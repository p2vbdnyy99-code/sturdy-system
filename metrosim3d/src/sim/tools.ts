import {
  BUILDING_DEFS,
  BuildingType,
  COST_BULLDOZE,
  COST_ZONE,
  KIND_BUILDING,
  KIND_EMPTY,
  KIND_ROAD,
  MAX_BUILD_SLOPE,
  TILE,
  ZONE_NONE,
  ZoneId,
} from './constants';
import { TileXY, World } from './world';
import { removeRoads } from './roads/build';
import { rulesFor } from './rules';
import type { ExpenseCategory } from './finance/types';

export type Action =
  | { type: 'zone'; zone: ZoneId; from: TileXY; to: TileXY }
  | { type: 'bulldoze'; from: TileXY; to: TileXY }
  | { type: 'place'; building: BuildingType; at: TileXY };

export interface PlanTile {
  x: number;
  y: number;
  ok: boolean;
}

export interface Plan {
  action: Action;
  tiles: PlanTile[];
  /** Number of tiles/items the action would actually change. */
  count: number;
  cost: number;
  ok: boolean;
  reason?: string;
  /** Bulldoze: road segments that will be removed. */
  roadSegs?: number[];
}


function clampTo(world: World, t: TileXY): TileXY {
  return { x: Math.min(Math.max(t.x, 0), world.size - 1), y: Math.min(Math.max(t.y, 0), world.size - 1) };
}

/** Road segments with any covered tile inside the rectangle. */
function bulldozeSegments(world: World, area: TileXY[], inRect: Set<number>): number[] {
  if (!area.length) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of area) {
    x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y);
  }
  const pad = 12;
  return world.roads
    .segsInBox(x0 * TILE - pad, y0 * TILE - pad, (x1 + 1) * TILE + pad, (y1 + 1) * TILE + pad)
    .filter((id) => (world.segTiles.get(id) ?? []).some((i) => inRect.has(i)));
}

function rect(world: World, a: TileXY, b: TileXY): TileXY[] {
  const MAX_DRAG = rulesFor(world).maxDrag;
  const fa = clampTo(world, a);
  let fb = clampTo(world, b);
  fb = {
    x: fa.x + Math.max(-MAX_DRAG + 1, Math.min(MAX_DRAG - 1, fb.x - fa.x)),
    y: fa.y + Math.max(-MAX_DRAG + 1, Math.min(MAX_DRAG - 1, fb.y - fa.y)),
  };
  const out: TileXY[] = [];
  for (let y = Math.min(fa.y, fb.y); y <= Math.max(fa.y, fb.y); y++)
    for (let x = Math.min(fa.x, fb.x); x <= Math.max(fa.x, fb.x); x++) out.push({ x, y });
  return out;
}

function tileSlope(world: World, x: number, y: number): number {
  const c = world.tileCorners(x, y);
  return Math.max(...c) - Math.min(...c);
}

function affordable(world: World, plan: Plan): Plan {
  if (plan.ok && rulesFor(world).chargeMoney && plan.cost > world.money) {
    return { ...plan, ok: false, reason: 'Not enough money' };
  }
  return plan;
}

