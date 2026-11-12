import { KIND_BUILDING, SEA_LEVEL, TILE } from '../constants';
import { rulesFor } from '../rules';
import type { World } from '../world';
import { closestT, Curve, curveLength, dist, evalCurve, intersectCurves, P2, sampleCurve, splitCurve, straight, subCurve, tangent } from './geometry';
import { attachSegment, curveTiles, detachSegment } from './raster';
import { ROAD_TYPES, RoadType } from './types';

/** How close (metres) a finger must be to snap onto an existing junction or end. */
export const SNAP_NODE = 9;
/** Crossings flatter than ~25° are refused (they make unusable sliver junctions). */
const MAX_CROSS_COS = Math.cos((25 * Math.PI) / 180);
/** Two junctions on a new road closer than this (metres) are merged into one. */
const MIN_JUNCTION_GAP = 10;
/** Pieces shorter than this are not created. */
const MIN_PIECE = 2;
const SPLIT_TOL = 0.6;

export interface Snap {
  p: P2;
  /** Snapped onto an existing node / onto an existing segment (at t). */
  node?: number;
  seg?: { id: number; t: number };
}

/** Where a road end lands: an existing node, a point on an existing road, the grid, or free. */
export function snapPoint(world: World, p: P2, type: RoadType, grid: boolean): Snap {
  const net = world.roads;
  const n = net.nodeNear(p, SNAP_NODE);
  if (n) return { p: { x: n.x, z: n.z }, node: n.id };
  let best: Snap | null = null;
  let bd = Infinity;
  for (const id of net.segsInBox(p.x - 12, p.z - 12, p.x + 12, p.z + 12)) {
    const s = net.segs.get(id)!;
    const k = net.curveOf(s);
    const { t, d } = closestT(k, p);
    const reach = ROAD_TYPES[s.type].width / 2 + 2;
    if (d <= reach && d < bd) {
      bd = d;
      const len = curveLength(k);
      // Near either end of that road: use its end node instead of splitting.
      if (t * len < SNAP_NODE) best = { p: { x: net.nodes.get(s.a)!.x, z: net.nodes.get(s.a)!.z }, node: s.a };
      else if ((1 - t) * len < SNAP_NODE) best = { p: { x: net.nodes.get(s.b)!.x, z: net.nodes.get(s.b)!.z }, node: s.b };
      else best = { p: evalCurve(k, t), seg: { id, t } };
    }
  }
  if (best) return best;
  if (grid) {
    const off = ROAD_TYPES[type].snap === 'centre' ? 0.5 : 0;
    return { p: { x: (Math.round(p.x / TILE - off) + off) * TILE, z: (Math.round(p.z / TILE - off) + off) * TILE } };
  }
  return { p };
}

export interface RoadPlan {
  curves: Curve[];
  type: RoadType;
  ok: boolean;
  reason?: string;
  cost: number;
  length: number;
  /** Tiles the new road would cover, and those blocked by buildings. */
  tiles: number[];
  blocked: number[];
  /** Junctions that will be created where the road meets or crosses others. */
  junctions: number;
}

function inMap(world: World, p: P2): boolean {
  const span = world.size * TILE;
  return p.x >= 0 && p.z >= 0 && p.x <= span && p.z <= span;
}

