/** World units are metres. One tile is TILE x TILE metres. */
export const TILE = 8;
export const SEA_LEVEL = 0;
/** Max height difference between the corners of one tile for a road to be built on it. */
export const MAX_ROAD_SLOPE = 3;
/** Max height difference across a building footprint (the foundation plinth fills the rest). */
export const MAX_BUILD_SLOPE = 4.5;

export const MAP_SIZES = { medium: 128, large: 192, huge: 256 } as const;
export type MapSizeId = keyof typeof MAP_SIZES;

export const KIND_EMPTY = 0;
export const KIND_ROAD = 1;
export const KIND_BUILDING = 2;

export const ZONE_NONE = 0;
export const ZONE_RES = 1;
export const ZONE_COM = 2;
export const ZONE_IND = 3;
export type ZoneId = 0 | 1 | 2 | 3;

export const START_MONEY = 50_000;
export const COST_ROAD = 100;
export const COST_ZONE = 10;
export const COST_BULLDOZE = 5;

export type BuildingType =
  | 'house'
  | 'apartment'
  | 'shop'
  | 'office'
  | 'workshop'
  | 'warehouse'
  | 'park'
  | 'resTower'
  | 'officeTower'
  | 'bigFactory';

export interface BuildingDef {
  label: string;
  w: number;
  h: number;
  /** Cost when placed by hand. Zone-grown buildings are free (private development). */
  cost: number;
  residents: number;
  jobs: number;
  zone: ZoneId;
  /** Can the player place it directly from the Buildings menu? */
  placeable: boolean;
}

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: { label: 'House', w: 1, h: 1, cost: 0, residents: 4, jobs: 0, zone: ZONE_RES, placeable: false },
  apartment: { label: 'Apartments', w: 1, h: 1, cost: 0, residents: 40, jobs: 0, zone: ZONE_RES, placeable: false },
  shop: { label: 'Shop', w: 1, h: 1, cost: 0, residents: 0, jobs: 8, zone: ZONE_COM, placeable: false },
  office: { label: 'Office', w: 1, h: 1, cost: 0, residents: 0, jobs: 60, zone: ZONE_COM, placeable: false },
  workshop: { label: 'Workshop', w: 1, h: 1, cost: 0, residents: 0, jobs: 20, zone: ZONE_IND, placeable: false },
  warehouse: { label: 'Warehouse', w: 1, h: 1, cost: 0, residents: 0, jobs: 12, zone: ZONE_IND, placeable: false },
  park: { label: 'Park', w: 1, h: 1, cost: 2_000, residents: 0, jobs: 2, zone: ZONE_NONE, placeable: true },
  resTower: { label: 'Residential tower', w: 2, h: 2, cost: 45_000, residents: 320, jobs: 0, zone: ZONE_RES, placeable: true },
  officeTower: { label: 'Office tower', w: 2, h: 2, cost: 60_000, residents: 0, jobs: 450, zone: ZONE_COM, placeable: true },
  bigFactory: { label: 'Factory', w: 2, h: 2, cost: 30_000, residents: 0, jobs: 150, zone: ZONE_IND, placeable: true },
};

export const PLACEABLE_TYPES = (Object.keys(BUILDING_DEFS) as BuildingType[]).filter(
  (t) => BUILDING_DEFS[t].placeable,
);
