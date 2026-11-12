import { BUILDING_DEFS, BuildingType, MAP_SIZES, MapSizeId, TILE, ZONE_COM, ZONE_IND, ZONE_RES } from '../sim/constants';
import { stepGrowth } from '../sim/growth';
import { CityData, restore, snapshot } from '../sim/serialize';
import { CityStats, computeStats } from '../sim/stats';
import { Action, commitAction, Plan, planAction } from '../sim/tools';
import { TileXY, World } from '../sim/world';
import { Quality } from '../render/quality';
import { SceneRenderer } from '../render/SceneRenderer';
import { listSaves, loadCity, newSaveId, saveCity, SaveMeta } from '../storage/saves';
import { InputController, ToolHandler } from './InputController';
import { BenchReport, DIAG_SECONDS, formatReport, makeScenarioWorld, ORBIT_SECONDS, percentile, ScenarioResult, SCENARIOS } from './benchmark';
import { loadSettings, saveSettings, Settings, shadowPref } from './settings';

export type ToolId = 'pan' | 'road' | 'zoneRes' | 'zoneCom' | 'zoneInd' | 'place' | 'bulldoze';
export type Speed = 0 | 1 | 3;

export interface UiState {
  tool: ToolId;
  placeType: BuildingType;
  cityName: string;
  saveId: string | null;
  money: number;
  unlimitedMoney: boolean;
  stats: CityStats;
  day: number;
  speed: Speed;
  hint: { text: string; ok: boolean } | null;
  toast: { text: string; id: number } | null;
  canUndo: boolean;
  settings: Settings;
  frameMs: number;
  lastSavedAt: number | null;
  mapSize: number;
  bench: { running: boolean; step: string; report: string | null };
}

const UNDO_LIMIT = 25;
const AUTOSAVE_MS = 60_000;
/** Real seconds per simulated day at 1x. */
const DAY_SECONDS = 0.8;

const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/**
 * Game controller: owns the World, the renderer and input, and turns pointer gestures into
 * simulation Actions. The React UI talks only to this class (via getState/subscribe + methods).
 */
export class Game implements ToolHandler {
  world: World;
  readonly view: SceneRenderer;
  private input: InputController;
  private listeners = new Set<() => void>();
  private state: UiState;
  private undoStack: CityData[] = [];
  private anchor: TileXY | null = null;
  private current: TileXY | null = null;
  private raf = 0;
  private lastT = performance.now();
  private simAcc = 0;
  private toastId = 0;
  private changedSinceSave = false;
  private autosaveTimer: number;
  /** While set, the benchmark drives the camera and records frame times each loop. */
  private benchHook: ((t: number) => void) | null = null;
  private onResize = () => this.view.resize();
  private onHide = () => {
    if (document.visibilityState === 'hidden') void this.autosave();
  };

  constructor(canvas: HTMLCanvasElement) {
    const settings = loadSettings();
    this.world = new World(MAP_SIZES.large, randomSeed(), 'New City');
    this.view = new SceneRenderer(canvas, this.world, settings.quality, shadowPref(settings));
    this.input = new InputController(canvas, this.view.rig, this);
    this.state = {
      tool: 'road',
      placeType: 'park',
      cityName: this.world.name,
      saveId: null,
      money: this.world.money,
      unlimitedMoney: this.world.unlimitedMoney,
      stats: computeStats(this.world),
      day: 0,
      speed: 1,
      hint: null,
      toast: null,
      canUndo: false,
      settings,
      frameMs: 0,
      lastSavedAt: null,
      mapSize: this.world.size,
      bench: { running: false, step: '', report: null },
    };
    this.view.resize();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onHide);
    this.autosaveTimer = window.setInterval(() => void this.autosave(), AUTOSAVE_MS);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- UI store ----------
  getState = (): UiState => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
  private refreshCity(): void {
    this.set({
      money: this.world.money,
      unlimitedMoney: this.world.unlimitedMoney,
      stats: computeStats(this.world),
      day: this.world.tick,
      cityName: this.world.name,
      canUndo: this.undoStack.length > 0,
      mapSize: this.world.size,
    });
  }
  toast(text: string): void {
    this.set({ toast: { text, id: ++this.toastId } });
  }