/** Checks a set of curves (shared by drawing, upgrading and editing). */
function checkCurves(world: World, curves: Curve[], type: RoadType, ignoreSegs: Set<number>): { ok: boolean; reason?: string; tiles: number[]; blocked: number[] } {
  const rules = rulesFor(world);
  const def = ROAD_TYPES[type];
  const tiles = new Set<number>();
  for (const k of curves) for (const t of curveTiles(world, k, type)) tiles.add(t);
  const blocked = [...tiles].filter((i) => world.kind[i] === KIND_BUILDING);
  if (blocked.length) return { ok: false, reason: 'A building is in the way — bulldoze it first', tiles: [...tiles], blocked };
  for (const k of curves) {
    if (!inMap(world, k.a) || !inMap(world, k.b) || !inMap(world, k.c)) return { ok: false, reason: 'Off the map', tiles: [...tiles], blocked };
  }
  if (rules.enforceWater || rules.enforceSlope) {
    for (const k of curves) {
      const pts = sampleCurve(k, 4);
      let prevH: number | null = null;
      for (const { p } of pts) {
        const h = world.heightAt(p.x, p.z);
        if (rules.enforceWater && h < SEA_LEVEL + 0.3) return { ok: false, reason: 'Roads cannot cross water in Realistic mode yet (bridges come later)', tiles: [...tiles], blocked };
        if (rules.enforceSlope && prevH !== null && Math.abs(h - prevH) / (curveLength(k) / (pts.length - 1)) > def.maxGrade)
          return { ok: false, reason: `Too steep for a ${def.label.toLowerCase()} (max ${Math.round(def.maxGrade * 100)}%) — try Flatten or Creative mode`, tiles: [...tiles], blocked };
        prevH = h;
      }
    }
  }
  // Running along (on top of) an existing road is not a junction: refuse it.
  const net = world.roads;
  for (const k of curves) {
    const len = curveLength(k);
    let run = 0;
    for (const { p, t } of sampleCurve(k, 2)) {
      if (t * len < 10 || (1 - t) * len < 10) {
        run = 0;
        continue;
      }
      let along = false;
      for (const id of net.segsInBox(p.x - 15, p.z - 15, p.x + 15, p.z + 15)) {
        if (ignoreSegs.has(id)) continue;
        const s = net.segs.get(id)!;
        const ek = net.curveOf(s);
        const c = closestT(ek, p);
        const lim = (ROAD_TYPES[s.type].width + def.width) / 2 - 1;
        if (c.d < lim) {
          const ta = tangent(k, t);
          const tb = tangent(ek, c.t);
          if (Math.abs(ta.x * tb.x + ta.z * tb.z) > 0.9) along = true;
        }
      }
      run = along ? run + 1 : 0;
      if (run >= 3) return { ok: false, reason: 'Runs along or grazes an existing road — cross it more squarely, or use Upgrade or Edit', tiles: [...tiles], blocked };
    }
  }
  return { ok: true, tiles: [...tiles], blocked };
}

/** Plans drawing a road along a chain of curves (finger stroke), without changing the world. */
export function planRoad(world: World, raw: Curve[], type: RoadType, grid: boolean): RoadPlan {
  const empty: RoadPlan = { curves: [], type, ok: false, cost: 0, length: 0, tiles: [], blocked: [], junctions: 0 };
  if (!raw.length) return empty;
  const curves = raw.map((k) => ({ a: { ...k.a }, c: { ...k.c }, b: { ...k.b } }));
  const first = curves[0];
  const last = curves[curves.length - 1];
  const wasStraightFirst = dist(first.c, { x: (first.a.x + first.b.x) / 2, z: (first.a.z + first.b.z) / 2 }) < 0.01;
  const wasStraightLast = dist(last.c, { x: (last.a.x + last.b.x) / 2, z: (last.a.z + last.b.z) / 2 }) < 0.01;
  const sa = snapPoint(world, first.a, type, grid);
  const sb = snapPoint(world, last.b, type, grid);
  first.a = sa.p;
  last.b = sb.p;
  if (curves.length === 1 && wasStraightFirst) curves[0] = straight(first.a, first.b);
  else {
    if (wasStraightFirst) first.c = { x: (first.a.x + first.b.x) / 2, z: (first.a.z + first.b.z) / 2 };
    if (wasStraightLast) last.c = { x: (last.a.x + last.b.x) / 2, z: (last.a.z + last.b.z) / 2 };
  }
  const kept = curves.filter((k) => curveLength(k) >= MIN_PIECE);
  const length = kept.reduce((s, k) => s + curveLength(k), 0);
  if (!kept.length || length < 4) return { ...empty, curves: kept, reason: 'Drag further to draw a road' };
  if (sa.node !== undefined && sa.node === sb.node && kept.length === 1) return { ...empty, curves: kept, reason: 'Start and end are the same junction' };
  // No road is exempt from the overlap test: the first/last 10 m near the ends are skipped instead,
  // so connecting to a road is fine but running along it is not.
  const chk = checkCurves(world, kept, type, new Set());
  // Count junctions (snapped ends plus crossings) and refuse grazing crossings.
  let junctions = (sa.node !== undefined || sa.seg ? 1 : 0) + (sb.node !== undefined || sb.seg ? 1 : 0);
  let shallow = false;
  let crowded = false;
  kept.forEach((k, ki) => {
    const marks: number[] = [];
    if (ki === 0 && (sa.node !== undefined || sa.seg)) marks.push(0);
    if (ki === kept.length - 1 && (sb.node !== undefined || sb.seg)) marks.push(1);
    const b = { x0: Math.min(k.a.x, k.c.x, k.b.x), z0: Math.min(k.a.z, k.c.z, k.b.z), x1: Math.max(k.a.x, k.c.x, k.b.x), z1: Math.max(k.a.z, k.c.z, k.b.z) };
    const len = curveLength(k);
    for (const id of world.roads.segsInBox(b.x0, b.z0, b.x1, b.z1)) {
      const ek = world.roads.curveOf(world.roads.segs.get(id)!);
      for (const x of intersectCurves(k, ek)) {
        if (x.ta * len <= 3 || (1 - x.ta) * len <= 3) continue;
        junctions++;
        marks.push(x.ta);
        const ta = tangent(k, x.ta);
        const tb = tangent(ek, x.tb);
        if (Math.abs(ta.x * tb.x + ta.z * tb.z) > MAX_CROSS_COS) shallow = true;
      }
    }
    marks.sort((x, y) => x - y);
    for (let i = 1; i < marks.length; i++) if ((marks[i] - marks[i - 1]) * len < MIN_JUNCTION_GAP) crowded = true;
  });
  if (crowded && chk.ok) {
    chk.ok = false;
    chk.reason = 'Junctions would be too close together — leave at least 10 m between them';
  }
  if (shallow && chk.ok) {
    chk.ok = false;
    chk.reason = 'Roads would cross at too shallow an angle — cross more squarely';
  }
  const charge = rulesFor(world).chargeMoney;
  const cost = charge ? Math.round(length * ROAD_TYPES[type].costPerMetre) : 0;
  let ok = chk.ok;
  let reason = chk.reason;
  if (ok && charge && cost > world.money) {
    ok = false;
    reason = 'Not enough money';
  }
  return { curves: kept, type, ok, reason, cost, length, tiles: chk.tiles, blocked: chk.blocked, junctions };
}

