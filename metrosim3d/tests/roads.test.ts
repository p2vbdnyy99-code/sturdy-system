import { describe, expect, it } from 'vitest';
import { KIND_BUILDING, KIND_ROAD } from '../src/sim/constants';
import {
  commitBend, commitMoveNode, commitRoad, commitUpgrade, planBend, planRoad, planUpgrade, removeRoads, segmentAt, snapPoint,
} from '../src/sim/roads/build';
import { curveLength, fitChain, simplify, straight } from '../src/sim/roads/geometry';
import { migrateTileRoads } from '../src/sim/roads/migrate';
import { lanesFor } from '../src/sim/roads/types';
import { CityData, restore, snapshot } from '../src/sim/serialize';
import { commitAction } from '../src/sim/tools';
import { World } from '../src/sim/world';

function flat(size = 48): World {
  return new World(size, 9, 'R', new Float32Array((size + 1) * (size + 1)).fill(5));
}
const P = (x: number, z: number) => ({ x, z });

describe('road graph: drawing', () => {
  it('a road crossing another creates a 4-way junction and splits both', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(20, 100), P(300, 100))], 'street', false));
    const plan = planRoad(w, [straight(P(150, 20), P(150, 300))], 'street', false);
    expect(plan.ok).toBe(true);
    expect(plan.junctions).toBe(1);
    commitRoad(w, plan);
    expect(w.roads.segs.size).toBe(4);
    const j = w.roads.nodeNear(P(150, 100), 1)!;
    expect(w.roads.degree(j.id)).toBe(4);
  });

  it('snaps ends to nearby junctions and onto roads, and to the grid otherwise', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(20, 100), P(300, 100))], 'street', false));
    expect(snapPoint(w, P(24, 104), 'street', true).node).toBeDefined(); // near the end node
    const onRoad = snapPoint(w, P(150, 103), 'street', true);
    expect(onRoad.seg).toBeDefined();
    expect(onRoad.p.z).toBeCloseTo(100, 3);
    expect(snapPoint(w, P(201, 203), 'street', true).p).toEqual(P(204, 204)); // nearest tile centre
    expect(snapPoint(w, P(201, 203), 'avenue', true).p).toEqual(P(200, 200)); // tile edge
  });

  it('draws smooth curves from a finger path and keeps them tangent-continuous', () => {
    const pts = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 59) * Math.PI;
      return P(200 + Math.cos(a) * 100, 200 + Math.sin(a) * 100); // half circle
    });
    const chain = fitChain(simplify(pts, 2.5));
    expect(chain.length).toBeGreaterThan(2);
    for (let i = 0; i < chain.length - 1; i++) {
      expect(chain[i].b).toEqual(chain[i + 1].a);
      // control - end and next control - start are collinear (smooth join)
      const d1 = { x: chain[i].b.x - chain[i].c.x, z: chain[i].b.z - chain[i].c.z };
      const d2 = { x: chain[i + 1].c.x - chain[i + 1].a.x, z: chain[i + 1].c.z - chain[i + 1].a.z };
      expect(Math.abs(d1.x * d2.z - d1.z * d2.x) / (Math.hypot(d1.x, d1.z) * Math.hypot(d2.x, d2.z))).toBeLessThan(1e-6);
    }
    const total = chain.reduce((s, k) => s + curveLength(k), 0);
    expect(total).toBeGreaterThan(Math.PI * 100 * 0.97);
    const w = flat();
    const plan = planRoad(w, chain, 'street', false);
    expect(plan.ok).toBe(true);
    commitRoad(w, plan);
    expect(w.roads.segs.size).toBe(chain.length);
  });

  it('refuses a road running along an existing one, and roads through buildings', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(20, 100), P(300, 100))], 'street', false));
    expect(planRoad(w, [straight(P(60, 102), P(250, 102))], 'street', false).reason).toMatch(/Runs along/);
    commitAction(w, { type: 'place', building: 'officeTower', at: { x: 30, y: 30 } });
    const plan = planRoad(w, [straight(P(200, 248), P(300, 248))], 'street', false);
    expect(plan.ok).toBe(false);
    expect(plan.blocked.length).toBeGreaterThan(0);
  });

  it('enforces gradient in Realistic mode only', () => {
    const w = flat();
    for (let y = 0; y <= w.size; y++) for (let x = 20; x <= w.size; x++) w.setCornerH(x, y, 5 + (x - 20) * 3); // 37% slope
    const k = [straight(P(150, 100), P(300, 100))];
    w.mode = 'realistic';
    expect(planRoad(w, k, 'street', false).reason).toMatch(/steep/);
    w.mode = 'creative';
    expect(planRoad(w, k, 'street', false).ok).toBe(true);
  });
});

