export interface PaperPair {
  paper: string;
  ink: string;
}

export const GRAYSCALE_PAIR: PaperPair = { paper: '#ececea', ink: '#1c1c1c' };

/** The one accent Paper draws on top of any pair: FIND ME, the current search match, errors. */
export const PAPER_ACCENT = '#c8361d';
