import { hexToRgb } from '../lib/colourBlend';

export interface PaperPair {
  paper: string;
  ink: string;
  accent: string;
}

export const GRAYSCALE_PAIR: PaperPair = { paper: '#ececea', ink: '#1c1c1c', accent: '#c8361d' };

export const PAPER_PAIRS: readonly PaperPair[] = [
  { paper: '#2e675a', ink: '#eceeed', accent: '#eceeed' },
  { paper: '#320b9f', ink: '#e4bf96', accent: '#e4bf96' },
  { paper: '#d44744', ink: '#ffffff', accent: '#ffffff' },
  { paper: '#f7ce50', ink: '#1d1a10', accent: '#1d1a10' },
  { paper: '#1f4bd1', ink: '#f2eee4', accent: '#f2eee4' },
  { paper: '#f2b8c6', ink: '#5a1426', accent: '#5a1426' },
  { paper: '#e8762c', ink: '#1f1208', accent: '#1f1208' },
];

export type PairColour = keyof PaperPair;

/** A pair's colours as CSS values, such as the live pair's `rgb(var(...))`; a PaperPair holds hex. */
export type PairColours = Record<PairColour, string>;

export const PAIR_CSS_VARS: Record<PairColour, string> = {
  paper: '--paper-pair-paper',
  ink: '--paper-pair-ink',
  accent: '--paper-pair-accent',
};

export function pairVar(colour: PairColour, opacity = 1): string {
  const channels = `var(${PAIR_CSS_VARS[colour]}, ${hexToRgb(GRAYSCALE_PAIR[colour]).join(' ')})`;
  return opacity === 1 ? `rgb(${channels})` : `rgb(${channels} / ${opacity})`;
}

export function pairCssValues(pair: PaperPair): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(PAIR_CSS_VARS) as PairColour[]).map((colour) => [
      PAIR_CSS_VARS[colour],
      hexToRgb(pair[colour]).join(' '),
    ])
  );
}

export const livePair = {
  paper: (opacity?: number) => pairVar('paper', opacity),
  ink: (opacity?: number) => pairVar('ink', opacity),
  accent: (opacity?: number) => pairVar('accent', opacity),
};
