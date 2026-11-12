import * as THREE from 'three';
import type { Part } from './buildingParts';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Writes a part's transform into `out` at float offset `o` (16 floats). */
export function partMatrix(p: Part, out: Float32Array, o: number): void {
  tmpP.set(p.x, p.y, p.z);
  tmpQ.setFromAxisAngle(UP, p.rotY);
  tmpS.set(p.sx, p.sy, p.sz);
  tmpM.compose(tmpP, tmpQ, tmpS);
  tmpM.toArray(out, o);
}

/** Writes a part's linear-space colour into `out` at float offset `o` (3 floats). */
export function partColor(p: Part, out: Float32Array, o: number): void {
  tmpC.setHex(p.color);
  out[o] = tmpC.r;
  out[o + 1] = tmpC.g;
  out[o + 2] = tmpC.b;
}

/** An InstancedMesh that grows its capacity as needed. */
export class InstancedPool {
  mesh: THREE.InstancedMesh;
  private capacity: number;

  constructor(
    private parent: THREE.Object3D,
    private geometry: THREE.BufferGeometry,
    private material: THREE.Material,
    private cast: boolean,
    initial = 256,
    private receive = cast,
  ) {
    this.capacity = initial;
    this.mesh = this.create(initial);
  }

  private create(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geometry, this.material, cap);
    m.count = 0;
    m.castShadow = this.cast;
    m.receiveShadow = this.receive;
    m.frustumCulled = false; // instances span the whole map
    m.setColorAt(0, tmpC.set(0xffffff));
    this.parent.add(m);
    return m;
  }

  /** Grows capacity, keeping the first `keep` instances. */
  private ensure(count: number, keep = 0): void {
    if (count <= this.capacity) return;
    const old = this.mesh;
    this.parent.remove(old);
    while (this.capacity < count) this.capacity *= 2;
    this.mesh = this.create(this.capacity);
    if (keep > 0) {
      (this.mesh.instanceMatrix.array as Float32Array).set((old.instanceMatrix.array as Float32Array).subarray(0, keep * 16));
      (this.mesh.instanceColor!.array as Float32Array).set((old.instanceColor!.array as Float32Array).subarray(0, keep * 3));
    }
    old.dispose();
  }

  /** Appends instances after the current ones and uploads only that range. */
  appendRaw(matrices: Float32Array, colors: Float32Array, n: number): void {
    if (n === 0) return;
    const start = this.mesh.count;
    this.ensure(start + n, start);
    (this.mesh.instanceMatrix.array as Float32Array).set(matrices.subarray(0, n * 16), start * 16);
    (this.mesh.instanceColor!.array as Float32Array).set(colors.subarray(0, n * 3), start * 3);
    this.mesh.count = start + n;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(start * 16, n * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.clearUpdateRanges();
    this.mesh.instanceColor!.addUpdateRange(start * 3, n * 3);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  setParts(parts: Part[]): void {
    this.ensure(parts.length);
    const ma = this.mesh.instanceMatrix.array as Float32Array;
    const ca = this.mesh.instanceColor!.array as Float32Array;
    for (let i = 0; i < parts.length; i++) {
      partMatrix(parts[i], ma, i * 16);
      partColor(parts[i], ca, i * 3);
    }
    this.finish(parts.length);
  }

  /** Fast path: copy precomputed 4x4 matrices (16 floats each) and RGB colours (3 floats each). */
  setRaw(matrices: Float32Array, colors: Float32Array, count: number): void {
    this.ensure(count);
    (this.mesh.instanceMatrix.array as Float32Array).set(matrices.subarray(0, count * 16));
    (this.mesh.instanceColor!.array as Float32Array).set(colors.subarray(0, count * 3));
    this.finish(count);
  }

  private finish(count: number): void {
    this.mesh.count = count;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceColor!.clearUpdateRanges();
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  setShadows(cast: boolean, receive = cast): void {
    this.cast = cast;
    this.receive = receive;
    this.mesh.castShadow = cast;
    this.mesh.receiveShadow = receive;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
  }
}