  // ---------- main loop ----------
  private loop = (t: number) => {
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    if (this.benchHook) {
      this.benchHook(t);
      this.view.render(true);
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    this.input.tick(dt);
    if (this.state.speed > 0) {
      this.simAcc += dt * this.state.speed;
      let grew = 0;
      let days = 0;
      while (this.simAcc >= DAY_SECONDS && days < 5) {
        this.simAcc -= DAY_SECONDS;
        grew += stepGrowth(this.world);
        days++;
      }
      if (days) {
        if (grew) this.changedSinceSave = true;
        this.refreshCity();
      }
    }
    this.view.sync();
    if (this.view.render() && this.state.settings.showPerf) {
      if (Math.abs(this.view.frameMs - this.state.frameMs) > 0.2) this.set({ frameMs: this.view.frameMs });
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  // ---------- tools ----------
  setTool(tool: ToolId): void {
    this.anchor = this.current = null;
    this.view.setPreview(null);
    this.set({ tool, hint: tool === 'pan' ? { text: 'Drag to move the view. Two fingers: zoom and rotate.', ok: true } : null });
  }
  setPlaceType(t: BuildingType): void {
    this.set({ placeType: t });
    this.setTool('place');
  }

  toolActive(): boolean {
    return this.state.tool !== 'pan' && !this.state.bench.running;
  }

  private tileAt(cx: number, cy: number): TileXY | null {
    if (Number.isNaN(cx)) return null;
    const p = this.view.pick(cx, cy);
    if (!p) return null;
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.z / TILE) };
  }

  private actionFor(a: TileXY, b: TileXY): Action | null {
    switch (this.state.tool) {
      case 'road':
        return { type: 'road', from: a, to: b };
      case 'zoneRes':
        return { type: 'zone', zone: ZONE_RES, from: a, to: b };
      case 'zoneCom':
        return { type: 'zone', zone: ZONE_COM, from: a, to: b };
      case 'zoneInd':
        return { type: 'zone', zone: ZONE_IND, from: a, to: b };
      case 'bulldoze':
        return { type: 'bulldoze', from: a, to: b };
      case 'place': {
        const def = BUILDING_DEFS[this.state.placeType];
        // Centre multi-tile footprints on the finger.
        return { type: 'place', building: this.state.placeType, at: { x: b.x - Math.floor((def.w - 1) / 2), y: b.y - Math.floor((def.h - 1) / 2) } };
      }
      default:
        return null;
    }
  }

  private showPlan(plan: Plan | null): void {
    this.view.setPreview(plan ? plan.tiles : null);
    if (!plan) return this.set({ hint: null });
    const money = this.world.unlimitedMoney ? '' : ` · ${fmtMoney(plan.cost)}`;
    let text: string;
    if (!plan.ok) text = plan.reason ?? 'Not possible here';
    else if (plan.action.type === 'road') text = `Road: ${plan.count} tile${plan.count === 1 ? '' : 's'}${money}`;
    else if (plan.action.type === 'zone') text = `Zone ${plan.count} tile${plan.count === 1 ? '' : 's'}${money}`;
    else if (plan.action.type === 'bulldoze') text = `Bulldoze${plan.count ? ` ${plan.count} item${plan.count === 1 ? '' : 's'}` : ' zone'}${money}`;
    else text = `${BUILDING_DEFS[plan.action.building].label}${money}`;
    this.set({ hint: { text, ok: plan.ok } });
  }

  private updatePreview(): void {
    if (!this.current) return this.showPlan(null);
    const action = this.actionFor(this.anchor ?? this.current, this.current);
    this.showPlan(action ? planAction(this.world, action) : null);
  }

  hover(cx: number, cy: number): void {
    if (!this.toolActive()) return;
    const t = this.tileAt(cx, cy);
    if (sameTile(t, this.current)) return;
    this.current = t;
    this.updatePreview();
  }
  toolDown(cx: number, cy: number): void {
    const t = this.tileAt(cx, cy);
    this.anchor = this.state.tool === 'place' ? null : t;
    this.current = t;
    this.updatePreview();
  }
  toolMove(cx: number, cy: number): void {
    const t = this.tileAt(cx, cy);
    if (!t || sameTile(t, this.current)) return;
    this.current = t;
    this.updatePreview();
  }
  toolUp(cx: number, cy: number): void {
    if (this.state.bench.running) return;
    const t = this.tileAt(cx, cy) ?? this.current;
    const a = this.anchor ?? t;
    this.anchor = null;
    this.current = null;
    this.view.setPreview(null);
    if (!t || !a) return this.set({ hint: null });
    const action = this.actionFor(a, t);
    if (!action) return;
    const before = snapshot(this.world);
    const res = commitAction(this.world, action);
    if (res.ok) {
      this.undoStack.push(before);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      this.changedSinceSave = true;
      this.set({ hint: null });
    } else {
      this.set({ hint: { text: res.reason ?? 'Not possible here', ok: false } });
    }
    this.refreshCity();
  }
  toolCancel(): void {
    this.anchor = this.current = null;
    this.view.setPreview(null);
    this.set({ hint: null });
  }
  cameraChanged(): void {
    this.view.markDirty();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    const cam = { ...this.view.rig.state };
    this.replaceWorld(restore(prev), false);
    this.view.rig.setState(cam);
    this.changedSinceSave = true;
    this.toast('Undone');
  }

  // ---------- city-level controls ----------
  setSpeed(speed: Speed): void {
    this.set({ speed });
  }
  setUnlimitedMoney(on: boolean): void {
    this.world.unlimitedMoney = on;
    this.changedSinceSave = true;
    this.refreshCity();
  }
  renameCity(name: string): void {
    this.world.name = name.trim() || 'Unnamed City';
    this.changedSinceSave = true;
    this.refreshCity();
  }
  updateSettings(patch: Partial<Settings>): void {
    const settings = { ...this.state.settings, ...patch };
    saveSettings(settings);
    if (patch.quality) this.view.setQuality(patch.quality as Quality);
    if (patch.shadows) this.view.setShadowPref(shadowPref(settings));
    this.set({ settings });
  }
  camera(action: 'rotL' | 'rotR' | 'tiltUp' | 'tiltDown' | 'zoomIn' | 'zoomOut' | 'reset'): void {
    const r = this.view.rig;
    switch (action) {
      case 'rotL': r.rotate(Math.PI / 8, 0); break;
      case 'rotR': r.rotate(-Math.PI / 8, 0); break;
      case 'tiltUp': r.rotate(0, 0.12); break;
      case 'tiltDown': r.rotate(0, -0.12); break;
      case 'zoomIn': r.zoom(0.75); break;
      case 'zoomOut': r.zoom(1 / 0.75); break;
      case 'reset': {
        const span = this.world.size * TILE;
        r.setState({ tx: span / 2, tz: span / 2, distance: Math.min(450, span * 0.55), yaw: Math.PI / 5, pitch: 0.85 });
        break;
      }
    }
    this.view.markDirty();
  }

  private replaceWorld(world: World, resetCamera: boolean): void {
    this.world = world;
    this.view.setWorld(world);
    this.anchor = this.current = null;
    this.view.setPreview(null);
    if (resetCamera) this.camera('reset');
    this.refreshCity();
  }

  newCity(sizeId: MapSizeId, name: string, seed = randomSeed()): void {
    const w = new World(MAP_SIZES[sizeId], seed, name.trim() || 'New City');
    this.undoStack = [];
    this.replaceWorld(w, true);
    this.changedSinceSave = false;
    this.set({ saveId: null, lastSavedAt: null });
    this.toast(`New city: ${w.name}`);
  }

  // ---------- saves ----------
  private meta(id: string, autosave: boolean): SaveMeta {
    return {
      id,
      name: this.world.name,
      savedAt: Date.now(),
      population: computeStats(this.world).population,
      size: this.world.size,
      autosave,
    };
  }

  /** Save to the current slot (or a new one). `asNew` forces a new slot. */
  async save(asNew = false): Promise<void> {
    const id = !asNew && this.state.saveId ? this.state.saveId : newSaveId();
    try {
      await saveCity(this.meta(id, false), snapshot(this.world, this.view.rig.state));
      this.changedSinceSave = false;
      this.set({ saveId: id, lastSavedAt: Date.now() });
      this.toast(`Saved “${this.world.name}”`);
    } catch (e) {
      this.toast(`Save failed: ${(e as Error).message}`);
    }
  }

  private async autosave(): Promise<void> {
    // Never autosave a benchmark city over the player's city.
    if (!this.changedSinceSave || this.state.bench.running) return;
    // Autosave goes to the city's own slot if it has one, otherwise to a single shared autosave slot.
    const id = this.state.saveId ?? 'autosave';
    try {
      await saveCity(this.meta(id, !this.state.saveId), snapshot(this.world, this.view.rig.state));
      this.changedSinceSave = false;
      this.set({ lastSavedAt: Date.now() });
    } catch {
      /* will retry next interval */
    }
  }

  async load(id: string): Promise<void> {
    try {
      const data = await loadCity(id);
      const w = restore(data);
      this.undoStack = [];
      this.replaceWorld(w, !data.camera);
      if (data.camera) this.view.rig.setState(data.camera);
      this.view.markDirty();
      this.changedSinceSave = false;
      this.set({ saveId: id === 'autosave' ? null : id, lastSavedAt: Date.now() });
      this.toast(`Loaded “${w.name}”`);
    } catch (e) {
      this.toast(`Load failed: ${(e as Error).message}`);
    }
  }

  // ---------- performance test ----------
  /**
   * Replaces the city with generated test cities of increasing size, orbits the camera over each
   * while recording real frame intervals, then restores the player's city exactly as it was.
   */
  async runBenchmark(): Promise<void> {
    if (this.state.bench.running) return;
    const saved = snapshot(this.world, this.view.rig.state);
    const savedSpeed = this.state.speed;
    const savedUndo = this.undoStack;
    this.set({ speed: 0, bench: { running: true, step: 'Preparing…', report: null } });
    const results: ScenarioResult[] = [];
    const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));
    try {
      for (const sc of SCENARIOS) {
        this.set({ bench: { running: true, step: `Building “${sc.label}” city…`, report: null } });
        await nextFrame();
        const world = makeScenarioWorld(sc.buildings);
        const t0 = performance.now();
        this.world = world;
        this.view.setWorld(world);
        const buildMs = performance.now() - t0;
        const f0 = performance.now();
        this.view.render(true);
        const firstFrameMs = performance.now() - f0;
        // Rebuild cost: what one growth step costs the renderer at this city size.
        const rebuild: number[] = [];
        const splits: { buildings: number; trees: number; zones: number }[] = [];
        for (let k = 0; k < 5; k++) {
          const x = 2 + k * 3;
          const y = 2;
          if (world.getKind(x, y) === 0 && !world.isWater(x, y)) {
            world.zone[world.idx(x, y)] = 1;
            world.addBuilding('house', x, y, true);
          } else world.buildingVersion++;
          const r0 = performance.now();
          this.view.sync();
          rebuild.push(performance.now() - r0);
          const ls = this.view.lastSync;
          splits.push({ buildings: ls.buildings, trees: ls.trees, zones: ls.zones });
        }
        const med = (k: 'buildings' | 'trees' | 'zones') => percentile(splits.map((x) => x[k]).sort((a, b) => a - b), 0.5);
        rebuild.sort((a, b) => a - b);
        // Orbit at a typical playing view over the dense centre.
        const span = world.size * 8;
        this.view.rig.setState({ tx: span / 2, tz: span / 2, distance: 380, yaw: 0, pitch: 0.75 });
        this.set({ bench: { running: true, step: `Measuring “${sc.label}” (${world.buildings.size.toLocaleString('en-US')} buildings)…`, report: null } });
        const times = await this.orbit(ORBIT_SECONDS, 300);
        const sorted = [...times].sort((a, b) => a - b);
        const total = times.reduce((a, b) => a + b, 0);
        const info = this.view.renderer.info.render;
        results.push({
          label: sc.label,
          buildings: world.buildings.size,
          roadTiles: world.kind.reduce((n, k) => n + (k === 1 ? 1 : 0), 0),
          buildMs,
          rebuildMs: percentile(rebuild, 0.5),
          rebuildSplit: { buildings: med('buildings'), trees: med('trees'), zones: med('zones') },
          firstFrameMs,
          frames: times.length,
          fps: times.length ? (1000 * times.length) / total : 0,
          p50: percentile(sorted, 0.5),
          p95: percentile(sorted, 0.95),
          worst: sorted[sorted.length - 1] ?? 0,
          drawCalls: info.calls,
          triangles: info.triangles,
        });
      }
      // Diagnosis: re-measure the City scenario with one cost factor removed at a time.
      const diagnosis: BenchReport['diagnosis'] = [];
      const city = makeScenarioWorld(SCENARIOS[2].buildings);
      this.world = city;
      this.view.setWorld(city);
      const trees = this.view.treeCount();
      const span = city.size * 8;
      // Each variant flips one factor relative to the current configuration.
      const shOn = this.view.shadowsOn();
      const pr = this.view.basePixelRatio();
      const altPr = pr > 1 ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      const prLabel = `${altPr}x resolution`;
      const shLabel = shOn ? 'No shadows' : 'With shadows';
      const variants: { label: string; apply: () => void }[] = [
        { label: `As set (${pr}x, shadows ${shOn ? 'on' : 'off'})`, apply: () => {} },
        { label: shLabel, apply: () => this.view.diagnose({ shadows: !shOn }) },
        { label: prLabel, apply: () => this.view.diagnose({ pixelRatio: altPr }) },
        { label: `${shLabel} + ${altPr}x`, apply: () => this.view.diagnose({ shadows: !shOn, pixelRatio: altPr }) },
      ];
      for (const v of variants) {
        this.set({ bench: { running: true, step: `Diagnosing: ${v.label}…`, report: null } });
        this.view.diagnose({ shadows: null, pixelRatio: null, trees: null, shadowMode: null });
        v.apply();
        this.view.rig.setState({ tx: span / 2, tz: span / 2, distance: 380, yaw: 0, pitch: 0.75 });
        const t = await this.orbit(DIAG_SECONDS, 1500); // long settle: toggling shadows recompiles shaders
        const st = [...t].sort((a, b) => a - b);
        const tot = t.reduce((a, b) => a + b, 0);
        diagnosis.push({ label: v.label, fps: t.length ? (1000 * t.length) / tot : 0, p50: percentile(st, 0.5), p95: percentile(st, 0.95) });
      }
      this.view.diagnose({ shadows: null, pixelRatio: null, trees: null, shadowMode: null });
      const report: BenchReport = {
        date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        device: navigator.userAgent,
        screen: `${screen.width}×${screen.height} @${window.devicePixelRatio}x, canvas ${this.view.renderer.domElement.width}×${this.view.renderer.domElement.height}`,
        quality: this.state.settings.quality,
        pixelRatio: this.view.renderer.getPixelRatio(),
        renderer: gpuName(this.view.renderer.getContext()),
        heapMB: heapMB(),
        scenarios: results,
        diagnosis,
        trees,
      };
      this.set({ bench: { running: false, step: '', report: formatReport(report) } });
    } catch (e) {
      this.benchHook = null;
      this.view.diagnose({ shadows: null, pixelRatio: null, trees: null, shadowMode: null });
      this.set({ bench: { running: false, step: '', report: `Performance test failed: ${(e as Error).message}` } });
    } finally {
      // Put the player's city back exactly as it was.
      this.world = restore(saved);
      this.view.setWorld(this.world);
      if (saved.camera) this.view.rig.setState(saved.camera);
      this.undoStack = savedUndo;
      this.view.markDirty();
      this.set({ speed: savedSpeed });
      this.refreshCity();
    }
  }

  /** Orbit the camera for `seconds`, returning frame intervals (ms) recorded after `settleMs`. */
  private orbit(seconds: number, settleMs: number): Promise<number[]> {
    const times: number[] = [];
    return new Promise((resolve) => {
      let start = -1;
      let last = -1;
      this.benchHook = (t) => {
        if (start < 0) start = t;
        else if (t - start > settleMs) times.push(t - last);
        last = t;
        this.view.rig.rotate((Math.PI * 2) / (seconds * 60), 0);
        if (t - start > settleMs + seconds * 1000) {
          this.benchHook = null;
          resolve(times);
        }
      };
    });
  }

  clearBenchReport(): void {
    this.set({ bench: { running: false, step: '', report: null } });
  }

  listSaves(): Promise<SaveMeta[]> {
    return listSaves();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    clearInterval(this.autosaveTimer);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onHide);
    this.input.dispose();
    this.view.dispose();
  }
}

function sameTile(a: TileXY | null, b: TileXY | null): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } catch {
    return 'unknown';
  }
}

function heapMB(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
