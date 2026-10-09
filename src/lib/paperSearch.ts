import type { FamilyLink } from '../types/graph';
import { getLinkEndpoints } from './familyGraph';
import { focusEmphasis, type Emphasis } from './focusEmphasis';
import type { PaperLayout } from './paperLayout';
import type { Point3 } from './paperHover';

/** The least space left between two discs in the search cluster: room for a name between them. */
export const PAPER_CLUSTER_GAP = 20;

const SETTLE_STEPS = 120;
const START_SHARE = 0.25;
const CENTRE_PULL = 0.08;
const LINK_PULL = 0.3;
const COLLISION_PASSES = 200;

/**
 * Where each match sits in the search cluster: a short, one-off settle on the
 * matches only, which draws them toward their centre, keeps linked matches
 * side by side and leaves PAPER_CLUSTER_GAP between every two discs. The same
 * matches always give the same cluster. The layout is not changed.
 */
export function packMatches(layout: PaperLayout, matchIds: ReadonlySet<string>, links: readonly FamilyLink[]): Map<string, Point3> {
  const ids = [...matchIds].filter((id) => layout.has(id)).sort();
  const radii = ids.map((id) => layout.get(id)!.radius);
  const centre = { x: 0, y: 0, z: 0 };
  for (const id of ids) {
    const { x, y, z } = layout.get(id)!;
    centre.x += x / ids.length;
    centre.y += y / ids.length;
    centre.z += z / ids.length;
  }
  const places = ids.map((id) => {
    const { x, y, z } = layout.get(id)!;
    return { x: centre.x + (x - centre.x) * START_SHARE, y: centre.y + (y - centre.y) * START_SHARE, z: centre.z + (z - centre.z) * START_SHARE };
  });
  const index = new Map(ids.map((id, i) => [id, i]));
  const pairs = matchedPairs(links, index);

  for (let step = 0; step < SETTLE_STEPS; step++) {
    const cooling = 1 - step / SETTLE_STEPS;
    for (const place of places) {
      place.x += (centre.x - place.x) * CENTRE_PULL * cooling;
      place.y += (centre.y - place.y) * CENTRE_PULL * cooling;
      place.z += (centre.z - place.z) * CENTRE_PULL * cooling;
    }
    for (const [i, j] of pairs) pull(places[i], places[j], radii[i] + radii[j] + PAPER_CLUSTER_GAP, LINK_PULL * cooling);
    separate(places, radii);
  }
  for (let pass = 0; pass < COLLISION_PASSES && separate(places, radii); pass++);

  return new Map(ids.map((id, i) => [id, places[i]]));
}

/** The layout with each match moved to its cluster place: a new map, the layout itself unchanged. */
export function paperSearchLayout(layout: PaperLayout, packed: ReadonlyMap<string, Point3>): PaperLayout {
  const placed = new Map(layout);
  for (const [id, { x, y, z }] of packed) {
    const disc = layout.get(id);
    if (disc) placed.set(id, { x, y, z, radius: disc.radius });
  }
  return placed;
}

export interface PaperSearchEmphasisInput {
  ids: readonly string[];
  links: readonly FamilyLink[];
  hoveredId: string | null;
  selectedId: string | null;
  matchIds: ReadonlySet<string> | null;
}

/** The focus emphasis while searching: non-matches are hidden, and only a match can be hovered or focused. */
export function paperSearchEmphasis({ ids, links, hoveredId, selectedId, matchIds }: PaperSearchEmphasisInput): Map<string, Emphasis> {
  const matched = (id: string | null) => (id && (!matchIds || matchIds.has(id)) ? id : null);
  return focusEmphasis({ personIds: ids, links, hoveredId: matched(hoveredId), focusedId: matched(selectedId), searchMatchIds: matchIds });
}

export function paperSearchCount(matches: number): string {
  return `${matches} ${matches === 1 ? 'PERSON' : 'PEOPLE'}`;
}

/** Any edit under way counts as a selection. */
export function paperEscape({ interactionIdle, searchQuery }: { interactionIdle: boolean; searchQuery: string }): 'interaction' | 'search' | null {
  if (!interactionIdle) return 'interaction';
  return searchQuery !== '' ? 'search' : null;
}

export function paperSearchOrder<T extends { id: string }>(matches: readonly T[], clusterIds: ReadonlySet<string>): T[] {
  return matches.filter((m) => clusterIds.has(m.id));
}

const CLUSTER_VIEW_MARGIN = 1.4;
const CLUSTER_VIEW_LEAST = 60;

/** How much of the scene the camera keeps in view around a cluster of this radius: the cluster with room for its names, and never so little that a lone match fills the screen. */
export function paperClusterView(radius: number): number {
  return Math.max(radius * CLUSTER_VIEW_MARGIN, CLUSTER_VIEW_LEAST);
}

export const PAPER_GATHER_SECONDS = 3;
export const PAPER_SHRINK_SECONDS = 0.8;

/**
 * The move into the search cluster or back out of it: each Person's offset from
 * their place in the scene's layout, and each Person's size, both as they were
 * at `since` on the scene clock. Offsets ease to none; sizes ease to their
 * targets. A size missing from a map means whole.
 */
export interface PaperSearchMotion {
  since: number;
  offsets: ReadonlyMap<string, Point3>;
  sizes: ReadonlyMap<string, number>;
  targetSizes: ReadonlyMap<string, number>;
}

