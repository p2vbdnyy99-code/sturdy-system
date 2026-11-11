import { TILE } from '../sim/constants';
import { mulberry32 } from '../sim/rng';
import { Building, World } from '../sim/world';

export type PartMesh = 'win' | 'plain' | 'roof' | 'cyl' | 'cone';

/** One primitive of a procedural building, in world space. Geometry base sits at y = 0. */
export interface Part {
  mesh: PartMesh;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  color: number;
}

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}
function range(r: () => number, lo: number, hi: number): number {
  return lo + r() * (hi - lo);
}

const PASTELS = [0xe8dcc8, 0xd9c7a8, 0xf0e6d2, 0xc9d6df, 0xe3c9b5, 0xd8e2c8, 0xf2d7c4];
const ROOFS = [0x8b3a2b, 0x6b4a3a, 0x4f5459, 0x7a5230, 0x5c3b32];
const BRICK = [0xa65d45, 0xb7876b, 0xcdbfa8, 0x9d8574, 0xd6cbb8];
const GLASS = [0x7f9db3, 0x8aa7b8, 0x6f8797, 0x9fb3bf, 0x5f7f99, 0xa6b8c4];
const CONCRETE = [0x9c9a94, 0xaaa69d, 0x8f8d88, 0xb3afa6];
const FOUNDATION = 0x8a857b;

/**
 * Procedural geometry for a building. Deterministic: the same building always looks the same.
 * The building stands on the highest corner of its footprint; a foundation plinth fills the
 * slope down to the lowest corner so nothing floats on hills.
 */
export function buildingParts(b: Building, world: World): Part[] {
  const r = mulberry32(b.seed);
  const [lo, hi] = world.footprintMinMax(b.x, b.y, b.w, b.h);
  const cx = (b.x + b.w / 2) * TILE;
  const cz = (b.y + b.h / 2) * TILE;
  const fw = b.w * TILE;
  const fd = b.h * TILE;
  const base = hi + 0.2;
  const parts: Part[] = [];
  const rot = (r() < 0.5 ? 0 : Math.PI / 2);
  parts.push({ mesh: 'plain', x: cx, y: lo - 0.5, z: cz, sx: fw * 0.92, sy: base - lo + 0.5, sz: fd * 0.92, rotY: 0, color: FOUNDATION });
  const box = (mesh: PartMesh, sx: number, sy: number, sz: number, y: number, color: number, dx = 0, dz = 0, rotY = rot) => {
    // Offsets rotate with the building so attached parts stay attached.
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    parts.push({ mesh, x: cx + dx * c + dz * s, y, z: cz - dx * s + dz * c, sx, sy, sz, rotY, color });
  };

  switch (b.type) {
    case 'house': {
      const w = range(r, 4.2, 5.6);
      const d = range(r, 4.2, 5.8);
      const h = range(r, 3, 5.5);
      box('plain', w, h, d, base, pick(r, PASTELS));
      box('roof', w + 0.6, range(r, 1.6, 2.6), d + 0.4, base + h, pick(r, ROOFS));
      break;
    }
    case 'apartment': {
      const w = range(r, 6, 7);
      const h = range(r, 10, 24);
      box('win', w, h, w, base, pick(r, BRICK));
      box('plain', w * 0.4, 1.6, w * 0.4, base + h, 0x77736c);
      break;
    }
    case 'shop': {
      const w = range(r, 6, 7.2);
      const h = range(r, 4, 7);
      box('win', w, h, w, base, pick(r, PASTELS));
      box('plain', w + 0.4, 0.4, 1.2, base + 3, pick(r, [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910]), 0, w / 2);
      break;
    }
    case 'office': {
      const w = range(r, 5.5, 7);
      const h = range(r, 18, 42);
      box('win', w, h, w, base, pick(r, GLASS));
      box('plain', w * 0.85, 1, w * 0.85, base + h, 0x6d6f73);
      break;
    }
    case 'workshop': {
      const w = range(r, 6.5, 7.2);
      const d = range(r, 4.5, 6);
      const h = range(r, 5, 7);
      box('plain', w, h, d, base, pick(r, CONCRETE));
      box('cyl', 0.9, range(r, 9, 14), 0.9, base, 0x7b6f66, w * 0.3, -d * 0.2);
      break;
    }
    case 'warehouse': {
      const w = range(r, 6.8, 7.4);
      const h = range(r, 4.5, 6);
      box('plain', w, h, w, base, pick(r, CONCRETE));
      box('roof', w, 1.2, w, base + h, 0x5d6166);
      break;
    }
    case 'park': {
      box('plain', TILE * 0.96, 0.25, TILE * 0.96, base - 0.1, 0x5f9446, 0, 0, 0);
      const trees = 3 + Math.floor(r() * 3);
      for (let i = 0; i < trees; i++) {
        const dx = range(r, -2.8, 2.8);
        const dz = range(r, -2.8, 2.8);
        const th = range(r, 1.2, 2);
        parts.push({ mesh: 'cyl', x: cx + dx, y: base, z: cz + dz, sx: 0.35, sy: th, sz: 0.35, rotY: 0, color: 0x6b4a2f });
        const s = range(r, 2, 3.2);
        parts.push({ mesh: 'cone', x: cx + dx, y: base + th, z: cz + dz, sx: s, sy: s * 1.6, sz: s, rotY: 0, color: pick(r, [0x3f7a35, 0x4a8a3a, 0x356b2e]) });
      }
      break;
    }
    case 'resTower': {
      const w = range(r, 11, 13);
      const h = range(r, 45, 80);
      const col = pick(r, BRICK);
      box('win', w, h, w, base, col);
      const h2 = range(r, 8, 18);
      box('win', w * 0.7, h2, w * 0.7, base + h, col);
      box('plain', w * 0.3, 2.5, w * 0.3, base + h + h2, 0x6d6f73);
      break;
    }
    case 'officeTower': {
      const w = range(r, 12, 14);
      const h = range(r, 70, 120);
      const col = pick(r, GLASS);
      box('win', w, h, w, base, col);
      const h2 = range(r, 10, 25);
      box('win', w * 0.72, h2, w * 0.72, base + h, col);
      box('cyl', 0.6, range(r, 10, 20), 0.6, base + h + h2, 0xbfc3c7);
      break;
    }
    case 'bigFactory': {
      box('plain', 14, range(r, 9, 12), 9, base, pick(r, CONCRETE), 0, -2.5, 0);
      box('roof', 14, 2, 9, base + 10, 0x5d6166, 0, -2.5, 0);
      const stacks = 2 + Math.floor(r() * 2);
      for (let i = 0; i < stacks; i++) box('cyl', 1.4, range(r, 20, 30), 1.4, base, 0x8c6d5a, -5 + i * 3.5, 4.5, 0);
      box('cyl', 4, 6, 4, base, 0xc9ccd0, 5, 4.5, 0);
      break;
    }
  }
  return parts;
}
