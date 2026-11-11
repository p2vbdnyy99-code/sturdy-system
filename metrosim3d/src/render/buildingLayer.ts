import * as THREE from 'three';
import { KIND_EMPTY, SEA_LEVEL, TILE, ZONE_NONE } from '../sim/constants';
import { hash2 } from '../sim/rng';
import { fbm } from '../sim/terrain';
import { World } from '../sim/world';
import { buildingParts, Part, PartMesh } from './buildingParts';
import { InstancedPool } from './instancedPool';

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

/** All buildings and decorative trees, as a handful of instanced meshes. */
export class BuildingLayer {
  readonly group = new THREE.Group();
  private pools: Record<PartMesh, InstancedPool>;
  private treePools: { trunk: InstancedPool; crown: InstancedPool };
  private geoms = unitGeometries();
  private materials: THREE.Material[] = [];

  constructor(private world: World, shadows: boolean, private treeDensity: number) {
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
      trunk: new InstancedPool(this.group, g.cyl, plain, shadows, 1024),
      crown: new InstancedPool(this.group, g.cone, cone, shadows, 1024),
    };
  }

  updateBuildings(): void {
    const buckets: Record<PartMesh, Part[]> = { win: [], plain: [], roof: [], cyl: [], cone: [] };
    for (const b of this.world.buildings.values()) for (const p of buildingParts(b, this.world)) buckets[p.mesh].push(p);
    for (const k of Object.keys(buckets) as PartMesh[]) this.pools[k].setParts(buckets[k]);
  }

  /** Decorative forest on undeveloped, unzoned land. Purely visual; removed when land is used. */
  updateTrees(): void {
    const w = this.world;
    const trunks: Part[] = [];
    const crowns: Part[] = [];
    if (this.treeDensity > 0) {
      for (let y = 0; y < w.size; y++) {
        for (let x = 0; x < w.size; x++) {
          const i = w.idx(x, y);
          if (w.kind[i] !== KIND_EMPTY || w.zone[i] !== ZONE_NONE || w.isWater(x, y)) continue;
          const forest = fbm(x / 22, y / 22, w.seed + 404, 3);
          const r0 = hash2(x, y, w.seed + 17);
          if (forest < 0.12 || r0 > this.treeDensity * Math.min(1, (forest - 0.12) * 4)) continue;
          const count = 1 + Math.floor(hash2(x, y, w.seed + 18) * 3);
          for (let k = 0; k < count; k++) {
            const px = (x + 0.15 + hash2(x * 3 + k, y, w.seed + 19) * 0.7) * TILE;
            const pz = (y + 0.15 + hash2(x, y * 3 + k, w.seed + 20) * 0.7) * TILE;
            const gh = w.heightAt(px, pz);
            if (gh < SEA_LEVEL + 1.5 || gh > 50) continue;
            const s = 2.2 + hash2(x + k, y + k, w.seed + 21) * 2.2;
            trunks.push({ mesh: 'cyl', x: px, y: gh - 0.3, z: pz, sx: 0.4, sy: 1.8, sz: 0.4, rotY: 0, color: 0x5e4129 });
            const shade = [0x2f6b2c, 0x3b7a33, 0x2a5e2a, 0x467f3a][Math.floor(hash2(x, y + k, w.seed + 22) * 4)];
            crowns.push({ mesh: 'cone', x: px, y: gh + 1.2, z: pz, sx: s, sy: s * 2, sz: s, rotY: 0, color: shade });
          }
        }
      }
    }
    this.treePools.trunk.setParts(trunks);
    this.treePools.crown.setParts(crowns);
  }

  setTreeDensity(d: number): void {
    this.treeDensity = d;
    this.updateTrees();
  }

  setShadows(on: boolean): void {
    for (const p of Object.values(this.pools)) p.setShadows(on);
    this.treePools.trunk.setShadows(on);
    this.treePools.crown.setShadows(on);
  }

  dispose(): void {
    for (const p of Object.values(this.pools)) p.dispose();
    this.treePools.trunk.dispose();
    this.treePools.crown.dispose();
    for (const g of Object.values(this.geoms)) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
