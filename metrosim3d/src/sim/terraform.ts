import { KIND_BUILDING } from './constants';
import { rulesFor } from './rules';
import { World } from './world';

export type BrushMode = 'raise' | 'lower' | 'flatten' | 'smooth';

export interface Brush {
  mode: BrushMode;
  /** Radius in tiles (1–16). */
  radius: number;
  /** 1–10. Raise/lower: metres per second at the centre; flatten/smooth: blend speed. */
  strength: number;
  /** Flatten target height, taken where the stroke started. */
  target?: number;
}

export const TERRAIN_MIN = -25;
export const TERRAIN_MAX = 140;
/** Realistic mode: dollars per cubic-metre-equivalent of earth moved (corner metre × tile area / 64). */
export const COST_PER_METRE = 40;

/** Corners touching a building are locked so foundations never break. Roads simply follow the ground. */
export function cornerLocked(world: World, cx: number, cy: number): boolean {
  for (let dy = -1; dy <= 0; dy++)
    for (let dx = -1; dx <= 0; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (world.inBounds(x, y) && world.getKind(x, y) === KIND_BUILDING) return true;
    }
  return false;
}

export interface BrushResult {
  /** Total absolute height change (metres, summed over corners). */
  moved: number;
  cost: number;
  /** False when Realistic mode funds ran out (nothing changed). */
  ok: boolean;
}

/**
 * Applies one brush step of `dt` seconds centred on corner (cx, cy). Deterministic for the same
 * inputs. Charges the treasury in Realistic mode (or Creative with finances on).
 */
export function applyBrush(world: World, brush: Brush, cx: number, cy: number, dt: number): BrushResult {
  const r = Math.max(1, Math.min(16, brush.radius));
  const n = world.size;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(n, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(n, Math.ceil(cy + r));
  const k = Math.max(1, Math.min(10, brush.strength));
  const changes: [number, number, number][] = [];
  let moved = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d > 1 || cornerLocked(world, x, y)) continue;
      const fall = 0.5 + 0.5 * Math.cos(Math.PI * d); // smooth falloff: 1 at centre, 0 at edge
      const h = world.cornerH(x, y);
      let nh = h;
      switch (brush.mode) {
        case 'raise':
          nh = h + k * 1.5 * dt * fall;
          break;
        case 'lower':
          nh = h - k * 1.5 * dt * fall;
          break;
        case 'flatten': {
          const t = brush.target ?? h;
          nh = h + (t - h) * Math.min(1, k * 0.6 * dt * fall);
          break;
        }
        case 'smooth': {
          let sum = 0;
          let cnt = 0;
          for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) {
              const xx = x + i;
              const yy = y + j;
              if (xx < 0 || yy < 0 || xx > n || yy > n) continue;
              sum += world.cornerH(xx, yy);
              cnt++;
            }
          nh = h + (sum / cnt - h) * Math.min(1, k * 0.6 * dt * fall);
          break;
        }
      }
      nh = Math.max(TERRAIN_MIN, Math.min(TERRAIN_MAX, nh));
      if (nh !== h) {
        changes.push([x, y, nh]);
        moved += Math.abs(nh - h);
      }
    }
  }
  const rules = rulesFor(world);
  const cost = rules.chargeMoney ? Math.round(moved * COST_PER_METRE) : 0;
  if (!changes.length) return { moved: 0, cost: 0, ok: true };
  if (cost > 0 && cost > world.money) return { moved: 0, cost, ok: false };
  for (const [x, y, h] of changes) world.setCornerH(x, y, h);
  world.markTerrainDirty(x0, y0, x1, y1);
  if (cost > 0) world.treasury.post({ day: world.tick, amount: -cost, category: 'construction.terrain', budget: 'capital' });
  return { moved, cost, ok: true };
}
