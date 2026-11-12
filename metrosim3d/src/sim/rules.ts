import type { World } from './world';

/** Creative is the primary experience; Realistic adds costs and physical limits. */
export type GameMode = 'creative' | 'realistic';

export interface Rules {
  /** Construction and terraforming are paid from the treasury. */
  chargeMoney: boolean;
  /** Steep ground blocks roads, zones and buildings. */
  enforceSlope: boolean;
  /** Water blocks roads, zones and buildings. */
  enforceWater: boolean;
  /** Largest drag rectangle side for zone/bulldoze (roads: twice this). */
  maxDrag: number;
}

/** Rules are derived from the mode, never stored, so switching mode never touches the city. */
export function rulesFor(world: World): Rules {
  if (world.mode === 'creative') {
    return {
      chargeMoney: world.financeInCreative,
      enforceSlope: false,
      enforceWater: false,
      maxDrag: world.size,
    };
  }
  return { chargeMoney: true, enforceSlope: true, enforceWater: true, maxDrag: 64 };
}