describe('road graph: editing', () => {
  it('upgrades a street to an avenue (wider, refused if it would hit buildings)', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(20, 100), P(300, 100))], 'street', false));
    const id = [...w.roads.segs.keys()][0];
    const narrow = w.segTiles.get(id)!.length;
    expect(commitUpgrade(w, [id], 'avenue')).toBe(true);
    expect(w.roads.segs.get(id)!.type).toBe('avenue');
    expect(w.segTiles.get(id)!.length).toBeGreaterThan(narrow);
    const w2 = flat();
    commitRoad(w2, planRoad(w2, [straight(P(20, 100), P(300, 100))], 'street', false));
    commitAction(w2, { type: 'place', building: 'park', at: { x: 15, y: 13 } }); // just beside the street
    expect(planUpgrade(w2, [...w2.roads.segs.keys()], 'avenue').ok).toBe(false);
  });

  it('moves a junction (connected roads follow) and joins two road ends', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(20, 100), P(150, 100))], 'street', false));
    commitRoad(w, planRoad(w, [straight(P(150, 100), P(150, 250))], 'street', false));
    const j = w.roads.nodeNear(P(150, 100), 1)!;
    expect(commitMoveNode(w, j.id, P(160, 120), false)).toBe(true);
    expect(w.getKind(Math.floor(160 / 8), Math.floor(120 / 8))).toBe(KIND_ROAD);
    // A separate road whose end is dragged onto another end joins them.
    commitRoad(w, planRoad(w, [straight(P(300, 100), P(300, 200))], 'street', false));
    const end = w.roads.nodeNear(P(300, 200), 1)!;
    const target = w.roads.nodeNear(P(150, 250), 1)!;
    expect(commitMoveNode(w, end.id, P(152, 248), false)).toBe(true);
    expect(w.roads.nodes.has(end.id)).toBe(false);
    expect(w.roads.degree(target.id)).toBe(2);
  });

  it('bends a road through the finger and deletes segments cleanly', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(40, 200), P(300, 200))], 'street', false));
    const id = [...w.roads.segs.keys()][0];
    expect(planBend(w, id, P(170, 150)).ok).toBe(true);
    expect(commitBend(w, id, P(170, 150))).toBe(true);
    expect(w.getKind(Math.floor(170 / 8), Math.floor(150 / 8))).toBe(KIND_ROAD);
    expect(segmentAt(w, P(171, 151))).toBe(id);
    removeRoads(w, [id]);
    expect(w.roads.segs.size).toBe(0);
    expect(w.roads.nodes.size).toBe(0);
    expect(w.kind.some((k) => k === KIND_ROAD)).toBe(false);
  });

  it('bulldozing a road tile removes its whole segment', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(20, 100), P(150, 100))], 'street', false));
    commitRoad(w, planRoad(w, [straight(P(150, 100), P(300, 100))], 'avenue', false));
    expect(commitAction(w, { type: 'bulldoze', from: { x: 6, y: 12 }, to: { x: 6, y: 12 } }).ok).toBe(true);
    expect(w.roads.segs.size).toBe(1);
    expect(w.getKind(6, 12)).toBe(0);
    expect(w.getKind(25, 12)).toBe(KIND_ROAD);
  });

  it('defines lanes for traffic (right-hand, both directions)', () => {
    expect(lanesFor('street')).toEqual([{ offset: 1.2, dir: 1 }, { offset: -1.2, dir: -1 }]);
    expect(lanesFor('avenue').filter((l) => l.dir === 1)).toHaveLength(2);
  });
});

