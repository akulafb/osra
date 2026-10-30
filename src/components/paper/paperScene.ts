import * as THREE from 'three';
import type { FamilyLink } from '../../types/graph';
import type { PaperLayout, PaperLine, Point3 } from '../../lib/paperLayout';

export interface ScreenPoint {
  x: number;
  y: number;
}

/** The sphere the camera frames: it holds every shown disc whole. */
export interface PaperFrame {
  center: Point3;
  radius: number;
}

export const TAP_SLOP_PX = 6;

/** Lines draw before the discs and write no depth, so every disc covers the lines that cross it. */
export const PAPER_LINE_RENDER_ORDER = -2;

export interface PaperLineStyle {
  width: number;
  dashed?: boolean;
}

export const PAPER_LINE_STYLE: Record<FamilyLink['type'], PaperLineStyle> = {
  parent: { width: 1 },
  marriage: { width: 2.75 },
  divorce: { width: 1.5, dashed: true },
};

export const PAPER_DASH = { dashSize: 3, gapSize: 2.5 };

export function paperLineShown(type: FamilyLink['type'], toggles: { links: boolean; arrows: boolean }): boolean {
  return toggles.links || (type === 'parent' && toggles.arrows);
}

export const PAPER_HOVER_FRAME_PRIORITY = -1;
export const PAPER_SPREAD_FRAME_PRIORITY = PAPER_HOVER_FRAME_PRIORITY - 1;
export const PAPER_CAMERA_FRAME_PRIORITY = PAPER_SPREAD_FRAME_PRIORITY + 0.5;
export const PAPER_REVEAL_FRAME_PRIORITY = PAPER_HOVER_FRAME_PRIORITY + 0.5;
export const PAPER_SEARCH_FRAME_PRIORITY = PAPER_REVEAL_FRAME_PRIORITY + 0.25;

const EMPTY_FRAME_RADIUS = 50;

export function paperFrame(layout: PaperLayout, ids: Iterable<string>): PaperFrame {
  const discs = [...ids].flatMap((id) => {
    const disc = layout.get(id);
    return disc ? [disc] : [];
  });
  if (discs.length === 0) return { center: { x: 0, y: 0, z: 0 }, radius: EMPTY_FRAME_RADIUS };

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const d of discs) {
    min.x = Math.min(min.x, d.x);
    min.y = Math.min(min.y, d.y);
    min.z = Math.min(min.z, d.z);
    max.x = Math.max(max.x, d.x);
    max.y = Math.max(max.y, d.y);
    max.z = Math.max(max.z, d.z);
  }
  const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  let radius = 0;
  for (const d of discs) {
    radius = Math.max(radius, Math.hypot(d.x - center.x, d.y - center.y, d.z - center.z) + d.radius);
  }
  return { center, radius };
}

/** How much ink is left at `distance` from the camera: all of it up to `start`, floor from `end`. */
export function depthFade(distance: number, start: number, end: number, floor: number = 0): number {
  if (distance <= start) return 1;
  if (distance >= end) return floor;
  return floor + ((1 - floor) * (end - distance)) / (end - start);
}

const projected = new THREE.Vector3();

/** Where a scene point lands on a canvas of `size`, in CSS pixels from its top left: what Cosmos's `graph2ScreenCoords` gives. */
export function paperScreenPoint(point: Point3, camera: THREE.Camera, size: { width: number; height: number }): ScreenPoint {
  projected.set(point.x, point.y, point.z).project(camera);
  return { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height };
}

export function isTap(down: ScreenPoint | null, up: ScreenPoint): boolean {
  if (!down) return true;
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP_PX;
}

/** A tap on empty paper, which clears the selection; a tap on a Person or a camera drag does not. */
export function isBackgroundTap(down: ScreenPoint | null, up: ScreenPoint, onPerson: boolean): boolean {
  return !onPerson && isTap(down, up);
}

