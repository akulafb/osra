import type { PaperDisc, PaperLayout, Point3 } from './paperLayout';

/**
 * How far Paper 3D spreads its Persons out from the tree's centre (GLOSSARY:
 * Spread): 1 is the still layout. Disc and label sizes never change with it.
 */
export type Spread = number & { readonly __spread: unique symbol };

export const SPREAD_MIN = 1 as Spread;
export const SPREAD_MAX = 3 as Spread;

/** Any number as a Spread: clamped to the slider's range, and 1x when it is not a number. */
export function toSpread(value: number): Spread {
  if (Number.isNaN(value)) return SPREAD_MIN;
  return Math.min(SPREAD_MAX, Math.max(SPREAD_MIN, value)) as Spread;
}

/** Where a point is drawn at `spread`: moved out from `centre` along its own direction, written into `out`. */
export function spreadInto<P extends Point3>(centre: Point3, point: Point3, spread: Spread, out: P): P {
  if (spread === 1) {
    out.x = point.x;
    out.y = point.y;
    out.z = point.z;
    return out;
  }
  out.x = centre.x + (point.x - centre.x) * spread;
  out.y = centre.y + (point.y - centre.y) * spread;
  out.z = centre.z + (point.z - centre.z) * spread;
  return out;
}

export function spreadPoint(centre: Point3, point: Point3, spread: Spread): Point3 {
  return spreadInto(centre, point, spread, { x: 0, y: 0, z: 0 });
}

/** The Spread the scene draws with, and the one centre it spreads from: the tree's, computed once per load. */
export interface PaperSpread {
  centre: Point3;
  factor: Spread;
}

/**
 * The centre every Person spreads out from: the middle of the full layout made
 * at load. Newcomers placed since leave it where it is, so a newcomer moves
 * nobody else at any Spread (ADR 0014).
 */
export function spreadCentre(layout: PaperLayout, newcomers: ReadonlySet<string>): Point3 {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const [id, disc] of layout) {
    if (newcomers.has(id)) continue;
    min.x = Math.min(min.x, disc.x);
    min.y = Math.min(min.y, disc.y);
    min.z = Math.min(min.z, disc.z);
    max.x = Math.max(max.x, disc.x);
    max.y = Math.max(max.y, disc.y);
    max.z = Math.max(max.z, disc.z);
  }
  if (min.x === Infinity) return { x: 0, y: 0, z: 0 };
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
}

/** How far a Person at `point` in the layout moves when the Spread goes from `from` to `to`: the camera moves the same to keep them put on screen. */
export function spreadFollow(point: Point3, from: PaperSpread, to: PaperSpread): Point3 {
  const before = spreadPoint(from.centre, point, from.factor);
  const after = spreadPoint(to.centre, point, to.factor);
  return { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
}

/**
 * A sphere around some Persons, at `spread`: its centre moves out with them and
 * its radius grows by the Spread, which still holds every disc whole since the
 * discs keep their size.
 */
export function spreadFrame(frame: { center: Point3; radius: number }, spread: PaperSpread): { center: Point3; radius: number } {
  if (spread.factor === 1) return frame;
  return { center: spreadPoint(spread.centre, frame.center, spread.factor), radius: frame.radius * spread.factor };
}

/**
 * Offsets measured in the layout (a search match on its way to the cluster,
 * a Person pulled in by the intro reveal), at `spread`. A lean or a wobble is
 * sized by the discs instead, and is added as it is.
 */
export function spreadOffsets(offsets: ReadonlyMap<string, Point3>, spread: Spread): ReadonlyMap<string, Point3> {
  if (spread === 1 || offsets.size === 0) return offsets;
  const spreadOut = new Map<string, Point3>();
  for (const [id, o] of offsets) spreadOut.set(id, { x: o.x * spread, y: o.y * spread, z: o.z * spread });
  return spreadOut;
}

/** The layout as drawn at `spread`, for a reader that works from a whole layout once, such as a focus flight. */
export function spreadLayout(layout: PaperLayout, spread: PaperSpread): PaperLayout {
  if (spread.factor === 1) return layout;
  const spreadOut = new Map<string, PaperDisc>();
  for (const [id, disc] of layout) spreadOut.set(id, spreadInto(spread.centre, disc, spread.factor, { ...disc }));
  return spreadOut;
}
