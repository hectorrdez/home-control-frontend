import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RoomGlow } from "./glow";
import { DEFAULT_PLAN, type Box, type HousePlan, type RoomPlan } from "./plan";
import { zoneColorToken } from "../features/zones/zoneColors";

// Procedural isometric house (106). Plain three + OrbitControls; render on demand (no idle loop).
// Colors come from the CSS tokens of index.css, read once at mount. Nothing here is a hex literal.

export type ViewPreset = "iso" | "top" | "reset";

export interface RoomState {
  id: string;
  areaId: string;
  present: boolean; // false -> dimmed and unselectable
}

export interface SceneCallbacks {
  onSelect: (areaId: string) => void;
  onContextLost: () => void;
}

interface RoomObjects {
  plan: RoomPlan;
  areaId: string;
  group: THREE.Group;
  center: THREE.Vector3;
  present: boolean;
  hit: THREE.Mesh;
  outline: THREE.LineSegments;
  outlineMat: THREE.LineBasicMaterial;
  tintMat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  hue: THREE.Color; // glow hue from the plan (lit state)
  zone: THREE.Color; // stable zone color (feature 130): tint, outline and marker
}

const LABEL_HEIGHT = 3.2;
const ISO = { azimuth: Math.PI / 4, polar: 0.58, radius: 38 };
const TOP = { azimuth: 0, polar: 1.35, radius: 38 };
const CLICK_SLACK_PX = 5;

function token(name: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  return new THREE.Color(raw || undefined);
}

function boxMesh(box: Box, material: THREE.Material, edge: THREE.Color, edgeOpacity: number): THREE.Group {
  const geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
  const group = new THREE.Group();
  group.position.set(box.x, box.h / 2, box.z);
  group.add(new THREE.Mesh(geometry, material));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: edgeOpacity }),
  );
  group.add(edges);
  return group;
}

export class HouseScene {
  private readonly container: HTMLElement;
  private readonly callbacks: SceneCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly rooms = new Map<string, RoomObjects>();
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
    this.controls.target.set(0, 1.5, 0);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 60;
    this.controls.addEventListener("change", () => this.requestRender());
    this.setView("iso");

    this.buildLights();
    this.buildStage(plan);
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
      const hit = this.pick(event);
      if (hit?.present) this.callbacks.onSelect(hit.areaId);
    });
    this.on(canvas, "pointermove", (e) => {
      const hit = this.pick(e as PointerEvent);
      canvas.style.cursor = hit?.present ? "pointer" : "";
    });
    this.requestRender();
  }

  // Room list from the live areas: updates dimming, glows and the highlight. Call on every store change.
  setRooms(rooms: RoomState[], glows: Record<string, RoomGlow>): void {
    for (const room of rooms) {
      const obj = this.rooms.get(room.id);
      if (!obj) continue;
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
    const r = view.radius;
    this.camera.position.set(
      r * Math.cos(view.polar) * Math.sin(view.azimuth),
      r * Math.sin(view.polar),
      r * Math.cos(view.polar) * Math.cos(view.azimuth),
    );
    this.camera.lookAt(this.controls.target);
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
      for (const wall of floor.walls) {
        const mat = this.track(new THREE.MeshPhongMaterial({ color: token("surface-container-highest"), transparent: true, opacity: 0.35 }));
        this.scene.add(boxMesh(wall, mat, token("secondary"), 0.8));
      }
      for (const room of floor.rooms) this.buildRoom(room);
    }
  }

  private buildRoom(plan: RoomPlan): void {
    const { rect } = plan;
    const center = new THREE.Vector3(rect.x, LABEL_HEIGHT, rect.z);
    const hue = token(plan.hue);
    const zone = token(this.zoneOf(plan.areaId));
    const group = new THREE.Group();

    const tintMat = this.track(new THREE.MeshBasicMaterial({ color: zone, transparent: true, opacity: 0.04, side: THREE.DoubleSide }));
    const floorGeo = this.trackGeometry(new THREE.PlaneGeometry(rect.w, rect.d));
    const hit = new THREE.Mesh(floorGeo, tintMat);
    hit.rotation.x = -Math.PI / 2;
    hit.position.set(rect.x, 0.01, rect.z);
    group.add(hit);

    const outlineMat = this.track(new THREE.LineBasicMaterial({ color: zone, transparent: true, opacity: 0.5 }));
    const outline = new THREE.LineSegments(this.trackGeometry(new THREE.EdgesGeometry(new THREE.BoxGeometry(rect.w, 0.02, rect.d))), outlineMat);
    outline.position.set(rect.x, 0.02, rect.z);
    group.add(outline);

    const furnitureMat = this.track(new THREE.MeshPhongMaterial({ color: token("surface-container-highest"), transparent: true, opacity: 0.6 }));
    for (const box of plan.furniture) group.add(boxMesh(box, furnitureMat, hue, 0.7));

    const marker = new THREE.Mesh(
      this.trackGeometry(new THREE.SphereGeometry(0.3, 16, 16)),
      this.track(new THREE.MeshStandardMaterial({ color: zone, emissive: zone, emissiveIntensity: 0.8 })),
    );
    marker.position.copy(center);
    group.add(marker);

    const light = new THREE.PointLight(hue, 0, 14);
    light.position.set(rect.x, 3, rect.z);
    light.visible = false;
    group.add(light);

    this.scene.add(group);
    this.rooms.set(plan.id, {
      plan,
      areaId: plan.areaId,
      group,
      center,
      present: true,
      hit,
      outline,
      outlineMat,
      tintMat,
      light,
      hue,
      zone,
    });
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
      const active = this.selected === obj.plan.areaId && obj.present;
      // Active = primary-container at full opacity (readable on every zone color); idle = the zone color.
      obj.outlineMat.color.copy(active ? token("primary-container") : obj.zone);
      obj.outlineMat.opacity = active ? 1 : 0.5;
      obj.tintMat.opacity = !obj.present ? 0.01 : active ? 0.14 : 0.04;
    }
  }

  private pick(event: PointerEvent): RoomObjects | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.rooms.values()].map((r) => r.hit), false);
    if (hits.length === 0) return undefined;
    return [...this.rooms.values()].find((r) => r.hit === hits[0].object);
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
      const visible = v.z < 1;
      el.style.opacity = visible ? "1" : "0";
      el.style.transform = `translate(${((v.x + 1) / 2) * this.width}px, ${((1 - v.y) / 2) * this.height}px) translate(-50%, -100%)`;
    }
  }
}
