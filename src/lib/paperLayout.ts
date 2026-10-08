import type { FamilyLink, FamilyNode } from '../types/graph';
import { getLinkEndpoints } from './familyGraph';
import { keepDrawnParentLinks } from './layoutEngine';
import { hashString, seededRandom } from './seededRandom';

/** A Person's disc in the Paper 3D scene: its centre and its radius, in world units. */
export interface PaperDisc {
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** Every Person's disc, by Person id. */
export type PaperLayout = ReadonlyMap<string, PaperDisc>;

/** A Kinship Link to draw, with both endpoints resolved to Person ids. */
export interface PaperLine<L extends FamilyLink = FamilyLink> {
  sourceId: string;
  targetId: string;
  type: FamilyLink['type'];
  link: L;
}

/** The least space left between two discs. */
export const PAPER_DISC_GAP = 4;

const MIN_RADIUS = 4;
const RADIUS_GROWTH = 2;
const MAX_RADIUS = 14;

const LINK_LENGTH: Record<FamilyLink['type'], number> = { parent: 60, marriage: 32, divorce: 48 };
const SEED = 0x05a2a93;
const ITERATIONS = 200;
const REPULSION_RANGE = 80;
const REPULSION = 480;
const GRAVITY = 0.01;
const COLLISION = 0.7;
const VELOCITY_KEEP = 0.6;

/** The disc radius for a Person with this many Kinship Links: it grows with the count, up to a limit. */
export function paperDiscRadius(kinshipLinkCount: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + RADIUS_GROWTH * Math.sqrt(Math.max(0, kinshipLinkCount)));
}

/**
 * Each Person's number of stored Kinship Links: parent links to both parents
 * (ADR 0012), children, marriages and divorces. Links to anyone outside
 * `nodes` do not count.
 */
export function kinshipLinkCounts(nodes: readonly FamilyNode[], links: readonly FamilyLink[]): Map<string, number> {
  const counts = new Map(nodes.map((n) => [n.id, 0]));
  for (const link of links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    if (sourceId === targetId || !counts.has(sourceId) || !counts.has(targetId)) continue;
    counts.set(sourceId, counts.get(sourceId)! + 1);
    counts.set(targetId, counts.get(targetId)! + 1);
  }
  return counts;
}

/**
 * The lines Paper draws between the given Persons: every marriage and divorce,
 * and one parent line per child by the drawn-parent rule Cosmos uses
 * (ADR 0012). Links to anyone outside `nodes` are left out.
 */
export function paperLines<L extends FamilyLink>(nodes: readonly FamilyNode[], links: readonly L[]): PaperLine<L>[] {
  const shown = new Set(nodes.map((n) => n.id));
  const lines: PaperLine<L>[] = [];
  for (const link of keepDrawnParentLinks(nodes, links)) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    if (sourceId === targetId || !shown.has(sourceId) || !shown.has(targetId)) continue;
    lines.push({ sourceId, targetId, type: link.type, link });
  }
  return lines;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

function randomUnit(random: () => number): Point {
  for (;;) {
    const x = random() * 2 - 1;
    const y = random() * 2 - 1;
    const z = random() * 2 - 1;
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length > 1e-3 && length <= 1) return { x: x / length, y: y / length, z: z / length };
  }
}

const GRID_SPAN = 2048;
const GRID_OFFSET = 1024;

function cellOf(value: number, size: number): number {
  return Math.max(-GRID_OFFSET + 1, Math.min(GRID_OFFSET - 2, Math.floor(value / size)));
}

function cellKey(ix: number, iy: number, iz: number): number {
  return ((ix + GRID_OFFSET) * GRID_SPAN + (iy + GRID_OFFSET)) * GRID_SPAN + (iz + GRID_OFFSET);
}

/** Buckets the points into cubes of `size`, so near neighbours are found without testing every pair. */
class Grid {
  private cells = new Map<number, number[]>();

  constructor(private size: number) {}

  add(index: number, p: Point): void {
    const key = cellKey(cellOf(p.x, this.size), cellOf(p.y, this.size), cellOf(p.z, this.size));
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
  }

