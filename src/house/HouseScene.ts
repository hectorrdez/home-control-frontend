import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RoomGlow } from "./glow";
import { DEFAULT_PLAN, type Box, type FloorPlan, type HousePlan, type RoomPlan, type WallCut } from "./plan";
import { zoneColorToken } from "../features/zones/zoneColors";

// Procedural isometric house (106). Plain three + OrbitControls; render on demand (no idle loop).
// Colors come from the CSS tokens of index.css, read once at mount. Nothing here is a hex literal.

export type ViewPreset = "iso" | "top" | "reset";
export type SceneMode = "house" | "floor";

export interface RoomState {
  id: string;
  areaId: string; // resolved HA area (bindRooms)
  present: boolean; // false -> dimmed and unselectable
  floor?: number; // floor the room belongs to; re-parents the room group when it differs from the built one
}

export interface SceneCallbacks {
  onSelect: (areaId: string) => void;
  onContextLost: () => void;
  onFloorPick?: (floorIndex: number) => void; // whole-house mode: a click on a floor isolates it
}

interface RoomObjects {
  plan: RoomPlan;
  areaId: string; // resolved area; drives highlight and selection
  floor: number;
  group: THREE.Group;
  center: THREE.Vector3;
  present: boolean;
  hits: THREE.Mesh[]; // one floor plane per part
  marker: THREE.Mesh; // zone ball: picks the room like its floor plane (feature 154)
  outlineMat: THREE.LineBasicMaterial;
  tintMat: THREE.MeshBasicMaterial;
  markerMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  hue: THREE.Color; // glow hue from the plan (lit state)
  zone: THREE.Color; // stable zone color (feature 130): tint, outline and marker
}

interface ClipTarget {
  material: THREE.Material;
  cut: WallCut;
}

const LABEL_HEIGHT = 3.2;
const LEVEL_UNITS = 2.7 * 2; // 2.7 m per level at 2 units per metre
const SLAB_THICKNESS = 0.1;
const CUT_NORMAL = 2.6; // isolated view keeps y < 2.6 for normal walls, furniture and fixtures
const CUT_LOW = 1.2; // ... and y < 1.2 for "low" walls (facade, right party wall)
const ISO = { azimuth: Math.PI / 4, polar: 0.58 };
const TOP = { azimuth: 0, polar: 1.35 };
const FLOOR_RADIUS = 38;
const HOUSE_RADIUS = 46;
const FLOOR_TARGET_Y = 1.5;
const CLICK_SLACK_PX = 5;

function token(name: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  return new THREE.Color(raw || undefined);
}

