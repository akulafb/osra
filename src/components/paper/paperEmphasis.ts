import * as THREE from 'three';
import type { Emphasis } from '../../lib/focusEmphasis';
import type { PaperLayout } from '../../lib/paperLayout';
import type { Point3 } from '../../lib/paperHover';

/** How much of its ink a Person keeps in each emphasis; the rest fades into the paper. */
export const PAPER_3D_INK: Record<Emphasis, number> = {
  normal: 1,
  hovered: 1,
  focused: 1,
  relative: 1,
  dimmed: 0.5,
  ghost: 1,
  hidden: 1,
};

/**
 * What the scene draws from on each frame. The hover writes it before the
 * other parts of the scene read it, so a hover shows in the frame it is found.
 * Both maps are replaced, never changed in place: a part redraws when one is a
 * new map.
 */
export interface PaperEmphasisState {
  emphasis: ReadonlyMap<string, Emphasis>;
  drift: ReadonlyMap<string, Point3>;
}

export function emptyEmphasisState(): PaperEmphasisState {
  return { emphasis: new Map(), drift: new Map() };
}

export function inkOf(state: PaperEmphasisState, id: string): number {
  return PAPER_3D_INK[state.emphasis.get(id) ?? 'normal'];
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
