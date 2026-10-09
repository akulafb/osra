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
export function growingFrom(subject: { aId: string; bId: string }, spawning: ReadonlySet<string>): [string, string] {
  return spawning.has(subject.aId) && !spawning.has(subject.bId) ? [subject.bId, subject.aId] : [subject.aId, subject.bId];
}

/** The Persons in a Spawn or a Dissolve. */
export function inLifecycle(lifecycles: readonly Lifecycle[]): Set<string> {
  return new Set(lifecycles.flatMap((l) => (l.subject.kind === 'node' ? [l.subject.id] : [])));
}

/** The lines not in a Spawn: those are drawn growing instead. */
export function steadyLines<L extends PaperLine>(lines: readonly L[], lifecycles: readonly Lifecycle[]): readonly L[] {
  const growing = lifecycles.flatMap((l) => (l.kind === 'spawn' && l.subject.kind === 'link' ? [l.subject] : []));
  if (growing.length === 0) return lines;
  const isGrowing = (line: L) =>
    growing.some(
      ({ aId, bId }) => (line.sourceId === aId && line.targetId === bId) || (line.sourceId === bId && line.targetId === aId)
    );
  return lines.filter((line) => !isGrowing(line));
}

/**
 * The layout, plus the last known position of each Person in `keep` who has
 * left it, so a Dissolve plays where the Person was after the Working Record
 * has dropped them. Returns `layout` itself when nobody kept has left.
 */
export function rememberPositions(previous: PaperLayout, layout: PaperLayout, keep: ReadonlySet<string>): PaperLayout {
  const left = [...keep].filter((id) => !layout.has(id) && previous.has(id));
  if (left.length === 0) return layout;
  const remembered = new Map(layout);
  for (const id of left) remembered.set(id, previous.get(id)!);
  return remembered;
}