describe('road graph: saves', () => {
  it('migrates v1/v2 tile roads exactly (same road tiles, buildings untouched)', () => {
    const w = flat(32);
    const kind = new Uint8Array(32 * 32);
    const set = (x: number, y: number) => (kind[y * 32 + x] = KIND_ROAD);
    for (let x = 2; x <= 20; x++) set(x, 5); // E-W road
    for (let y = 5; y <= 18; y++) set(10, y); // T junction going south
    for (let x = 10; x <= 25; x++) set(x, 18); // corner then east
    set(28, 28); // a lone road tile
    migrateTileRoads(w, kind);
    for (let i = 0; i < kind.length; i++) expect(w.kind[i] === KIND_ROAD).toBe(kind[i] === KIND_ROAD);
    const t = w.roads.nodeNear(P(10.5 * 8, 5.5 * 8), 1)!;
    expect(w.roads.degree(t.id)).toBe(3);
  });

  it('round-trips the road graph and loads a v2 save with grid roads', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(20, 100), P(300, 100))], 'street', false));
    commitRoad(w, planRoad(w, fitChain(simplify([P(100, 20), P(160, 120), P(150, 300)], 1)), 'avenue', false));
    commitAction(w, { type: 'place', building: 'park', at: { x: 2, y: 30 } });
    const data = snapshot(w);
    const w2 = restore(structuredClone(data));
    expect(w2.roads.toData()).toEqual(w.roads.toData());
    expect(w2.kind).toEqual(w.kind);
    // v2 shape: no road graph, tile roads only.
    const v2: CityData = { ...structuredClone(data), version: 2, roads: undefined };
    const tileOnly = flat();
    for (let x = 3; x <= 30; x++) tileOnly.kind[tileOnly.idx(x, 7)] = KIND_ROAD;
    v2.kind = tileOnly.kind.slice();
    v2.buildings = [];
    const m = restore(v2);
    expect(m.roads.segs.size).toBe(1);
    for (let x = 3; x <= 30; x++) expect(m.getKind(x, 7)).toBe(KIND_ROAD);
    expect(m.getKind(2, 7)).toBe(0);
    expect(m.kind.filter((k) => k === KIND_BUILDING).length).toBe(0);
  });
});

describe('road graph: junction quality', () => {
  it('refuses grazing crossings and junctions packed too closely', () => {
    const w = flat();
    commitRoad(w, planRoad(w, [straight(P(20, 200), P(360, 200))], 'avenue', false));
    // Crossing at ~11° grazes the avenue.
    expect(planRoad(w, [straight(P(40, 170), P(340, 230))], 'street', false).reason).toMatch(/shallow|grazes/);
    // Crossing two parallel streets 8 m apart would put junctions 8 m apart: refused.
    const w2 = flat();
    commitRoad(w2, planRoad(w2, [straight(P(20, 100), P(300, 100))], 'street', false));
    expect(planRoad(w2, [straight(P(40, 108), P(280, 108))], 'street', false).ok).toBe(true);
    commitRoad(w2, planRoad(w2, [straight(P(40, 108), P(280, 108))], 'street', false));
    expect(planRoad(w2, [straight(P(150, 40), P(150, 170))], 'street', false).reason).toMatch(/too close/);
    // A clean perpendicular crossing is fine.
    expect(planRoad(w, [straight(P(300, 120), P(300, 300))], 'street', false).ok).toBe(true);
  });
});
