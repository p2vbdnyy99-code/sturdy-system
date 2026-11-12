import {
  BUILDING_DEFS,
  BuildingType,
  KIND_BUILDING,
  KIND_EMPTY,
  SEA_LEVEL,
  START_MONEY,
  TILE,
  ZoneId,
} from './constants';
import { Treasury } from './finance/treasury';
import { Rng } from './rng';
import type { GameMode } from './rules';
import { generateHeights } from './terrain';

export interface Building {
  id: number;
  type: BuildingType;
  /** Top-left (north-west) tile of the footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Seed for procedural appearance. */
  seed: number;
  /** True if it grew from zoning (vs. placed by hand). */
  grown: boolean;
}

export interface TileXY {
  x: number;
  y: number;
}

/**
 * Pure simulation state. No rendering or DOM dependencies, so it can move to a Web Worker later.
 * Version counters let the renderer rebuild only the layers that changed.
 */
export class World {
  readonly size: number;
  readonly seed: number;
  name: string;
  heights: Float32Array;
  kind: Uint8Array;
  zone: Uint8Array;
  buildingAt: Int32Array;
  buildings = new Map<number, Building>();
  nextBuildingId = 1;
  /** Creative (default, primary) or Realistic. Switching never modifies the city itself. */
  mode: GameMode = 'creative';
  /** Creative mode only: charge construction to the treasury anyway (optional finance simulation). */
  financeInCreative = false;
  treasury = new Treasury(START_MONEY);
  /** Union of terrain corners changed since the renderer last synced (null = none / full). */
  terrainDirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  rng: Rng;
  /** Simulation ticks elapsed (one tick = one in-game day). */
  tick = 0;

  terrainVersion = 0;
  roadVersion = 0;
  zoneVersion = 0;
  buildingVersion = 0;

  constructor(size: number, seed: number, name = 'New City', heights?: Float32Array) {
    this.size = size;
    this.seed = seed >>> 0;
    this.name = name;
    this.heights = heights ?? generateHeights(size, this.seed);
    if (this.heights.length !== (size + 1) * (size + 1)) throw new Error('Height array size mismatch');
    this.kind = new Uint8Array(size * size);
    this.zone = new Uint8Array(size * size);
    this.buildingAt = new Int32Array(size * size).fill(-1);
    this.rng = new Rng(this.seed ^ 0x9e3779b9);
  }

  get money(): number {
    return this.treasury.balance;
  }
  set money(v: number) {
    this.treasury.balance = Math.round(v);
  }
  /** True when construction is free: Creative mode without the optional finance simulation. */
  get unlimitedMoney(): boolean {
    return this.mode === 'creative' && !this.financeInCreative;
  }

  setCornerH(cx: number, cy: number, h: number): void {
    this.heights[cy * (this.size + 1) + cx] = h;
  }

  /** Record a changed corner rectangle so the renderer can update just that area. */
  markTerrainDirty(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.terrainDirty;
    this.terrainDirty = d
      ? { x0: Math.min(d.x0, x0), y0: Math.min(d.y0, y0), x1: Math.max(d.x1, x1), y1: Math.max(d.y1, y1) }
      : { x0, y0, x1, y1 };
    this.terrainVersion++;
  }

  idx(x: number, y: number): number {
    return y * this.size + x;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }
  cornerH(cx: number, cy: number): number {
    return this.heights[cy * (this.size + 1) + cx];
  }
  /** Corner heights of a tile in order NW, NE, SE, SW. */
  tileCorners(x: number, y: number): [number, number, number, number] {
    return [this.cornerH(x, y), this.cornerH(x + 1, y), this.cornerH(x + 1, y + 1), this.cornerH(x, y + 1)];
  }
  /** Min/max corner height over a rectangular footprint. */
  footprintMinMax(x: number, y: number, w: number, h: number): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    for (let cy = y; cy <= y + h; cy++) {
      for (let cx = x; cx <= x + w; cx++) {
        const v = this.cornerH(cx, cy);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return [lo, hi];
  }
  /** A tile is water if any corner is below sea level (keeps shorelines clear of construction). */
  isWater(x: number, y: number): boolean {
    const c = this.tileCorners(x, y);
    return Math.min(c[0], c[1], c[2], c[3]) < SEA_LEVEL + 0.3;
  }
  getKind(x: number, y: number): number {
    return this.kind[this.idx(x, y)];
  }
  getZone(x: number, y: number): ZoneId {
    return this.zone[this.idx(x, y)] as ZoneId;
  }

  /**
   * Terrain height at world position (wx, wz), interpolated on the same triangle split the
   * terrain mesh uses (diagonal from SW to NE corner), so picks land exactly on the surface.
   */
  heightAt(wx: number, wz: number): number {
    const fx = Math.min(Math.max(wx / TILE, 0), this.size - 1e-6);
    const fy = Math.min(Math.max(wz / TILE, 0), this.size - 1e-6);
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const u = fx - x;
    const v = fy - y;
    const [nw, ne, se, sw] = this.tileCorners(x, y);
    // Triangle A: NW, SW, NE (u + v <= 1); triangle B: NE, SW, SE.
    if (u + v <= 1) return nw + (ne - nw) * u + (sw - nw) * v;
    return se + (sw - se) * (1 - u) + (ne - se) * (1 - v);
  }

  addBuilding(type: BuildingType, x: number, y: number, grown: boolean): Building {
    const def = BUILDING_DEFS[type];
    const b: Building = {
      id: this.nextBuildingId++,
      type,
      x,
      y,
      w: def.w,
      h: def.h,
      seed: (this.rng.next() * 4294967296) >>> 0,
      grown,
    };
    this.buildings.set(b.id, b);
    for (let ty = y; ty < y + def.h; ty++) {
      for (let tx = x; tx < x + def.w; tx++) {
        const i = this.idx(tx, ty);
        this.kind[i] = KIND_BUILDING;
        this.buildingAt[i] = b.id;
      }
    }
    this.buildingVersion++;
    return b;
  }

  removeBuilding(id: number): void {
    const b = this.buildings.get(id);
    if (!b) return;
    for (let ty = b.y; ty < b.y + b.h; ty++) {
      for (let tx = b.x; tx < b.x + b.w; tx++) {
        const i = this.idx(tx, ty);
        this.kind[i] = KIND_EMPTY;
        this.buildingAt[i] = -1;
      }
    }
    this.buildings.delete(id);
    this.buildingVersion++;
  }

  /** Rebuilds buildingAt/kind from the building list (used after loading). */
  reindexBuildings(): void {
    this.buildingAt.fill(-1);
    for (const b of this.buildings.values()) {
      for (let ty = b.y; ty < b.y + b.h; ty++) {
        for (let tx = b.x; tx < b.x + b.w; tx++) {
          const i = this.idx(tx, ty);
          this.kind[i] = KIND_BUILDING;
          this.buildingAt[i] = b.id;
        }
      }
    }
  }

  bumpAll(): void {
    this.terrainVersion++;
    this.roadVersion++;
    this.zoneVersion++;
    this.buildingVersion++;
  }
}
