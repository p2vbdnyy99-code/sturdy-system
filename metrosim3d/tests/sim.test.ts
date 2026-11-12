import { describe, expect, it } from 'vitest';
import { KIND_BUILDING, KIND_ROAD, MAX_ROAD_SLOPE, ZONE_COM, ZONE_RES } from '../src/sim/constants';
import { stepGrowth } from '../src/sim/growth';
import { restore, snapshot } from '../src/sim/serialize';
import { computeStats } from '../src/sim/stats';
import { commitAction, planAction } from '../src/sim/tools';
import { World } from '../src/sim/world';
import { planTileRoad, tileRoad } from './helpers';

/** A flat 32x32 world at height 5 (no water, no slopes) for predictable tests. */
function flatWorld(size = 32): World {
  return new World(size, 1, 'Test', new Float32Array((size + 1) * (size + 1)).fill(5));
}

describe('terrain generation', () => {
  it('is deterministic per seed and has water and buildable land', () => {
    const a = new World(64, 42);
    const b = new World(64, 42);
    expect(a.heights).toEqual(b.heights);
    expect(new World(64, 43).heights).not.toEqual(a.heights);
    let water = 0;
    let flat = 0;
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        if (a.isWater(x, y)) water++;
        else {
          const c = a.tileCorners(x, y);
          if (Math.max(...c) - Math.min(...c) <= MAX_ROAD_SLOPE) flat++;
        }
      }
    expect(water).toBeGreaterThan(0);
    expect(flat).toBeGreaterThan(64 * 64 * 0.4);
  });

  it('heightAt matches corner heights at tile corners', () => {
    const w = new World(32, 7);
    expect(w.heightAt(8 * 3, 8 * 4)).toBeCloseTo(w.cornerH(3, 4), 4);
    expect(w.heightAt(8 * 10 + 4, 8 * 2)).toBeCloseTo((w.cornerH(10, 2) + w.cornerH(11, 2)) / 2, 4);
  });
});

describe('roads (tile helper over the road graph)', () => {
  it('builds an L-shaped street, charges per metre, and joins roads at junctions', () => {
    const w = flatWorld();
    w.mode = 'realistic';
    const start = w.money;
    const r = tileRoad(w, { x: 2, y: 2 }, { x: 6, y: 2 });
    expect(r.ok).toBe(true);
    expect(w.money).toBe(start - 32 * 12); // 4 tiles × 8 m × $12/m
    for (let x = 2; x <= 6; x++) expect(w.getKind(x, 2)).toBe(KIND_ROAD);
    expect(w.getKind(2, 1)).toBe(0);
    expect(w.getKind(2, 3)).toBe(0);
    // A road starting in the middle of another creates a T junction.
    expect(tileRoad(w, { x: 4, y: 2 }, { x: 4, y: 6 }).ok).toBe(true);
    const junction = w.roads.nodeNear({ x: 4.5 * 8, z: 2.5 * 8 }, 1)!;
    expect(w.roads.degree(junction.id)).toBe(3);
  });

  it('rejects water in Realistic mode and does not charge', () => {
    const w = flatWorld();
    w.mode = 'realistic';
    w.heights[w.size + 1 + 5] = -5; // corner (5,1) underwater
    const plan = planTileRoad(w, { x: 3, y: 1 }, { x: 7, y: 1 });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/water/);
    const before = w.money;
    expect(tileRoad(w, { x: 3, y: 1 }, { x: 7, y: 1 }).ok).toBe(false);
    expect(w.money).toBe(before);
    expect(w.getKind(3, 1)).toBe(0);
  });

  it('respects money unless unlimited money is on', () => {
    const w = flatWorld();
    w.mode = 'realistic';
    w.money = 150;
    expect(tileRoad(w, { x: 0, y: 0 }, { x: 4, y: 0 })).toMatchObject({ ok: false, reason: 'Not enough money' });
    w.mode = 'creative';
    expect(tileRoad(w, { x: 0, y: 0 }, { x: 4, y: 0 }).ok).toBe(true);
    expect(w.money).toBe(150);
  });
});

