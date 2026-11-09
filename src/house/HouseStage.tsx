import { useEffect, useMemo, useRef, useState } from "react";
import { isUnavailable } from "@/state/selectors";
import { useEntities } from "@/state/EntitiesProvider";
import type { Entity } from "@/api/types";
import { roomGlow, roomLabel, roomStatus, type RoomGlow } from "./glow";
import { DEFAULT_PLAN, bindRooms } from "./plan";
import { HouseScene, type ViewPreset } from "./HouseScene";
import { useZoneTokenResolver } from "@/features/zones/ZoneColorsContext";
import { zoneColorToken } from "@/features/zones/zoneColors";

// The 3D stage of `/` (106). Lazy chunk: only loaded by HomePage, never by /telemetry.
// View: the whole house ("house") or one isolated floor (its index).
type View = "house" | number;

const VIEWS: Array<{ preset: ViewPreset; label: string }> = [
  { preset: "iso", label: "Isometric view" },
  { preset: "top", label: "Top view" },
  { preset: "reset", label: "Reset camera" },
];

const buttonClass =
  "min-h-11 rounded border border-outline-variant/40 bg-surface-container-lowest/80 px-space-sm font-mono text-label-caps uppercase text-on-surface-variant hover:border-primary-container/40 hover:text-primary-container focus-visible:outline-2 focus-visible:outline-primary-container";

const pressedClass = "border-primary-container text-primary-container";

function applyView(scene: HouseScene, view: View) {
  if (view === "house") scene.setMode("house");
  else scene.setFloor(view);
}