/** Splits a segment at t, returning the new junction node (or an end node if t is at an end). */
export function splitSegment(world: World, segId: number, t: number): number {
  const net = world.roads;
  const s = net.segs.get(segId)!;
  const k = net.curveOf(s);
  const len = curveLength(k);
  if (t * len < SPLIT_TOL * 3) return s.a;
  if ((1 - t) * len < SPLIT_TOL * 3) return s.b;
  const [l, r] = splitCurve(k, t);
  detachSegment(world, segId);
  net.removeSegment(segId);
  // removeSegment may have deleted end nodes left with no roads; recreate if so.
  const a = net.nodes.has(s.a) ? s.a : net.addNode(k.a.x, k.a.z).id;
  const b = net.nodes.has(s.b) ? s.b : net.addNode(k.b.x, k.b.z).id;
  const m = net.addNode(l.b.x, l.b.z).id;
  attachSegment(world, net.addSegment(a, m, s.type, l.c).id);
  attachSegment(world, net.addSegment(m, b, s.type, r.c).id);
  return m;
}

/** Existing node at p, or a new junction on a road at p, or a new free node. */
function nodeAt(world: World, p: P2, allowFree: boolean): number {
  const net = world.roads;
  const n = net.nodeNear(p, SPLIT_TOL);
  if (n) return n.id;
  for (const id of net.segsInBox(p.x - 2, p.z - 2, p.x + 2, p.z + 2)) {
    const c = closestT(net.curveOf(net.segs.get(id)!), p);
    if (c.d < SPLIT_TOL) return splitSegment(world, id, c.t);
  }
  if (!allowFree) return -1;
  return net.addNode(p.x, p.z).id;
}

