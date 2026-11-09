import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { HousePlan } from "./plan";
import { HouseScene, type SceneCallbacks } from "./HouseScene";
import { ZONE_TOKENS, zoneColorToken } from "../features/zones/zoneColors";

// jsdom has no WebGL: replace only the renderer, keep real three.js geometry, raycasting and math.
const hoisted = vi.hoisted(() => ({ renderers: [] as Array<FakeRendererHandle> }));
interface FakeRendererHandle {
  domElement: HTMLCanvasElement;
  render: Mock;
  setSize: Mock;
  dispose: Mock;
}

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class FakeWebGLRenderer {
    domElement = document.createElement("canvas");
    render = vi.fn();
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    dispose = vi.fn();
    constructor() {
      hoisted.renderers.push(this);
    }
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

// Two stacked floors. The upper "bedroom" sits exactly over the ground "kitchen", so only the shown floor can be picked.
const plan: HousePlan = {
  plate: 22,
  floors: [
    {
      index: 0,
      label: "Planta baja",
      walls: [{ x: 0, z: -10, w: 20, d: 0.4, h: 2.6 }],
      glass: [{ x: 0, z: -10, w: 2, d: 0.2, h: 1.2, y: 0.9 }],
      fixtures: [{ x: 5, z: 5, w: 1, d: 1, h: 0.2 }],
      rooms: [
        {
          id: "kitchen",
          areaId: "kitchen",
          areaIds: ["kitchen", "cocina"],
          label: "Kitchen",
          rect: { x: 0, z: 0, w: 20, d: 20, h: 0 },
          hue: "primary-container",
          furniture: [{ x: 1, z: 1, w: 1, d: 1, h: 1 }],
        },
        {
          id: "hall",
          areaId: "hall",
          areaIds: ["hall"],
          label: "Hall",
          rect: { x: 60, z: 60, w: 2, d: 2, h: 0 },
          hue: "secondary",
          furniture: [],
        },
      ],
    },
    {
      index: 1,
      label: "Planta alta",
      walls: [],
      glass: [],
      fixtures: [],
      rooms: [
        {
          id: "bedroom",
          areaId: "bedroom",
          areaIds: ["bedroom"],
          label: "Bedroom",
          rect: { x: 0, z: 0, w: 20, d: 20, h: 0 },
          hue: "secondary",
          furniture: [],
        },
      ],
    },
  ],
};

interface Internals {
  camera: THREE.PerspectiveCamera;
  floorGroups: THREE.Group[];
  rooms: Map<string, { group: THREE.Group; present: boolean; outlineMat: THREE.LineBasicMaterial; tintMat: THREE.MeshBasicMaterial; light: THREE.PointLight }>;
  disposed: boolean;
}
const internals = (scene: HouseScene) => scene as unknown as Internals;

let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
const flush = () => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((cb) => cb(0));
};

function pointer(target: EventTarget, type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y });
  target.dispatchEvent(event);
  return event;
}

function makeContainer(width = 800, height = 600): HTMLElement {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(container, "clientHeight", { configurable: true, get: () => height });
  document.body.appendChild(container);
  return container;
}

