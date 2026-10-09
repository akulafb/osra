import { useEffect, useState } from 'react';
import { layoutPaperTree, placeNewcomer, type PaperLayout } from '../lib/paperLayout';
import type { FamilyGraph } from '../types/graph';

/** The layout, and the Persons placed into it one by one since it was made. */
export interface ReadyPaperLayout {
  status: 'ready';
  layout: PaperLayout;
  newcomers: ReadonlySet<string>;
}

export type PaperLayoutState =
  | { status: 'waiting' }
  | ReadyPaperLayout
  | { status: 'failed' };

/**
 * Whether to make the Paper layout now: only once, when Paper 3D first needs
 * it, so edits and mode switches never move anyone (ADR 0014).
 */
export function needsPaperLayout(
  state: PaperLayoutState,
  graph: FamilyGraph | null,
  needed: boolean
): boolean {
  return state.status === 'waiting' && needed && !!graph;
}

export function makePaperLayout(
  graph: FamilyGraph,
  layOut: (graph: FamilyGraph) => PaperLayout = layoutPaperTree
): PaperLayoutState {
  try {
    return { status: 'ready', layout: layOut(graph), newcomers: new Set() };
  } catch (error) {
    console.error('[usePaperLayout] Paper layout failed:', error);
    return { status: 'failed' };
  }
}

/**
 * Places each Person the layout has not seen beside their relatives, once,
 * and drops a newcomer who leaves the Working Record again (an aborted
 * Spawn). Persons from the full layout keep their spot whatever happens; the
 * full layout is made again only on the next load.
 */
export function followWorkingRecord(state: ReadyPaperLayout, graph: FamilyGraph): ReadyPaperLayout {
  const present = new Set(graph.nodes.map((n) => n.id));
  const gone = [...state.newcomers].filter((id) => !present.has(id));
  const unseen = [...present].filter((id) => !state.layout.has(id)).sort();
  if (gone.length === 0 && unseen.length === 0) return state;

  const kept = new Map(state.layout);
  const newcomers = new Set(state.newcomers);
  for (const id of gone) {
    kept.delete(id);
    newcomers.delete(id);
  }
  let layout: PaperLayout = kept;
  for (const id of unseen) {
    layout = placeNewcomer(layout, id, graph.links);
    newcomers.add(id);
  }
  return { status: 'ready', layout, newcomers };
}

/** Made after the loaded gate has painted. */
export function usePaperLayout(graph: FamilyGraph | null, needed: boolean): PaperLayoutState {
  const [state, setState] = useState<PaperLayoutState>({ status: 'waiting' });

  useEffect(() => {
    if (!graph || !needsPaperLayout(state, graph, needed)) return;
    let timeout = 0;
    const frame = requestAnimationFrame(() => {
      timeout = window.setTimeout(() => setState(makePaperLayout(graph)));
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [state, graph, needed]);

  useEffect(() => {
    if (!graph) return;
    setState((current) => (current.status === 'ready' ? followWorkingRecord(current, graph) : current));
  }, [graph, state.status]);

  return state;
}
