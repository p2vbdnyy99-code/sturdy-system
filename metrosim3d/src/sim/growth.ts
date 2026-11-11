import { BuildingType, KIND_BUILDING, KIND_EMPTY, KIND_ROAD, ZONE_COM, ZONE_IND, ZONE_NONE, ZONE_RES } from './constants';
import { World } from './world';

/** Tiles within this Manhattan distance of a road can develop. */
export const ROAD_REACH = 2;
/** Zoned empty tiles examined per day: a base amount plus a share of all candidates. */
const BASE_SAMPLES = 4;
const SAMPLE_SHARE = 0.04;
const GROW_CHANCE = 0.5;

export function nearRoad(world: World, x: number, y: number): boolean {
  for (let dy = -ROAD_REACH; dy <= ROAD_REACH; dy++) {
    for (let dx = -ROAD_REACH; dx <= ROAD_REACH; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > ROAD_REACH) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (world.inBounds(nx, ny) && world.getKind(nx, ny) === KIND_ROAD) return true;
    }
  }
  return false;
}

function builtNeighbours(world: World, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if ((dx || dy) && world.inBounds(x + dx, y + dy) && world.getKind(x + dx, y + dy) === KIND_BUILDING) n++;
  return n;
}

/**
 * One simulation day of zone development: zoned, empty tiles near a road may grow a building.
 * Denser neighbourhoods grow taller buildings. Deterministic given the world's RNG state.
 * Returns the number of buildings that grew.
 */
export function stepGrowth(world: World): number {
  world.tick++;
  // Candidates: zoned, undeveloped tiles. Sampling only these keeps growth speed independent of map size.
  const cand: number[] = [];
  for (let i = 0; i < world.zone.length; i++) if (world.zone[i] !== ZONE_NONE && world.kind[i] === KIND_EMPTY) cand.push(i);
  if (!cand.length) return 0;
  const samples = Math.min(cand.length, Math.round(BASE_SAMPLES + cand.length * SAMPLE_SHARE));
  let grown = 0;
  for (let s = 0; s < samples; s++) {
    const i = cand[world.rng.int(cand.length)];
    const x = i % world.size;
    const y = Math.floor(i / world.size);
    const z = world.zone[i];
    if (world.kind[i] !== KIND_EMPTY) continue;
    if (world.rng.next() > GROW_CHANCE) continue;
    if (!nearRoad(world, x, y)) continue;
    const dense = builtNeighbours(world, x, y) >= 4 && world.rng.next() < 0.45;
    let type: BuildingType;
    if (z === ZONE_RES) type = dense ? 'apartment' : 'house';
    else if (z === ZONE_COM) type = dense ? 'office' : 'shop';
    else if (z === ZONE_IND) type = world.rng.next() < 0.5 ? 'workshop' : 'warehouse';
    else continue;
    world.addBuilding(type, x, y, true);
    grown++;
  }
  return grown;
}