export class HouseScene {
  private readonly container: HTMLElement;
  private readonly callbacks: SceneCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly rooms = new Map<string, RoomObjects>();
  private readonly floorGroups: THREE.Group[] = []; // one group per floor, indexed by floor.index
  private readonly levels: number[] = []; // floor.level per group, for the stacked house view
  private readonly slabs: THREE.Object3D[] = []; // upper floor slabs, shown in the whole-house view only
  private readonly roofs: THREE.Object3D[] = []; // gable roof mesh + edges, shown in the whole-house view only
  private readonly clipTargets: ClipTarget[] = [];
  private readonly normalPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_NORMAL);
  private readonly lowPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_LOW);
  private houseTop = 0;
  private mode: SceneMode = "house";
  private activeFloor = 0;
  private readonly labels = new Map<string, HTMLElement>();
  private readonly materials: THREE.Material[] = [];
  private readonly zoneOf: (areaId: string) => string; // feature 147: assigned zone token per area (130 hash as fallback)
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private selected: string | null = null;
  private frame = 0;
  private width = 1;
  private height = 1;
  private downAt: { x: number; y: number } | null = null;
  private disposed = false;
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];

  // Throws when WebGL is unavailable; the caller shows the fallback panel.
  constructor(container: HTMLElement, callbacks: SceneCallbacks, plan: HousePlan = DEFAULT_PLAN, zoneOf: (areaId: string) => string = zoneColorToken) {
    this.container = container;
    this.callbacks = callbacks;
    this.zoneOf = zoneOf;
    this.width = Math.max(1, container.clientWidth);
    this.height = Math.max(1, container.clientHeight);

    const bg = token("background");
    this.scene.fog = new THREE.FogExp2(bg, 0.015);
    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.localClippingEnabled = true; // section cut in the isolated floor view
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.width, this.height);
    container.appendChild(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    this.on(canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      this.callbacks.onContextLost();
    });

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 60;
    this.controls.addEventListener("change", () => this.requestRender());

    this.buildLights();
    this.buildStage(plan);
    this.applyMode();
    this.setView("iso");

    this.on(canvas, "pointerdown", (e) => {
      const event = e as PointerEvent;
      this.downAt = { x: event.clientX, y: event.clientY };
    });
    this.on(canvas, "pointerup", (e) => {
      const event = e as PointerEvent;
      const moved = this.downAt
        ? Math.hypot(event.clientX - this.downAt.x, event.clientY - this.downAt.y)
        : Infinity;
      this.downAt = null;
      if (moved > CLICK_SLACK_PX) return;
      if (this.mode === "house") {
        const floor = this.pickFloor(event);
        if (floor !== undefined) this.callbacks.onFloorPick?.(floor);
        return;
      }
      const hit = this.pick(event);
      if (hit?.present) this.callbacks.onSelect(hit.areaId);
    });
    this.on(canvas, "pointermove", (e) => {
      const event = e as PointerEvent;
      const over = this.mode === "house" ? this.pickFloor(event) !== undefined : this.pick(event)?.present;
      canvas.style.cursor = over ? "pointer" : "";
    });
    this.requestRender();
  }

  // Whole house (all floors stacked, click a floor to isolate it) or one isolated floor (rooms pickable).
  setMode(mode: SceneMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyMode();
    this.setView("iso");
    this.requestRender();
  }

  // Isolates one floor (switches to floor mode). The camera keeps its angle when already in floor mode.
  setFloor(index: number): void {
    const entering = this.mode !== "floor";
    this.mode = "floor";
    this.activeFloor = index;
    this.applyMode();
    if (entering) this.setView("iso");
    this.requestRender();
  }

  // Room list from the live areas: updates dimming, glows, the highlight and the zone color of a re-bound area.
  setRooms(rooms: RoomState[], glows: Record<string, RoomGlow>): void {
    for (const room of rooms) {
      const obj = this.rooms.get(room.id);
      if (!obj) continue;
      if (room.areaId !== obj.areaId) {
        obj.areaId = room.areaId;
        obj.zone.copy(token(this.zoneOf(room.areaId)));
        obj.tintMat.color.copy(obj.zone);
        obj.outlineMat.color.copy(obj.zone);
        obj.markerMat.color.copy(obj.zone);
        obj.markerMat.emissive.copy(obj.zone);
      }
      if (room.floor !== undefined && room.floor !== obj.floor && this.floorGroups[room.floor]) {
        this.floorGroups[room.floor].add(obj.group); // Object3D.add re-parents the group
        obj.floor = room.floor;
      }
      obj.present = room.present;
      const glow = glows[room.areaId] ?? { on: false, intensity: 0, hue: "light" as const };
      obj.light.visible = glow.on;
      obj.light.intensity = glow.on ? 2.5 * glow.intensity : 0;
      obj.light.color.copy(glow.hue === "climate" ? token("tertiary-fixed-dim") : obj.hue);
      this.applyPresence(obj);
    }
    this.applyHighlight();
    this.requestRender();
  }

  setSelected(areaId: string | null): void {
    this.selected = areaId;
    this.applyHighlight();
    this.requestRender();
  }

  setView(preset: ViewPreset): void {
    const view = preset === "top" ? TOP : ISO;
    const r = this.mode === "house" ? HOUSE_RADIUS : FLOOR_RADIUS;
    const t = this.controls.target;
    this.camera.position.set(
      t.x + r * Math.cos(view.polar) * Math.sin(view.azimuth),
      t.y + r * Math.sin(view.polar),
      t.z + r * Math.cos(view.polar) * Math.cos(view.azimuth),
    );
    this.camera.lookAt(t);
    this.controls.update();
    this.requestRender();
  }

  // Label elements per room id; the scene only positions them, React owns their text.
  setLabelElements(elements: Map<string, HTMLElement>): void {
    this.labels.clear();
    for (const [id, el] of elements) this.labels.set(id, el);
    this.requestRender();
  }

  resize(): void {
    if (this.disposed) return;
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn);
    this.scene.traverse((node) => {
      const geometry = (node as THREE.Mesh).geometry;
      if (geometry) geometry.dispose();
    });
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.rooms.clear();
    this.labels.clear();
  }

  private on(target: EventTarget, type: string, fn: (event: Event) => void): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private trackGeometry<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  // A material the section cut clips in the floor view (applyMode sets its clippingPlanes).
  private clipped<T extends THREE.Material>(m: T, cut: WallCut): T {
    this.clipTargets.push({ material: m, cut });
    return this.track(m);
  }

  // One material per cut: a "low" wall needs the lower plane, so it cannot share a material with a normal one.
  private clippedPair<T extends THREE.Material>(make: () => T): Record<WallCut, T> {
    return { normal: this.clipped(make(), "normal"), low: this.clipped(make(), "low") };
  }

  private buildLights(): void {
    this.scene.add(new THREE.AmbientLight(token("on-surface-variant"), 1.2));
    const key = new THREE.DirectionalLight(token("primary-container"), 0.6);
    key.position.set(20, 35, 15);
    this.scene.add(key);
    const grid = new THREE.GridHelper(36, 36, token("primary-container"), token("outline-variant"));
    grid.position.y = -0.05;
    for (const m of Array.isArray(grid.material) ? grid.material : [grid.material]) this.track(m);
    this.geometries.push(grid.geometry);
    this.scene.add(grid);
  }

  private buildStage(plan: HousePlan): void {
    const { plate } = plan;
    const plateGeo = this.trackGeometry(new THREE.BoxGeometry(plate, 0.4, plate));
    const plateMat = this.track(
      new THREE.MeshPhongMaterial({ color: token("surface-container-lowest"), transparent: true, opacity: 0.85, shininess: 40 }),
    );
    const base = new THREE.Mesh(plateGeo, plateMat);
    base.position.y = -0.2;
    this.scene.add(base);
    const edge = new THREE.LineSegments(
      this.trackGeometry(new THREE.EdgesGeometry(plateGeo)),
      this.track(new THREE.LineBasicMaterial({ color: token("primary-container"), transparent: true, opacity: 0.6 })),
    );
    edge.position.y = -0.2;
    this.scene.add(edge);

    for (const floor of plan.floors) {
      this.houseTop = Math.max(this.houseTop, floor.level * LEVEL_UNITS + (floor.roof?.ridge ?? 0));
      this.buildFloor(floor);
    }
  }

  private buildFloor(floor: FloorPlan): void {
    const group = new THREE.Group();
    this.floorGroups[floor.index] = group;
    this.levels[floor.index] = floor.level;
    this.scene.add(group);

    const wallMats = this.clippedPair(() => new THREE.MeshPhongMaterial({ color: token("surface-container-highest"), transparent: true, opacity: 0.35 }));
    for (const wall of floor.walls) this.addBox(group, wall, wallMats[wall.cut ?? "normal"], token("secondary"), 0.8);
    const glassMats = this.clippedPair(() => new THREE.MeshPhongMaterial({ color: token("primary-container"), transparent: true, opacity: 0.25 }));
    for (const pane of floor.glass) this.addBox(group, pane, glassMats[pane.cut ?? "normal"], token("primary-container"), 0.6);
    const fixtureMat = this.clipped(
      new THREE.MeshPhongMaterial({ color: token("surface-container-highest"), transparent: true, opacity: 0.6 }),
      "normal",
    );
    for (const box of floor.fixtures) this.addBox(group, box, fixtureMat, token("secondary"), 0.7);
    if (floor.roof) this.buildRoof(floor.roof, group);
    // Upper levels: a thin slab under each room part (the void and the stairwell stay open).
    if (floor.level > 0) {
      for (const room of floor.rooms) {
        for (const part of room.parts) {
          this.slabs.push(this.addBox(group, { ...part, y: -SLAB_THICKNESS, h: SLAB_THICKNESS }, wallMats.normal, token("secondary"), 0.8));
        }
      }
    }
    const furnitureMat = this.clipped(
      new THREE.MeshPhongMaterial({ color: token("surface-container-highest"), transparent: true, opacity: 0.6 }),
      "normal",
    );
    for (const room of floor.rooms) this.buildRoom(room, floor.index, group, furnitureMat);
  }

  // Gable roof: a pentagonal profile (knee walls to the eaves, then two slopes to the ridge) extruded along x.
  private buildRoof(roof: NonNullable<FloorPlan["roof"]>, parent: THREE.Group): void {
    const { box, knee, ridge } = roof;
    const zFront = box.z + box.d / 2; // facade side
    const zBack = box.z - box.d / 2;
    const profile = new THREE.Shape();
    profile.moveTo(zFront, 0);
    profile.lineTo(zBack, 0);
    profile.lineTo(zBack, knee);
    profile.lineTo(box.z, ridge);
    profile.lineTo(zFront, knee);
    profile.closePath();
    // Shape x = world z, shape y = world y; the extrusion is turned onto world x and centred on the box.
    const geometry = this.trackGeometry(new THREE.ExtrudeGeometry(profile, { depth: box.w, bevelEnabled: false }));
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(box.x + box.w / 2, 0, 0);
    const roofMat = this.clipped(
      new THREE.MeshPhongMaterial({
        color: token("surface-container-highest"),
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      "normal",
    );
    const edges = new THREE.LineSegments(
      this.trackGeometry(new THREE.EdgesGeometry(geometry)),
      this.clipped(new THREE.LineBasicMaterial({ color: token("secondary"), transparent: true, opacity: 0.7 }), "normal"),
    );
    const mesh = new THREE.Mesh(geometry, roofMat);
    mesh.name = "roof";
    edges.name = "roof";
    this.roofs.push(mesh, edges);
    parent.add(mesh, edges);
  }

  private buildRoom(plan: RoomPlan, floor: number, parent: THREE.Group, furnitureMat: THREE.Material): void {
    const { rect } = plan;
    const center = new THREE.Vector3(rect.x, LABEL_HEIGHT, rect.z);
    const hue = token(plan.hue);
    const zone = token(this.zoneOf(plan.areaId));
    const group = new THREE.Group();

    const tintMat = this.track(new THREE.MeshBasicMaterial({ color: zone, transparent: true, opacity: 0.04, side: THREE.DoubleSide }));
    const outlineMat = this.track(new THREE.LineBasicMaterial({ color: zone, transparent: true, opacity: 0.5 }));
    const hits: THREE.Mesh[] = [];
    for (const part of plan.parts) {
      const hit = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(part.w, part.d)), tintMat);
      hit.rotation.x = -Math.PI / 2;
      hit.position.set(part.x, 0.01, part.z);
      group.add(hit);
      hits.push(hit);

      const outline = new THREE.LineSegments(
        this.trackGeometry(new THREE.EdgesGeometry(this.trackGeometry(new THREE.BoxGeometry(part.w, 0.02, part.d)))),
        outlineMat,
      );
      outline.position.set(part.x, 0.02, part.z);
      group.add(outline);
    }

    for (const box of plan.furniture) this.addBox(group, box, furnitureMat, hue, 0.7);

    const markerMat = this.track(new THREE.MeshStandardMaterial({ color: zone, emissive: zone, emissiveIntensity: 0.8 }));
    const marker = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.3, 16, 16)), markerMat);
    marker.position.copy(center);
    group.add(marker);

    const light = new THREE.PointLight(hue, 0, 14);
    light.position.set(rect.x, 3, rect.z);
    light.visible = false;
    group.add(light);

    parent.add(group);
    this.rooms.set(plan.id, {
      plan,
      areaId: plan.areaId,
      floor,
      group,
      center,
      present: true,
      hits,
      marker,
      outlineMat,
      tintMat,
      markerMat,
      light,
      hue,
      zone,
    });
  }

  // A box mesh with its edge lines (the edges follow the box's cut). Returns the group it created under `parent`.
  private addBox(parent: THREE.Object3D, box: Box, material: THREE.Material, edge: THREE.Color, edgeOpacity: number): THREE.Group {
    const geometry = this.trackGeometry(new THREE.BoxGeometry(box.w, box.h, box.d));
    const group = new THREE.Group();
    group.position.set(box.x, (box.y ?? 0) + box.h / 2, box.z);
    group.add(new THREE.Mesh(geometry, material));
    const edges = new THREE.LineSegments(
      this.trackGeometry(new THREE.EdgesGeometry(geometry)),
      this.clipped(new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: edgeOpacity }), box.cut ?? "normal"),
    );
    group.add(edges);
    parent.add(group);
    return group;
  }

  // Whole house: every floor shown at its level. Floor: only the active floor at ground level, sectioned.
  private applyMode(): void {
    const floorMode = this.mode === "floor";
    this.controls.target.set(0, floorMode ? FLOOR_TARGET_Y : this.houseTop / 2, 0);
    this.floorGroups.forEach((group, i) => {
      group.visible = !floorMode || i === this.activeFloor;
      group.position.y = floorMode ? 0 : (this.levels[i] ?? 0) * LEVEL_UNITS;
    });
    for (const slab of this.slabs) slab.visible = !floorMode;
    for (const roof of this.roofs) roof.visible = !floorMode;
    for (const target of this.clipTargets) {
      target.material.clippingPlanes = floorMode ? [target.cut === "low" ? this.lowPlane : this.normalPlane] : [];
    }
  }

  // Dimmed rooms: every material of the room group keeps its ratio but drops to a quarter opacity.
  private applyPresence(obj: RoomObjects): void {
    obj.group.traverse((child) => {
      const mat = (child as THREE.Mesh).material as THREE.Material | undefined;
      if (!mat || Array.isArray(mat) || !("opacity" in mat)) return;
      const base = (mat.userData.baseOpacity as number | undefined) ?? (mat.userData.baseOpacity = mat.opacity);
      mat.opacity = obj.present ? base : base * 0.25;
    });
  }

  private applyHighlight(): void {
    for (const obj of this.rooms.values()) {
      const active = this.selected === obj.areaId && obj.present;
      // Active = primary-container at full opacity (readable on every zone color); idle = the zone color.
      obj.outlineMat.color.copy(active ? token("primary-container") : obj.zone);
      obj.outlineMat.opacity = active ? 1 : 0.5;
      obj.tintMat.opacity = !obj.present ? 0.01 : active ? 0.14 : 0.04;
    }
  }

  private setPointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    // Matrices are only refreshed on render; the camera and floor groups may have moved since the last frame.
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  // Floor mode: the room under the pointer (shown floor only). Its floor plane or its zone marker ball (feature 154).
  private pick(event: PointerEvent): RoomObjects | undefined {
    this.setPointer(event);
    const rooms = [...this.rooms.values()].filter((r) => r.floor === this.activeFloor);
    const targets = rooms.flatMap((r) => [...r.hits, r.marker]);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return undefined;
    const object = hits[0].object;
    return rooms.find((r) => r.marker === object || r.hits.includes(object as THREE.Mesh));
  }

  // Whole-house mode: the floor of the nearest mesh under the pointer. Lines are skipped (their pick threshold is wide).
  private pickFloor(event: PointerEvent): number | undefined {
    this.setPointer(event);
    const hits = this.raycaster.intersectObjects(this.floorGroups, true);
    for (const hit of hits) {
      if (!(hit.object instanceof THREE.Mesh)) continue;
      const index = this.floorGroups.findIndex((group) => {
        for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) if (node === group) return true;
        return false;
      });
      if (index >= 0) return index;
    }
    return undefined;
  }

  private requestRender(): void {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    const v = new THREE.Vector3();
    for (const [id, el] of this.labels) {
      const obj = this.rooms.get(id);
      if (!obj) continue;
      v.copy(obj.center).project(this.camera);
      const visible = this.mode === "floor" && v.z < 1 && obj.floor === this.activeFloor;
      el.style.opacity = visible ? "1" : "0";
      el.style.transform = `translate(${((v.x + 1) / 2) * this.width}px, ${((1 - v.y) / 2) * this.height}px) translate(-50%, -100%)`;
    }
  }
}
