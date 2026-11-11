import * as THREE from 'three';
import { TILE } from '../sim/constants';
import { World } from '../sim/world';

/**
 * Builds one quad per tile that follows the terrain corners (raised by `lift`), using the
 * same triangle split as the terrain mesh (SW-NE diagonal) so overlays never cut into hills.
 */
export function buildTileQuads<T extends { x: number; y: number }>(
  world: World,
  tiles: T[],
  lift: number,
  color?: (t: T, i: number) => THREE.Color,
  inset = 0,
): THREE.BufferGeometry {
  const n = tiles.length;
  const pos = new Float32Array(n * 12);
  const col = color ? new Float32Array(n * 12) : null;
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    const [nw, ne, se, sw] = world.tileCorners(t.x, t.y);
    const x0 = t.x * TILE + inset;
    const x1 = (t.x + 1) * TILE - inset;
    const z0 = t.y * TILE + inset;
    const z1 = (t.y + 1) * TILE - inset;
    const o = i * 12;
    pos.set([x0, nw + lift, z0, x1, ne + lift, z0, x1, se + lift, z1, x0, sw + lift, z1], o);
    if (col && color) {
      const c = color(t, i);
      for (let k = 0; k < 4; k++) col.set([c.r, c.g, c.b], o + k * 3);
    }
    const v = i * 4;
    // NW=v, NE=v+1, SE=v+2, SW=v+3. Triangles (NW, SW, NE) and (NE, SW, SE).
    idx.set([v, v + 3, v + 1, v + 1, v + 3, v + 2], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
