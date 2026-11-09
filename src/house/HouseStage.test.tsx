import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { HouseScene, SceneCallbacks } from "./HouseScene";
import { DEFAULT_PLAN } from "./plan";
import { ZoneColorsProvider } from "@/features/zones/ZoneColorsContext";
import { ZONE_TOKENS } from "@/features/zones/zoneColors";

const hoisted = vi.hoisted(() => {
  type Fake = {
    callbacks: SceneCallbacks;
    setRooms: Mock;
    setSelected: Mock;
    setView: Mock;
    setLabelElements: Mock;
    setFloor: Mock;
    resize: Mock;
    dispose: Mock;
    zoneOf: (areaId: string) => string;
  };
  return {
    scenes: [] as Fake[],
    failNextConstruction: false,
    stage: { value: null as unknown as { state: unknown; selectedArea: string | null; setSelectedArea: Mock } },
  };
});

vi.mock("./HouseScene", () => ({
  HouseScene: class {
    constructor(_host: HTMLElement, callbacks: SceneCallbacks, _plan: unknown, zoneOf: (areaId: string) => string) {
      if (hoisted.failNextConstruction) {
        hoisted.failNextConstruction = false;
        throw new Error("no webgl");
      }
      const self = {
        callbacks,
        setRooms: vi.fn(),
        setSelected: vi.fn(),
        setView: vi.fn(),
        setLabelElements: vi.fn(),
        setFloor: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
        zoneOf,
      };
      hoisted.scenes.push(self);
      return self as unknown as HouseScene;
    }
  },
}));

vi.mock("@/state/EntitiesProvider", () => ({
  useEntities: () => hoisted.stage.value,
}));

// Imported after the mocks so the component binds to the fake scene and context.
const { default: HouseStage } = await import("./HouseStage");

const observers: Array<{ callback: () => void; disconnect: Mock }> = [];

class FakeResizeObserver {
  disconnect = vi.fn();
  callback: () => void;
  observe = vi.fn();
  unobserve = vi.fn();
  constructor(callback: () => void) {
    this.callback = callback;
    observers.push(this);
  }
}

const firstArea = DEFAULT_PLAN.floors[0].rooms[0].areaId; // living_room (ground)
const secondArea = DEFAULT_PLAN.floors[0].rooms[1].areaId; // kitchen (ground)
const upperArea = DEFAULT_PLAN.floors[1].rooms[0].areaId; // bedroom (upper)

function stageWith(selectedArea: string | null = null) {
  hoisted.stage.value = {
    state: {
      areas: [{ areaId: firstArea, name: "Kitchen", entityIds: ["light.k"] }],
      entities: {
        "light.k": { entityId: "light.k", domain: "light", name: "Kitchen light", state: "on", attributes: {}, area: firstArea, lastChanged: "" },
      },
    },
    selectedArea,
    setSelectedArea: vi.fn(),
  };
  return hoisted.stage.value;
}

