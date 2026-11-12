import { buildStressCity } from '../sim/stressCity';
import type { World } from '../sim/world';

export interface ScenarioResult {
  label: string;
  buildings: number;
  roadTiles: number;
  /** Time to build all meshes for the city (load / new city cost). */
  buildMs: number;
  /** Time to rebuild meshes after one building appears (paid on every growth step). */
  rebuildMs: number;
  /** Median split of rebuildMs: buildings / trees / zone overlay. */
  rebuildSplit: { buildings: number; trees: number; zones: number };
  firstFrameMs: number;
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  worst: number;
  drawCalls: number;
  triangles: number;
}

export interface BenchReport {
  date: string;
  device: string;
  screen: string;
  quality: string;
  pixelRatio: number;
  renderer: string;
  heapMB: number | null;
  scenarios: ScenarioResult[];
  /** "City" scenario re-measured with one cost factor removed at a time. */
  diagnosis: { label: string; fps: number; p50: number; p95: number }[];
  trees: number;
}

export const SCENARIOS = [
  { label: 'Empty map', buildings: 0 },
  { label: 'Town', buildings: 1500 },
  { label: 'City', buildings: 5000 },
  { label: 'Metro', buildings: 10000 },
];

/** Seconds the camera orbits per scenario. */
export const ORBIT_SECONDS = 6;
/** Seconds per diagnosis variant (after a short settle period). */
export const DIAG_SECONDS = 4;
export const BENCH_MAP_SIZE = 192;
export const BENCH_SEED = 20261111;

export function makeScenarioWorld(buildings: number): World {
  return buildStressCity(BENCH_MAP_SIZE, BENCH_SEED, buildings);
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export function formatReport(r: BenchReport): string {
  const lines = [
    `MetroSim 3D performance test — ${r.date}`,
    `Device: ${r.device}`,
    `Screen: ${r.screen}, render pixel ratio ${r.pixelRatio}, quality ${r.quality}`,
    `GPU: ${r.renderer}${r.heapMB != null ? `, JS heap ${r.heapMB} MB` : ''}`,
    '',
    'Scenario     Bldgs   FPS   p50ms  p95ms  worst  build  rebuild (bldg/tree/zone)  draws  tris',
  ];
  for (const s of r.scenarios) {
    lines.push(
      [
        s.label.padEnd(11),
        String(s.buildings).padStart(6),
        s.fps.toFixed(0).padStart(5),
        s.p50.toFixed(1).padStart(7),
        s.p95.toFixed(1).padStart(6),
        s.worst.toFixed(0).padStart(6),
        s.buildMs.toFixed(0).padStart(6),
        `${s.rebuildMs.toFixed(1).padStart(8)} (${s.rebuildSplit.buildings.toFixed(1)}/${s.rebuildSplit.trees.toFixed(1)}/${s.rebuildSplit.zones.toFixed(1)})`.padEnd(25),
        String(s.drawCalls).padStart(6),
        `${(s.triangles / 1000).toFixed(0)}k`.padStart(6),
      ].join(' '),
    );
  }
  if (r.diagnosis.length) {
    lines.push('', `What costs frame time (City, ${r.trees.toLocaleString('en-US')} trees):`, 'Variant              FPS   p50ms  p95ms');
    for (const d of r.diagnosis) lines.push(`${d.label.padEnd(18)} ${d.fps.toFixed(0).padStart(5)} ${d.p50.toFixed(1).padStart(7)} ${d.p95.toFixed(1).padStart(6)}`);
  }
  lines.push('', 'FPS/p50/p95/worst: frame interval while the camera orbits (60 FPS = 16.7 ms).',
    'build: ms to create all meshes for the city. rebuild: ms of main-thread work per growth step.');
  return lines.join('\n');
}
