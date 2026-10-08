import { createContext, useContext } from 'react';
import {
  CANVAS_MODE_STORAGE_KEY,
  PAPER_COLOUR_STORAGE_KEY,
  resolveCanvasMode,
  type CanvasMode,
  type CanvasModePreference,
} from '../lib/canvasMode';
import { GRAYSCALE_PAIR, type PaperPair } from '../theme/paperPair';

export interface CanvasModeController extends CanvasModePreference {
  setMode: (mode: CanvasMode) => void;
}

export interface CurrentPaperPair {
  pair: PaperPair;
}

export const CanvasModeContext = createContext<CanvasModeController | null>(null);
export const CurrentPaperPairContext = createContext<CurrentPaperPair>({ pair: GRAYSCALE_PAIR });

export function readStoredCanvasMode(): CanvasModePreference {
  try {
    return resolveCanvasMode({
      mode: localStorage.getItem(CANVAS_MODE_STORAGE_KEY),
      paperColour: localStorage.getItem(PAPER_COLOUR_STORAGE_KEY),
    });
  } catch (e) {
    console.warn('[useCanvasMode] Failed to load stored preference:', e);
    return resolveCanvasMode({ mode: null, paperColour: null });
  }
}

export function writeStoredCanvasMode(mode: CanvasMode): void {
  try {
    localStorage.setItem(CANVAS_MODE_STORAGE_KEY, mode);
  } catch (e) {
    console.warn('[useCanvasMode] Failed to save preference:', e);
  }
}

export function useCanvasMode(): CanvasModeController {
  const controller = useContext(CanvasModeContext);
  if (!controller) throw new Error('useCanvasMode must be used inside CanvasModeProvider');
  return controller;
}

export function useCurrentPaperPair(): CurrentPaperPair {
  return useContext(CurrentPaperPairContext);
}