  forNear(p: Point, visit: (index: number) => void): void {
    const ix = cellOf(p.x, this.size);
    const iy = cellOf(p.y, this.size);
    const iz = cellOf(p.z, this.size);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = this.cells.get(cellKey(ix + dx, iy + dy, iz + dz));
          if (bucket) for (const index of bucket) visit(index);
        }
      }
    }
  }
}

/** The cells next to a cell that come after it, itself included, so each pair of cells is visited once. */
const FORWARD_CELLS: readonly (readonly [number, number, number])[] = [-1, 0, 1]
  .flatMap((dx) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dz) => [dx, dy, dz] as const)))
  .filter(([dx, dy, dz]) => dx > 0 || (dx === 0 && (dy > 0 || (dy === 0 && dz >= 0))));

/** Pushes every pair of Persons closer than the repulsion range apart, and harder when their discs touch. */
function repel(points: readonly Point[], velocity: Point[], radii: readonly number[], alpha: number): void {
  const cells = new Map<number, number[]>();
  points.forEach((p, i) => {
    const key = cellKey(cellOf(p.x, REPULSION_RANGE), cellOf(p.y, REPULSION_RANGE), cellOf(p.z, REPULSION_RANGE));
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  });

  const pushApart = (i: number, j: number) => {
    const p = points[i];
    const q = points[j];
    let dx = q.x - p.x;
    let dy = q.y - p.y;
    let dz = q.z - p.z;
    let squared = dx * dx + dy * dy + dz * dz;
    if (squared >= REPULSION_RANGE * REPULSION_RANGE) return;
    if (squared < 1e-12) {
      dx = (j - i) * 1e-3;
      dy = 0;
      dz = 0;
      squared = dx * dx;
    }
    const distance = Math.sqrt(squared);
    const clearance = radii[i] + radii[j] + PAPER_DISC_GAP;
    const push = (REPULSION * alpha) / squared + (distance < clearance ? ((clearance - distance) / distance) * COLLISION * 0.5 : 0);
    velocity[i].x -= dx * push;
    velocity[i].y -= dy * push;
    velocity[i].z -= dz * push;
    velocity[j].x += dx * push;
    velocity[j].y += dy * push;
    velocity[j].z += dz * push;
  };

  for (const [key, bucket] of cells) {
    const p = points[bucket[0]];
    const ix = cellOf(p.x, REPULSION_RANGE);
    const iy = cellOf(p.y, REPULSION_RANGE);
    const iz = cellOf(p.z, REPULSION_RANGE);
    for (const [dx, dy, dz] of FORWARD_CELLS) {
      const otherKey = cellKey(ix + dx, iy + dy, iz + dz);
      const other = otherKey === key ? bucket : cells.get(otherKey);
      if (!other) continue;
      for (let a = 0; a < bucket.length; a++) {
        for (let b = otherKey === key ? a + 1 : 0; b < other.length; b++) pushApart(bucket[a], other[b]);
      }
    }
  }
}

interface Spring {
  a: number;
  b: number;
  length: number;
}

/** Springs between linked Persons, one per pair, in an order that does not depend on the input order. */
function springsBetween(index: Map<string, number>, links: readonly FamilyLink[]): Spring[] {
  const byPair = new Map<string, Spring>();
  for (const link of links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    const a = index.get(sourceId);
    const b = index.get(targetId);
    if (a === undefined || b === undefined || a === b) continue;
    const [low, high] = a < b ? [a, b] : [b, a];
    const key = `${low}|${high}`;
    const length = LINK_LENGTH[link.type];
    const existing = byPair.get(key);
    if (!existing || length < existing.length) byPair.set(key, { a: low, b: high, length });
  }
  return [...byPair.values()].sort((s, t) => s.a - t.a || s.b - t.b);
}

