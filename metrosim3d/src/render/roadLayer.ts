import * as THREE from 'three';
import { KIND_ROAD, TILE } from '../sim/constants';
import { roadMask } from '../sim/tools';
import { World } from '../sim/world';

const CELL = 128;
// Atlas cells (canonical orientation): connection masks with N=1,E=2,S=4,W=8.
const CANON = [
  { mask: 0, cell: 0 }, // isolated
  { mask: 1, cell: 1 }, // dead end (N)
  { mask: 5, cell: 2 }, // straight N-S
  { mask: 3, cell: 3 }, // corner N-E
  { mask: 7, cell: 4 }, // T: N, E, S
  { mask: 15, cell: 5 }, // cross
];
const COLS = 3;
const ROWS = 2;

function rot(m: number): number {
  return ((m << 1) | (m >> 3)) & 15; // N->E->S->W (clockwise)
}

/** For each of the 16 masks: atlas cell and number of clockwise quarter turns. */
const LOOKUP: { cell: number; turns: number }[] = [];
for (let m = 0; m < 16; m++) {
  for (const c of CANON) {
    let r = c.mask;
    let found = -1;
    for (let t = 0; t < 4; t++) {
      if (r === m) {
        found = t;
        break;
      }
      r = rot(r);
    }
    if (found >= 0) {
      LOOKUP[m] = { cell: c.cell, turns: found };
      break;
    }
  }
}

function drawAtlas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CELL * COLS;
  cv.height = CELL * ROWS;
  const g = cv.getContext('2d')!;
  const S = CELL;
  const walk = 16; // sidewalk width in px
  for (const c of CANON) {
    const ox = (c.cell % COLS) * S;
    const oy = Math.floor(c.cell / COLS) * S;
    g.save();
    g.translate(ox, oy);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    // Sidewalk base, then asphalt.
    g.fillStyle = '#b9b5ac';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#3d4044';
    g.fillRect(walk, walk, S - 2 * walk, S - 2 * walk);
    const m = c.mask;
    if (m & 1) g.fillRect(walk, 0, S - 2 * walk, walk);
    if (m & 2) g.fillRect(S - walk, walk, walk, S - 2 * walk);
    if (m & 4) g.fillRect(walk, S - walk, S - 2 * walk, walk);
    if (m & 8) g.fillRect(0, walk, walk, S - 2 * walk);
    // Kerb lines.
    g.fillStyle = '#d8d4cb';
    // Centre lines toward each connection.
    g.strokeStyle = '#e8c547';
    g.lineWidth = 3;
    g.setLineDash([12, 10]);
    const cx = S / 2;
    const conns = [1, 2, 4, 8].filter((b) => m & b).length;
    if (conns <= 2) {
      for (const [bit, x, y] of [[1, cx, 0], [2, S, cx], [4, cx, S], [8, 0, cx]] as const) {
        if (!(m & bit)) continue;
        g.beginPath();
        g.moveTo(cx, cx);
        g.lineTo(x, y);
        g.stroke();
      }
    } else {
      // Intersection: stop lines instead of centre lines.
      g.setLineDash([]);
      g.strokeStyle = '#e9e9e4';
      g.lineWidth = 4;
      const a = walk + 4;
      const b = S - walk - 4;
      if (m & 1) { g.beginPath(); g.moveTo(walk, a); g.lineTo(b, a); g.stroke(); }
      if (m & 4) { g.beginPath(); g.moveTo(a, b); g.lineTo(S - walk, b); g.stroke(); }
      if (m & 2) { g.beginPath(); g.moveTo(b, walk); g.lineTo(b, b); g.stroke(); }
      if (m & 8) { g.beginPath(); g.moveTo(a, a); g.lineTo(a, S - walk); g.stroke(); }
    }
    g.restore();
  }
  return cv;
}

/** Road surface: one textured quad per road tile, oriented by its neighbour connections. */
export class RoadLayer {
  readonly mesh: THREE.Mesh;
  private texture: THREE.CanvasTexture;

  constructor(private world: World, anisotropy: number) {
    this.texture = new THREE.CanvasTexture(drawAtlas());
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = anisotropy;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.update();
  }

  update(): void {
    const w = this.world;
    const tiles: { x: number; y: number }[] = [];
    for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) if (w.getKind(x, y) === KIND_ROAD) tiles.push({ x, y });
    const n = tiles.length;
    const pos = new Float32Array(n * 12);
    const uv = new Float32Array(n * 8);
    const idx = new Uint32Array(n * 6);
    const lift = 0.12;
    const pad = 2 / (CELL * COLS); // inset to avoid atlas bleeding
    const padY = 2 / (CELL * ROWS);
    for (let i = 0; i < n; i++) {
      const t = tiles[i];
      const [nw, ne, se, sw] = w.tileCorners(t.x, t.y);
      const x0 = t.x * TILE;
      const x1 = x0 + TILE;
      const z0 = t.y * TILE;
      const z1 = z0 + TILE;
      pos.set([x0, nw + lift, z0, x1, ne + lift, z0, x1, se + lift, z1, x0, sw + lift, z1], i * 12);
      const { cell, turns } = LOOKUP[roadMask(w, t.x, t.y)];
      const cu = (cell % COLS) / COLS;
      const cv = Math.floor(cell / COLS) / ROWS;
      // Local corner coords (u right/east, v down/south), rotated back into canonical space.
      const local: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let k = 0; k < 4; k++) {
        let [u, v] = local[k];
        for (let r = 0; r < turns; r++) [u, v] = [v, 1 - u]; // inverse of a clockwise quarter turn
        uv[i * 8 + k * 2] = cu + pad + u * (1 / COLS - 2 * pad);
        uv[i * 8 + k * 2 + 1] = cv + padY + v * (1 / ROWS - 2 * padY);
      }
      const v0 = i * 4;
      idx.set([v0, v0 + 3, v0 + 1, v0 + 1, v0 + 3, v0 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
