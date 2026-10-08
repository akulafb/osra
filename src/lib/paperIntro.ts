import type { PaperLayout } from './paperLayout';
import type { Point3 } from './paperHover';

export const PAPER_REVEAL_SECONDS = 1.8;

const PERSON_REVEAL_SECONDS = 0.9;

/** Each Person's share of the way out from `center`: 0 at the centre, 1 for the farthest. */
export function paperRevealShares(layout: PaperLayout, ids: readonly string[], center: Point3): Map<string, number> {
  const distances = new Map<string, number>();
  let farthest = 0;
  for (const id of ids) {
    const disc = layout.get(id);
    if (!disc) continue;
    const distance = Math.hypot(disc.x - center.x, disc.y - center.y, disc.z - center.z);
    distances.set(id, distance);
    farthest = Math.max(farthest, distance);
  }
  const shares = new Map<string, number>();
  for (const [id, distance] of distances) shares.set(id, farthest > 0 ? distance / farthest : 0);
  return shares;
}

/**
 * How far a Person `share` of the way out has revealed, `seconds` into the
 * reveal, eased from 0 to 1. Nearer Persons start sooner; a time that is not
 * a finite number shows everyone whole (ADR 0011).
 */
export function paperRevealProgress(share: number, seconds: number): number {
  if (!Number.isFinite(seconds)) return 1;
  const start = clamp01(share) * (PAPER_REVEAL_SECONDS - PERSON_REVEAL_SECONDS);
  const t = clamp01((seconds - start) / PERSON_REVEAL_SECONDS);
  return 1 - (1 - t) ** 3;
}

export const PAPER_HINT_SEEN_KEY = 'family-tree-paper-hint-seen';

export function paperHintCopy(coarsePointer: boolean): string {
  return coarsePointer ? 'Drag to rotate · Pinch to zoom' : 'Drag to rotate · Scroll to zoom';
}

/** Whether the hint has been seen; storage that cannot be read counts as seen, so the hint never nags. */
export function readPaperHintSeen(storage: () => Pick<Storage, 'getItem'>): boolean {
  try {
    return storage().getItem(PAPER_HINT_SEEN_KEY) !== null;
  } catch {
    return true;
  }
}

export function writePaperHintSeen(storage: () => Pick<Storage, 'setItem'>): void {
  try {
    storage().setItem(PAPER_HINT_SEEN_KEY, '1');
  } catch (e) {
    console.warn('[paperIntro] Failed to save the hint as seen:', e);
  }
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
