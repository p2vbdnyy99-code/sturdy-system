import * as THREE from 'three';
import type { CameraState } from '../sim/serialize';

export const MIN_DIST = 25;
export const MAX_DIST = 1400;
export const MIN_PITCH = (18 * Math.PI) / 180;
export const MAX_PITCH = (88 * Math.PI) / 180;

/** Orbit-style city camera: a ground target, distance, yaw and pitch. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  state: CameraState;
  private groundHeight: (x: number, z: number) => number;
  private bounds: number;

  constructor(mapSpan: number, groundHeight: (x: number, z: number) => number) {
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 6000);
    this.bounds = mapSpan;
    this.groundHeight = groundHeight;
    this.state = { tx: mapSpan / 2, tz: mapSpan / 2, distance: Math.min(450, mapSpan * 0.55), yaw: Math.PI / 5, pitch: 0.85 };
    this.apply();
  }

  setBounds(mapSpan: number): void {
    this.bounds = mapSpan;
    this.apply();
  }

  setState(s: CameraState): void {
    this.state = { ...s };
    this.apply();
  }

  /** Ground-plane metres per screen pixel at the target, for pan gestures. */
  metresPerPixel(viewHeight: number): number {
    const fov = (this.camera.fov * Math.PI) / 180;
    return (2 * this.state.distance * Math.tan(fov / 2)) / Math.max(1, viewHeight);
  }

  pan(dxPx: number, dyPx: number, viewHeight: number): void {
    const k = this.metresPerPixel(viewHeight);
    const { yaw, pitch } = this.state;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const kv = k / Math.max(0.35, Math.sin(pitch));
    this.state.tx += -rx * dxPx * k + fx * dyPx * kv;
    this.state.tz += -rz * dxPx * k + fz * dyPx * kv;
    this.apply();
  }

  rotate(dYaw: number, dPitch: number): void {
    this.state.yaw += dYaw;
    this.state.pitch += dPitch;
    this.apply();
  }

  zoom(factor: number): void {
    this.state.distance *= factor;
    this.apply();
  }

  apply(): void {
    const s = this.state;
    s.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, s.pitch));
    s.distance = Math.min(MAX_DIST, Math.max(MIN_DIST, s.distance));
    s.tx = Math.min(this.bounds, Math.max(0, s.tx));
    s.tz = Math.min(this.bounds, Math.max(0, s.tz));
    s.yaw = ((s.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const ty = Math.max(0, this.groundHeight(s.tx, s.tz));
    const cp = Math.cos(s.pitch);
    const cx = s.tx + Math.sin(s.yaw) * cp * s.distance;
    let cy = ty + Math.sin(s.pitch) * s.distance;
    const cz = s.tz + Math.cos(s.yaw) * cp * s.distance;
    // Keep the camera above the terrain under it.
    const under = this.groundHeight(Math.min(this.bounds, Math.max(0, cx)), Math.min(this.bounds, Math.max(0, cz)));
    if (cy < under + 6) cy = under + 6;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(s.tx, ty, s.tz);
    this.camera.near = Math.max(0.5, s.distance / 200);
    this.camera.far = s.distance * 6 + 3000;
    this.camera.updateProjectionMatrix();
  }
}
