/** Road kinds available in Phase 2b. Highways and one-way roads arrive in 2d. */
export type RoadType = 'street' | 'avenue';

export interface RoadTypeDef {
  label: string;
  /** Total width including sidewalks, metres. */
  width: number;
  /** Lanes in each direction (traffic-ready: Phase 3 builds lanes from this). */
  lanesPerDirection: number;
  laneWidth: number;
  /** Central median width, metres (0 = painted centre line). */
  median: number;
  sidewalk: number;
  /** Cost per metre (Realistic mode). */
  costPerMetre: number;
  /** Max gradient (rise / run) in Realistic mode. */
  maxGrade: number;
  /** Design speed, km/h (Phase 3). */
  speed: number;
  /** Grid snapping: street centres sit on tile centres, avenues on tile edges. */
  snap: 'centre' | 'edge';
  /** Index used by the road shader. */
  shaderKind: number;
}

export const ROAD_TYPES: Record<RoadType, RoadTypeDef> = {
  street: { label: 'Street', width: 8, lanesPerDirection: 1, laneWidth: 2.4, median: 0, sidewalk: 1.6, costPerMetre: 12, maxGrade: 0.15, speed: 40, snap: 'centre', shaderKind: 0 },
  avenue: { label: 'Avenue', width: 14, lanesPerDirection: 2, laneWidth: 2.4, median: 1.2, sidewalk: 1.6, costPerMetre: 28, maxGrade: 0.12, speed: 60, snap: 'edge', shaderKind: 1 },
};

export const ROAD_TYPE_IDS = Object.keys(ROAD_TYPES) as RoadType[];

/**
 * A tile is covered by a road (marked KIND_ROAD) when its centre is within halfWidth + this
 * margin of the centreline, so building footprints never overlap the pavement.
 */
export const COVER_MARGIN = 3;

export interface Lane {
  /** Lateral offset from the centreline, metres (positive = right of a→b). */
  offset: number;
  /** +1 travels a→b, -1 travels b→a. */
  dir: 1 | -1;
}

/** Traffic-ready lane layout for a road type (right-hand traffic). */
export function lanesFor(type: RoadType): Lane[] {
  const d = ROAD_TYPES[type];
  const out: Lane[] = [];
  for (let i = 0; i < d.lanesPerDirection; i++) {
    const off = d.median / 2 + d.laneWidth * (i + 0.5);
    out.push({ offset: off, dir: 1 }, { offset: -off, dir: -1 });
  }
  return out;
}
