/** Quadratic Bézier helpers for road centrelines (x/z in world metres). */

export interface P2 {
  x: number;
  z: number;
}

/** A road curve: start, control point, end. A straight road has its control at the midpoint. */
export interface Curve {
  a: P2;
  c: P2;
  b: P2;
}

export const mid = (p: P2, q: P2): P2 => ({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
export const dist = (p: P2, q: P2) => Math.hypot(p.x - q.x, p.z - q.z);
const lerp = (p: P2, q: P2, t: number): P2 => ({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });

export function straight(a: P2, b: P2): Curve {
  return { a, c: mid(a, b), b };
}

export function evalCurve(k: Curve, t: number): P2 {
  const u = 1 - t;
  return { x: u * u * k.a.x + 2 * u * t * k.c.x + t * t * k.b.x, z: u * u * k.a.z + 2 * u * t * k.c.z + t * t * k.b.z };
}

export function tangent(k: Curve, t: number): P2 {
  const x = 2 * (1 - t) * (k.c.x - k.a.x) + 2 * t * (k.b.x - k.c.x);
  const z = 2 * (1 - t) * (k.c.z - k.a.z) + 2 * t * (k.b.z - k.c.z);
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

export function curveLength(k: Curve, steps = 16): number {
  let len = 0;
  let p = k.a;
  for (let i = 1; i <= steps; i++) {
    const q = evalCurve(k, i / steps);
    len += dist(p, q);
    p = q;
  }
  return len;
}

/** Points along the curve every ~`step` metres, with their t values (ends included). */
export function sampleCurve(k: Curve, step: number): { p: P2; t: number }[] {
  const n = Math.max(1, Math.ceil(curveLength(k) / step));
  const out: { p: P2; t: number }[] = [];
  for (let i = 0; i <= n; i++) out.push({ p: evalCurve(k, i / n), t: i / n });
  return out;
}

/** de Casteljau split: two curves meeting at t. */
export function splitCurve(k: Curve, t: number): [Curve, Curve] {
  const q0 = lerp(k.a, k.c, t);
  const q1 = lerp(k.c, k.b, t);
  const m = lerp(q0, q1, t);
  return [
    { a: k.a, c: q0, b: m },
    { a: m, c: q1, b: k.b },
  ];
}

/** Sub-curve between parameters t0 < t1 (Bézier subdivision keeps parameters linear). */
export function subCurve(k: Curve, t0: number, t1: number): Curve {
  let c = k;
  if (t1 < 1) c = splitCurve(c, t1)[0];
  if (t0 > 0) c = splitCurve(c, t0 / t1)[1];
  return c;
}

export function closestT(k: Curve, p: P2): { t: number; d: number } {
  let best = 0;
  let bd = Infinity;
  const n = 32;
  for (let i = 0; i <= n; i++) {
    const d = dist(evalCurve(k, i / n), p);
    if (d < bd) {
      bd = d;
      best = i / n;
    }
  }
  let lo = Math.max(0, best - 1 / n);
  let hi = Math.min(1, best + 1 / n);
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (dist(evalCurve(k, m1), p) < dist(evalCurve(k, m2), p)) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  return { t, d: dist(evalCurve(k, t), p) };
}

/** Bounding box of the control polygon (contains the curve). */
export function curveBox(k: Curve): { x0: number; z0: number; x1: number; z1: number } {
  return {
    x0: Math.min(k.a.x, k.c.x, k.b.x),
    z0: Math.min(k.a.z, k.c.z, k.b.z),
    x1: Math.max(k.a.x, k.c.x, k.b.x),
    z1: Math.max(k.a.z, k.c.z, k.b.z),
  };
}

/** Crossing points of two curves as (tA, tB) pairs, from 2 m polylines. */
export function intersectCurves(ka: Curve, kb: Curve): { ta: number; tb: number }[] {
  const A = sampleCurve(ka, 2);
  const B = sampleCurve(kb, 2);
  const out: { ta: number; tb: number }[] = [];
  for (let i = 0; i < A.length - 1; i++) {
    const p = A[i].p;
    const p2 = A[i + 1].p;
    for (let j = 0; j < B.length - 1; j++) {
      const q = B[j].p;
      const q2 = B[j + 1].p;
      const rx = p2.x - p.x;
      const rz = p2.z - p.z;
      const sx = q2.x - q.x;
      const sz = q2.z - q.z;
      const den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const u = ((q.x - p.x) * sz - (q.z - p.z) * sx) / den;
      const v = ((q.x - p.x) * rz - (q.z - p.z) * rx) / den;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const ta = A[i].t + (A[i + 1].t - A[i].t) * u;
      const tb = B[j].t + (B[j + 1].t - B[j].t) * v;
      if (!out.some((o) => Math.abs(o.ta - ta) < 1e-3)) out.push({ ta, tb });
    }
  }
  return out.sort((x, y) => x.ta - y.ta);
}

/** Ramer–Douglas–Peucker simplification of a finger path. */
export function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length < 3) return pts.slice();
  const a = pts[0];
  const b = pts[pts.length - 1];
  let worst = 0;
  let wi = 0;
  const lx = b.x - a.x;
  const lz = b.z - a.z;
  const ll = Math.hypot(lx, lz) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - a.x) * lz - (pts[i].z - a.z) * lx) / ll;
    if (d > worst) {
      worst = d;
      wi = i;
    }
  }
  if (worst <= tol) return [a, b];
  const left = simplify(pts.slice(0, wi + 1), tol);
  const right = simplify(pts.slice(wi), tol);
  return left.slice(0, -1).concat(right);
}

/**
 * Smooth chain of quadratic curves through a simplified path: each interior vertex becomes a
 * control point and curves meet at the midpoints between vertices (tangent-continuous).
 */
export function fitChain(v: P2[]): Curve[] {
  if (v.length < 2) return [];
  if (v.length === 2) return [straight(v[0], v[1])];
  const out: Curve[] = [];
  let start = v[0];
  for (let i = 1; i < v.length - 1; i++) {
    const end = i === v.length - 2 ? v[v.length - 1] : mid(v[i], v[i + 1]);
    out.push({ a: start, c: v[i], b: end });
    start = end;
  }
  return out;
}