describe('zoning, growth, placement, bulldozing', () => {
  it('zones only empty land and grows buildings only near roads', () => {
    const w = flatWorld();
    tileRoad(w, { x: 0, y: 10 }, { x: 31, y: 10 });
    const z = commitAction(w, { type: 'zone', zone: ZONE_RES, from: { x: 0, y: 0 }, to: { x: 31, y: 31 } });
    expect(z.ok).toBe(true);
    expect(w.getZone(5, 10)).toBe(0); // road tile not zoned
    for (let i = 0; i < 300; i++) stepGrowth(w);
    expect(w.buildings.size).toBeGreaterThan(20);
    for (const b of w.buildings.values()) {
      expect(Math.abs(b.y - 10)).toBeLessThanOrEqual(2);
      expect(['house', 'apartment']).toContain(b.type);
    }
    expect(computeStats(w).population).toBeGreaterThan(0);
  });

  it('places a 2x2 building, blocks overlaps, and bulldozes the whole footprint', () => {
    const w = flatWorld();
    commitAction(w, { type: 'zone', zone: ZONE_COM, from: { x: 4, y: 4 }, to: { x: 5, y: 5 } });
    expect(commitAction(w, { type: 'place', building: 'officeTower', at: { x: 4, y: 4 } }).ok).toBe(true);
    expect(w.getKind(5, 5)).toBe(KIND_BUILDING);
    expect(w.getZone(5, 5)).toBe(0);
    expect(planAction(w, { type: 'place', building: 'park', at: { x: 5, y: 5 } }).ok).toBe(false);
    expect(planTileRoad(w, { x: 3, y: 5 }, { x: 7, y: 5 }).ok).toBe(false);
    // Bulldozing one tile of the footprint removes the whole building.
    expect(commitAction(w, { type: 'bulldoze', from: { x: 5, y: 5 }, to: { x: 5, y: 5 } }).ok).toBe(true);
    expect(w.buildings.size).toBe(0);
    expect(w.getKind(4, 4)).toBe(0);
  });
});

describe('save snapshot', () => {
  it('round-trips the full city state', () => {
    const w = flatWorld(48);
    w.name = 'Roundtrip';
    w.mode = 'realistic';
    expect(tileRoad(w, { x: 20, y: 20 }, { x: 30, y: 24 }).ok).toBe(true);
    commitAction(w, { type: 'zone', zone: ZONE_RES, from: { x: 18, y: 18 }, to: { x: 32, y: 26 } });
    for (let i = 0; i < 50; i++) stepGrowth(w);
    const data = snapshot(w);
    const w2 = restore(structuredClone(data));
    expect(w2.name).toBe('Roundtrip');
    expect(w2.kind).toEqual(w.kind);
    expect(w2.zone).toEqual(w.zone);
    expect(w2.buildingAt).toEqual(w.buildingAt);
    expect(w2.money).toBe(w.money);
    expect(w2.rng.state).toBe(w.rng.state);
    // Same RNG state -> identical future growth.
    stepGrowth(w);
    stepGrowth(w2);
    expect([...w2.buildings.keys()]).toEqual([...w.buildings.keys()]);
    expect(w2.getKind(25, 20)).toBe(KIND_ROAD);
  });

  it('rejects corrupt saves', () => {
    const data = snapshot(flatWorld(16));
    expect(() => restore({ ...data, kind: new Uint8Array(3) })).toThrow(/Corrupt/);
    expect(() => restore({ ...data, version: 99 })).toThrow(/version/);
  });
});

import { buildStressCity } from '../src/sim/stressCity';
describe('benchmark city', () => {
  it('reaches the requested building count deterministically with consistent indexes', () => {
    const a = buildStressCity(192, 1234, 3000);
    const b = buildStressCity(192, 1234, 3000);
    expect(a.buildings.size).toBeGreaterThanOrEqual(3000);
    expect(a.buildings.size).toBe(b.buildings.size);
    for (const bl of a.buildings.values()) expect(a.buildingAt[a.idx(bl.x, bl.y)]).toBe(bl.id);
  });
});
