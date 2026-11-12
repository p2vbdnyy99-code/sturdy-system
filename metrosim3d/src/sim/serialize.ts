import { BUILDING_DEFS } from './constants';
import { Building, World } from './world';
import type { FinanceData } from './finance/types';
import { Treasury } from './finance/treasury';
import type { GameMode } from './rules';

/**
 * v1: first playable build (money + unlimitedMoney flag).
 * v2: game mode, optional finance in Creative, treasury ledger (finance block).
 * Older versions are migrated on load; saves are never rejected for being old.
 */
export const SAVE_VERSION = 2;

/** Plain, structured-clone-friendly city snapshot (typed arrays are stored as-is in IndexedDB). */
export interface CityData {
  version: number;
  name: string;
  size: number;
  seed: number;
  heights: Float32Array;
  kind: Uint8Array;
  zone: Uint8Array;
  buildings: Building[];
  nextBuildingId: number;
  /** v1 only (kept for migration). */
  money?: number;
  /** v1 only (kept for migration). */
  unlimitedMoney?: boolean;
  mode?: GameMode;
  financeInCreative?: boolean;
  finance?: FinanceData;
  rngState: number;
  tick: number;
  camera?: CameraState;
}

export interface CameraState {
  tx: number;
  tz: number;
  distance: number;
  yaw: number;
  pitch: number;
}

export function snapshot(world: World, camera?: CameraState): CityData {
  return {
    version: SAVE_VERSION,
    name: world.name,
    size: world.size,
    seed: world.seed,
    heights: world.heights.slice(),
    kind: world.kind.slice(),
    zone: world.zone.slice(),
    buildings: [...world.buildings.values()].map((b) => ({ ...b })),
    nextBuildingId: world.nextBuildingId,
    mode: world.mode,
    financeInCreative: world.financeInCreative,
    finance: world.treasury.toData(),
    rngState: world.rng.state,
    tick: world.tick,
    camera: camera ? { ...camera } : undefined,
  };
}

export function restore(data: CityData): World {
  if (!(data.version >= 1 && data.version <= SAVE_VERSION)) throw new Error(`Unsupported save version ${data.version}`);
  const n = data.size;
  if (data.kind.length !== n * n || data.zone.length !== n * n) throw new Error('Corrupt save: tile arrays do not match map size');
  const world = new World(n, data.seed, data.name, Float32Array.from(data.heights));
  world.kind.set(data.kind);
  world.zone.set(data.zone);
  for (const b of data.buildings) {
    if (!(b.type in BUILDING_DEFS)) throw new Error(`Corrupt save: unknown building type ${b.type}`);
    world.buildings.set(b.id, { ...b });
  }
  world.reindexBuildings();
  world.nextBuildingId = data.nextBuildingId;
  if (data.version === 1) {
    // v1 migration: unlimited money meant the sandbox; limited money meant costs and limits.
    world.mode = data.unlimitedMoney === false ? 'realistic' : 'creative';
    world.financeInCreative = false;
    world.treasury = new Treasury(data.money ?? 0);
  } else {
    world.mode = data.mode === 'realistic' ? 'realistic' : 'creative';
    world.financeInCreative = !!data.financeInCreative;
    if (!data.finance) throw new Error('Corrupt save: finance data missing');
    world.treasury = Treasury.fromData(data.finance);
  }
  world.rng.state = data.rngState >>> 0;
  world.tick = data.tick;
  world.bumpAll();
  return world;
}