export default function HouseStage() {
  const { state, selectedArea, setSelectedArea } = useEntities();
  const zoneOf = useZoneTokenResolver();
  const hostRef = useRef<HTMLDivElement>(null);
  const labelEls = useRef(new Map<string, HTMLElement>());
  const sceneRef = useRef<HouseScene | null>(null);
  const onSelectRef = useRef(setSelectedArea);
  const [unavailable, setUnavailable] = useState(false);
  const [view, setView] = useState<View>("house");
  const onFloorPickRef = useRef<(index: number) => void>(setView);
  // Latest scene inputs, so a rebuilt scene (new zone assignment) gets the current rooms, glows, selection and view.
  const latest = useRef<{
    rooms: Parameters<HouseScene["setRooms"]>[0];
    glows: Parameters<HouseScene["setRooms"]>[1];
    selected: string | null;
    view: View;
  }>({ rooms: [], glows: {}, selected: null, view: "house" });

  useEffect(() => {
    onSelectRef.current = setSelectedArea;
  }, [setSelectedArea]);

  useEffect(() => {
    onFloorPickRef.current = setView;
  }, []);

  // Mount the scene. Feature 147: the room colors are baked at build time, so the scene is rebuilt when the zone
  // assignment changes (area list loaded or changed; rare). WebGL missing (or context lost) -> the fallback panel; the room chips keep working.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: HouseScene;
    try {
      scene = new HouseScene(
        host,
        {
          onSelect: (areaId) => onSelectRef.current(areaId),
          onFloorPick: (index) => onFloorPickRef.current(index),
          onContextLost: () => {
            sceneRef.current?.dispose();
            sceneRef.current = null;
            setUnavailable(true);
          },
        },
        undefined,
        (areaId) => zoneOf(areaId) ?? zoneColorToken(areaId),
      );
    } catch {
      setUnavailable(true);
      return;
    }
    sceneRef.current = scene;
    scene.setRooms(latest.current.rooms, latest.current.glows);
    scene.setSelected(latest.current.selected);
    applyView(scene, latest.current.view);
    scene.setLabelElements(labelEls.current);
    const observer = new ResizeObserver(() => scene.resize());
    observer.observe(host);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [zoneOf]);

  const rooms = useMemo(() => bindRooms(DEFAULT_PLAN, state.areas.map((a) => a.areaId)), [state.areas]);

  const entitiesByArea = useMemo(() => {
    const map = new Map<string, Entity[]>();
    for (const group of state.areas) {
      map.set(group.areaId, group.entityIds.map((id) => state.entities[id]).filter((e): e is Entity => Boolean(e) && !isUnavailable(e)));
    }
    return map;
  }, [state.areas, state.entities]);

  const glows = useMemo(() => {
    const out: Record<string, RoomGlow> = {};
    for (const [areaId, entities] of entitiesByArea) out[areaId] = roomGlow(entities);
    return out;
  }, [entitiesByArea]);

  const areaName = (areaId: string, fallback: string) => state.areas.find((a) => a.areaId === areaId)?.name ?? fallback;

  const sceneRooms = useMemo(() => rooms.map((r) => ({ id: r.id, areaId: r.areaId, present: r.present, floor: r.floor })), [rooms]);

  // Keeps `latest` current. If a scene is rebuilt in the same commit as a rooms/selection change, the rooms/selection
  // effects below run after the mount effect and apply the new values to the new scene.
  useEffect(() => {
    latest.current = { rooms: sceneRooms, glows, selected: selectedArea, view };
  }, [sceneRooms, glows, selectedArea, view]);

  useEffect(() => {
    sceneRef.current?.setRooms(sceneRooms, glows);
  }, [sceneRooms, glows]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedArea);
  }, [selectedArea]);

  useEffect(() => {
    if (sceneRef.current) applyView(sceneRef.current, view);
  }, [view]);

  // Labels of the shown floor only (none in the whole-house view); the scene keeps a copy of the map, so refresh it when the view or rooms change.
  useEffect(() => {
    sceneRef.current?.setLabelElements(labelEls.current);
  }, [rooms, view]);

  // Selecting a room on another floor brings that floor up. Adjusted during render on a selection change only,
  // so a manual view switch is not undone by a store change.
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  if (selectedArea !== lastSelected) {
    setLastSelected(selectedArea);
    const target = selectedArea ? rooms.find((r) => r.present && r.areaId === selectedArea) : undefined;
    if (target && target.floor !== view) setView(target.floor);
  }

  const presentRooms = rooms.filter((r) => r.present);
  const shownRooms = view === "house" ? [] : rooms.filter((r) => r.floor === view);
  const shownPresent = shownRooms.filter((r) => r.present);

  return (
    <section
      aria-label="House view"
      className="relative col-span-12 min-h-0 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest xl:col-span-8"
    >
      <div ref={hostRef} className={`absolute inset-0 ${unavailable ? "hidden" : ""}`} />

      {unavailable ? (
        <div className="absolute inset-0 flex items-center justify-center p-space-md">
          <p role="status" className="rounded border border-error/30 bg-error/10 p-space-md font-label-caps text-label-caps uppercase text-error">
            3D VIEW UNAVAILABLE
          </p>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0">
          {shownRooms.map((room) => (
            <div
              key={room.id}
              ref={(el) => {
                if (el) labelEls.current.set(room.id, el);
                else labelEls.current.delete(room.id);
              }}
              className={`absolute left-0 top-0 whitespace-nowrap font-mono text-label-caps text-on-surface ${room.present ? "" : "opacity-40"}`}
            >
              {roomLabel(areaName(room.areaId, room.label), entitiesByArea.get(room.areaId) ?? [])}
            </div>
          ))}
        </div>
      )}

      <p className="pointer-events-none absolute left-space-md top-space-md font-mono text-label-caps uppercase text-on-surface-variant">
        {view === "house"
          ? `HOUSE • ${DEFAULT_PLAN.floors.length} LEVELS • ${presentRooms.length} ROOMS`
          : `LEVEL 0${view + 1} • ${shownPresent.length} ROOMS`}
      </p>

      <div className="absolute right-space-md top-space-md flex flex-col gap-space-xs">
        {VIEWS.map((item) => (
          <button
            key={item.preset + item.label}
            type="button"
            aria-label={item.label}
            className={buttonClass}
            disabled={unavailable}
            onClick={() => sceneRef.current?.setView(item.preset)}
          >
            {item.label.replace(" view", "").replace("Reset camera", "RESET")}
          </button>
        ))}
        <div role="group" aria-label="Floors" className="flex flex-col gap-space-xs">
          <button
            type="button"
            aria-pressed={view === "house"}
            aria-label="Whole house"
            className={`${buttonClass} ${view === "house" ? pressedClass : ""}`}
            disabled={unavailable}
            onClick={() => setView("house")}
          >
            HOUSE
          </button>
          {DEFAULT_PLAN.floors.map((f) => (
            <button
              key={f.index}
              type="button"
              aria-pressed={view === f.index}
              aria-label={f.label}
              className={`${buttonClass} ${view === f.index ? pressedClass : ""}`}
              disabled={unavailable}
              onClick={() => setView(f.index)}
            >
              {`FL 0${f.index + 1}`}
            </button>
          ))}
        </div>
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-space-sm text-center font-mono text-label-caps uppercase text-on-surface-variant">
        ORBIT [LEFT DRAG] • PAN [RIGHT DRAG]
      </p>

      <ul aria-live="polite" className="sr-only">
        {presentRooms.map((room) => (
          <li key={room.id}>{roomStatus(areaName(room.areaId, room.label), entitiesByArea.get(room.areaId) ?? [])}</li>
        ))}
      </ul>
    </section>
  );
}
