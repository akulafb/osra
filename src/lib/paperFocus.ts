import type { Emphasis } from './focusEmphasis';
import type { PaperLayout } from './paperLayout';
import type { Point3 } from './paperHover';

export const PAPER_FLY_SECONDS = 1;

const FOCUS_DISTANCE_PER_RADIUS = 10;
const MIN_FOCUS_DISTANCE = 60;

export interface PaperFlyInput {
  person: Point3;
  radius: number;
  /** Where the camera is now and what it looks at. */
  from: { position: Point3; target: Point3 };
  viewport: { width: number; height: number };
  /** The part of the screen the person drawer will cover. */
  inset: { rightPx: number; bottomPx: number };
  fovDegrees: number;
}

/**
 * Where the camera flies to frame a focused Person: from the side it already
 * looks from, close enough to read them, with the Person in the middle of the
 * space the drawer leaves free. A portrait phone stands further back, so the
 * relatives still fit the narrow space above the bottom sheet.
 */
export function paperFlyTo({ person, radius, from, viewport, inset, fovDegrees }: PaperFlyInput): { position: Point3; target: Point3 } {
  const back = normalize(sub(from.position, from.target)) ?? { x: 0, y: 0, z: 1 };
  const freeWidth = Math.max(1, viewport.width - inset.rightPx);
  const freeHeight = Math.max(1, viewport.height - inset.bottomPx);
  const distance =
    Math.max(MIN_FOCUS_DISTANCE, radius * FOCUS_DISTANCE_PER_RADIUS) * (viewport.height / Math.min(freeWidth, freeHeight));
  const worldPerPx = (2 * distance * Math.tan((fovDegrees * Math.PI) / 360)) / viewport.height;

  const forward = scale(back, -1);
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 })) ?? { x: 1, y: 0, z: 0 };
  const up = cross(right, forward);
  const target = add(add(person, scale(right, (inset.rightPx / 2) * worldPerPx)), scale(up, -(inset.bottomPx / 2) * worldPerPx));
  return { position: add(target, scale(back, distance)), target };
}

const FALLBACK_FLY_SECONDS = PAPER_FLY_SECONDS;

/** The camera's smoothing time for a flight of about `seconds`; a duration that is not a finite positive number flies in the usual time (ADR 0011). */
export function paperFlySmoothTime(seconds: number): number {
  const flight = Number.isFinite(seconds) && seconds > 0 ? seconds : FALLBACK_FLY_SECONDS;
  return flight / 3;
}

export const PAPER_RIPPLE_SECONDS = 0.9;

/** How far the focus ripple has run, eased from 0 to 1; null before it starts and once it is over. */
export function paperRippleProgress(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= PAPER_RIPPLE_SECONDS) return null;
  return 1 - (1 - seconds / PAPER_RIPPLE_SECONDS) ** 3;
}

const PULSE_LENGTH = 0.3;

/** The stretch of a line the ripple covers, as shares of the way from the focused Person to the other end. */
export function paperRipplePulse(progress: number): { tail: number; head: number } {
  const front = progress * (1 + PULSE_LENGTH);
  return { tail: Math.max(0, front - PULSE_LENGTH), head: Math.min(1, front) };
}

const WOBBLE_MAX = 1.5;
const WOBBLE_PER_RADIUS = 0.25;
const WOBBLE_RAMP_SECONDS = 0.6;

/**
 * The gentle float of the focused Person's relatives, `seconds` after the
 * focus began: a small offset on top of each relative's layout place.
 */
export function paperWobble(layout: PaperLayout, emphasis: ReadonlyMap<string, Emphasis>, seconds: number): Map<string, Point3> {
  const wobble = new Map<string, Point3>();
  const ramp = Math.min(1, Math.max(0, seconds / WOBBLE_RAMP_SECONDS));
  const strength = ramp * ramp * (3 - 2 * ramp);
  if (strength === 0 || ![...emphasis.values()].includes('focused')) return wobble;
  for (const [id, state] of emphasis) {
    const disc = layout.get(id);
    if (state !== 'relative' || !disc) continue;
    const amplitude = Math.min(WOBBLE_MAX, disc.radius * WOBBLE_PER_RADIUS) * strength;
    const phase = phaseOf(id);
    wobble.set(id, {
      x: amplitude * Math.sin(1.9 * seconds + phase),
      y: amplitude * Math.cos(1.5 * seconds + phase * 1.3),
      z: amplitude * 0.6 * Math.sin(1.2 * seconds + phase * 0.7),
    });
  }
  return wobble;
}

function phaseOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash >>> 0) % 6283) / 1000;
}

function add(a: Point3, b: Point3): Point3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: Point3, k: number): Point3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

function cross(a: Point3, b: Point3): Point3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(a: Point3): Point3 | null {
  const length = Math.hypot(a.x, a.y, a.z);
  return length > 1e-9 ? scale(a, 1 / length) : null;
}
