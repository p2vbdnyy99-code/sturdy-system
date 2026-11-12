import * as THREE from 'three';
import { SEA_LEVEL } from '../sim/constants';
import { Curve, curveLength, evalCurve, tangent } from '../sim/roads/geometry';
import { CHUNK, RoadNetwork } from '../sim/roads/network';
import { ROAD_TYPES, RoadType } from '../sim/roads/types';
import { World } from '../sim/world';

const JUNCTION_KIND = 9;

export interface RibbonItem {
  curve: Curve;
  type: RoadType;
  /** Metres trimmed off each end to leave room for a junction pad. */
  trimA: number;
  trimB: number;
}
export interface PadItem {
  x: number;
  z: number;
  r: number;
}

/**
 * Road surface geometry: ribbons that follow each curve and the terrain, plus round junction
 * pads. Attributes roadUv (metres across, metres along) and roadKind drive the marking shader.
 */
export function buildRoadGeometry(world: World, ribbons: RibbonItem[], pads: PadItem[], lift: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const kind: number[] = [];
  const idx: number[] = [];
  const ground = (x: number, z: number) => Math.max(world.heightAt(x, z), SEA_LEVEL + 0.2);
  const tri = (a: number, b: number, c: number) => {
    // Orient every triangle upwards (normals point to the sky).
    const ax = pos[a * 3], az = pos[a * 3 + 2];
    const bx = pos[b * 3], bz = pos[b * 3 + 2];
    const cx = pos[c * 3], cz = pos[c * 3 + 2];
    const y = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (y >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };
  for (const r of ribbons) {
    const def = ROAD_TYPES[r.type];
    const hw = def.width / 2;
    const len = curveLength(r.curve);
    const t0 = Math.min(0.49, r.trimA / len);
    const t1 = Math.max(0.51, 1 - r.trimB / len);
    const n = Math.max(1, Math.ceil(((t1 - t0) * len) / 2));
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const p = evalCurve(r.curve, t);
      const f = tangent(r.curve, t);
      const rx = -f.z;
      const rz = f.x;
      const v = t * len;
      for (const u of [-hw, 0, hw]) {
        const x = p.x + rx * u;
        const z = p.z + rz * u;
        pos.push(x, ground(x, z) + lift, z);
        uv.push(u, v);
        kind.push(def.shaderKind);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 3;
      const b = a + 3;
      tri(a, a + 1, b);
      tri(b, a + 1, b + 1);
      tri(a + 1, a + 2, b + 1);
      tri(b + 1, a + 2, b + 2);
    }
  }
  const SIDES = 24;
  for (const pd of pads) {
    const c = pos.length / 3;
    pos.push(pd.x, ground(pd.x, pd.z) + lift + 0.03, pd.z);
    uv.push(0, 0);
    kind.push(JUNCTION_KIND);
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      const x = pd.x + Math.cos(a) * pd.r;
      const z = pd.z + Math.sin(a) * pd.r;
      pos.push(x, ground(x, z) + lift + 0.03, z);
      uv.push(pd.r, 0);
      kind.push(JUNCTION_KIND);
    }
    for (let j = 0; j < SIDES; j++) tri(c, c + 1 + j, c + 1 + ((j + 1) % SIDES));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('roadUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('roadKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Asphalt, sidewalks and lane markings computed per pixel (no textures). */
function roadMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 roadUv;\nattribute float roadKind;\nvarying vec2 vRoadUv;\nvarying float vRoadKind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadUv = roadUv;\nvRoadKind = roadKind;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoadUv;\nvarying float vRoadKind;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 asphalt = vec3(0.23, 0.24, 0.26);
vec3 walk = vec3(0.70, 0.68, 0.64);
vec3 col = asphalt;
float u = abs(vRoadUv.x);
float v = vRoadUv.y;
float aa = clamp(1.4 - length(fwidth(vRoadUv)) * 1.2, 0.0, 1.0); // fade markings far away
if (vRoadKind < 8.5) {
  float hw = vRoadKind < 0.5 ? 4.0 : 7.0;
  float walkEdge = hw - 1.6;
  float isWalk = smoothstep(walkEdge - 0.05, walkEdge + 0.05, u);
  float edgeLine = (1.0 - smoothstep(0.06, 0.12, abs(u - (walkEdge - 0.3)))) * aa;
  col = mix(col, vec3(0.85), edgeLine);
  if (vRoadKind < 0.5) {
    float centre = (1.0 - smoothstep(0.07, 0.13, u)) * step(0.5, fract(v / 6.0)) * aa;
    col = mix(col, vec3(0.91, 0.77, 0.28), centre);
  } else {
    float median = 1.0 - smoothstep(0.55, 0.65, u);
    col = mix(col, vec3(0.45, 0.55, 0.33), median);
    float lane = (1.0 - smoothstep(0.06, 0.12, abs(u - 3.0))) * step(0.5, fract(v / 8.0)) * aa;
    col = mix(col, vec3(0.88), lane);
  }
  col = mix(col, walk, isWalk);
}
diffuseColor.rgb = col;`,
      );
  };
  m.customProgramCacheKey = () => 'metrosim-road-v1';
  return m;
}

/** What a junction looks like: pad radius and how far roads stop short of the node. */
function junctionInfo(net: RoadNetwork, nodeId: number): { pad: number; trim: number } | null {
  const ids = net.segsAt(nodeId);
  if (ids.length < 2) return null;
  const segs = ids.map((id) => net.segs.get(id)!);
  const hw = Math.max(...segs.map((s) => ROAD_TYPES[s.type].width / 2));
  if (ids.length === 2) {
    // A plain continuation (same type, nearly straight) needs no pad.
    const [s0, s1] = segs;
    const dirAt = (s: typeof s0) => {
      const k = net.curveOf(s);
      const t = tangent(k, s.a === nodeId ? 0 : 1);
      return s.a === nodeId ? t : { x: -t.x, z: -t.z }; // pointing away from the node
    };
    const d0 = dirAt(s0);
    const d1 = dirAt(s1);
    const dot = d0.x * d1.x + d0.z * d1.z; // -1 = straight through
    if (s0.type === s1.type && dot < -0.94) return null;
  }
  return { pad: hw * 1.42, trim: hw };
}

/** Road meshes in 256 m chunks: an edit rebuilds only the chunks it touches. */
export class RoadLayer {
  readonly group = new THREE.Group();
  private material = roadMaterial();
  private chunks = new Map<string, THREE.Mesh>();

  constructor(private world: World) {
    this.rebuildAll();
  }

  rebuildAll(): void {
    for (const m of this.chunks.values()) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.chunks.clear();
    const keys = new Set<string>();
    const net = this.world.roads;
    for (const s of net.segs.values()) keys.add(RoadNetwork.segChunk(net, s));
    for (const n of net.nodes.values()) keys.add(`${Math.floor(n.x / CHUNK)},${Math.floor(n.z / CHUNK)}`);
    net.dirtyChunks.clear();
    for (const k of keys) this.rebuildChunk(k);
  }

  /** Rebuilds chunks the network marked dirty, plus any overlapping an edited terrain rectangle (metres). */
  update(terrainRect?: { x0: number; z0: number; x1: number; z1: number }): number {
    const net = this.world.roads;
    const keys = new Set(net.dirtyChunks);
    net.dirtyChunks.clear();
    if (terrainRect) {
      for (let cz = Math.floor((terrainRect.z0 - 16) / CHUNK); cz <= Math.floor((terrainRect.z1 + 16) / CHUNK); cz++)
        for (let cx = Math.floor((terrainRect.x0 - 16) / CHUNK); cx <= Math.floor((terrainRect.x1 + 16) / CHUNK); cx++) {
          const k = `${cx},${cz}`;
          if (this.chunks.has(k)) keys.add(k);
        }
    }
    // A changed junction changes its neighbours' trims: include chunks of segments at dirty nodes.
    for (const k of keys) this.rebuildChunk(k);
    return keys.size;
  }

  private rebuildChunk(key: string): void {
    const net = this.world.roads;
    const ribbons: RibbonItem[] = [];
    const pads: PadItem[] = [];
    const info = new Map<number, { pad: number; trim: number } | null>();
    const jn = (id: number) => {
      if (!info.has(id)) info.set(id, junctionInfo(net, id));
      return info.get(id)!;
    };
    for (const s of net.segs.values()) {
      if (RoadNetwork.segChunk(net, s) !== key) continue;
      const ja = jn(s.a);
      const jb = jn(s.b);
      ribbons.push({ curve: net.curveOf(s), type: s.type, trimA: ja?.trim ?? 0, trimB: jb?.trim ?? 0 });
    }
    for (const n of net.nodes.values()) {
      if (`${Math.floor(n.x / CHUNK)},${Math.floor(n.z / CHUNK)}` !== key) continue;
      const j = jn(n.id);
      if (j) pads.push({ x: n.x, z: n.z, r: j.pad });
    }
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.chunks.delete(key);
    }
    if (!ribbons.length && !pads.length) return;
    const mesh = new THREE.Mesh(buildRoadGeometry(this.world, ribbons, pads, 0.15), this.material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.chunks.set(key, mesh);
  }

  chunkCount(): number {
    return this.chunks.size;
  }

  dispose(): void {
    for (const m of this.chunks.values()) m.geometry.dispose();
    this.material.dispose();
  }
}