describe("HouseScene", () => {
  let callbacks: SceneCallbacks;
  let container: HTMLElement;

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    // Screen = 100 x 100 px at the origin, so clientX/clientY map straight to normalised device coordinates.
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, right: 100, bottom: 100, toJSON: () => ({}),
    } as DOMRect);
    hoisted.renderers.length = 0;
    callbacks = { onSelect: vi.fn(), onContextLost: vi.fn() };
    container = makeContainer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    container.remove();
  });

  const mountScene = (p: HousePlan = plan) => {
    const scene = new HouseScene(container, callbacks, p);
    const renderer = hoisted.renderers[0];
    const canvas = renderer.domElement;
    // OrbitControls takes pointer capture on pointerdown; jsdom does not implement it.
    canvas.setPointerCapture = () => undefined;
    canvas.releasePointerCapture = () => undefined;
    canvas.hasPointerCapture = () => false;
    return { scene, renderer, canvas };
  };

  it("mounts its canvas into the container and draws the first frame on demand", () => {
    const { renderer, canvas } = mountScene();
    expect(container.contains(canvas)).toBe(true);
    expect(canvas.style.display).toBe("block");
    expect(renderer.render).not.toHaveBeenCalled();

    flush();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it("selects a present room on a click and ignores drags longer than the click slack", () => {
    const { canvas } = mountScene();

    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointerup", 50, 50);
    expect(callbacks.onSelect).toHaveBeenCalledWith("kitchen");

    vi.mocked(callbacks.onSelect).mockClear();
    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointerup", 80, 50);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });

  it("shows one floor at a time and only picks rooms of the shown floor", () => {
    const { scene, canvas } = mountScene();
    const groups = internals(scene).floorGroups;
    expect(groups[0].visible).toBe(true);
    expect(groups[1].visible).toBe(false);

    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointerup", 50, 50);
    expect(callbacks.onSelect).toHaveBeenLastCalledWith("kitchen");

    scene.setFloor(1);
    expect(groups[0].visible).toBe(false);
    expect(groups[1].visible).toBe(true);
    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointerup", 50, 50);
    expect(callbacks.onSelect).toHaveBeenLastCalledWith("bedroom");

    vi.mocked(callbacks.onSelect).mockClear();
    scene.setFloor(0);
    expect(groups[0].visible).toBe(true);
    expect(groups[1].visible).toBe(false);
    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointerup", 50, 50);
    expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelect).toHaveBeenCalledWith("kitchen");
  });

  it("reports the re-bound area after setRooms changes a room areaId", () => {
    const { scene, canvas } = mountScene();
    scene.setRooms([{ id: "kitchen", areaId: "cocina", present: true }], {});

    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointerup", 50, 50);
    expect(callbacks.onSelect).toHaveBeenLastCalledWith("cocina");

    scene.setSelected("cocina");
    expect(internals(scene).rooms.get("kitchen")!.outlineMat.opacity).toBe(1);
    scene.setSelected("kitchen");
    expect(internals(scene).rooms.get("kitchen")!.outlineMat.opacity).toBeCloseTo(0.5);
  });

  it("does not select a room that is dimmed as not present", () => {
    const { scene, canvas } = mountScene();
    scene.setRooms([{ id: "kitchen", areaId: "kitchen", present: false }], {});

    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointerup", 50, 50);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });

  it("ignores a pointer-up with no matching pointer-down (no origin, so never a click)", () => {
    const { canvas } = mountScene();
    pointer(canvas, "pointerup", 50, 50);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });

  it("shows a pointer cursor over a present room and clears it elsewhere", () => {
    const { canvas } = mountScene();

    pointer(canvas, "pointermove", 50, 50);
    expect(canvas.style.cursor).toBe("pointer");

    pointer(canvas, "pointermove", 0, 0);
    expect(canvas.style.cursor).toBe("");
  });

  it("reports a lost WebGL context and prevents the default recovery", () => {
    const { canvas } = mountScene();
    const event = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.onContextLost).toHaveBeenCalledTimes(1);
  });

  it("drives room glow lights and presence from setRooms", () => {
    const { scene } = mountScene();
    const kitchen = internals(scene).rooms.get("kitchen")!;

    scene.setRooms([{ id: "kitchen", areaId: "kitchen", present: true }], {
      kitchen: { on: true, intensity: 0.5, hue: "climate" },
    });
    expect(kitchen.light.visible).toBe(true);
    expect(kitchen.light.intensity).toBeCloseTo(1.25);

    scene.setRooms([{ id: "kitchen", areaId: "kitchen", present: false }], {});
    expect(kitchen.present).toBe(false);
    expect(kitchen.light.visible).toBe(false);
    expect(kitchen.light.intensity).toBe(0);
    expect(kitchen.tintMat.opacity).toBeCloseTo(0.01);
  });

  it("tints and outlines each room with its own zone color (feature 130)", () => {
    // Named CSS colors keep this file free of hex literals (lint:tokens); THREE.Color parses them.
    const named = ["red", "green", "blue", "yellow", "magenta", "cyan", "white", "orange"];
    const values: Record<string, string> = {};
    ZONE_TOKENS.forEach((token, i) => {
      values[`--color-${token}`] = named[i];
    });
    values["--color-primary-container"] = "black";
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el: Element) =>
        ({
          getPropertyValue: (name: string) => (name in values ? values[name] : original(el).getPropertyValue(name)),
        }) as unknown as CSSStyleDeclaration,
    );

    const { scene } = mountScene();
    scene.setSelected(null);
    const rooms = internals(scene).rooms;
    for (const areaId of ["kitchen", "hall"]) {
      const expected = new THREE.Color(values[`--color-${zoneColorToken(areaId)}`]).getHexString();
      const room = rooms.get(areaId)!;
      expect(room.tintMat.color.getHexString()).toBe(expected);
      expect(room.outlineMat.color.getHexString()).toBe(expected);
      const marker = room.group.children.find(
        (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial,
      )!;
      const mat = marker.material as THREE.MeshStandardMaterial;
      expect(mat.color.getHexString()).toBe(expected);
      expect(mat.emissive.getHexString()).toBe(expected);
    }

    // Selected room swaps its outline to the active color at full opacity; deselecting restores the zone color.
    const kitchen = rooms.get("kitchen")!;
    const zoneHex = new THREE.Color(values[`--color-${zoneColorToken("kitchen")}`]).getHexString();
    scene.setSelected("kitchen");
    expect(kitchen.outlineMat.opacity).toBe(1);
    expect(kitchen.outlineMat.color.getHexString()).toBe("000000");
    scene.setSelected(null);
    expect(kitchen.outlineMat.opacity).toBeCloseTo(0.5);
    expect(kitchen.outlineMat.color.getHexString()).toBe(zoneHex);
  });

  it("highlights only the selected present room", () => {
    const { scene } = mountScene();
    const kitchen = internals(scene).rooms.get("kitchen")!;

    scene.setSelected("kitchen");
    expect(kitchen.outlineMat.opacity).toBe(1);
    expect(kitchen.tintMat.opacity).toBeCloseTo(0.14);

    scene.setSelected(null);
    expect(kitchen.outlineMat.opacity).toBeCloseTo(0.5);
    expect(kitchen.tintMat.opacity).toBeCloseTo(0.04);
  });

  it("moves the camera to the top-down and isometric presets", () => {
    const { scene } = mountScene();
    const camera = internals(scene).camera;

    scene.setView("top");
    expect(camera.position.y).toBeGreaterThan(30);
    expect(camera.position.x).toBeCloseTo(0);

    scene.setView("iso");
    expect(camera.position.y).toBeLessThan(25);
    expect(camera.position.x).toBeGreaterThan(0);
  });

  it("positions the room labels on screen after each frame, hiding labels of other floors", () => {
    const { scene } = mountScene();
    const kitchenLabel = document.createElement("div");
    const bedroomLabel = document.createElement("div");
    scene.setLabelElements(
      new Map([
        ["kitchen", kitchenLabel],
        ["bedroom", bedroomLabel],
      ]),
    );
    flush();

    expect(kitchenLabel.style.opacity).toBe("1");
    expect(kitchenLabel.style.transform).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\) translate\(-50%, -100%\)$/);
    expect(bedroomLabel.style.opacity).toBe("0");

    scene.setFloor(1);
    flush();
    expect(kitchenLabel.style.opacity).toBe("0");
    expect(bedroomLabel.style.opacity).toBe("1");
  });

  it("follows the container size on resize", () => {
    const { scene, renderer } = mountScene();
    Object.defineProperty(container, "clientWidth", { configurable: true, get: () => 400 });

    scene.resize();
    expect(renderer.setSize).toHaveBeenLastCalledWith(400, 600);
    expect(internals(scene).camera.aspect).toBeCloseTo(400 / 600);
  });

  it("tears down the renderer, listeners and canvas once, and ignores later calls", () => {
    const { scene, renderer, canvas } = mountScene();

    scene.dispose();
    scene.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(container.contains(canvas)).toBe(false);
    expect(internals(scene).disposed).toBe(true);

    scene.resize();
    scene.setSelected("kitchen");
    flush();
    expect(renderer.setSize).toHaveBeenCalledTimes(1); // only the constructor call
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("uses a clamped minimum size for an empty container", () => {
    container.remove();
    container = makeContainer(0, 0);
    const { renderer } = mountScene();
    expect(renderer.setSize).toHaveBeenCalledWith(1, 1);
  });
});
