import { describe, expect, it } from 'vitest';
import { KIND_BUILDING, KIND_ROAD, ZONE_RES } from '../src/sim/constants';
import { Treasury } from '../src/sim/finance/treasury';
import { stepGrowth } from '../src/sim/growth';
import { rulesFor } from '../src/sim/rules';
import { CityData, restore, snapshot } from '../src/sim/serialize';
import { applyBrush, cornerLocked } from '../src/sim/terraform';
import { commitAction, planAction } from '../src/sim/tools';
import { World } from '../src/sim/world';
import { planTileRoad, tileRoad } from './helpers';

function flat(size = 32, h = 5): World {
  return new World(size, 3, 'T', new Float32Array((size + 1) * (size + 1)).fill(h));
}

describe('game modes', () => {
  it('Creative ignores money, slope and water; Realistic enforces them', () => {
    const w = flat();
    w.heights[w.size + 1 + 6] = -5; // water around corner (6,1)
    w.heights[(w.size + 1) * 10 + 10] = 30; // steep around corner (10,10)
    w.money = 0;
    w.mode = 'realistic';
    expect(planTileRoad(w, { x: 3, y: 1 }, { x: 8, y: 1 }).ok).toBe(false); // water + no money
    expect(planAction(w, { type: 'place', building: 'park', at: { x: 9, y: 9 } }).reason).toMatch(/steep|money/i);
    w.mode = 'creative';
    expect(rulesFor(w)).toMatchObject({ chargeMoney: false, enforceSlope: false, enforceWater: false });
    expect(tileRoad(w, { x: 3, y: 1 }, { x: 8, y: 1 }).ok).toBe(true);
    expect(commitAction(w, { type: 'place', building: 'park', at: { x: 9, y: 9 } }).ok).toBe(true);
    expect(w.money).toBe(0);
  });

  it('switching modes never changes the city', () => {
    const w = flat();
    tileRoad(w, { x: 0, y: 5 }, { x: 20, y: 5 });
    commitAction(w, { type: 'zone', zone: ZONE_RES, from: { x: 0, y: 3 }, to: { x: 20, y: 7 } });
    for (let i = 0; i < 50; i++) stepGrowth(w);
    const before = snapshot(w);
    w.mode = 'realistic';
    w.mode = 'creative';
    w.financeInCreative = true;
    w.financeInCreative = false;
    const after = snapshot(w);
    expect(after.kind).toEqual(before.kind);
    expect(after.zone).toEqual(before.zone);
    expect(after.buildings).toEqual(before.buildings);
    expect(after.heights).toEqual(before.heights);
  });

  it('optional finance in Creative charges costs to the ledger', () => {
    const w = flat();
    w.financeInCreative = true;
    const start = w.money;
    tileRoad(w, { x: 0, y: 0 }, { x: 9, y: 0 });
    expect(w.money).toBe(start - 72 * 12); // 9 tiles × 8 m × $12/m
    expect(w.treasury.current(w.tick)?.byCategory['construction.roads']).toBe(-72 * 12);
  });
});

describe('treasury ledger', () => {
  it('aggregates by month and category, deterministically, and round-trips', () => {
    const t = new Treasury(1000);
    t.post({ day: 1, amount: -100, category: 'construction.roads', budget: 'capital' });
    t.post({ day: 29, amount: -50.4, category: 'construction.roads', budget: 'capital' });
    t.post({ day: 30, amount: 500, category: 'tax.residential', budget: 'operating' });
    expect(t.balance).toBe(1350);
    expect(t.months).toHaveLength(2);
    expect(t.months[0]).toMatchObject({ month: 0, opening: 1000, closing: 850, byCategory: { 'construction.roads': -150 } });
    expect(t.months[1]).toMatchObject({ month: 1, opening: 850, closing: 1350 });
    expect(Treasury.fromData(structuredClone(t.toData())).toData()).toEqual(t.toData());
  });
});

describe('terrain brush', () => {
  it('raises, lowers, flattens and smooths with falloff', () => {
    const w = flat();
    applyBrush(w, { mode: 'raise', radius: 4, strength: 5 }, 16, 16, 1);
    const centre = w.cornerH(16, 16);
    expect(centre).toBeGreaterThan(10);
    expect(w.cornerH(18, 16)).toBeLessThan(centre);
    expect(w.cornerH(25, 16)).toBe(5); // outside radius untouched
    expect(w.terrainDirty).not.toBeNull();
    applyBrush(w, { mode: 'flatten', radius: 6, strength: 10, target: 5 }, 16, 16, 10);
    expect(w.cornerH(16, 16)).toBeCloseTo(5, 1);
    applyBrush(w, { mode: 'lower', radius: 3, strength: 10 }, 5, 5, 2);
    expect(w.cornerH(5, 5)).toBeLessThan(0); // dug below sea level -> water
    expect(w.isWater(5, 5)).toBe(true);
    const spike = flat();
    spike.setCornerH(10, 10, 20);
    applyBrush(spike, { mode: 'smooth', radius: 3, strength: 10 }, 10, 10, 1);
    expect(spike.cornerH(10, 10)).toBeLessThan(20);
  });

  it('never moves corners under buildings, and roads follow the ground', () => {
    const w = flat();
    commitAction(w, { type: 'place', building: 'officeTower', at: { x: 15, y: 15 } });
    tileRoad(w, { x: 10, y: 20 }, { x: 22, y: 20 });
    applyBrush(w, { mode: 'raise', radius: 8, strength: 10 }, 16, 18, 2);
    expect(cornerLocked(w, 16, 16)).toBe(true);
    for (let y = 15; y <= 17; y++) for (let x = 15; x <= 17; x++) expect(w.cornerH(x, y)).toBe(5);
    expect(w.getKind(16, 20)).toBe(KIND_ROAD);
    expect(w.cornerH(16, 20)).toBeGreaterThan(5);
    expect(w.getKind(15, 15)).toBe(KIND_BUILDING);
  });

  it('charges in Realistic mode and refuses without funds', () => {
    const w = flat();
    w.mode = 'realistic';
    const start = w.money;
    const r = applyBrush(w, { mode: 'raise', radius: 3, strength: 5 }, 10, 10, 0.5);
    expect(r.ok).toBe(true);
    expect(w.money).toBe(start - r.cost);
    w.money = 0;
    const h = w.cornerH(10, 10);
    expect(applyBrush(w, { mode: 'raise', radius: 3, strength: 5 }, 10, 10, 0.5).ok).toBe(false);
    expect(w.cornerH(10, 10)).toBe(h);
  });
});

describe('save migration', () => {
  it('loads a version-1 save with the city intact', () => {
    const w = flat();
    tileRoad(w, { x: 0, y: 5 }, { x: 20, y: 5 });
    commitAction(w, { type: 'place', building: 'park', at: { x: 3, y: 3 } });
    const v2 = snapshot(w);
    // Build the v1 shape exactly as the first build wrote it.
    const { mode: _m, financeInCreative: _f, finance: _fin, ...rest } = v2;
    const v1: CityData = { ...rest, version: 1, money: 12345, unlimitedMoney: false };
    const m = restore(structuredClone(v1));
    expect(m.mode).toBe('realistic');
    expect(m.money).toBe(12345);
    expect(m.kind).toEqual(w.kind);
    expect([...m.buildings.values()]).toEqual([...w.buildings.values()]);
    expect(restore({ ...v1, unlimitedMoney: true }).mode).toBe('creative');
    // And it re-saves as the current version.
    expect(snapshot(m).version).toBe(3);
  });
});
