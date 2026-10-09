import type { FamilyLink } from '../types/graph';
import { getLinkEndpoints } from './familyGraph';
import { focusEmphasis, type Emphasis } from './focusEmphasis';
import { easeInOutCubic, easeOutCubic } from './paperEasing';
import { PaperGrid, type PaperLayout, type Point3 } from './paperLayout';

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
 *
 * Given the places an earlier pack gave, every match already placed keeps its
 * place, a removed match drops out, and only the new matches settle, beside
 * the cluster.
 */
export function packMatches(
  layout: PaperLayout,
  matchIds: ReadonlySet<string>,
  links: readonly FamilyLink[],
  placed?: ReadonlyMap<string, Point3>
): Map<string, Point3> {
  const ids = [...matchIds].filter((id) => layout.has(id)).sort();
  const radii = ids.map((id) => layout.get(id)!.radius);
  const kept = ids.flatMap((id) => (placed?.has(id) ? [placed.get(id)!] : []));
  const fixed = ids.map((id) => !!placed?.has(id));
  const centre = centreOf(kept.length ? kept : ids.map((id) => layout.get(id)!));
  const places = placed && kept.length ? aroundPlaced(layout, ids, radii, fixed, placed, centre) : gathered(layout, ids, centre);
  const index = new Map(ids.map((id, i) => [id, i]));
  const pairs = matchedPairs(links, index);

  if (!fixed.every(Boolean)) {
    for (let step = 0; step < SETTLE_STEPS; step++) {
      const cooling = 1 - step / SETTLE_STEPS;
      places.forEach((place, i) => {
        if (fixed[i]) return;
        place.x += (centre.x - place.x) * CENTRE_PULL * cooling;
        place.y += (centre.y - place.y) * CENTRE_PULL * cooling;
        place.z += (centre.z - place.z) * CENTRE_PULL * cooling;
      });
      for (const [i, j] of pairs) pull(places, fixed, i, j, radii[i] + radii[j] + PAPER_CLUSTER_GAP, LINK_PULL * cooling);
      separate(places, radii, fixed);
    }
    for (let pass = 0; pass < COLLISION_PASSES && separate(places, radii, fixed); pass++);
  }

  return new Map(ids.map((id, i) => [id, places[i]]));
}

/** Each match a quarter of the way from its layout place to the matches' centre. */
function gathered(layout: PaperLayout, ids: readonly string[], centre: Point3): Point3[] {
  return ids.map((id) => {
    const { x, y, z } = layout.get(id)!;
    return { x: centre.x + (x - centre.x) * START_SHARE, y: centre.y + (y - centre.y) * START_SHARE, z: centre.z + (z - centre.z) * START_SHARE };
  });
}

/** The matches already placed where they were, and each new one just outside the cluster, on the side its layout place lies. */
function aroundPlaced(
  layout: PaperLayout,
  ids: readonly string[],
  radii: readonly number[],
  fixed: readonly boolean[],
  placed: ReadonlyMap<string, Point3>,
  centre: Point3
): Point3[] {
  const kept = ids.flatMap((id, i) => (fixed[i] ? [{ place: placed.get(id)!, radius: radii[i] }] : []));
  const reach = Math.max(...kept.map(({ place, radius }) => Math.hypot(place.x - centre.x, place.y - centre.y, place.z - centre.z) + radius));
  return ids.map((id, i) => {
    if (fixed[i]) return { ...placed.get(id)! };
    const { x, y, z } = layout.get(id)!;
    const length = Math.hypot(x - centre.x, y - centre.y, z - centre.z);
    const [dx, dy, dz] = length > 0 ? [(x - centre.x) / length, (y - centre.y) / length, (z - centre.z) / length] : [1, 0, 0];
    const out = reach + radii[i] + PAPER_CLUSTER_GAP;
    return { x: centre.x + dx * out, y: centre.y + dy * out, z: centre.z + dz * out };
  });
}

function centreOf(points: readonly Point3[]): Point3 {
  const centre = { x: 0, y: 0, z: 0 };
  for (const { x, y, z } of points) {
    centre.x += x / points.length;
    centre.y += y / points.length;
    centre.z += z / points.length;
  }
  return centre;
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

/** What a flight to a Person frames: the Person, or the search cluster when the search hides them. */
export function paperFlyFrames(id: string, matchIds: ReadonlySet<string> | null): 'person' | 'cluster' {
  return !matchIds || matchIds.has(id) ? 'person' : 'cluster';
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
  const gather = finite ? easeInOutCubic(seconds / PAPER_GATHER_SECONDS) : 1;
  const shrink = finite ? easeOutCubic(seconds / PAPER_SHRINK_SECONDS) : 1;

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

/** How much of a shared move each disc of a pair takes: half each, or all of it when the other disc is placed for good. */
function shares(fixed: readonly boolean[], i: number, j: number): [number, number] {
  return [fixed[i] ? 0 : fixed[j] ? 2 : 1, fixed[j] ? 0 : fixed[i] ? 2 : 1];
}

function pull(places: Point3[], fixed: readonly boolean[], i: number, j: number, rest: number, strength: number): void {
  const a = places[i];
  const b = places[j];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= rest) return;
  const k = ((distance - rest) / distance) * strength * 0.5;
  const [sa, sb] = shares(fixed, i, j);
  a.x += dx * k * sa;
  a.y += dy * k * sa;
  a.z += dz * k * sa;
  b.x -= dx * k * sb;
  b.y -= dy * k * sb;
  b.z -= dz * k * sb;
}

/** One pass that pushes every two overlapping discs apart; true when it moved any. Only discs in neighbouring grid cells can overlap. */
function separate(places: Point3[], radii: readonly number[], fixed: readonly boolean[]): boolean {
  const grid = new PaperGrid(2 * Math.max(...radii) + PAPER_CLUSTER_GAP);
  places.forEach((p, i) => grid.add(i, p));
  let moved = false;
  places.forEach((p, i) =>
    grid.forNear(p, (j) => {
      if (j > i && push(places, radii, fixed, i, j)) moved = true;
    })
  );
  return moved;
}

function push(places: Point3[], radii: readonly number[], fixed: readonly boolean[], i: number, j: number): boolean {
  if (fixed[i] && fixed[j]) return false;
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
  const [sa, sb] = shares(fixed, i, j);
  a.x -= dx * k * sa;
  a.y -= dy * k * sa;
  a.z -= dz * k * sa;
  b.x += dx * k * sb;
  b.y += dy * k * sb;
  b.z += dz * k * sb;
  return true;
}
