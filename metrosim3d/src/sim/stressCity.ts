import { BuildingType, KIND_EMPTY, KIND_ROAD, MAX_BUILD_SLOPE, MAX_ROAD_SLOPE, ZONE_COM, ZONE_IND, ZONE_RES } from './constants';
import { World } from './world';

/**
 * Builds a dense, deterministic test city for performance measurement: a road grid every
 * `block` tiles, fully developed blocks, and a mix of every building type. Grows outward from
 * the map centre until `targetBuildings` is reached (or land runs out).
 */
export function buildStressCity(size: number, seed: number, targetBuildings: number): World {
  const w = new World(size, seed, 'Benchmark City');
  const block = 5;
  const c = Math.floor(size / 2);
  const slope = (x: number, y: number) => {
    const k = w.tileCorners(x, y);
    return Math.max(...k) - Math.min(...k);
  };
  // Spiral the radius out until enough buildings exist.
  for (let r = 6; r <= size / 2 && w.buildings.size < targetBuildings; r += 4) {
    for (let y = Math.max(0, c - r); y < Math.min(size, c + r); y++) {
      for (let x = Math.max(0, c - r); x < Math.min(size, c + r); x++) {
        const i = w.idx(x, y);
        if (w.kind[i] !== KIND_EMPTY || w.isWater(x, y)) continue;
        const onGrid = x % block === 0 || y % block === 0;
        if (onGrid) {
          if (slope(x, y) <= MAX_ROAD_SLOPE) w.kind[i] = KIND_ROAD;
          continue;
        }
        if (w.buildings.size >= targetBuildings || slope(x, y) > MAX_BUILD_SLOPE) continue;
        const d = Math.hypot(x - c, y - c);
        const rr = w.rng.next();
        let type: BuildingType;
        let zone = ZONE_RES;
        if (d < 12) {
          type = rr < 0.6 ? 'office' : 'apartment';
          zone = rr < 0.6 ? ZONE_COM : ZONE_RES;
        } else if ((Math.floor(x / 20) + Math.floor(y / 20)) % 5 === 0) {
          type = rr < 0.5 ? 'workshop' : 'warehouse';
          zone = ZONE_IND;
        } else if (rr < 0.12) {
          type = 'shop';
          zone = ZONE_COM;
        } else if (rr < 0.16) type = 'park';
        else type = d < 30 && rr < 0.5 ? 'apartment' : 'house';
        w.zone[i] = type === 'park' ? 0 : zone;
        w.addBuilding(type, x, y, type !== 'park');
      }
    }
  }
  // A few landmark towers near the centre.
  for (let k = 0; k < 12; k++) {
    const x = c - 8 + (k % 4) * 4 + 1;
    const y = c - 8 + Math.floor(k / 4) * 5 + 1;
    const free = [0, 1].every((dy) => [0, 1].every((dx) => w.inBounds(x + dx, y + dy) && w.kind[w.idx(x + dx, y + dy)] === KIND_EMPTY && !w.isWater(x + dx, y + dy)));
    if (free) w.addBuilding(k % 3 === 0 ? 'resTower' : 'officeTower', x, y, false);
  }
  w.bumpAll();
  return w;
}