describe("HouseStage", () => {
  beforeEach(() => {
    hoisted.scenes.length = 0;
    hoisted.failNextConstruction = false;
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mounts one scene, pushes the bound rooms and counts only the present ones", () => {
    stageWith();
    render(<HouseStage />);

    expect(hoisted.scenes).toHaveLength(1);
    const scene = hoisted.scenes[0];
    expect(scene.setRooms).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ areaId: firstArea, present: true })]),
      expect.objectContaining({ [firstArea]: expect.objectContaining({ on: true }) }),
    );
    expect(screen.getByText("LEVEL 01 • 1 ROOMS")).toBeTruthy();
    expect(screen.getByRole("list").textContent).toContain("Kitchen");
  });

  it("shows a floor chip per floor, pressed for the shown floor, and switches the scene floor on click", () => {
    stageWith();
    render(<HouseStage />);
    const scene = hoisted.scenes[0];
    const ground = screen.getByRole("button", { name: "Planta baja" });
    const upper = screen.getByRole("button", { name: "Planta alta" });

    expect(ground.textContent).toBe("FL 01");
    expect(upper.textContent).toBe("FL 02");
    expect(ground.getAttribute("aria-pressed")).toBe("true");
    expect(upper.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(upper);
    expect(scene.setFloor).toHaveBeenLastCalledWith(1);
    expect(upper.getAttribute("aria-pressed")).toBe("true");
    expect(ground.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("LEVEL 02 • 0 ROOMS")).toBeTruthy();
  });

  it("brings up the floor of a selected upper-floor room", () => {
    hoisted.stage.value = {
      state: {
        areas: [{ areaId: upperArea, name: "Master suite", entityIds: [] }],
        entities: {},
      },
      selectedArea: upperArea,
      setSelectedArea: vi.fn(),
    };
    render(<HouseStage />);
    const scene = hoisted.scenes[0];

    expect(scene.setFloor).toHaveBeenLastCalledWith(1);
    expect(screen.getByText("LEVEL 02 • 1 ROOMS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Planta alta" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("sends the view presets to the scene from the camera buttons", () => {
    stageWith();
    render(<HouseStage />);
    const scene = hoisted.scenes[0];

    fireEvent.click(screen.getByRole("button", { name: "Isometric view" }));
    fireEvent.click(screen.getByRole("button", { name: "Top view" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));

    expect(scene.setView.mock.calls).toEqual([["iso"], ["top"], ["reset"]]);
    expect(screen.getByRole("button", { name: "Reset camera" }).textContent).toBe("RESET");
  });

  it("routes a room click from the scene to the store selection", () => {
    const store = stageWith();
    render(<HouseStage />);

    act(() => hoisted.scenes[0].callbacks.onSelect(firstArea));
    expect(store.setSelectedArea).toHaveBeenCalledWith(firstArea);
  });

  it("highlights the selected room in the scene when the selection changes", () => {
    stageWith(null);
    const { rerender } = render(<HouseStage />);
    expect(hoisted.scenes[0].setSelected).toHaveBeenLastCalledWith(null);

    hoisted.stage.value = { ...hoisted.stage.value, selectedArea: secondArea };
    rerender(<HouseStage />);
    expect(hoisted.scenes[0].setSelected).toHaveBeenLastCalledWith(secondArea);
  });

  it("shows the fallback panel and disables the camera when WebGL is unavailable", () => {
    stageWith();
    hoisted.failNextConstruction = true;
    render(<HouseStage />);

    expect(screen.getByRole("status").textContent).toBe("3D VIEW UNAVAILABLE");
    expect(hoisted.scenes).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Top view" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("falls back and disposes the scene when the WebGL context is lost", () => {
    stageWith();
    render(<HouseStage />);
    const scene = hoisted.scenes[0];

    act(() => scene.callbacks.onContextLost());
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("3D VIEW UNAVAILABLE");
  });

  it("resizes the scene with its host and tears everything down on unmount", () => {
    stageWith();
    const { unmount } = render(<HouseStage />);
    const scene = hoisted.scenes[0];

    observers[0].callback();
    expect(scene.resize).toHaveBeenCalledTimes(1);

    unmount();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps the camera on area reorder and restores rooms, selection and labels after a color change", () => {
    stageWith(firstArea);
    const show = (areaIds: string[]) => (
      <ZoneColorsProvider areaIds={areaIds}>
        <HouseStage />
      </ZoneColorsProvider>
    );
    const { rerender, unmount } = render(show([firstArea, secondArea]));
    const first = hoisted.scenes[0];
    expect(first.zoneOf(firstArea)).toBe(ZONE_TOKENS[1]);

    rerender(show([secondArea, firstArea, firstArea]));
    expect(hoisted.scenes).toHaveLength(1);
    expect(first.dispose).not.toHaveBeenCalled();

    rerender(show([firstArea]));
    expect(hoisted.scenes).toHaveLength(2);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    const second = hoisted.scenes[1];
    expect(second.setRooms).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ areaId: firstArea, present: true })]),
      expect.objectContaining({ [firstArea]: expect.objectContaining({ on: true }) }),
    );
    expect(second.setSelected).toHaveBeenCalledWith(firstArea);
    expect(second.setLabelElements).toHaveBeenCalledWith(expect.any(Map));
    expect(second.zoneOf(firstArea)).toBe(ZONE_TOKENS[0]);

    unmount();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(observers[1].disconnect).toHaveBeenCalledTimes(1);
  });
});
