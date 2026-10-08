import * as THREE from 'three';
import type { Emphasis } from '../../lib/focusEmphasis';
import type { PaperLayout, PaperLine } from '../../lib/paperLayout';
import type { Point3 } from '../../lib/paperHover';

/** How much of its ink a Person keeps in each emphasis; the rest fades into the paper. */
export const PAPER_3D_INK: Record<Emphasis, number> = {
  normal: 1,
  hovered: 1,
  focused: 1,
  relative: 1,
  dimmed: 0.5,
  ghost: 0.2,
  hidden: 0,
};

/**
 * What the scene draws from on each frame. Both maps are replaced, never
 * changed in place: a part redraws when one is a new map.
 */
export interface PaperEmphasisState {
  emphasis: ReadonlyMap<string, Emphasis>;
  /** Render offsets on top of the layout: the hover lean and the focus wobble. */
  drift: ReadonlyMap<string, Point3>;
  /** The Person under the mouse, selected or not; none for touch. */
  pointedId: string | null;
  /** The focused Person, and the scene clock's time when the focus began. */
  focus: PaperFocus | null;
}

export interface PaperFocus {
  id: string;
  since: number;
}

export function emptyEmphasisState(): PaperEmphasisState {
  return { emphasis: new Map(), drift: new Map(), pointedId: null, focus: null };
}

export function inkOf(state: PaperEmphasisState, id: string): number {
  return PAPER_3D_INK[state.emphasis.get(id) ?? 'normal'];
}

/**
 * The ink each end of a line keeps: its own Person's. A faint Person's line
 * darkens toward a kept relative, so it never crosses their disc as a light wedge.
 */
export function lineEndInks(state: PaperEmphasisState, line: PaperLine): [number, number] {
  return [inkOf(state, line.sourceId), inkOf(state, line.targetId)];
}

/** Where a Person is drawn: their layout place, plus any lean. */
export function placeOf(layout: PaperLayout, drift: ReadonlyMap<string, Point3>, id: string, out: THREE.Vector3): THREE.Vector3 {
  const disc = layout.get(id);
  const lean = drift.get(id);
  if (!disc) return out.set(0, 0, 0);
  return out.set(disc.x + (lean?.x ?? 0), disc.y + (lean?.y ?? 0), disc.z + (lean?.z ?? 0));
}

/** `colour` with `ink` of its ink kept, the rest faded into the paper. */
export function fadeInk(colour: THREE.Color, paper: THREE.Color, ink: number, out: THREE.Color): THREE.Color {
  return out.copy(colour).lerp(paper, 1 - ink);
}
