import { Curve, curveBox, curveLength, P2 } from './geometry';
import type { RoadType } from './types';

export interface RoadNode {
  id: number;
  x: number;
  z: number;
}

export interface RoadSegment {
  id: number;
  /** Start and end node ids. Lanes are defined relative to a→b. */
  a: number;
  b: number;
  type: RoadType;
  /** Quadratic control point (midpoint for a straight road). */
  cx: number;
  cz: number;
}

/** Save format (v3+). */
export interface RoadNetworkData {
  nodes: [number, number, number][];
  segs: [number, number, number, RoadType, number, number][];
  nextNode: number;
  nextSeg: number;
}

const CELL = 64; // spatial index cell, metres
/** Render chunk size in metres (32 tiles). */
export const CHUNK = 256;

/**
 * The road graph: the source of truth for roads (traffic-ready: nodes connect segments, and
 * each segment's lanes follow from its type). Pure data; tiles are derived in raster.ts.
 */
export class RoadNetwork {
  nodes = new Map<number, RoadNode>();
  segs = new Map<number, RoadSegment>();
  private nodeSegs = new Map<number, Set<number>>();
  private grid = new Map<string, Set<number>>();
  private segCells = new Map<number, string[]>();
  nextNode = 1;
  nextSeg = 1;
  /** Render chunks ("cx,cz") whose roads changed since the renderer last looked. */
  dirtyChunks = new Set<string>();
  version = 0;

  curveOf(s: RoadSegment): Curve {
    const a = this.nodes.get(s.a)!;
    const b = this.nodes.get(s.b)!;
    return { a: { x: a.x, z: a.z }, c: { x: s.cx, z: s.cz }, b: { x: b.x, z: b.z } };
  }

  segsAt(nodeId: number): number[] {
    return [...(this.nodeSegs.get(nodeId) ?? [])];
  }

  degree(nodeId: number): number {
    return this.nodeSegs.get(nodeId)?.size ?? 0;
  }

  addNode(x: number, z: number): RoadNode {
    const n = { id: this.nextNode++, x, z };
    this.nodes.set(n.id, n);
    this.nodeSegs.set(n.id, new Set());
    this.markChunk(x, z);
    return n;
  }

  addSegment(a: number, b: number, type: RoadType, c?: P2): RoadSegment {
    const na = this.nodes.get(a)!;
    const nb = this.nodes.get(b)!;
    const s: RoadSegment = { id: this.nextSeg++, a, b, type, cx: c ? c.x : (na.x + nb.x) / 2, cz: c ? c.z : (na.z + nb.z) / 2 };
    this.segs.set(s.id, s);
    this.nodeSegs.get(a)!.add(s.id);
    this.nodeSegs.get(b)!.add(s.id);
    this.index(s);
    this.touchSeg(s);
    return s;
  }

  /** Removes a segment and any node left with no roads. */
  removeSegment(id: number): RoadSegment | undefined {
    const s = this.segs.get(id);
    if (!s) return;
    this.touchSeg(s);
    this.unindex(id);
    this.segs.delete(id);
    for (const n of [s.a, s.b]) {
      const set = this.nodeSegs.get(n);
      set?.delete(id);
      if (set && set.size === 0) {
        const node = this.nodes.get(n)!;
        this.markChunk(node.x, node.z);
        this.nodes.delete(n);
        this.nodeSegs.delete(n);
      }
    }
    return s;
  }

  setType(id: number, type: RoadType): void {
    const s = this.segs.get(id)!;
    s.type = type;
    this.touchSeg(s);
  }

  setControl(id: number, c: P2): void {
    const s = this.segs.get(id)!;
    this.touchSeg(s);
    this.unindex(id);
    s.cx = c.x;
    s.cz = c.z;
    this.index(s);
    this.touchSeg(s);
  }

  /** Moves a node; straight segments stay straight, curved ones keep their control point. */
  moveNode(id: number, x: number, z: number): void {
    const n = this.nodes.get(id)!;
    const segs = this.segsAt(id).map((sid) => this.segs.get(sid)!);
    const wasStraight = segs.map((s) => this.isStraight(s));
    for (const s of segs) {
      this.touchSeg(s);
      this.unindex(s.id);
    }
    this.markChunk(n.x, n.z);
    n.x = x;
    n.z = z;
    segs.forEach((s, i) => {
      if (wasStraight[i]) {
        const a = this.nodes.get(s.a)!;
        const b = this.nodes.get(s.b)!;
        s.cx = (a.x + b.x) / 2;
        s.cz = (a.z + b.z) / 2;
      }
      this.index(s);
      this.touchSeg(s);
    });
    this.markChunk(x, z);
  }