/** Each Person starts one link length from the relative it was reached from, so families start together. */
function startingPoints(ids: readonly string[], springs: readonly Spring[]): Point[] {
  const neighbours = ids.map(() => [] as Spring[]);
  for (const spring of springs) {
    neighbours[spring.a].push(spring);
    neighbours[spring.b].push(spring);
  }
  const points: (Point | undefined)[] = ids.map(() => undefined);
  const spread = LINK_LENGTH.parent * Math.sqrt(ids.length);
  for (let root = 0; root < ids.length; root++) {
    if (points[root]) continue;
    const offset = randomUnit(seededRandom(hashString(ids[root], SEED)));
    const reach = root === 0 ? 0 : seededRandom(hashString(ids[root], SEED + 1))() * spread;
    points[root] = { x: offset.x * reach, y: offset.y * reach, z: offset.z * reach };
    const queue = [root];
    for (let head = 0; head < queue.length; head++) {
      const from = queue[head];
      for (const spring of neighbours[from]) {
        const to = spring.a === from ? spring.b : spring.a;
        if (points[to]) continue;
        const direction = randomUnit(seededRandom(hashString(ids[to], SEED)));
        const p = points[from]!;
        points[to] = { x: p.x + direction.x * spring.length, y: p.y + direction.y * spring.length, z: p.z + direction.z * spring.length };
        queue.push(to);
      }
    }
  }
  return points as Point[];
}

/** Moves each disc that touches one already settled outward from the centre until it is clear. */
function separate(ids: readonly string[], points: Point[], radii: readonly number[]): void {
  const order = ids
    .map((_, i) => i)
    .sort((i, j) => {
      const a = points[i];
      const b = points[j];
      return a.x * a.x + a.y * a.y + a.z * a.z - (b.x * b.x + b.y * b.y + b.z * b.z) || (ids[i] < ids[j] ? -1 : 1);
    });
  const grid = new Grid(MAX_RADIUS * 2 + PAPER_DISC_GAP);
  for (const i of order) {
    const p = points[i];
    const length = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    const outward = length > 1e-6 ? { x: p.x / length, y: p.y / length, z: p.z / length } : randomUnit(seededRandom(hashString(ids[i], SEED)));
    for (;;) {
      let clear = true;
      grid.forNear(p, (j) => {
        const q = points[j];
        const clearance = radii[i] + radii[j] + PAPER_DISC_GAP;
        if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2 < clearance * clearance) clear = false;
      });
      if (clear) break;
      p.x += outward.x * PAPER_DISC_GAP;
      p.y += outward.y * PAPER_DISC_GAP;
      p.z += outward.z * PAPER_DISC_GAP;
    }
    grid.add(i, p);
  }
}

/**
 * Positions every Person in the Tree Record in a still, organic 3D cloud.
 *
 * The same Tree Record always gives the same layout, whatever order its
 * Persons and Kinship Links arrive in and whatever positions a simulation left
 * on them. It runs a fixed number of steps to completion, never live physics.
 * Relatives are pulled together, and no two discs overlap. Lay out the whole
 * Working Record: collapsing or hiding Persons only stops drawing them.
 */
export function layoutPaperTree(graph: { nodes: readonly FamilyNode[]; links: readonly FamilyLink[] }): PaperLayout {
  const ids = [...new Set(graph.nodes.map((n) => n.id))].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const springs = springsBetween(index, graph.links);
  const counts = kinshipLinkCounts(ids.map((id) => ({ id, firstName: id })), graph.links);
  const radii = ids.map((id) => paperDiscRadius(counts.get(id)!));
  const degree = ids.map(() => 0);
  for (const spring of springs) {
    degree[spring.a]++;
    degree[spring.b]++;
  }

  const points = startingPoints(ids, springs);
  const velocity = ids.map(() => ({ x: 0, y: 0, z: 0 }));

  for (let step = 0; step < ITERATIONS; step++) {
    const alpha = 1 - step / ITERATIONS;

    for (const { a, b, length } of springs) {
      const p = points[a];
      const q = points[b];
      const dx = q.x + velocity[b].x - p.x - velocity[a].x;
      const dy = q.y + velocity[b].y - p.y - velocity[a].y;
      const dz = q.z + velocity[b].z - p.z - velocity[a].z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const pull = ((distance - length) / distance) * alpha / Math.min(degree[a], degree[b]);
      const bias = degree[a] / (degree[a] + degree[b]);
      velocity[b].x -= dx * pull * bias;
      velocity[b].y -= dy * pull * bias;
      velocity[b].z -= dz * pull * bias;
      velocity[a].x += dx * pull * (1 - bias);
      velocity[a].y += dy * pull * (1 - bias);
      velocity[a].z += dz * pull * (1 - bias);
    }

    repel(points, velocity, radii, alpha);

    points.forEach((p, i) => {
      const v = velocity[i];
      v.x = (v.x - p.x * GRAVITY * alpha) * VELOCITY_KEEP;
      v.y = (v.y - p.y * GRAVITY * alpha) * VELOCITY_KEEP;
      v.z = (v.z - p.z * GRAVITY * alpha) * VELOCITY_KEEP;
      p.x += v.x;
      p.y += v.y;
      p.z += v.z;
    });
  }

  const centre = points.reduce((sum, p) => ({ x: sum.x + p.x, y: sum.y + p.y, z: sum.z + p.z }), { x: 0, y: 0, z: 0 });
  const count = points.length || 1;
  for (const p of points) {
    p.x -= centre.x / count;
    p.y -= centre.y / count;
    p.z -= centre.z / count;
  }
  separate(ids, points, radii);

  return new Map(ids.map((id, i) => [id, { x: points[i].x, y: points[i].y, z: points[i].z, radius: radii[i] }]));
}

