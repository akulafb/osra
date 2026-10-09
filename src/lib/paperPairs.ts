import { mixOklab } from './colourBlend';
import { easeInOutQuad } from './paperEasing';
import { GRAYSCALE_PAIR, PAPER_PAIRS, type PaperPair } from '../theme/paperPair';
import { hashCluster } from '../utils/familyColors';
import type { CanvasMode, PaperColour } from './canvasMode';

export const PAIR_FADE_MS = 400;

export function pairForFamily(familyCluster: string): PaperPair {
  return PAPER_PAIRS[Math.abs(hashCluster(familyCluster)) % PAPER_PAIRS.length];
}

/** The pair the scene fades to: the focused Person's family pair in Paper colour, else the overview pair; grayscale otherwise. */
export function paperTargetPair({
  mode,
  paperColour,
  focused,
  overview,
}: {
  mode: CanvasMode;
  paperColour: PaperColour;
  focused: { familyCluster?: string } | null;
  overview: PaperPair;
}): PaperPair {
  if (mode !== 'paper' || paperColour === 'grayscale') return GRAYSCALE_PAIR;
  return focused?.familyCluster ? pairForFamily(focused.familyCluster) : overview;
}

export function drawOverviewPair(previous: PaperPair | null, random: () => number = Math.random): PaperPair {
  const choices = PAPER_PAIRS.filter((pair) => pair !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}

export function mixPair(from: PaperPair, to: PaperPair, t: number): PaperPair {
  return {
    paper: mixOklab(from.paper, to.paper, t),
    ink: mixOklab(from.ink, to.ink, t),
    accent: mixOklab(from.accent, to.accent, t),
  };
}

export interface PairFade {
  from: PaperPair;
  to: PaperPair;
  startedAt: number;
}

export function pairAt(fade: PairFade, now: number): PaperPair {
  const t = Math.min(1, Math.max(0, (now - fade.startedAt) / PAIR_FADE_MS));
  if (t === 1) return fade.to;
  return mixPair(fade.from, fade.to, easeInOutQuad(t));
}
