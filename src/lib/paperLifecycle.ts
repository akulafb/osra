import {
  canvasParticleAt,
  cardDissolveAt,
  cardSpawnAt,
  linkGrowthAt,
  spawnRingAt,
  type CanvasParticleSeed,
} from '../utils/canvasFx';
import type { Lifecycle, LifecycleKind } from './lifecycle';
import type { PaperLayout, PaperLine } from './paperLayout';
import { getLinkEndpoints } from './familyGraph';
import type { FamilyLink, FamilyNode } from '../types/graph';

/**
 * Spawn and Dissolve drawn in ink (LIN-96, ADR 0007): the 2D curves in
 * `canvasFx.ts`, read as a size and how much ink is kept. No glow, no colour;
 * what ink is lost fades into the paper.
 */
export interface PaperInkFrame {
  /** A multiple of the disc's radius. */
  scale: number;
  /** 1 is full ink, 0 is paper. */
  ink: number;
}

export interface PaperSpeck {
  /** Offsets from the disc's centre in the disc's plane, up positive. */
  x: number;
  y: number;
  r: number;
  ink: number;
}

/** A speck's size, as a multiple of the disc's radius per user unit of its seed. */
const PAPER_SPECK_SIZE = 0.05;

export function paperSpawnDisc(progress: number): PaperInkFrame {
  const { scale, opacity } = cardSpawnAt(progress);
  return { scale, ink: opacity };
}

export function paperSpawnRing(progress: number): PaperInkFrame {
  const { scale, opacity } = spawnRingAt(progress);
  return { scale, ink: opacity };
}

export function paperDissolveDisc(progress: number): PaperInkFrame {
  const { scale, opacity } = cardDissolveAt(progress);
  return { scale, ink: opacity };
}

/** Ink specks blown off a dissolving disc of `radius`. */
export function paperDissolveSpecks(seeds: readonly CanvasParticleSeed[], progress: number, radius: number): PaperSpeck[] {
  const origin = { x: 0, y: 0, width: radius, height: radius };
  return seeds.map((seed) => {
    const { x, y, r, opacity } = canvasParticleAt(seed, progress, origin);
    return { x, y: -y, r: r * radius * PAPER_SPECK_SIZE, ink: opacity };
  });
}

/** How much of a Kinship Link's line is drawn: a Spawn grows it, a Dissolve draws it back. */
export function paperLinkDrawn(kind: LifecycleKind, progress: number): number {
  const { drawn } = linkGrowthAt(progress);
  return kind === 'spawn' ? drawn : 1 - drawn;
}

/** The two ends of a line in the order it grows: from the Person already there towards a spawning one. */
function growingFrom(subject: { aId: string; bId: string }, spawning: ReadonlySet<string>): [string, string] {
  return spawning.has(subject.aId) && !spawning.has(subject.bId) ? [subject.bId, subject.aId] : [subject.aId, subject.bId];
}

/** The Persons in a Spawn or a Dissolve. */
export function inLifecycle(lifecycles: readonly Lifecycle[]): Set<string> {
  return new Set(lifecycles.flatMap((l) => (l.subject.kind === 'node' ? [l.subject.id] : [])));
}

export type ProgressOf = (key: string) => number | null;

type LinkSubject = { aId: string; bId: string };

function joins(line: { sourceId: string; targetId: string }, { aId, bId }: LinkSubject): boolean {
  return (line.sourceId === aId && line.targetId === bId) || (line.sourceId === bId && line.targetId === aId);
}

function linkSubjects(lifecycles: readonly Lifecycle[]): LinkSubject[] {
  return lifecycles.flatMap((l) => (l.subject.kind === 'link' ? [l.subject] : []));
}

/** The lines not in a Spawn or a Dissolve: those are drawn growing or drawing back instead. */
export function steadyLines(lines: readonly PaperLine[], lifecycles: readonly Lifecycle[]): readonly PaperLine[] {
  const links = linkSubjects(lifecycles);
  if (links.length === 0) return lines;
  return lines.filter((line) => !links.some((link) => joins(line, link)));
}

/**
 * The shown Persons and lines, plus how each one in a lifecycle was last
 * shown, so a Dissolve plays as what the view drew after the Working Record
 * has dropped it.
 */
