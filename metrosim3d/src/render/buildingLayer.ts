import * as THREE from 'three';
import { KIND_EMPTY, SEA_LEVEL, TILE, ZONE_NONE } from '../sim/constants';
import { hash2 } from '../sim/rng';
import { fbm } from '../sim/terrain';
import { Building, World } from '../sim/world';
import { buildingParts, Part, PartMesh } from './buildingParts';
import { InstancedPool, partColor, partMatrix } from './instancedPool';

/** Standard material + procedural windows on vertical faces (world-space, no textures). */
function windowMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMsWorld;\nvarying vec3 vMsNormal;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vMsWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vMsNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
  vMsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vMsNormal = normalize(mat3(modelMatrix) * objectNormal);
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMsWorld;\nvarying vec3 vMsNormal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (abs(vMsNormal.y) < 0.5) {
  float along = dot(vMsWorld.xz, vec2(-vMsNormal.z, vMsNormal.x));
  float fy = fract(vMsWorld.y / 3.2);
  float fx = fract(along / 2.6);
  float win = step(0.3, fy) * step(fy, 0.82) * step(0.18, fx) * step(fx, 0.82);
  // Fade the pattern out where it would alias (far away / grazing angles).
  float fw = max(length(fwidth(vMsWorld)) , 1e-4);
  float aa = clamp(1.6 - fw * 0.9, 0.0, 1.0);
  vec3 glass = vec3(0.16, 0.21, 0.27);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.75, glass, win), aa * 0.9);
}`,
      );
  };
  m.customProgramCacheKey = () => 'metrosim-windows-v1';
  return m;
}

function unitGeometries(): Record<PartMesh, THREE.BufferGeometry> {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // Triangular prism roof: ridge along x.
  const roof = new THREE.BufferGeometry();
  const v = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0, // north slope
    0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, // south slope
    -0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 1, 0, // west gable
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0, // east gable
  ];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roof.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12]);
  const roofNI = roof.toNonIndexed();
  roofNI.computeVertexNormals();
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0);
  const cone = new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0);
  return { win: box, plain: box.clone(), roof: roofNI, cyl, cone };
}

interface CachedBuilding {
  /** Per mesh kind: precomputed matrices and colours for this building's parts. */
  parts: Partial<Record<PartMesh, { m: Float32Array; c: Float32Array; n: number }>>;
}

interface TreeCache {
  count: number;
  tile: Int32Array;
  /** World x/z of each tree, to re-seat it when the ground under it is edited. */
  px: Float32Array;
  pz: Float32Array;
  /** 0 when the ground is now underwater or too high for trees. */
  valid: Uint8Array;
  trunkM: Float32Array;
  crownM: Float32Array;
  trunkC: Float32Array;
  crownC: Float32Array;
  /** Reused output buffers, so updates allocate nothing. */
  out: { tm: Float32Array; cm: Float32Array; tc: Float32Array; cc: Float32Array };
}

const MESHES: PartMesh[] = ['win', 'plain', 'roof', 'cyl', 'cone'];

/** All buildings and decorative trees, as a handful of instanced meshes. */
export class BuildingLayer {
  readonly group = new THREE.Group();
  private pools: Record<PartMesh, InstancedPool>;
  private treePools: { trunk: InstancedPool; crown: InstancedPool };
  private geoms = unitGeometries();
  // Low-poly, open-ended tree shapes: thousands of trees made up most of the triangle count.
  private treeTrunkGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1, true).translate(0, 0.5, 0);
  private treeCrownGeom = new THREE.ConeGeometry(0.5, 1, 6, 1, true).translate(0, 0.5, 0);
  private materials: THREE.Material[] = [];
  private cache = new Map<number, CachedBuilding>();
  private trees: TreeCache | null = null;
  private scratch = { m: new Float32Array(0), c: new Float32Array(0) };

  constructor(private world: World, shadows: boolean, private treeDensity: number, treeShadows: boolean) {
    const plain = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const win = windowMaterial();
    const cone = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    this.materials.push(plain, win, cone);
    const g = this.geoms;
    this.pools = {
      win: new InstancedPool(this.group, g.win, win, shadows),
      plain: new InstancedPool(this.group, g.plain, plain, shadows),
      roof: new InstancedPool(this.group, g.roof, plain, shadows),
      cyl: new InstancedPool(this.group, g.cyl, plain, shadows),
      cone: new InstancedPool(this.group, g.cone, cone, shadows),
    };
    this.treePools = {
      trunk: new InstancedPool(this.group, this.treeTrunkGeom, plain, shadows && treeShadows, 1024, false),
      crown: new InstancedPool(this.group, this.treeCrownGeom, cone, shadows && treeShadows, 1024, shadows),
    };
  }

  private scratchFor(n: number): { m: Float32Array; c: Float32Array } {
    if (this.scratch.m.length < n * 16) this.scratch = { m: new Float32Array(n * 16 * 1.5), c: new Float32Array(n * 3 * 1.5) };
    return this.scratch;
  }

  /**
   * Incremental: each building's parts are generated once and cached as ready-made matrices.
   * A growth step then only generates the new building and copies the cached arrays.
   */
  updateBuildings(): void {
    const w = this.world;
    // Terrain edits never move corners under buildings (sim/terraform.ts), so cached
    // foundations stay valid; only a fresh layer (new city / load / undo) starts empty.
    let full = this.cache.size === 0 && w.buildings.size > 0;
    for (const id of this.cache.keys()) {
      if (!w.buildings.has(id)) {
        this.cache.delete(id);
        full = true; // removals leave gaps: repack everything
      }
    }
    if (!full) {
      // Common case (growth, placement): append only the new buildings' instances.
      for (const b of w.buildings.values()) {
        if (this.cache.has(b.id)) continue;
        const cb = this.makeCached(b);
        for (const k of MESHES) {
          const e = cb.parts[k];
          if (e) this.pools[k].appendRaw(e.m, e.c, e.n);
        }
      }
      return;
    }
    const totals: Record<PartMesh, number> = { win: 0, plain: 0, roof: 0, cyl: 0, cone: 0 };
    for (const b of w.buildings.values()) {
      const cb = this.cache.get(b.id) ?? this.makeCached(b);
      for (const k of MESHES) totals[k] += cb.parts[k]?.n ?? 0;
    }
    for (const k of MESHES) {
      const sc = this.scratchFor(totals[k]);
      let o = 0;
      for (const cb of this.cache.values()) {
        const e = cb.parts[k];
        if (!e) continue;
        sc.m.set(e.m, o * 16);
        sc.c.set(e.c, o * 3);
        o += e.n;
      }
      this.pools[k].setRaw(sc.m, sc.c, o);
    }
  }

  private makeCached(b: Building): CachedBuilding {
    const parts = buildingParts(b, this.world);
    const cb: CachedBuilding = { parts: {} };
    for (const k of MESHES) {
      const ps = parts.filter((p) => p.mesh === k);
      if (!ps.length) continue;
      const m = new Float32Array(ps.length * 16);
      const c = new Float32Array(ps.length * 3);
      ps.forEach((p, i) => {
        partMatrix(p, m, i * 16);
        partColor(p, c, i * 3);
      });
      cb.parts[k] = { m, c, n: ps.length };
    }
    this.cache.set(b.id, cb);
    return cb;
  }

  /** Candidate tree positions are computed once per city; updates only filter by tile use. */
  private buildTreeCache(): TreeCache {
    const w = this.world;
    const trunks: Part[] = [];
    const crowns: Part[] = [];
    const tiles: number[] = [];
    const pxs: number[] = [];
    const pzs: number[] = [];
    if (this.treeDensity > 0) {
      for (let y = 0; y < w.size; y++) {
        for (let x = 0; x < w.size; x++) {
          const forest = fbm(x / 22, y / 22, w.seed + 404, 3);
          const r0 = hash2(x, y, w.seed + 17);
          if (forest < 0.12 || r0 > this.treeDensity * Math.min(1, (forest - 0.12) * 4)) continue;
          const count = 1 + Math.floor(hash2(x, y, w.seed + 18) * 3);
          for (let k = 0; k < count; k++) {
            const px = (x + 0.15 + hash2(x * 3 + k, y, w.seed + 19) * 0.7) * TILE;
            const pz = (y + 0.15 + hash2(x, y * 3 + k, w.seed + 20) * 0.7) * TILE;
            const gh = w.heightAt(px, pz);
            const s = 2.2 + hash2(x + k, y + k, w.seed + 21) * 2.2;
            trunks.push({ mesh: 'cyl', x: px, y: gh - 0.3, z: pz, sx: 0.4, sy: 1.8, sz: 0.4, rotY: 0, color: 0x5e4129 });
            const shade = [0x2f6b2c, 0x3b7a33, 0x2a5e2a, 0x467f3a][Math.floor(hash2(x, y + k, w.seed + 22) * 4)];
            crowns.push({ mesh: 'cone', x: px, y: gh + 1.2, z: pz, sx: s, sy: s * 2, sz: s, rotY: hash2(x, y, k) * 6.28, color: shade });
            tiles.push(w.idx(x, y));
            pxs.push(px);
            pzs.push(pz);
          }
        }
      }
    }
    const n = tiles.length;
    const tc: TreeCache = {
      count: n,
      tile: Int32Array.from(tiles),
      px: Float32Array.from(pxs),
      pz: Float32Array.from(pzs),
      valid: new Uint8Array(n),
      trunkM: new Float32Array(n * 16),
      crownM: new Float32Array(n * 16),
      trunkC: new Float32Array(n * 3),
      crownC: new Float32Array(n * 3),
      out: { tm: new Float32Array(n * 16), cm: new Float32Array(n * 16), tc: new Float32Array(n * 3), cc: new Float32Array(n * 3) },
    };
    for (let i = 0; i < n; i++) {
      partMatrix(trunks[i], tc.trunkM, i * 16);
      partMatrix(crowns[i], tc.crownM, i * 16);
      partColor(trunks[i], tc.trunkC, i * 3);
      partColor(crowns[i], tc.crownC, i * 3);
      const gh = trunks[i].y + 0.3;
      tc.valid[i] = gh >= SEA_LEVEL + 1.5 && gh <= 50 ? 1 : 0;
    }
    return tc;
  }

  /** Decorative forest on undeveloped, unzoned land. Purely visual; removed when land is used. */
  updateTrees(): void {
    const w = this.world;
    const t = (this.trees ??= this.buildTreeCache());
    const { tm, cm, tc: tcol, cc: ccol } = t.out;
    let o = 0;
    for (let i = 0; i < t.count; i++) {
      const ti = t.tile[i];
      if (!t.valid[i] || w.kind[ti] !== KIND_EMPTY || w.zone[ti] !== ZONE_NONE) continue;
      for (let k = 0; k < 16; k++) {
        tm[o * 16 + k] = t.trunkM[i * 16 + k];
        cm[o * 16 + k] = t.crownM[i * 16 + k];
      }
      for (let k = 0; k < 3; k++) {
        tcol[o * 3 + k] = t.trunkC[i * 3 + k];
        ccol[o * 3 + k] = t.crownC[i * 3 + k];
      }
      o++;
    }
    this.treePools.trunk.setRaw(tm, tcol, o);
    this.treePools.crown.setRaw(cm, ccol, o);
  }

  /** Re-seat trees whose ground changed (corner rectangle from a terrain brush). */
  updateTreeHeights(x0: number, y0: number, x1: number, y1: number): void {
    const t = this.trees;
    if (!t) return;
    const w = this.world;
    const minX = x0 * TILE;
    const maxX = x1 * TILE;
    const minZ = y0 * TILE;
    const maxZ = y1 * TILE;
    for (let i = 0; i < t.count; i++) {
      const px = t.px[i];
      const pz = t.pz[i];
      if (px < minX || px > maxX || pz < minZ || pz > maxZ) continue;
      const gh = w.heightAt(px, pz);
      t.trunkM[i * 16 + 13] = gh - 0.3; // matrix translation y
      t.crownM[i * 16 + 13] = gh + 1.2;
      t.valid[i] = gh >= SEA_LEVEL + 1.5 && gh <= 50 ? 1 : 0;
    }
  }

  /** Number of decorative trees currently drawn (for the performance test). */
  treeCount(): number {
    return this.treePools.crown.mesh.count;
  }

  setTreesVisible(v: boolean): void {
    this.treePools.trunk.mesh.visible = v;
    this.treePools.crown.mesh.visible = v;
  }

  setTreeDensity(d: number): void {
    if (d === this.treeDensity) return;
    this.treeDensity = d;
    this.trees = null;
    this.updateTrees();
  }

  setShadows(on: boolean, treeShadows: boolean): void {
    for (const p of Object.values(this.pools)) p.setShadows(on);
    this.treePools.trunk.setShadows(on && treeShadows, false);
    this.treePools.crown.setShadows(on && treeShadows, on);
  }

  dispose(): void {
    for (const p of Object.values(this.pools)) p.dispose();
    this.treePools.trunk.dispose();
    this.treePools.crown.dispose();
    for (const g of Object.values(this.geoms)) g.dispose();
    this.treeTrunkGeom.dispose();
    this.treeCrownGeom.dispose();
    for (const m of this.materials) m.dispose();
  }
}
