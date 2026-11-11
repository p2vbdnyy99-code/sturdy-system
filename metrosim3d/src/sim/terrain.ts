import { hash2 } from './rng';

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0,1), lattice spacing 1. */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Fractal noise in roughly [-1,1]. */
export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += (valueNoise(x * freq, y * freq, seed + o * 1013) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Generates corner heights for a size x size tile map: (size+1)^2 values, row-major.
 * Shape: a coastline along one edge, a meandering river, broad buildable plains in the
 * middle and hills toward the far edges.
 */
export function generateHeights(size: number, seed: number): Float32Array {
  const n = size + 1;
  const h = new Float32Array(n * n);
  const s = seed >>> 0;
  // River: a sine-ish path across the map (x as function of y), perturbed by noise.
  const riverPhase = hash2(1, 2, s) * Math.PI * 2;
  const riverBase = 0.35 + hash2(3, 4, s) * 0.3;
  const coastSide = Math.floor(hash2(5, 6, s) * 4); // which edge the sea is on

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / size;
      const v = y / size;
      // Base rolling terrain, scaled so the plains are gentle.
      const large = fbm(u * 3, v * 3, s, 5); // [-1,1]
      const detail = fbm(u * 14, v * 14, s + 77, 3) * 0.6;
      // Hilliness grows toward the edges, so the centre is easy to build on.
      const dc = Math.hypot(u - 0.5, v - 0.5) / 0.7071; // 0 centre .. 1 corner
      const hilliness = 0.25 + 0.75 * Math.pow(dc, 1.6);
      let height = 6 + large * 14 * hilliness + detail * 2 * hilliness;
      const ridge = Math.max(0, fbm(u * 2.2 + 9, v * 2.2 + 9, s + 5, 4)) * 55 * Math.pow(dc, 2.2);
      height += ridge;

      // Coast: distance to chosen edge, height falls below sea level near it.
      const edgeDist = [v, 1 - u, 1 - v, u][coastSide];
      const coastNoise = fbm(u * 6, v * 6, s + 99, 3) * 0.04;
      const c = (edgeDist + coastNoise - 0.1) / 0.12;
      if (c < 1) height = height * Math.max(0, c) + (-6) * (1 - Math.max(0, c)) + Math.min(0, c) * 4;

      // River across the map, roughly perpendicular to the coast so it flows into the sea.
      const along = coastSide % 2 === 0 ? v : u;
      const across = coastSide % 2 === 0 ? u : v;
      const riverCentre = riverBase + Math.sin(along * Math.PI * 2.2 + riverPhase) * 0.1 + fbm(along * 4, 3, s + 31, 2) * 0.05;
      const rd = Math.abs(across - riverCentre) * size; // in tiles
      const riverHalfWidth = 2.2;
      const bank = 7;
      if (rd < riverHalfWidth + bank) {
        const t = Math.max(0, (rd - riverHalfWidth) / bank); // 0 in river .. 1 at bank edge
        const riverBed = -3;
        const target = rd < riverHalfWidth ? riverBed : riverBed + (Math.min(height, 6) - riverBed) * smooth(t);
        const blend = smooth(Math.min(1, t * 1.2));
        height = target * (1 - blend) + height * blend;
        if (rd < riverHalfWidth) height = riverBed;
      }
      h[y * n + x] = height;
    }
  }
  return h;
}
