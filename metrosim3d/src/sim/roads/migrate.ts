import { KIND_ROAD, TILE } from '../constants';
import type { World } from '../world';
import { rasterizeAll } from './raster';

/**
 * Save v1/v2 → v3: converts tile roads into the road graph. Junctions, corners and dead ends
 * become nodes at tile centres; straight runs between them become street segments. The
 * graph covers exactly the original road tiles (tested), so no building is disturbed.
 */
export function migrateTileRoads(world: World, kind: Uint8Array): void {
  const n = world.size;
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && kind[y * n + x] === KIND_ROAD;
  const net = world.roads;
  const nodeAt = new Map<number, number>();
  const centre = (x: number, y: number) => ({ x: (x + 0.5) * TILE, z: (y + 0.5) * TILE });
  const isNode = (x: number, y: number) => {
    const ns = isRoad(x, y - 1);
    const s = isRoad(x, y + 1);
    const e = isRoad(x + 1, y);
    const w = isRoad(x - 1, y);
    const straightNS = ns && s && !e && !w;
    const straightEW = e && w && !ns && !s;
    return !(straightNS || straightEW);
  };
  const node = (x: number, y: number) => {
    const i = y * n + x;
    let id = nodeAt.get(i);
    if (id === undefined) {
      const c = centre(x, y);
      id = net.addNode(c.x, c.z).id;
      nodeAt.set(i, id);
    }
    return id;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!isRoad(x, y) || !isNode(x, y)) continue;
      const here = node(x, y);
      // Walk east and south only, so each run is created once.
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        let cx = x + dx;
        let cy = y + dy;
        if (!isRoad(cx, cy)) continue;
        while (!isNode(cx, cy)) {
          cx += dx;
          cy += dy;
        }
        net.addSegment(here, node(cx, cy), 'street');
      }
      // A lone road tile: keep it as a tiny stub so the tile stays a road.
      if (!isRoad(x + 1, y) && !isRoad(x - 1, y) && !isRoad(x, y + 1) && !isRoad(x, y - 1)) {
        const c = centre(x, y);
        const stub = net.addNode(c.x + 0.5, c.z).id;
        net.addSegment(here, stub, 'street');
      }
    }
  }
  rasterizeAll(world);
}