/**
 * Adds a newcomer beside their relatives without moving anyone: every disc
 * already placed keeps its position and size, and the newcomer takes the
 * nearest clear spot around their relatives (around the edge of the cloud when
 * they have none). The same newcomer always lands in the same spot. The full
 * layout is recomputed only on the next load. Returns `layout` itself when the
 * newcomer is already placed.
 */
export function placeNewcomer(layout: PaperLayout, newcomerId: string, links: readonly FamilyLink[]): PaperLayout {
  if (layout.has(newcomerId)) return layout;

  const relatives = new Set<string>();
  let linkCount = 0;
  for (const link of links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    const otherId = sourceId === newcomerId ? targetId : targetId === newcomerId ? sourceId : null;
    if (otherId === null || otherId === newcomerId || !layout.has(otherId)) continue;
    relatives.add(otherId);
    linkCount++;
  }
  const radius = paperDiscRadius(linkCount);
  const discs = [...layout.values()];

  let anchor: Point;
  let reach: number;
  if (relatives.size > 0) {
    const around = [...relatives].map((id) => layout.get(id)!);
    anchor = {
      x: around.reduce((sum, d) => sum + d.x, 0) / around.length,
      y: around.reduce((sum, d) => sum + d.y, 0) / around.length,
      z: around.reduce((sum, d) => sum + d.z, 0) / around.length,
    };
    reach = radius + PAPER_DISC_GAP + Math.min(...around.map((d) => d.radius));
  } else {
    const count = discs.length || 1;
    anchor = {
      x: discs.reduce((sum, d) => sum + d.x, 0) / count,
      y: discs.reduce((sum, d) => sum + d.y, 0) / count,
      z: discs.reduce((sum, d) => sum + d.z, 0) / count,
    };
    const extent = discs.reduce((most, d) => Math.max(most, Math.sqrt((d.x - anchor.x) ** 2 + (d.y - anchor.y) ** 2 + (d.z - anchor.z) ** 2) + d.radius), 0);
    reach = extent + radius + PAPER_DISC_GAP;
  }

  const random = seededRandom(hashString(newcomerId, SEED));
  const isClear = (p: Point) =>
    discs.every((d) => {
      const clearance = d.radius + radius + PAPER_DISC_GAP;
      return (p.x - d.x) ** 2 + (p.y - d.y) ** 2 + (p.z - d.z) ** 2 >= clearance * clearance;
    });

  for (let distance = reach; ; distance += PAPER_DISC_GAP) {
    for (let attempt = 0; attempt < 32; attempt++) {
      const direction = randomUnit(random);
      const spot = { x: anchor.x + direction.x * distance, y: anchor.y + direction.y * distance, z: anchor.z + direction.z * distance };
      if (isClear(spot)) {
        const placed = new Map(layout);
        placed.set(newcomerId, { ...spot, radius });
        return placed;
      }
    }
  }
}