  /** Re-points one end of a segment to another node (joining roads). */
  replaceEndpoint(segId: number, from: number, to: number): void {
    const s = this.segs.get(segId)!;
    this.touchSeg(s);
    this.unindex(segId);
    if (s.a === from) s.a = to;
    if (s.b === from) s.b = to;
    this.nodeSegs.get(from)?.delete(segId);
    this.nodeSegs.get(to)!.add(segId);
    this.index(s);
    this.touchSeg(s);
  }

  removeNodeIfUnused(id: number): void {
    const set = this.nodeSegs.get(id);
    if (set && set.size === 0) {
      const n = this.nodes.get(id)!;
      this.markChunk(n.x, n.z);
      this.nodes.delete(id);
      this.nodeSegs.delete(id);
    }
  }

  isStraight(s: RoadSegment): boolean {
    const a = this.nodes.get(s.a)!;
    const b = this.nodes.get(s.b)!;
    return Math.hypot(s.cx - (a.x + b.x) / 2, s.cz - (a.z + b.z) / 2) < 0.05;
  }

  length(id: number): number {
    return curveLength(this.curveOf(this.segs.get(id)!));
  }

  /** Segment ids whose bounding box touches the rectangle (metres). */
  segsInBox(x0: number, z0: number, x1: number, z1: number): number[] {
    const out = new Set<number>();
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++)
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const set = this.grid.get(`${cx},${cz}`);
        if (set) for (const id of set) out.add(id);
      }
    return [...out];
  }

  nodeNear(p: P2, r: number): RoadNode | null {
    let best: RoadNode | null = null;
    let bd = r;
    for (const id of this.segsInBox(p.x - r, p.z - r, p.x + r, p.z + r)) {
      const s = this.segs.get(id)!;
      for (const nid of [s.a, s.b]) {
        const n = this.nodes.get(nid)!;
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d <= bd) {
          bd = d;
          best = n;
        }
      }
    }
    return best;
  }

  private cellsFor(s: RoadSegment): string[] {
    const b = curveBox(this.curveOf(s));
    const keys: string[] = [];
    for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz++)
      for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) keys.push(`${cx},${cz}`);
    return keys;
  }
  private index(s: RoadSegment): void {
    const keys = this.cellsFor(s);
    this.segCells.set(s.id, keys);
    for (const k of keys) {
      let set = this.grid.get(k);
      if (!set) this.grid.set(k, (set = new Set()));
      set.add(s.id);
    }
  }
  private unindex(id: number): void {
    for (const k of this.segCells.get(id) ?? []) this.grid.get(k)?.delete(id);
    this.segCells.delete(id);
  }

  markChunk(x: number, z: number): void {
    this.dirtyChunks.add(`${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`);
    this.version++;
  }
  /** A segment is drawn in the chunk of its midpoint; its end nodes in theirs. */
  touchSeg(s: RoadSegment): void {
    const a = this.nodes.get(s.a)!;
    const b = this.nodes.get(s.b)!;
    this.markChunk((a.x + 2 * s.cx + b.x) / 4, (a.z + 2 * s.cz + b.z) / 4);
    this.markChunk(a.x, a.z);
    this.markChunk(b.x, b.z);
    // Roads meeting at these ends may change their junction trim, so redraw their chunks too.
    for (const n of [s.a, s.b])
      for (const id of this.nodeSegs.get(n) ?? []) {
        const o = this.segs.get(id);
        if (o && o !== s) this.dirtyChunks.add(RoadNetwork.segChunk(this, o));
      }
  }

  /** Chunk key a segment is rendered in. */
  static segChunk(net: RoadNetwork, s: RoadSegment): string {
    const a = net.nodes.get(s.a)!;
    const b = net.nodes.get(s.b)!;
    return `${Math.floor((a.x + 2 * s.cx + b.x) / 4 / CHUNK)},${Math.floor((a.z + 2 * s.cz + b.z) / 4 / CHUNK)}`;
  }

  toData(): RoadNetworkData {
    return {
      nodes: [...this.nodes.values()].map((n) => [n.id, n.x, n.z]),
      segs: [...this.segs.values()].map((s) => [s.id, s.a, s.b, s.type, s.cx, s.cz]),
      nextNode: this.nextNode,
      nextSeg: this.nextSeg,
    };
  }

  static fromData(d: RoadNetworkData): RoadNetwork {
    const net = new RoadNetwork();
    for (const [id, x, z] of d.nodes) {
      net.nodes.set(id, { id, x, z });
      net.nodeSegs.set(id, new Set());
    }
    for (const [id, a, b, type, cx, cz] of d.segs) {
      if (!net.nodes.has(a) || !net.nodes.has(b)) throw new Error('Corrupt save: road segment references a missing node');
      const s: RoadSegment = { id, a, b, type, cx, cz };
      net.segs.set(id, s);
      net.nodeSegs.get(a)!.add(id);
      net.nodeSegs.get(b)!.add(id);
      net.index(s);
    }
    net.nextNode = d.nextNode;
    net.nextSeg = d.nextSeg;
    return net;
  }
}
