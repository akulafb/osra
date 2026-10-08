import type { Emphasis } from '../lib/focusEmphasis';

/** Paper 2D keeps its layout, so `hidden` draws like `dimmed` rather than vanishing. */
export const PAPER_2D_OPACITY: Record<Emphasis, number> = {
  normal: 1,
  hovered: 1,
  focused: 1,
  relative: 1,
  dimmed: 0.4,
  ghost: 0.18,
  hidden: 0.4,
};