/** Builds a planned road: creates junctions where it meets or crosses roads, then charges for it. */
export function commitRoad(world: World, plan: RoadPlan): number[] {
  if (!plan.ok) return [];
  const net = world.roads;
  const created: number[] = [];
  for (const k of plan.curves) {
    const startNode = nodeAt(world, k.a, true);
    const endNode = nodeAt(world, k.b, true);
    const len = curveLength(k);
    // Crossings with existing roads become junctions.
    const stops: { t: number; node: number }[] = [
      { t: 0, node: startNode },
      { t: 1, node: endNode },
    ];
    const box = { x0: Math.min(k.a.x, k.c.x, k.b.x), z0: Math.min(k.a.z, k.c.z, k.b.z), x1: Math.max(k.a.x, k.c.x, k.b.x), z1: Math.max(k.a.z, k.c.z, k.b.z) };
    const crossings: { ta: number; seg: number; tb: number }[] = [];
    for (const id of net.segsInBox(box.x0, box.z0, box.x1, box.z1)) {
      const s = net.segs.get(id)!;
      for (const x of intersectCurves(k, net.curveOf(s))) {
        if (x.ta * len < 3 || (1 - x.ta) * len < 3) continue;
        crossings.push({ ta: x.ta, seg: id, tb: x.tb });
      }
    }
    // Split each crossed road at its crossing (one at a time: ids change after a split).
    for (const c of crossings.sort((x, y) => x.ta - y.ta)) {
      const p = evalCurve(k, c.ta);
      // Too close to a junction already on this road: reuse it instead of making a sliver.
      if (stops.some((s) => Math.abs(s.t - c.ta) * len < MIN_JUNCTION_GAP)) continue;
      const node = nodeAt(world, p, false);
      if (node >= 0 && !stops.some((s) => s.node === node)) stops.push({ t: c.ta, node });
    }
    stops.sort((x, y) => x.t - y.t);
    for (let i = 0; i < stops.length - 1; i++) {
      const s0 = stops[i];
      const s1 = stops[i + 1];
      if (s0.node === s1.node) continue;
      const piece = subCurve(k, s0.t, s1.t);
      if (curveLength(piece) < MIN_PIECE) continue;
      const seg = net.addSegment(s0.node, s1.node, plan.type, piece.c);
      attachSegment(world, seg.id);
      created.push(seg.id);
    }
  }
  if (plan.cost > 0) world.treasury.post({ day: world.tick, amount: -plan.cost, category: 'construction.roads', budget: 'capital' });
  return created;
}

/** Deletes road segments. */
export function removeRoads(world: World, ids: number[]): void {
  for (const id of ids) {
    if (!world.roads.segs.has(id)) continue;
    detachSegment(world, id);
    world.roads.removeSegment(id);
  }
}

/** Segments near a point (for tap-to-select). */
export function segmentAt(world: World, p: P2, extra = 2): number | null {
  const net = world.roads;
  let best: number | null = null;
  let bd = Infinity;
  for (const id of net.segsInBox(p.x - 16, p.z - 16, p.x + 16, p.z + 16)) {
    const s = net.segs.get(id)!;
    const c = closestT(net.curveOf(s), p);
    if (c.d <= ROAD_TYPES[s.type].width / 2 + extra && c.d < bd) {
      bd = c.d;
      best = id;
    }
  }
  return best;
}

export interface ChangePlan {
  ok: boolean;
  reason?: string;
  cost: number;
  curves: Curve[];
  type: RoadType;
  tiles: number[];
  blocked: number[];
}

/** Upgrading (or downgrading) the type of existing segments. */
export function planUpgrade(world: World, ids: number[], type: RoadType): ChangePlan {
  const net = world.roads;
  const segs = ids.map((id) => net.segs.get(id)!).filter((s) => s && s.type !== type);
  const curves = segs.map((s) => net.curveOf(s));
  if (!segs.length) return { ok: false, reason: ids.length ? `Already ${ROAD_TYPES[type].label.toLowerCase()}s` : 'Drag along roads to upgrade them', cost: 0, curves, type, tiles: [], blocked: [] };
  const tiles = new Set<number>();
  for (const k of curves) for (const t of curveTiles(world, k, type)) tiles.add(t);
  const blocked = [...tiles].filter((i) => world.kind[i] === KIND_BUILDING);
  const charge = rulesFor(world).chargeMoney;
  let cost = 0;
  if (charge) for (const s of segs) cost += Math.max(0, ROAD_TYPES[type].costPerMetre - ROAD_TYPES[s.type].costPerMetre) * net.length(s.id);
  cost = Math.round(cost);
  if (blocked.length) return { ok: false, reason: 'The wider road would hit buildings', cost, curves, type, tiles: [...tiles], blocked };
  if (charge && cost > world.money) return { ok: false, reason: 'Not enough money', cost, curves, type, tiles: [...tiles], blocked };
  return { ok: true, cost, curves, type, tiles: [...tiles], blocked };
}

export function commitUpgrade(world: World, ids: number[], type: RoadType): boolean {
  const plan = planUpgrade(world, ids, type);
  if (!plan.ok) return false;
  for (const id of ids) {
    const s = world.roads.segs.get(id);
    if (!s || s.type === type) continue;
    detachSegment(world, id);
    world.roads.setType(id, type);
    attachSegment(world, id);
  }
  if (plan.cost > 0) world.treasury.post({ day: world.tick, amount: -plan.cost, category: 'construction.roads', budget: 'capital' });
  return true;
}