export interface PaperSearchMotionFrame {
  offsets: ReadonlyMap<string, Point3>;
  sizes: ReadonlyMap<string, number>;
  done: boolean;
}

export const PAPER_SEARCH_STILL: PaperSearchMotion = { since: 0, offsets: new Map(), sizes: new Map(), targetSizes: new Map() };

/**
 * A new move, starting `now` from wherever `previous` has every Person drawn,
 * when the scene's layout changes from `from` to `to`. With matches, everyone
 * else shrinks away; without, everyone grows back.
 */
export function paperSearchMotionFrom(
  previous: PaperSearchMotion,
  from: PaperLayout,
  to: PaperLayout,
  matchIds: ReadonlySet<string> | null,
  now: number
): PaperSearchMotion {
  const drawn = paperSearchMotionAt(previous, now);
  const offsets = new Map<string, Point3>();
  for (const [id, next] of to) {
    const was = from.get(id);
    if (!was) continue;
    const lean = drawn.offsets.get(id);
    const offset = { x: was.x + (lean?.x ?? 0) - next.x, y: was.y + (lean?.y ?? 0) - next.y, z: was.z + (lean?.z ?? 0) - next.z };
    if (offset.x !== 0 || offset.y !== 0 || offset.z !== 0) offsets.set(id, offset);
  }
  const targetSizes = new Map<string, number>();
  if (matchIds) for (const id of to.keys()) if (!matchIds.has(id)) targetSizes.set(id, 0);
  return { since: now, offsets, sizes: drawn.sizes, targetSizes };
}

/** Where the move has every Person at `now`: it runs on the scene clock and ends within its time (ADR 0011). */
export function paperSearchMotionAt(motion: PaperSearchMotion, now: number): PaperSearchMotionFrame {
  const seconds = now - motion.since;
  const finite = Number.isFinite(seconds);
  const gather = finite ? easeInOut(seconds / PAPER_GATHER_SECONDS) : 1;
  const shrink = finite ? easeOut(seconds / PAPER_SHRINK_SECONDS) : 1;

  const offsets = new Map<string, Point3>();
  if (gather < 1) {
    for (const [id, { x, y, z }] of motion.offsets) {
      const left = 1 - gather;
      offsets.set(id, { x: x * left, y: y * left, z: z * left });
    }
  }
  const sizes = new Map<string, number>();
  for (const id of new Set([...motion.sizes.keys(), ...motion.targetSizes.keys()])) {
    const was = motion.sizes.get(id) ?? 1;
    const target = motion.targetSizes.get(id) ?? 1;
    const size = was + (target - was) * shrink;
    if (size !== 1 || target !== 1) sizes.set(id, size);
  }
  return { offsets, sizes, done: gather === 1 && shrink === 1 };
}

function easeInOut(t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOut(t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return 1 - (1 - t) ** 3;
}

function matchedPairs(links: readonly FamilyLink[], index: ReadonlyMap<string, number>): [number, number][] {
  const pairs = new Map<string, [number, number]>();
  for (const link of links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    const a = index.get(sourceId);
    const b = index.get(targetId);
    if (a === undefined || b === undefined || a === b) continue;
    const pair: [number, number] = a < b ? [a, b] : [b, a];
    pairs.set(`${pair[0]}:${pair[1]}`, pair);
  }
  return [...pairs.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

function pull(a: Point3, b: Point3, rest: number, strength: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= rest) return;
  const k = ((distance - rest) / distance) * strength * 0.5;
  a.x += dx * k;
  a.y += dy * k;
  a.z += dz * k;
  b.x -= dx * k;
  b.y -= dy * k;
  b.z -= dz * k;
}

/** One pass that pushes every two overlapping discs apart; true when it moved any. Only discs in neighbouring grid cells can overlap. */
function separate(places: Point3[], radii: readonly number[]): boolean {
  const cell = 2 * Math.max(...radii) + PAPER_CLUSTER_GAP;
  const grid = new Map<number, number[]>();
  const keyOf = (x: number, y: number, z: number) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  places.forEach((p, i) => {
    const key = keyOf(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  });
  let moved = false;
  for (let i = 0; i < places.length; i++) {
    const cx = Math.floor(places[i].x / cell);
    const cy = Math.floor(places[i].y / cell);
    const cz = Math.floor(places[i].z / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const j of grid.get(keyOf(cx + dx, cy + dy, cz + dz)) ?? []) if (j > i && push(places, radii, i, j)) moved = true;
  }
  return moved;
}

function push(places: Point3[], radii: readonly number[], i: number, j: number): boolean {
  const a = places[i];
  const b = places[j];
  const least = radii[i] + radii[j] + PAPER_CLUSTER_GAP;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dz = b.z - a.z;
  let distance = Math.hypot(dx, dy, dz);
  if (distance >= least) return false;
  if (distance === 0) {
    const angle = (i + j) * 2.399963;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    dz = 0;
    distance = 1;
  }
  const k = ((least - distance) / distance) * 0.5 * 1.001;
  a.x -= dx * k;
  a.y -= dy * k;
  a.z -= dz * k;
  b.x += dx * k;
  b.y += dy * k;
  b.z += dz * k;
  return true;
}
