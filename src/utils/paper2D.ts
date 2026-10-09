import type { Emphasis } from '../lib/focusEmphasis';

const DIMMED = 0.4;

export const PAPER_2D_OPACITY: Record<Emphasis, number> = {
  normal: 1,
  hovered: 1,
  focused: 1,
  relative: 1,
  dimmed: DIMMED,
  ghost: 0.18,
  // Below ghost: a search non-match never outshines a match the focus ghosts.
  hidden: 0.12,
};
