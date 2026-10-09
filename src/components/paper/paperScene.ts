import * as THREE from 'three';
import type { FamilyLink } from '../../types/graph';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

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

/** How much ink is left at `distance` from the camera: all of it up to `start`, none from `end`. */
export function depthFade(distance: number, start: number, end: number): number {
  if (distance <= start) return 1;
  if (distance >= end) return 0;
  return (end - distance) / (end - start);
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

export type PaperLineSegments = Record<FamilyLink['type'], [number, number, number][]>;

/** Each kind of line as consecutive start and end points, for one draw call per kind. */
export function paperLineSegments(lines: readonly PaperLine[], layout: PaperLayout): PaperLineSegments {
  const segments: PaperLineSegments = { parent: [], marriage: [], divorce: [] };
  for (const line of lines) {
    const a = layout.get(line.sourceId);
    const b = layout.get(line.targetId);
    if (!a || !b) continue;
    segments[line.type].push([a.x, a.y, a.z], [b.x, b.y, b.z]);
  }
  return segments;
}

/** `computeLineDistances` allocates a new GPU buffer on every call, and three never frees the one it replaces. */
export function setPaperSegment(geometry: THREE.BufferGeometry, index: number, from: Point3, to: Point3): boolean {
  const start = geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
  const ends = start.data.array as Float32Array;
  const at = index * 6;
  const next = [from.x, from.y, from.z, to.x, to.y, to.z];
  if (next.every((value, i) => ends[at + i] === Math.fround(value))) return false;
  ends.set(next, at);
  start.data.needsUpdate = true;

  const distance = geometry.attributes.instanceDistanceStart as THREE.InterleavedBufferAttribute | undefined;
  if (distance) {
    const distances = distance.data.array as Float32Array;
    distances[index * 2] = 0;
    distances[index * 2 + 1] = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    distance.data.needsUpdate = true;
  }
  return true;
}
