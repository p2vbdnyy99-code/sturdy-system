import type { CameraRig } from '../render/cameraRig';

export interface ToolHandler {
  /** True when one-finger / left-button drags should go to the active tool (not panning). */
  toolActive(): boolean;
  toolDown(clientX: number, clientY: number): void;
  toolMove(clientX: number, clientY: number): void;
  toolUp(clientX: number, clientY: number): void;
  toolCancel(): void;
  hover(clientX: number, clientY: number): void;
  cameraChanged(): void;
}

type Mode = 'none' | 'tool' | 'pan' | 'rotate' | 'gesture' | 'wait';

interface Ptr {
  x: number;
  y: number;
  type: string;
}

/**
 * Unified mouse / touch / pen input.
 * Touch: 1 finger = active tool (or pan with the Pan tool), 2 fingers = pan + pinch zoom + twist rotate.
 * Mouse: left = tool (or pan), right drag = rotate/tilt, middle drag = pan, wheel = zoom.
 * Keyboard: WASD/arrows pan, Q/E rotate, R/F tilt, +/- zoom.
 */
export class InputController {
  private ptrs = new Map<number, Ptr>();
  private mode: Mode = 'none';
  private toolPointer = -1;
  private gesture = { dist: 0, angle: 0, mx: 0, my: 0 };
  private keys = new Set<string>();
  private disposers: (() => void)[] = [];

  constructor(private el: HTMLElement, private rig: CameraRig, private handler: ToolHandler) {
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(el, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(el, 'pointermove', (e: PointerEvent) => this.move(e));
    on(el, 'pointerup', (e: PointerEvent) => this.up(e, false));
    on(el, 'pointercancel', (e: PointerEvent) => this.up(e, true));
    on(el, 'pointerleave', (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && this.ptrs.size === 0) this.handler.hover(NaN, NaN);
    });
    on(el, 'wheel', (e: WheelEvent) => this.wheel(e), { passive: false });
    on(el, 'contextmenu', (e: Event) => e.preventDefault());
    // Safari's own pinch-zoom of the page.
    on(document, 'gesturestart', (e: Event) => e.preventDefault());
    on(document, 'gesturechange', (e: Event) => e.preventDefault());
    on(window, 'keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => this.keys.clear());
  }

  private viewH(): number {
    return this.el.clientHeight || 1;
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (this.ptrs.size === 1) {
      if (e.pointerType === 'mouse') {
        if (e.button === 2) this.mode = 'rotate';
        else if (e.button === 1 || !this.handler.toolActive() || e.shiftKey) this.mode = 'pan';
        else this.startTool(e);
      } else if (this.handler.toolActive()) this.startTool(e);
      else this.mode = 'pan';
    } else if (this.ptrs.size === 2 && e.pointerType !== 'mouse') {
      if (this.mode === 'tool') this.handler.toolCancel();
      this.mode = 'gesture';
      this.toolPointer = -1;
      this.resetGesture();
    }
  }

  private startTool(e: PointerEvent): void {
    this.mode = 'tool';
    this.toolPointer = e.pointerId;
    this.handler.toolDown(e.clientX, e.clientY);
  }

  private resetGesture(): void {
    const [a, b] = [...this.ptrs.values()];
    this.gesture = {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  private move(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.handler.hover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    switch (this.mode) {
      case 'tool':
        if (e.pointerId === this.toolPointer) this.handler.toolMove(e.clientX, e.clientY);
        break;
      case 'pan':
        this.rig.pan(dx, dy, this.viewH());
        this.handler.cameraChanged();
        break;
      case 'rotate':
        this.rig.rotate(-dx * 0.006, dy * 0.004);
        this.handler.cameraChanged();
        break;
      case 'gesture': {
        if (this.ptrs.size < 2) break;
        const [a, b] = [...this.ptrs.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const g = this.gesture;
        if (dist > 10 && g.dist > 10) this.rig.zoom(g.dist / dist);
        let da = angle - g.angle;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.rig.rotate(da, 0);
        this.rig.pan(mx - g.mx, my - g.my, this.viewH());
        this.gesture = { dist, angle, mx, my };
        this.handler.cameraChanged();
        break;
      }
      default:
        break;
    }
  }

  private up(e: PointerEvent, cancelled: boolean): void {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId);
    if (this.mode === 'tool' && e.pointerId === this.toolPointer) {
      if (cancelled) this.handler.toolCancel();
      else this.handler.toolUp(e.clientX, e.clientY);
      this.toolPointer = -1;
      this.mode = this.ptrs.size ? 'wait' : 'none';
    } else if (this.mode === 'gesture') {
      // Ignore the remaining finger until it lifts, so ending a pinch never draws a road.
      this.mode = this.ptrs.size >= 2 ? 'gesture' : this.ptrs.size === 1 ? 'wait' : 'none';
      if (this.mode === 'gesture') this.resetGesture();
    } else if (this.ptrs.size === 0) this.mode = 'none';
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel.
    const k = e.ctrlKey ? 0.01 : 0.0012;
    this.rig.zoom(Math.exp(e.deltaY * k));
    this.handler.cameraChanged();
  }

  /** Apply held keys; call once per frame with elapsed seconds. */
  tick(dt: number): void {
    if (!this.keys.size) return;
    const k = this.keys;
    const pan = 600 * dt;
    let moved = false;
    const has = (...names: string[]) => names.some((n) => k.has(n));
    if (has('w', 'arrowup')) { this.rig.pan(0, pan, this.viewH()); moved = true; }
    if (has('s', 'arrowdown')) { this.rig.pan(0, -pan, this.viewH()); moved = true; }
    if (has('a', 'arrowleft')) { this.rig.pan(pan, 0, this.viewH()); moved = true; }
    if (has('d', 'arrowright')) { this.rig.pan(-pan, 0, this.viewH()); moved = true; }
    if (has('q')) { this.rig.rotate(1.6 * dt, 0); moved = true; }
    if (has('e')) { this.rig.rotate(-1.6 * dt, 0); moved = true; }
    if (has('r')) { this.rig.rotate(0, 0.9 * dt); moved = true; }
    if (has('f')) { this.rig.rotate(0, -0.9 * dt); moved = true; }
    if (has('=', '+')) { this.rig.zoom(Math.exp(-1.5 * dt)); moved = true; }
    if (has('-', '_')) { this.rig.zoom(Math.exp(1.5 * dt)); moved = true; }
    if (moved) this.handler.cameraChanged();
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }
}