/** Curves of a node's segments if the node moved to p. */
function curvesWithNodeAt(world: World, nodeId: number, p: P2): { id: number; k: Curve; type: RoadType }[] {
  const net = world.roads;
  return net.segsAt(nodeId).map((id) => {
    const s = net.segs.get(id)!;
    const k = net.curveOf(s);
    const straightBefore = net.isStraight(s);
    if (s.a === nodeId) k.a = p;
    if (s.b === nodeId) k.b = p;
    if (straightBefore) k.c = { x: (k.a.x + k.b.x) / 2, z: (k.a.z + k.b.z) / 2 };
    return { id, k, type: s.type };
  });
}

/** Moving a junction or road end; snapping onto another node joins them. */
export function planMoveNode(world: World, nodeId: number, p: P2, grid: boolean): ChangePlan & { target: P2; mergeInto?: number } {
  const net = world.roads;
  const node = net.nodes.get(nodeId)!;
  const own = new Set(net.segsAt(nodeId));
  // Snap to another node (to connect roads), else grid.
  let target = p;
  let mergeInto: number | undefined;
  const other = [...net.nodes.values()].find((n) => n.id !== nodeId && Math.hypot(n.x - p.x, n.z - p.z) < SNAP_NODE && !net.segsAt(n.id).some((sid) => own.has(sid)));
  if (other) {
    target = { x: other.x, z: other.z };
    mergeInto = other.id;
  } else if (grid) {
    const type = net.segs.get([...own][0])?.type ?? 'street';
    target = snapPoint(world, p, type, true).p;
    if (Math.hypot(target.x - node.x, target.z - node.z) < 0.01) target = { x: node.x, z: node.z };
  }
  const moved = curvesWithNodeAt(world, nodeId, target);
  const tiles = new Set<number>();
  const blocked = new Set<number>();
  let reason: string | undefined;
  for (const m of moved) {
    const chk = checkCurves(world, [m.k], m.type, new Set([...own, ...(mergeInto ? net.segsAt(mergeInto) : [])]));
    chk.tiles.forEach((t) => tiles.add(t));
    chk.blocked.forEach((t) => blocked.add(t));
    if (!chk.ok) reason ??= chk.reason;
    if (curveLength(m.k) < MIN_PIECE) reason ??= 'Road would be too short';
  }
  return { ok: !reason, reason, cost: 0, curves: moved.map((m) => m.k), type: moved[0]?.type ?? 'street', tiles: [...tiles], blocked: [...blocked], target, mergeInto };
}

export function commitMoveNode(world: World, nodeId: number, p: P2, grid: boolean): boolean {
  const plan = planMoveNode(world, nodeId, p, grid);
  if (!plan.ok) return false;
  const net = world.roads;
  const ids = net.segsAt(nodeId);
  for (const id of ids) detachSegment(world, id);
  net.moveNode(nodeId, plan.target.x, plan.target.z);
  if (plan.mergeInto !== undefined) {
    // Reconnect this node's roads to the target node, then drop the old node.
    for (const id of ids) {
      const s = net.segs.get(id)!;
      const other = s.a === nodeId ? s.b : s.a;
      if (other === plan.mergeInto) net.removeSegment(id); // would loop onto itself
      else {
        net.replaceEndpoint(id, nodeId, plan.mergeInto);
        attachSegment(world, id);
      }
    }
    net.removeNodeIfUnused(nodeId);
  } else for (const id of ids) attachSegment(world, id);
  return true;
}

/** Bending a road so it passes through p (touch-friendly curve editing). */
export function planBend(world: World, segId: number, p: P2): ChangePlan & { control: P2 } {
  const net = world.roads;
  const s = net.segs.get(segId)!;
  const k = net.curveOf(s);
  // The curve's midpoint is (a + 2c + b) / 4; solve for c so the midpoint is p.
  const control = { x: 2 * p.x - (k.a.x + k.b.x) / 2, z: 2 * p.z - (k.a.z + k.b.z) / 2 };
  const nk = { a: k.a, c: control, b: k.b };
  const chk = checkCurves(world, [nk], s.type, new Set([segId, ...net.segsAt(s.a), ...net.segsAt(s.b)]));
  return { ok: chk.ok, reason: chk.reason, cost: 0, curves: [nk], type: s.type, tiles: chk.tiles, blocked: chk.blocked, control };
}

export function commitBend(world: World, segId: number, p: P2): boolean {
  const plan = planBend(world, segId, p);
  if (!plan.ok) return false;
  detachSegment(world, segId);
  world.roads.setControl(segId, plan.control);
  attachSegment(world, segId);
  return true;
}
