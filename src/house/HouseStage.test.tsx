import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { HouseScene, SceneCallbacks } from "./HouseScene";
import { DEFAULT_PLAN } from "./plan";

const hoisted = vi.hoisted(() => {
  type Fake = {
    callbacks: SceneCallbacks;
    setRooms: Mock;
    setSelected: Mock;
    setView: Mock;
    setLabelElements: Mock;
    resize: Mock;
    dispose: Mock;
  };
  return {
    scenes: [] as Fake[],
    failNextConstruction: false,
    stage: { value: null as unknown as { state: unknown; selectedArea: string | null; setSelectedArea: Mock } },
  };
});

vi.mock("./HouseScene", () => ({
  HouseScene: class {
    constructor(_host: HTMLElement, callbacks: SceneCallbacks) {
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
        resize: vi.fn(),
        dispose: vi.fn(),
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

const firstArea = DEFAULT_PLAN.floors[0].rooms[0].areaId;
const secondArea = DEFAULT_PLAN.floors[0].rooms[1].areaId;

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
});
