import { BUILDING_DEFS, KIND_ROAD, ZONE_COM, ZONE_IND, ZONE_RES } from './constants';
import { World } from './world';

export interface CityStats {
  population: number;
  commercialJobs: number;
  industrialJobs: number;
  otherJobs: number;
  buildings: number;
  roadTiles: number;
  zonedRes: number;
  zonedCom: number;
  zonedInd: number;
}

export function computeStats(world: World): CityStats {
  const s: CityStats = {
    population: 0,
    commercialJobs: 0,
    industrialJobs: 0,
    otherJobs: 0,
    buildings: world.buildings.size,
    roadTiles: 0,
    zonedRes: 0,
    zonedCom: 0,
    zonedInd: 0,
  };
  for (const b of world.buildings.values()) {
    const d = BUILDING_DEFS[b.type];
    s.population += d.residents;
    if (d.zone === ZONE_COM) s.commercialJobs += d.jobs;
    else if (d.zone === ZONE_IND) s.industrialJobs += d.jobs;
    else s.otherJobs += d.jobs;
  }
  for (let i = 0; i < world.kind.length; i++) {
    if (world.kind[i] === KIND_ROAD) s.roadTiles++;
    const z = world.zone[i];
    if (z === ZONE_RES) s.zonedRes++;
    else if (z === ZONE_COM) s.zonedCom++;
    else if (z === ZONE_IND) s.zonedInd++;
  }
  return s;
}
