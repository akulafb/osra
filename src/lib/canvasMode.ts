export type CanvasMode = 'cosmos' | 'paper';
export type PaperColour = 'grayscale' | 'colour';

export interface CanvasModePreference {
  mode: CanvasMode;
  paperColour: PaperColour;
}

export interface StoredCanvasMode {
  mode: string | null;
  paperColour: string | null;
}

export const CANVAS_MODE_STORAGE_KEY = 'family-tree-canvas-mode';
export const PAPER_COLOUR_STORAGE_KEY = 'family-tree-paper-colour';

/**
 * Reads the viewer's raw stored values. Anything but an explicit choice lands on
 * grayscale Paper, so the retired background-theme values never survive.
 */
export function resolveCanvasMode(stored: StoredCanvasMode): CanvasModePreference {
  return {
    mode: stored.mode === 'cosmos' ? 'cosmos' : 'paper',
    paperColour: stored.paperColour === 'colour' ? 'colour' : 'grayscale',
  };
}