const LABEL_BASE_SIZE = 3;
const LABEL_SIZE_PER_RADIUS = 0.3;
const LABEL_MIN_RADIUS = 4;
const LABEL_MAX_RADIUS = 14;

/**
 * A label's size for a disc of this radius. `weight` runs from 0 (regular) to
 * 1 (bold): the one bundled font has a single weight, so the scene draws the
 * extra weight as an ink outline.
 */
export function paperLabelSize(discRadius: number): { fontSize: number; weight: number } {
  const r = Math.min(LABEL_MAX_RADIUS, Math.max(LABEL_MIN_RADIUS, discRadius));
  return {
    fontSize: LABEL_BASE_SIZE + LABEL_SIZE_PER_RADIUS * r,
    weight: (r - LABEL_MIN_RADIUS) / (LABEL_MAX_RADIUS - LABEL_MIN_RADIUS),
  };
}

const RING_SEGMENTS = 64;

/** A circle of radius 1 facing +z, closed, for a ring drawn as a fat line. */
export const PAPER_RING_POINTS: [number, number, number][] = Array.from({ length: RING_SEGMENTS + 1 }, (_, i) => {
  const a = (i / RING_SEGMENTS) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a), 0];
});

export const PAPER_CURVE_SEGMENTS = 8;
export const PAPER_CURVE_DEFLECTION_RATIO = 0.16;
export const PAPER_CURVE_MAX_DEFLECTION = 24;

/**
 * The quadratic bezier control point for a line between `from` and `to`.
 * It deflects perpendicularly from the chord midpoint, bowing outward from `centre`.
 */
export function paperLinkControlPoint<T extends Point3 = Point3>(
  from: Point3,
  to: Point3,
  centre: Point3 = { x: 0, y: 0, z: 0 },
  out?: T
): T {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const midZ = (from.z + to.z) / 2;
  if (dist < 1e-4) {
    if (out) {
      out.x = midX;
      out.y = midY;
      out.z = midZ;
      return out;
    }
    return { x: midX, y: midY, z: midZ } as T;
  }

  // Vector from centre to midpoint
  const rx = midX - centre.x;
  const ry = midY - centre.y;
  const rz = midZ - centre.z;

  // Project r onto chord d
  const dotRd = rx * dx + ry * dy + rz * dz;
  const chordSq = dist * dist;
  let px = rx - (dotRd / chordSq) * dx;
  let py = ry - (dotRd / chordSq) * dy;
  let pz = rz - (dotRd / chordSq) * dz;
  let pLen = Math.hypot(px, py, pz);

  // Fallback if midpoint lies directly on centre or collinear with chord:
  // use a canonical chord direction so swapping from/to gives the same normal.
  if (pLen < 1e-3) {
    const sign = (dx !== 0 ? dx : (dy !== 0 ? dy : dz)) >= 0 ? 1 : -1;
    const ndx = (dx / dist) * sign;
    const ndy = (dy / dist) * sign;
    const ndz = (dz / dist) * sign;
    if (Math.abs(ndy) < 0.9) {
      px = -ndz;
      py = 0;
      pz = ndx;
    } else {
      px = 0;
      py = ndz;
      pz = -ndy;
    }
    pLen = Math.hypot(px, py, pz);
  }

  const nx = px / pLen;
  const ny = py / pLen;
  const nz = pz / pLen;
  const deflection = Math.min(dist * PAPER_CURVE_DEFLECTION_RATIO, PAPER_CURVE_MAX_DEFLECTION);

  const cx = midX + nx * deflection;
  const cy = midY + ny * deflection;
  const cz = midZ + nz * deflection;

  if (out) {
    out.x = cx;
    out.y = cy;
    out.z = cz;
    return out;
  }
  return { x: cx, y: cy, z: cz } as T;
}

