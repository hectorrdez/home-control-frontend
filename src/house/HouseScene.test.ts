import type * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { HousePlan } from "./plan";
import { HouseScene, type SceneCallbacks } from "./HouseScene";

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

const plan: HousePlan = {
  plate: 22,
  floors: [
    {
      index: 0,
      walls: [{ x: 0, z: -10, w: 20, d: 0.4, h: 2.6 }],
      rooms: [
        {
          id: "kitchen",
          areaId: "kitchen",
          label: "Kitchen",
          rect: { x: 0, z: 0, w: 20, d: 20, h: 0 },
          hue: "primary-container",
          furniture: [{ x: 1, z: 1, w: 1, d: 1, h: 1 }],
        },
        {
          id: "hall",
          areaId: "hall",
          label: "Hall",
          rect: { x: 60, z: 60, w: 2, d: 2, h: 0 },
          hue: "secondary",
          furniture: [],
        },
      ],
    },
  ],
};

interface Internals {
  camera: THREE.PerspectiveCamera;
  rooms: Map<string, { present: boolean; outlineMat: THREE.LineBasicMaterial; tintMat: THREE.MeshBasicMaterial; light: THREE.PointLight }>;
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

  it("positions the room labels on screen after each frame", () => {
    const { scene } = mountScene();
    const label = document.createElement("div");
    scene.setLabelElements(new Map([["kitchen", label]]));
    flush();

    expect(label.style.opacity).toBe("1");
    expect(label.style.transform).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\) translate\(-50%, -100%\)$/);
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
