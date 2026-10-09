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
 * `personIds` do not count.
 */
export function kinshipLinkCounts(personIds: readonly string[], links: readonly FamilyLink[]): Map<string, number> {
  const counts = new Map(personIds.map((id) => [id, 0]));
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

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

function squaredDistance(p: Point3, q: Point3): number {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  const dz = p.z - q.z;
  return dx * dx + dy * dy + dz * dz;
}

export function centroid(points: readonly Point3[]): Point3 {
  const sum = { x: 0, y: 0, z: 0 };
  for (const p of points) {
    sum.x += p.x;
    sum.y += p.y;
    sum.z += p.z;
  }
  const count = points.length || 1;
  return { x: sum.x / count, y: sum.y / count, z: sum.z / count };
}

function randomUnit(random: () => number): Point3 {
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

const HALF_NEIGHBOURHOOD: readonly (readonly [number, number, number])[] = [-1, 0, 1]
  .flatMap((dx) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dz) => [dx, dy, dz] as const)))
  .filter(([dx, dy, dz]) => dx > 0 || (dx === 0 && (dy > 0 || (dy === 0 && dz >= 0))));

interface Cell {
  ix: number;
  iy: number;
  iz: number;
  members: number[];
}

/** A spatial hash: each index in a cube of `size`, so a lookup visits only the 27 cubes around a point. */
export class PaperGrid {
  private cells = new Map<number, Cell>();

  constructor(private size: number) {}

  add(index: number, p: Point3): void {
    const ix = cellOf(p.x, this.size);
    const iy = cellOf(p.y, this.size);
    const iz = cellOf(p.z, this.size);
    const key = cellKey(ix, iy, iz);
    const cell = this.cells.get(key);
    if (cell) cell.members.push(index);
    else this.cells.set(key, { ix, iy, iz, members: [index] });
  }

  forNear(p: Point3, visit: (index: number) => void): void {
    const ix = cellOf(p.x, this.size);
    const iy = cellOf(p.y, this.size);
    const iz = cellOf(p.z, this.size);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cell = this.cells.get(cellKey(ix + dx, iy + dy, iz + dz));
          if (cell) for (const index of cell.members) visit(index);
        }
      }
    }
  }

  forEachNearPair(visit: (i: number, j: number) => void): void {
    for (const cell of this.cells.values()) {
      const { members } = cell;
      for (const [dx, dy, dz] of HALF_NEIGHBOURHOOD) {
        const other = this.cells.get(cellKey(cell.ix + dx, cell.iy + dy, cell.iz + dz));
        if (!other) continue;
        const same = other === cell;
        for (let a = 0; a < members.length; a++) {
          for (let b = same ? a + 1 : 0; b < other.members.length; b++) visit(members[a], other.members[b]);
        }
      }
    }
  }
}

function repel(points: readonly Point3[], velocity: Point3[], radii: readonly number[], alpha: number): void {
  const grid = new PaperGrid(REPULSION_RANGE);
  points.forEach((p, i) => grid.add(i, p));
  grid.forEachNearPair((i, j) => {
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
    const push = (REPULSION * alpha) / Math.max(squared, 1) + (distance < clearance ? ((clearance - distance) / distance) * COLLISION * 0.5 : 0);
    velocity[i].x -= dx * push;
    velocity[i].y -= dy * push;
    velocity[i].z -= dz * push;
    velocity[j].x += dx * push;
    velocity[j].y += dy * push;
    velocity[j].z += dz * push;
  });
}

interface Spring {
  a: number;
  b: number;
  length: number;
}

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

function startingPoints(ids: readonly string[], springs: readonly Spring[]): Point3[] {
  const neighbours = ids.map(() => [] as Spring[]);
  for (const spring of springs) {
    neighbours[spring.a].push(spring);
    neighbours[spring.b].push(spring);
  }
  const points: (Point3 | undefined)[] = ids.map(() => undefined);
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
  return points as Point3[];
}

