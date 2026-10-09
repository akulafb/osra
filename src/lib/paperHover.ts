import type { Emphasis } from './focusEmphasis';
import { PAPER_DISC_GAP, type PaperLayout, type PaperLine, type Point3 } from './paperLayout';

export interface ScreenDisc {
  id: string;
  x: number;
  y: number;
  radius: number;
}

/** The Person under the pointer: of the discs that cover it, the one whose centre is nearest. */
export function nearestDiscAt(pointer: { x: number; y: number }, discs: readonly ScreenDisc[]): string | null {
  let nearest: string | null = null;
  let nearestDistance = Infinity;
  for (const disc of discs) {
    const distance = Math.hypot(pointer.x - disc.x, pointer.y - disc.y);
    if (distance <= disc.radius && distance < nearestDistance) {
      nearest = disc.id;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** A disc's radius in pixels, at `depth` in front of a perspective camera with this vertical field of view. */
export function paperScreenRadius(worldRadius: number, depth: number, fovDegrees: number, viewportHeightPx: number): number {
  if (depth <= 0) return 0;
  const halfHeight = depth * Math.tan((fovDegrees * Math.PI) / 360);
  return (worldRadius / halfHeight) * (viewportHeightPx / 2);
}

const DRIFT_SHARE = 0.15;
const DRIFT_MAX = 6;

/** The Person the emphasis is about when it comes from a hover; none when a Person is focused or nobody is hovered. */
export function hoveredPerson(emphasis: ReadonlyMap<string, Emphasis>): string | null {
  for (const [id, state] of emphasis) if (state === 'hovered') return id;
  return null;
}

/** The Person the emphasis is about: the focused one, or else the hovered one. */
export function emphasisSubject(emphasis: ReadonlyMap<string, Emphasis>): string | null {
  let hovered: string | null = null;
  for (const [id, state] of emphasis) {
    if (state === 'focused') return id;
    if (state === 'hovered') hovered = id;
  }
  return hovered;
}

/**
 * How far each relative of the hovered Person leans toward them: a small share
 * of the distance between them, capped, and never into the gap discs keep. A
 * render offset on top of the layout.
 */
export function paperDrift(layout: PaperLayout, emphasis: ReadonlyMap<string, Emphasis>): Map<string, Point3> {
  const drift = new Map<string, Point3>();
  const hoveredId = hoveredPerson(emphasis);
  const hovered = hoveredId ? layout.get(hoveredId) : undefined;
  if (!hovered) return drift;
  for (const [id, state] of emphasis) {
    const relative = layout.get(id);
    if (state !== 'relative' || !relative) continue;
    const dx = hovered.x - relative.x;
    const dy = hovered.y - relative.y;
    const dz = hovered.z - relative.z;
    const distance = Math.hypot(dx, dy, dz);
    const room = distance - hovered.radius - relative.radius - PAPER_DISC_GAP;
    const shift = Math.min(distance * DRIFT_SHARE, DRIFT_MAX, Math.max(0, room));
    if (shift <= 0) continue;
    const k = shift / distance;
    drift.set(id, { x: dx * k, y: dy * k, z: dz * k });
  }
  return drift;
}

const DRIFT_EASE_SECONDS = 0.12;
const DRIFT_SETTLED = 0.01;

const ORIGIN: Point3 = { x: 0, y: 0, z: 0 };

/** One frame of the lean: each offset eases toward its target, and back to none once it has no target. */
export function easeDrift(
  current: ReadonlyMap<string, Point3>,
  target: ReadonlyMap<string, Point3>,
  dtSeconds: number
): ReadonlyMap<string, Point3> {
  if (arrived(current, target)) return current;
  const k = 1 - Math.exp(-dtSeconds / DRIFT_EASE_SECONDS);
  const next = new Map<string, Point3>();
  for (const id of new Set([...current.keys(), ...target.keys()])) {
    const from = current.get(id) ?? ORIGIN;
    const to = target.get(id) ?? ORIGIN;
    const step = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
    const settled = Math.hypot(to.x - step.x, to.y - step.y, to.z - step.z) < DRIFT_SETTLED;
    if (settled && !target.has(id)) continue;
    next.set(id, settled ? { ...to } : step);
  }
  return next;
}

export function addOffsets(drift: ReadonlyMap<string, Point3>, offsets: ReadonlyMap<string, Point3>): ReadonlyMap<string, Point3> {
  if (offsets.size === 0) return drift;
  const moved = new Map(drift);
  for (const [id, o] of offsets) {
    const d = moved.get(id);
    moved.set(id, d ? { x: d.x + o.x, y: d.y + o.y, z: d.z + o.z } : o);
  }
  return moved;
}

export function linesOf<L extends PaperLine>(lines: readonly L[], personId: string | null): L[] {
  if (!personId) return [];
  return lines.filter((line) => line.sourceId === personId || line.targetId === personId);
}

function arrived(current: ReadonlyMap<string, Point3>, target: ReadonlyMap<string, Point3>): boolean {
  if (current.size !== target.size) return false;
  for (const [id, to] of target) {
    const at = current.get(id);
    if (!at || at.x !== to.x || at.y !== to.y || at.z !== to.z) return false;
  }
  return true;
}
