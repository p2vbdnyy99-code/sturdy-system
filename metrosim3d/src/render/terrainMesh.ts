import * as THREE from 'three';
import { SEA_LEVEL, TILE } from '../sim/constants';
import { hash2 } from '../sim/rng';
import { World } from '../sim/world';

const SAND = new THREE.Color('#d9c89a');
const GRASS_A = new THREE.Color('#6f9a4a');
const GRASS_B = new THREE.Color('#58833c');
const ROCK = new THREE.Color('#8a8275');
const SNOW = new THREE.Color('#eef0f2');
const SEABED = new THREE.Color('#a69a72');

/** Terrain surface + edge skirts + water plane. Vertices are the shared tile corners. */
export class TerrainMesh {
  readonly group = new THREE.Group();
  private geom: THREE.BufferGeometry;
  private mesh: THREE.Mesh;
  private skirt: THREE.Mesh;
  private water: THREE.Mesh;

  constructor(private world: World) {
    const n = world.size + 1;
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    this.geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    const idx = new Uint32Array(world.size * world.size * 6);
    let k = 0;
    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        const nw = y * n + x;
        const ne = nw + 1;
        const sw = nw + n;
        const se = sw + 1;
        idx[k++] = nw; idx[k++] = sw; idx[k++] = ne;
        idx[k++] = ne; idx[k++] = sw; idx[k++] = se;
      }
    }
    this.geom.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(this.geom, mat);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    this.skirt = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#5b4a37', roughness: 1 }));
    this.group.add(this.skirt);

    const span = world.size * TILE;
    const wg = new THREE.PlaneGeometry(span, span);
    wg.rotateX(-Math.PI / 2);
    wg.translate(span / 2, SEA_LEVEL, span / 2);
    this.water = new THREE.Mesh(
      wg,
      new THREE.MeshStandardMaterial({ color: '#2f6f8f', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82 }),
    );
    this.water.receiveShadow = true;
    this.water.renderOrder = 2;
    this.group.add(this.water);
    this.update();
  }

  update(): void {
    const w = this.world;
    const n = w.size + 1;
    const pos = this.geom.getAttribute('position') as THREE.BufferAttribute;
    const col = this.geom.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const h = w.heights[i];
        pos.setXYZ(i, x * TILE, h, y * TILE);
        // Local slope from neighbouring corners.
        const hx = w.heights[y * n + Math.min(x + 1, n - 1)] - w.heights[y * n + Math.max(x - 1, 0)];
        const hy = w.heights[Math.min(y + 1, n - 1) * n + x] - w.heights[Math.max(y - 1, 0) * n + x];
        const slope = Math.hypot(hx, hy) / (2 * TILE);
        const r = hash2(x, y, w.seed);
        if (h < SEA_LEVEL - 0.5) c.copy(SEABED);
        else if (h < SEA_LEVEL + 1.2) c.copy(SAND);
        else {
          c.copy(GRASS_A).lerp(GRASS_B, r);
          if (h > 30) c.lerp(ROCK, Math.min(1, (h - 30) / 12));
          if (slope > 0.35) c.lerp(ROCK, Math.min(1, (slope - 0.35) * 3));
          if (h > 52) c.lerp(SNOW, Math.min(1, (h - 52) / 8));
        }
        col.setXYZ(i, c.r, c.g, c.b);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geom.computeVertexNormals();
    this.geom.computeBoundingSphere();
    this.buildSkirt();
  }

  private buildSkirt(): void {
    const w = this.world;
    const n = w.size;
    const bottom = -30;
    const verts: number[] = [];
    const edge = (pts: [number, number][]) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const ha = w.cornerH(ax, ay);
        const hb = w.cornerH(bx, by);
        verts.push(ax * TILE, ha, ay * TILE, bx * TILE, hb, by * TILE, ax * TILE, bottom, ay * TILE);
        verts.push(bx * TILE, hb, by * TILE, bx * TILE, bottom, by * TILE, ax * TILE, bottom, ay * TILE);
      }
    };
    const north: [number, number][] = [];
    const south: [number, number][] = [];
    const west: [number, number][] = [];
    const east: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      north.push([n - i, 0]);
      south.push([i, n]);
      west.push([0, i]);
      east.push([n, n - i]);
    }
    edge(north);
    edge(south);
    edge(west);
    edge(east);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    this.skirt.geometry.dispose();
    this.skirt.geometry = g;
    (this.skirt.material as THREE.Material).side = THREE.DoubleSide;
  }

  dispose(): void {
    this.geom.dispose();
    this.skirt.geometry.dispose();
    this.water.geometry.dispose();
    for (const m of [this.mesh, this.skirt, this.water]) (m.material as THREE.Material).dispose();
  }
}