function pushOverlapsOutward(ids: readonly string[], points: Point3[], radii: readonly number[]): void {
  const order = ids
    .map((_, i) => i)
    .sort((i, j) => {
      const a = points[i];
      const b = points[j];
      return a.x * a.x + a.y * a.y + a.z * a.z - (b.x * b.x + b.y * b.y + b.z * b.z) || (ids[i] < ids[j] ? -1 : 1);
    });
  const grid = new PaperGrid(MAX_RADIUS * 2 + PAPER_DISC_GAP);
  for (const i of order) {
    const p = points[i];
    const length = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    const outward = length > 1e-6 ? { x: p.x / length, y: p.y / length, z: p.z / length } : randomUnit(seededRandom(hashString(ids[i], SEED)));
    for (;;) {
      let clear = true;
      grid.forNear(p, (j) => {
        const clearance = radii[i] + radii[j] + PAPER_DISC_GAP;
        if (squaredDistance(p, points[j]) < clearance * clearance) clear = false;
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
 * Positions every Person in the Working Record in a still, organic 3D cloud.
 *
 * The same Persons and Kinship Links always give the same layout, whatever
 * order they arrive in and whatever positions a simulation left on them. It runs a fixed number of steps to completion, never live physics.
 * Relatives are pulled together, and no two discs overlap. Lay out the whole
 * Working Record: collapsing or hiding Persons only stops drawing them.
 */
export function layoutPaperTree(graph: { nodes: readonly FamilyNode[]; links: readonly FamilyLink[] }): PaperLayout {
  const ids = [...new Set(graph.nodes.map((n) => n.id))].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const springs = springsBetween(index, graph.links);
  const counts = kinshipLinkCounts(ids, graph.links);
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

  const centre = centroid(points);
  for (const p of points) {
    p.x -= centre.x;
    p.y -= centre.y;
    p.z -= centre.z;
  }
  pushOverlapsOutward(ids, points, radii);

  return new Map(ids.map((id, i) => [id, { x: points[i].x, y: points[i].y, z: points[i].z, radius: radii[i] }]));
}

/**
 * Adds a newcomer beside their relatives without moving anyone: every disc
 * already placed keeps its position and size. The newcomer takes the nearest
 * clear shell around the placed relative closest to all their placed
 * relatives, at the spot in it nearest the others (at the edge of the cloud
 * when none are placed). The same relatives always give the same spot,
 * whatever the newcomer's id, so a Ghost Preview can show it before the id
 * exists. Returns `layout` itself when the newcomer is already placed.
 */
export function placeNewcomer(layout: PaperLayout, newcomerId: string, links: readonly FamilyLink[]): PaperLayout {
  if (layout.has(newcomerId)) return layout;

  const relativeIds = new Set<string>();
  let linkCount = 0;
  for (const link of links) {
    const { sourceId, targetId } = getLinkEndpoints(link);
    const otherId = sourceId === newcomerId ? targetId : targetId === newcomerId ? sourceId : null;
    if (otherId === null || otherId === newcomerId || !layout.has(otherId)) continue;
    relativeIds.add(otherId);
    linkCount++;
  }
  const radius = paperDiscRadius(linkCount);
  const discs = [...layout.values()];
  const relatives = [...relativeIds].sort().map((id) => layout.get(id)!);

  let anchor: Point3;
  let startDistance: number;
  let toward: Point3;
  if (relatives.length > 0) {
    toward = centroid(relatives);
    const beside = relatives.reduce((best, d) => (squaredDistance(d, toward) < squaredDistance(best, toward) ? d : best));
    anchor = beside;
    startDistance = radius + PAPER_DISC_GAP + beside.radius;
  } else {
    anchor = centroid(discs);
    toward = anchor;
    const extent = discs.reduce((most, d) => Math.max(most, Math.sqrt(squaredDistance(d, anchor)) + d.radius), 0);
    startDistance = extent + radius + PAPER_DISC_GAP;
  }

  const random = seededRandom(hashString([...relativeIds].sort().join('|'), SEED));
  const isClear = (p: Point3) =>
    discs.every((d) => {
      const clearance = d.radius + radius + PAPER_DISC_GAP;
      return squaredDistance(p, d) >= clearance * clearance;
    });

  for (let distance = startDistance; ; distance += PAPER_DISC_GAP) {
    let best: Point3 | null = null;
    for (let attempt = 0; attempt < 32; attempt++) {
      const direction = randomUnit(random);
      const spot = { x: anchor.x + direction.x * distance, y: anchor.y + direction.y * distance, z: anchor.z + direction.z * distance };
      if (isClear(spot) && (!best || squaredDistance(spot, toward) < squaredDistance(best, toward))) best = spot;
    }
    if (best) {
      const placed = new Map(layout);
      placed.set(newcomerId, { ...best, radius });
      return placed;
    }
  }
}