/** Evaluates a point on a quadratic Bezier curve at parameter t in [0, 1]. */
export function paperQuadraticPoint<T extends Point3 = Point3>(
  from: Point3,
  control: Point3,
  to: Point3,
  t: number,
  out?: T
): T {
  const inv = 1 - t;
  const c0 = inv * inv;
  const c1 = 2 * inv * t;
  const c2 = t * t;
  const x = c0 * from.x + c1 * control.x + c2 * to.x;
  const y = c0 * from.y + c1 * control.y + c2 * to.y;
  const z = c0 * from.z + c1 * control.z + c2 * to.z;
  if (out) {
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
  }
  return { x, y, z } as T;
}

/** The lines as consecutive start and end points of curved segments, for one draw call. */
export function paperLineSegments(
  lines: readonly PaperLine[],
  layout: PaperLayout,
  segmentsPerLine: number = PAPER_CURVE_SEGMENTS,
  centre?: Point3
): [number, number, number][] {
  const segments: [number, number, number][] = [];
  for (const line of lines) {
    const a = layout.get(line.sourceId);
    const b = layout.get(line.targetId);
    if (!a || !b) continue;
    if (segmentsPerLine <= 1) {
      segments.push([a.x, a.y, a.z], [b.x, b.y, b.z]);
      continue;
    }
    const ctrl = paperLinkControlPoint(a, b, centre);
    let prevX = a.x;
    let prevY = a.y;
    let prevZ = a.z;
    for (let s = 1; s <= segmentsPerLine; s++) {
      const t = s / segmentsPerLine;
      const pt = paperQuadraticPoint(a, ctrl, b, t);
      segments.push([prevX, prevY, prevZ], [pt.x, pt.y, pt.z]);
      prevX = pt.x;
      prevY = pt.y;
      prevZ = pt.z;
    }
  }
  return segments;
}

/** A fat line's colours, two per segment, written into the buffer it already has; true when they changed. */
export function setPaperColours(geometry: THREE.BufferGeometry, rgb: Float32Array): boolean {
  const start = geometry.attributes.instanceColorStart as THREE.InterleavedBufferAttribute | undefined;
  if (start && start.data.array.length === rgb.length) {
    const colours = start.data.array as Float32Array;
    if (colours.every((value, i) => value === rgb[i])) return false;
    colours.set(rgb);
    start.data.needsUpdate = true;
    return true;
  }
  const colours = new THREE.InstancedInterleavedBuffer(rgb.slice(), 6, 1);
  geometry.setAttribute('instanceColorStart', new THREE.InterleavedBufferAttribute(colours, 3, 0));
  geometry.setAttribute('instanceColorEnd', new THREE.InterleavedBufferAttribute(colours, 3, 3));
  return true;
}

/**
 * `computeLineDistances` allocates a new GPU buffer on every call, and three never frees the one it replaces.
 * Each segment's dashes start at its own start, where drei lays them end to end. True when the ends moved.
 */
export function setPaperSegment(
  geometry: THREE.BufferGeometry,
  index: number,
  from: Point3,
  to: Point3,
  dashStart: number = 0
): boolean {
  const start = geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
  const ends = start.data.array as Float32Array;
  const at = index * 6;
  const next = [from.x, from.y, from.z, to.x, to.y, to.z];
  const moved = !next.every((value, i) => ends[at + i] === Math.fround(value));
  if (moved) {
    ends.set(next, at);
    start.data.needsUpdate = true;
  }

  const distance = geometry.attributes.instanceDistanceStart as THREE.InterleavedBufferAttribute | undefined;
  if (distance) {
    const distances = distance.data.array as Float32Array;
    const length = Math.fround(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
    const startDist = Math.fround(dashStart);
    const endDist = Math.fround(dashStart + length);
    if (distances[index * 2] !== startDist || distances[index * 2 + 1] !== endDist) {
      distances[index * 2] = startDist;
      distances[index * 2 + 1] = endDist;
      distance.data.needsUpdate = true;
    }
  }
  return moved;
}