export interface PaperLifecycleScene {
  layout: PaperLayout;
  nodes: readonly FamilyNode[];
  lines: readonly PaperLine[];
}

export const EMPTY_LIFECYCLE_SCENE: PaperLifecycleScene = { layout: new Map(), nodes: [], lines: [] };

/**
 * `shown`, plus each Person and line in a lifecycle that `previous` drew and
 * the Working Record (`record`) has since dropped. One the view has only
 * hidden is not drawn.
 */
export function rememberLifecycleScene(
  previous: PaperLifecycleScene,
  layout: PaperLayout,
  shown: { nodes: readonly FamilyNode[]; lines: readonly PaperLine[] },
  lifecycles: readonly Lifecycle[],
  record: { nodes: readonly FamilyNode[]; links: readonly FamilyLink[] }
): PaperLifecycleScene {
  const inRecord = new Set(record.nodes.map((n) => n.id));
  const left = new Set([...inLifecycle(lifecycles)].filter((id) => !inRecord.has(id)));
  const shownLayout: PaperLayout = new Map(shown.nodes.flatMap((n) => (layout.has(n.id) ? [[n.id, layout.get(n.id)!]] : [])));
  const leftNodes = previous.nodes.filter((n) => left.has(n.id) && !shownLayout.has(n.id));
  const links = linkSubjects(lifecycles);
  const recordPairs = record.links.map(getLinkEndpoints);
  const leftLines = previous.lines.filter(
    (line) =>
      links.some((link) => joins(line, link)) && !recordPairs.some((pair) => joins(pair, { aId: line.sourceId, bId: line.targetId }))
  );
  return {
    layout: rememberPositions(previous.layout, shownLayout, left),
    nodes: leftNodes.length ? [...shown.nodes, ...leftNodes] : shown.nodes,
    lines: leftLines.length ? [...shown.lines, ...leftLines] : shown.lines,
  };
}

export type PaperLifecycleDraw =
  | { kind: 'disc'; lifecycle: Lifecycle; id: string }
  | { kind: 'line'; lifecycle: Lifecycle; line: PaperLine; from: string; to: string };

/** The Spawns and Dissolves whose Person, or whose line and both ends, `scene` holds; a link with no drawn line (a child's second parent, ADR 0012) draws nothing. */
export function paperLifecycleDraws(lifecycles: readonly Lifecycle[], scene: PaperLifecycleScene): PaperLifecycleDraw[] {
  const spawning = inLifecycle(lifecycles.filter((l) => l.kind === 'spawn'));
  return lifecycles.flatMap((lifecycle): PaperLifecycleDraw[] => {
    const { subject } = lifecycle;
    if (subject.kind === 'node') return scene.layout.has(subject.id) ? [{ kind: 'disc', lifecycle, id: subject.id }] : [];
    const line = scene.lines.find((l) => joins(l, subject));
    if (!line || !scene.layout.has(subject.aId) || !scene.layout.has(subject.bId)) return [];
    const [from, to] = growingFrom(subject, spawning);
    return [{ kind: 'line', lifecycle, line, from, to }];
  });
}

export function paperLifecycleDisc(kind: LifecycleKind, progress: number): PaperInkFrame {
  return kind === 'spawn' ? paperSpawnDisc(progress) : paperDissolveDisc(progress);
}

/**
 * `progressOf`, holding each lifecycle's last progress once it has ended, so
 * its last frame stays drawn until the lifecycle leaves the rendered list and
 * the steady scene takes the Person or line back.
 */
export function holdingProgress(progressOf: ProgressOf): ProgressOf {
  const last = new Map<string, number>();
  return (key) => {
    const progress = progressOf(key);
    if (progress === null) return last.get(key) ?? null;
    last.set(key, progress);
    return progress;
  };
}

/**
 * The layout, plus the last known position of each Person in `keep` who has
 * left it, so a Dissolve plays where the Person was after the Working Record
 * has dropped them. Returns `layout` itself when nobody kept has left.
 */
function rememberPositions(previous: PaperLayout, layout: PaperLayout, keep: ReadonlySet<string>): PaperLayout {
  const left = [...keep].filter((id) => !layout.has(id) && previous.has(id));
  if (left.length === 0) return layout;
  const remembered = new Map(layout);
  for (const id of left) remembered.set(id, previous.get(id)!);
  return remembered;
}
