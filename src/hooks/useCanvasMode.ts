import { createContext, useContext } from 'react';
import {
  CANVAS_MODE_STORAGE_KEY,
  PAPER_COLOUR_STORAGE_KEY,
  resolveCanvasMode,
  type CanvasMode,
  type CanvasModePreference,
  type PaperColour,
} from '../lib/canvasMode';
import { GRAYSCALE_PAIR, PAPER_PAIRS, type PaperPair } from '../theme/paperPair';

export interface FocusedPerson {
  familyCluster?: string;
}

export interface CanvasModeController extends CanvasModePreference {
  setMode: (mode: CanvasMode) => void;
  setPaperColour: (paperColour: PaperColour) => void;
  setFocusedPerson: (person: FocusedPerson | null) => void;
}

export interface CurrentPaperPair {
  pair: PaperPair;
  target: PaperPair;
}

export const CanvasModeContext = createContext<CanvasModeController | null>(null);
export const CurrentPaperPairContext = createContext<CurrentPaperPair>({
  pair: GRAYSCALE_PAIR,
  target: GRAYSCALE_PAIR,
});

const LAST_OVERVIEW_PAIR_KEY = 'family-tree-paper-overview-pair';

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

export function writeStoredPaperColour(paperColour: PaperColour): void {
  try {
    localStorage.setItem(PAPER_COLOUR_STORAGE_KEY, paperColour);
  } catch (e) {
    console.warn('[useCanvasMode] Failed to save colour setting:', e);
  }
}

export function readLastOverviewPair(): PaperPair | null {
  try {
    const stored = sessionStorage.getItem(LAST_OVERVIEW_PAIR_KEY);
    return stored === null ? null : (PAPER_PAIRS[Number(stored)] ?? null);
  } catch {
    return null;
  }
}

export function writeLastOverviewPair(pair: PaperPair): void {
  try {
    sessionStorage.setItem(LAST_OVERVIEW_PAIR_KEY, String(PAPER_PAIRS.indexOf(pair)));
  } catch (e) {
    console.warn('[useCanvasMode] Failed to save overview pair:', e);
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
