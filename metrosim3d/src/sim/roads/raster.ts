import { KIND_EMPTY, KIND_ROAD, TILE, ZONE_NONE } from '../constants';
import type { World } from '../world';
import { Curve, sampleCurve } from './geometry';
import { COVER_MARGIN, ROAD_TYPES, RoadType } from './types';

/** Tile indices a road curve covers (tile centre within half-width + margin of the centreline). */
export function curveTiles(world: World, k: Curve, type: RoadType): number[] {
  const r = ROAD_TYPES[type].width / 2 + COVER_MARGIN;
  const out = new Set<number>();
  for (const { p } of sampleCurve(k, 1)) {
    const tx0 = Math.max(0, Math.floor((p.x - r) / TILE));
    const tx1 = Math.min(world.size - 1, Math.floor((p.x + r) / TILE));
    const ty0 = Math.max(0, Math.floor((p.z - r) / TILE));
    const ty1 = Math.min(world.size - 1, Math.floor((p.z + r) / TILE));
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx = (tx + 0.5) * TILE - p.x;
        const dz = (ty + 0.5) * TILE - p.z;
        if (dx * dx + dz * dz <= r * r) out.add(ty * world.size + tx);
      }
  }
  return [...out];
}

/** Marks a segment's tiles as road (reference counted, so overlapping roads release cleanly). */
export function attachSegment(world: World, segId: number): void {
  const s = world.roads.segs.get(segId)!;
  const tiles = curveTiles(world, world.roads.curveOf(s), s.type);
  world.segTiles.set(segId, tiles);
  let zones = false;
  for (const i of tiles) {
    world.roadCount[i]++;
    world.kind[i] = KIND_ROAD;
    if (world.zone[i] !== ZONE_NONE) {
      world.zone[i] = ZONE_NONE;
      zones = true;
    }
  }
  if (zones) world.zoneVersion++;
  world.roadVersion++;
}

export function detachSegment(world: World, segId: number): void {
  for (const i of world.segTiles.get(segId) ?? []) {
    if (world.roadCount[i] > 0) world.roadCount[i]--;
    if (world.roadCount[i] === 0 && world.kind[i] === KIND_ROAD) world.kind[i] = KIND_EMPTY;
  }
  world.segTiles.delete(segId);
  world.roadVersion++;
}

/** Re-derives every road tile from the network (after loading). */
export function rasterizeAll(world: World): void {
  for (let i = 0; i < world.kind.length; i++) if (world.kind[i] === KIND_ROAD) world.kind[i] = KIND_EMPTY;
  world.roadCount.fill(0);
  world.segTiles.clear();
  for (const id of world.roads.segs.keys()) attachSegment(world, id);
}