export function planAction(world: World, action: Action): Plan {
  const rules = rulesFor(world);
  const water = (x: number, y: number) => rules.enforceWater && world.isWater(x, y);
  const steep = (x: number, y: number, limit: number) => rules.enforceSlope && tileSlope(world, x, y) > limit;
  switch (action.type) {
    case 'zone': {
      const tiles: PlanTile[] = [];
      let count = 0;
      for (const t of rect(world, action.from, action.to)) {
        const ok =
          !water(t.x, t.y) &&
          world.getKind(t.x, t.y) === KIND_EMPTY &&
          world.getZone(t.x, t.y) !== action.zone &&
          !steep(t.x, t.y, MAX_BUILD_SLOPE);
        if (ok) count++;
        tiles.push({ ...t, ok });
      }
      const ok = count > 0;
      return affordable(world, {
        action,
        tiles,
        count,
        cost: count * COST_ZONE,
        ok,
        reason: ok ? undefined : 'Nothing to zone here (water, roads, buildings, steep or already zoned)',
      });
    }
    case 'bulldoze': {
      const tiles: PlanTile[] = [];
      const seen = new Set<number>();
      let count = 0;
      const area = rect(world, action.from, action.to);
      const inRect = new Set(area.map((t) => world.idx(t.x, t.y)));
      // Roads are removed a whole segment (junction to junction) at a time.
      const segs = bulldozeSegments(world, area, inRect);
      count += segs.length;
      for (const t of area) {
        const i = world.idx(t.x, t.y);
        const k = world.kind[i];
        let ok = false;
        if (k === KIND_ROAD) {
          ok = segs.length > 0;
        } else if (k === KIND_BUILDING) {
          ok = true;
          const id = world.buildingAt[i];
          if (!seen.has(id)) {
            seen.add(id);
            count++;
          }
        } else if (world.zone[i] !== ZONE_NONE) {
          ok = true; // clearing a zone is free
        }
        tiles.push({ ...t, ok });
      }
      for (const id of segs)
        for (const i of world.segTiles.get(id) ?? [])
          if (!inRect.has(i)) tiles.push({ x: i % world.size, y: Math.floor(i / world.size), ok: true });
      // Show whole footprints of buildings that are partly inside the rectangle.
      for (const id of seen) {
        const b = world.buildings.get(id)!;
        for (let y = b.y; y < b.y + b.h; y++)
          for (let x = b.x; x < b.x + b.w; x++)
            if (!tiles.some((t) => t.x === x && t.y === y)) tiles.push({ x, y, ok: true });
      }
      const ok = tiles.some((t) => t.ok);
      return affordable(world, { action, tiles, count, cost: count * COST_BULLDOZE, ok, reason: ok ? undefined : 'Nothing to bulldoze', roadSegs: segs });
    }
    case 'place': {
      const def = BUILDING_DEFS[action.building];
      const at = action.at;
      const tiles: PlanTile[] = [];
      let reason: string | undefined;
      for (let y = at.y; y < at.y + def.h; y++) {
        for (let x = at.x; x < at.x + def.w; x++) {
          let ok = world.inBounds(x, y);
          if (!ok) reason ??= 'Off the map';
          else if (water(x, y)) {
            ok = false;
            reason ??= 'Cannot build on water in Realistic mode';
          } else if (world.getKind(x, y) !== KIND_EMPTY) {
            ok = false;
            reason ??= 'Space is occupied';
          }
          tiles.push({ x, y, ok });
        }
      }
      let ok = tiles.every((t) => t.ok);
      if (ok) {
        const [lo, hi] = world.footprintMinMax(at.x, at.y, def.w, def.h);
        if (rules.enforceSlope && hi - lo > MAX_BUILD_SLOPE) {
          ok = false;
          reason = 'Ground is too steep';
          for (const t of tiles) t.ok = false;
        }
      }
      return affordable(world, { action, tiles, count: ok ? 1 : 0, cost: def.cost, ok, reason: ok ? undefined : reason });
    }
  }
}

export interface CommitResult {
  ok: boolean;
  reason?: string;
  cost: number;
}

/** Applies an action if its plan is valid. Charges money unless unlimited money is on. */
export function commitAction(world: World, action: Action): CommitResult {
  const plan = planAction(world, action);
  if (!plan.ok) return { ok: false, reason: plan.reason, cost: 0 };
  switch (action.type) {
    case 'zone':
      for (const t of plan.tiles) if (t.ok) world.zone[world.idx(t.x, t.y)] = action.zone;
      world.zoneVersion++;
      break;
    case 'bulldoze': {
      let zones = false;
      removeRoads(world, plan.roadSegs ?? []);
      for (const t of plan.tiles) {
        if (!t.ok) continue;
        const i = world.idx(t.x, t.y);
        if (world.kind[i] === KIND_BUILDING) {
          world.removeBuilding(world.buildingAt[i]);
        }
        if (world.zone[i] !== ZONE_NONE) {
          world.zone[i] = ZONE_NONE;
          zones = true;
        }
      }
      if (zones) world.zoneVersion++;
      break;
    }
    case 'place': {
      const def = BUILDING_DEFS[action.building];
      for (let y = action.at.y; y < action.at.y + def.h; y++)
        for (let x = action.at.x; x < action.at.x + def.w; x++) world.zone[world.idx(x, y)] = ZONE_NONE;
      world.zoneVersion++;
      world.addBuilding(action.building, action.at.x, action.at.y, false);
      break;
    }
  }
  if (rulesFor(world).chargeMoney && plan.cost > 0) {
    const category: ExpenseCategory =
      action.type === 'zone' ? 'construction.zoning'
      : action.type === 'bulldoze' ? 'construction.demolition'
      : 'construction.buildings';
    world.treasury.post({ day: world.tick, amount: -plan.cost, category, budget: 'capital' });
  }
  return { ok: true, cost: plan.cost };
}
