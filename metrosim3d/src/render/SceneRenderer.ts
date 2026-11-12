import * as THREE from 'three';
import { KIND_ROAD, TILE } from '../sim/constants';
import { PlanTile } from '../sim/tools';
import { World } from '../sim/world';
import { BuildingLayer } from './buildingLayer';
import { CameraRig } from './cameraRig';
import { QUALITY_PROFILES, Quality } from './quality';
import { RoadLayer } from './roadLayer';
import { TerrainMesh } from './terrainMesh';
import { buildTileQuads } from './tileQuads';

const ZONE_COLORS = [new THREE.Color(0), new THREE.Color('#3ccf5a'), new THREE.Color('#3a8ee6'), new THREE.Color('#e6b43a')];
const OK_COLOR = new THREE.Color('#5fe08a');
const BAD_COLOR = new THREE.Color('#ff4d4d');
const SKY = new THREE.Color('#a9cbe3');

/**
 * Rendering layer: owns the WebGL renderer and scene, and mirrors the World into meshes.
 * Never mutates the World. Renders on demand (only when something changed) to save battery.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  private terrain!: TerrainMesh;
  private roads!: RoadLayer;
  private buildings!: BuildingLayer;
  private zoneMesh: THREE.Mesh;
  private previewMesh: THREE.Mesh;
  private world!: World;
  private seen = { terrain: -1, road: -1, zone: -1, building: -1 };
  private quality: Quality;
  private dirty = true;
  private shadowMode: 'dynamic' | 'static' = 'dynamic';
  /** Static shadow mode: redraw the shadow map on the next frame. */
  private shadowDirty = true;
  /** Rolling average of CPU time spent in render() calls, ms. */
  frameMs = 0;
  /** Time spent in the last sync(), by layer (ms). For the performance test. */
  lastSync = { terrain: 0, roads: 0, zones: 0, buildings: 0, trees: 0 };

  /** Player's shadow setting: null follows the quality preset. */
  private shadowPref: boolean | null = null;

  private effectiveShadows(): boolean {
    return this.shadowPref ?? QUALITY_PROFILES[this.quality].shadows;
  }

  constructor(private canvas: HTMLCanvasElement, world: World, quality: Quality, shadowPref: boolean | null = null) {
    this.quality = quality;
    this.shadowPref = shadowPref;
    const prof = { ...QUALITY_PROFILES[quality], shadows: shadowPref ?? QUALITY_PROFILES[quality].shadows };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: prof.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prof.pixelRatioCap));
    this.renderer.shadowMap.enabled = prof.shadows;
    this.renderer.shadowMap.type = prof.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.shadowMode = prof.shadowMode;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene.background = SKY;
    this.scene.fog = new THREE.Fog(SKY, 800, 4000);
    this.scene.add(new THREE.HemisphereLight('#cfe6ff', '#5a6b3a', 1.1));
    this.sun.position.set(300, 500, 200);
    this.sun.castShadow = prof.shadows;
    if (prof.shadows) {
      this.sun.shadow.mapSize.set(prof.shadowMapSize, prof.shadowMapSize);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.6;
    }
    this.scene.add(this.sun, this.sun.target);

    this.zoneMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    );
    this.zoneMesh.renderOrder = 3;
    this.previewMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }),
    );
    this.previewMesh.renderOrder = 10;
    this.scene.add(this.zoneMesh, this.previewMesh);

    this.world = world;
    this.rig = new CameraRig(world.size * TILE, (x, z) => this.world.heightAt(x, z));
    this.setWorld(world);
  }

  setWorld(world: World): void {
    if (this.terrain) {
      // Replacing an existing city.
      this.scene.remove(this.terrain.group, this.roads.mesh, this.buildings.group);
      this.terrain.dispose();
      this.roads.dispose();
      this.buildings.dispose();
    }
    this.world = world;
    const prof = QUALITY_PROFILES[this.quality];
    this.terrain = new TerrainMesh(world);
    this.roads = new RoadLayer(world, Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.buildings = new BuildingLayer(world, this.effectiveShadows(), prof.treeDensity, prof.treeShadows);
    this.scene.add(this.terrain.group, this.roads.mesh, this.buildings.group);
    // Rig bounds depend on map size.
    this.rig.setBounds(world.size * TILE);
    this.seen = { terrain: world.terrainVersion, road: -1, zone: -1, building: -1 };
    this.shadowDirty = true;
    this.sync();
    this.dirty = true;
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    const prof = QUALITY_PROFILES[q];
    // Antialiasing is fixed at context creation; the rest can change live.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prof.pixelRatioCap));
    this.renderer.shadowMap.type = prof.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.shadowMode = prof.shadowMode;
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.applyShadows(this.effectiveShadows());
    this.buildings.setTreeDensity(prof.treeDensity);
    this.resize();
  }

  /** Player's shadow choice: true/false, or null to follow the quality preset. */
  setShadowPref(p: boolean | null): void {
    this.shadowPref = p;
    this.applyShadows(this.effectiveShadows());
  }

  private applyShadows(on: boolean): void {
    const prof = QUALITY_PROFILES[this.quality];
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    if (on) this.sun.shadow.mapSize.set(prof.shadowMapSize, prof.shadowMapSize);
    this.buildings.setShadows(on, prof.treeShadows);
    this.scene.traverse((obj) => {
      const m = (obj as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.shadowDirty = true;
    this.dirty = true;
  }

  /**
   * Performance-test overrides: switch one cost factor off at a time to see what it costs.
   * Pass null to restore the quality profile's value.
   */
  diagnose(o: { shadows?: boolean | null; pixelRatio?: number | null; trees?: boolean | null; shadowMode?: 'dynamic' | 'static' | null }): void {
    const prof = QUALITY_PROFILES[this.quality];
    if (o.shadowMode !== undefined) {
      this.shadowMode = o.shadowMode ?? prof.shadowMode;
      this.shadowDirty = true;
    }
    if (o.shadows !== undefined) {
      const on = o.shadows ?? this.effectiveShadows();
      if (this.renderer.shadowMap.enabled !== on) this.applyShadows(on);
    }
    if (o.pixelRatio !== undefined && o.pixelRatio !== this.renderer.getPixelRatio()) {
      this.renderer.setPixelRatio(o.pixelRatio ?? Math.min(window.devicePixelRatio || 1, prof.pixelRatioCap));
      this.resize();
    }
    if (o.trees !== undefined) this.buildings.setTreesVisible(o.trees ?? true);
    this.dirty = true;
  }

  shadowsOn(): boolean {
    return this.renderer.shadowMap.enabled;
  }

  basePixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, QUALITY_PROFILES[this.quality].pixelRatioCap);
  }

  treeCount(): number {
    return this.buildings.treeCount();
  }

  /** Rebuild whatever layers the world says have changed. */
  sync(): void {
    const w = this.world;
    let trees = false;
    const ls = (this.lastSync = { terrain: 0, roads: 0, zones: 0, buildings: 0, trees: 0 });
    let t = performance.now();
    const lap = (k: keyof typeof ls) => {
      const n = performance.now();
      ls[k] += n - t;
      t = n;
    };
    // A terrain edit only needs roads / zone overlays rebuilt if the edited area contains any.
    let roadsInEdit = false;
    let zonesInEdit = false;
    if (w.terrainVersion !== this.seen.terrain) {
      const d = w.terrainDirty;
      if (d) {
        for (let y = Math.max(0, d.y0 - 1); y <= Math.min(w.size - 1, d.y1); y++)
          for (let x = Math.max(0, d.x0 - 1); x <= Math.min(w.size - 1, d.x1); x++) {
            const i = w.idx(x, y);
            if (w.kind[i] === KIND_ROAD) roadsInEdit = true;
            else if (w.zone[i] && w.kind[i] === 0) zonesInEdit = true;
          }
      } else roadsInEdit = zonesInEdit = true;
      if (d) {
        this.terrain.updateRect(d.x0, d.y0, d.x1, d.y1);
        this.buildings.updateTreeHeights(d.x0 - 1, d.y0 - 1, d.x1 + 1, d.y1 + 1);
      } else this.terrain.update();
      w.terrainDirty = null;
      lap('terrain');
      this.seen.terrain = w.terrainVersion;
      trees = true;
    }
    if (w.roadVersion !== this.seen.road || roadsInEdit) {
      this.roads.update();
      lap('roads');
      this.seen.road = w.roadVersion;
      trees = true;
    }
    if (w.zoneVersion !== this.seen.zone || w.buildingVersion !== this.seen.building || zonesInEdit) {
      t = performance.now();
      this.updateZones();
      lap('zones');
      trees = true;
    }
    if (w.buildingVersion !== this.seen.building) {
      t = performance.now();
      this.buildings.updateBuildings();
      lap('buildings');
    }
    this.seen.zone = w.zoneVersion;
    this.seen.building = w.buildingVersion;
    if (trees) {
      t = performance.now();
      this.buildings.updateTrees();
      lap('trees');
      this.dirty = true;
      this.shadowDirty = true;
    }
  }

  private updateZones(): void {
    const w = this.world;
    const tiles: { x: number; y: number; z: number }[] = [];
    for (let y = 0; y < w.size; y++)
      for (let x = 0; x < w.size; x++) {
        const i = w.idx(x, y);
        if (w.zone[i] && w.kind[i] === 0) tiles.push({ x, y, z: w.zone[i] });
      }
    const g = buildTileQuads(w, tiles, 0.2, (t) => ZONE_COLORS[t.z], 0.5);
    this.zoneMesh.geometry.dispose();
    this.zoneMesh.geometry = g;
  }

  setPreview(tiles: PlanTile[] | null): void {
    const g = tiles && tiles.length ? buildTileQuads(this.world, tiles, 0.35, (t) => (t.ok ? OK_COLOR : BAD_COLOR), 0.3) : new THREE.BufferGeometry();
    this.previewMesh.geometry.dispose();
    this.previewMesh.geometry = g;
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / Math.max(1, h);
    this.rig.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /** Renders if anything changed. Returns true if a frame was drawn. */
  render(force = false): boolean {
    if (!this.dirty && !force) return false;
    this.dirty = false;
    const t0 = performance.now();
    const s = this.rig.state;
    const sc = this.sun.shadow.camera;
    const sm = this.renderer.shadowMap;
    if (this.shadowMode === 'static') {
      // One shadow map for the whole map, from a fixed sun; redrawn only when the city changes.
      const span = this.world.size * TILE;
      const half = span * 0.75; // covers the map's diagonal as seen along the sun direction
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.near = 10;
      sc.far = 4000;
      sc.updateProjectionMatrix();
      this.sun.target.position.set(span / 2, 0, span / 2);
      this.sun.position.set(span / 2 + 700, 1200, span / 2 + 440);
      sm.autoUpdate = false;
      if (this.shadowDirty) {
        sm.needsUpdate = true;
        this.shadowDirty = false;
      }
    } else {
      // Fit the sun's shadow frustum around what the camera is looking at; redraw every frame.
      const ext = Math.min(1200, Math.max(120, s.distance * 1.3));
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.near = 10;
      sc.far = 2000;
      sc.updateProjectionMatrix();
      const ty = this.world.heightAt(s.tx, s.tz);
      this.sun.target.position.set(s.tx, ty, s.tz);
      this.sun.position.set(s.tx + 350, ty + 600, s.tz + 220);
      sm.autoUpdate = true;
    }
    const fog = this.scene.fog as THREE.Fog;
    fog.near = s.distance * 2 + 400;
    fog.far = s.distance * 6 + 2500;
    this.renderer.render(this.scene, this.rig.camera);
    const dt = performance.now() - t0;
    this.frameMs = this.frameMs * 0.9 + dt * 0.1;
    return true;
  }

  /** Ray-march the heightfield under a screen point. Returns world XZ or null if it misses the map. */
  pick(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.rig.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const span = this.world.size * TILE;
    const step = TILE / 3;
    const maxT = this.rig.camera.far;
    const above = (t: number) => {
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      return o.y + d.y * t - Math.max(0, this.world.heightAt(x, z));
    };
    let prev = 0;
    for (let t = step; t < maxT; t += step) {
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      if (above(t) <= 0) {
        // Binary refine between prev and t.
        let a = prev;
        let b = t;
        for (let i = 0; i < 12; i++) {
          const m = (a + b) / 2;
          if (above(m) > 0) a = m;
          else b = m;
        }
        const hx = o.x + d.x * b;
        const hz = o.z + d.z * b;
        if (hx < 0 || hz < 0 || hx >= span || hz >= span) return null;
        return { x: hx, z: hz };
      }
      if (d.y >= 0 && o.y + d.y * t > 400) break; // looking up into the sky
      if ((x < -span || z < -span || x > 2 * span || z > 2 * span) && t > span * 3) break;
      prev = t;
    }
    return null;
  }

  dispose(): void {
    this.terrain.dispose();
    this.roads.dispose();
    this.buildings.dispose();
    this.renderer.dispose();
  }
}
