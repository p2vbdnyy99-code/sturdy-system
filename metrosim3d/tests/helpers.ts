import { commitRoad, planRoad } from '../src/sim/roads/build';
import { straight } from '../src/sim/roads/geometry';
import type { RoadType } from '../src/sim/roads/types';
import type { TileXY, World } from '../src/sim/world';

const c = (t: TileXY) => ({ x: (t.x + 0.5) * 8, z: (t.y + 0.5) * 8 });

/** Plans a street along tile centres: straight, or L-shaped (horizontal first) like the old tool. */
export function planTileRoad(w: World, from: TileXY, to: TileXY, type: RoadType = 'street') {
  const curves =
    from.x !== to.x && from.y !== to.y
      ? [straight(c(from), c({ x: to.x, y: from.y })), straight(c({ x: to.x, y: from.y }), c(to))]
      : [straight(c(from), c(to))];
  return planRoad(w, curves, type, true);
}

export function tileRoad(w: World, from: TileXY, to: TileXY, type: RoadType = 'street') {
  const plan = planTileRoad(w, from, to, type);
  if (!plan.ok) return { ok: false, reason: plan.reason, plan };
  commitRoad(w, plan);
  return { ok: true, reason: undefined, plan };
}
