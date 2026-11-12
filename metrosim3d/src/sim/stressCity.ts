import { BuildingType, KIND_EMPTY, MAX_BUILD_SLOPE, MAX_ROAD_SLOPE, TILE, ZONE_COM, ZONE_IND, ZONE_RES } from './constants';
import { attachSegment } from './roads/raster';
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
  // Pick the smallest square around the centre with room for the buildings (plus a margin).
  let r = 6;
  const landIn = (rr: number) => {
    let n = 0;
    for (let y = Math.max(0, c - rr); y < Math.min(size, c + rr); y++)
      for (let x = Math.max(0, c - rr); x < Math.min(size, c + rr); x++)
        if (x % block && y % block && !w.isWater(x, y) && slope(x, y) <= MAX_BUILD_SLOPE) n++;
    return n;
  };
  if (targetBuildings > 0) while (r < size / 2 && landIn(r) < targetBuildings * 1.1) r += 4;
  // Road grid: streets along tile centres every `block` tiles, built through the road graph.
  if (targetBuildings > 0) {
    const lo = Math.max(0, Math.ceil((c - r) / block) * block);
    const hi = Math.min(size - 1, Math.floor((c + r) / block) * block);
    const nodeIds = new Map<string, number>();
    const node = (gx: number, gy: number) => {
      const key = `${gx},${gy}`;
      let id = nodeIds.get(key);
      if (id === undefined) {
        id = w.roads.addNode((gx + 0.5) * TILE, (gy + 0.5) * TILE).id;
        nodeIds.set(key, id);
      }
      return id;
    };
    const roadable = (x: number, y: number) => !w.isWater(x, y) && slope(x, y) <= MAX_ROAD_SLOPE;
    for (let gy = lo; gy <= hi; gy += block)
      for (let gx = lo; gx <= hi; gx += block) {
        if (gx + block <= hi && Array.from({ length: block + 1 }, (_, i) => roadable(gx + i, gy)).every(Boolean))
          attachSegment(w, w.roads.addSegment(node(gx, gy), node(gx + block, gy), 'street').id);
        if (gy + block <= hi && Array.from({ length: block + 1 }, (_, i) => roadable(gx, gy + i)).every(Boolean))
          attachSegment(w, w.roads.addSegment(node(gx, gy), node(gx, gy + block), 'street').id);
      }
  }
  // Buildings fill the blocks from the centre outwards.
  const cells: [number, number, number][] = [];
  for (let y = Math.max(0, c - r); y < Math.min(size, c + r); y++)
    for (let x = Math.max(0, c - r); x < Math.min(size, c + r); x++) cells.push([Math.hypot(x - c, y - c), x, y]);
  cells.sort((p, q) => p[0] - q[0] || p[2] - q[2] || p[1] - q[1]);
  for (const [d, x, y] of cells) {
    if (w.buildings.size >= targetBuildings) break;
    const i = w.idx(x, y);
    if (w.kind[i] !== KIND_EMPTY || w.isWater(x, y) || x % block === 0 || y % block === 0 || slope(x, y) > MAX_BUILD_SLOPE) continue;
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
