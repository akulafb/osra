import { useEffect, useState } from 'react';
import { layoutPaperTree, type PaperLayout } from '../lib/paperLayout';
import type { FamilyGraph } from '../types/graph';

export type PaperLayoutState =
  | { status: 'waiting' }
  | { status: 'ready'; layout: PaperLayout }
  | { status: 'failed' };

/**
 * Whether to make the Paper layout now: only once, when Paper 3D first needs
 * it, so edits and mode switches never move anyone (ADR 0014).
 */
export function needsPaperLayout(
  state: PaperLayoutState,
  graph: FamilyGraph | null,
  needed: boolean
): graph is FamilyGraph {
  return state.status === 'waiting' && needed && !!graph;
}

export function makePaperLayout(
  graph: FamilyGraph,
  layOut: (graph: FamilyGraph) => PaperLayout = layoutPaperTree
): PaperLayoutState {
  try {
    return { status: 'ready', layout: layOut(graph) };
  } catch (error) {
    console.error('[usePaperLayout] Paper layout failed:', error);
    return { status: 'failed' };
  }
}

/** Made after the loaded gate has painted. */
export function usePaperLayout(graph: FamilyGraph | null, needed: boolean): PaperLayoutState {
  const [state, setState] = useState<PaperLayoutState>({ status: 'waiting' });

  useEffect(() => {
    if (!needsPaperLayout(state, graph, needed)) return;
    let timeout = 0;
    const frame = requestAnimationFrame(() => {
      timeout = window.setTimeout(() => setState(makePaperLayout(graph)));
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [state, graph, needed]);

  return state;
}
