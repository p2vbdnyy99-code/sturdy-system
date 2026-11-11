import * as THREE from 'three';
import type { Part } from './buildingParts';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** An InstancedMesh that grows its capacity as needed. */
export class InstancedPool {
  mesh: THREE.InstancedMesh;
  private capacity: number;

  constructor(
    private parent: THREE.Object3D,
    private geometry: THREE.BufferGeometry,
    private material: THREE.Material,
    private shadows: boolean,
    initial = 256,
  ) {
    this.capacity = initial;
    this.mesh = this.create(initial);
  }

  private create(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geometry, this.material, cap);
    m.count = 0;
    m.castShadow = this.shadows;
    m.receiveShadow = this.shadows;
    m.frustumCulled = false; // instances span the whole map
    m.setColorAt(0, tmpC.set(0xffffff));
    this.parent.add(m);
    return m;
  }

  setParts(parts: Part[]): void {
    if (parts.length > this.capacity) {
      this.parent.remove(this.mesh);
      this.mesh.dispose();
      while (this.capacity < parts.length) this.capacity *= 2;
      this.mesh = this.create(this.capacity);
    }
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      tmpP.set(p.x, p.y, p.z);
      tmpQ.setFromAxisAngle(UP, p.rotY);
      tmpS.set(p.sx, p.sy, p.sz);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
      this.mesh.setColorAt(i, tmpC.setHex(p.color));
    }
    this.mesh.count = parts.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    this.mesh.castShadow = on;
    this.mesh.receiveShadow = on;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
  }
}
