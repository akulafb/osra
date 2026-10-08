import { useEffect, useState } from 'react';
import { layoutPaperTree, type PaperLayout } from '../lib/paperLayout';
import type { FamilyGraph } from '../types/graph';

/**
 * The Paper layout to use next: the one already made, else a new one once
 * Paper 3D needs it. Made once per load, so edits and mode switches never move
 * anyone (ADR 0014).
 */
export function resolvePaperLayout(
  current: PaperLayout | null,
  graph: FamilyGraph | null,
  needed: boolean
): PaperLayout | null {
  if (current || !needed || !graph) return current;
  return layoutPaperTree(graph);
}

/**
 * Called from `FamilyTree`, which stays mounted, so the layout outlives a
 * switch to Cosmos or 2D. It is made in an effect, after the loaded gate has
 * painted.
 */
export function usePaperLayout(graph: FamilyGraph | null, needed: boolean): PaperLayout | null {
  const [layout, setLayout] = useState<PaperLayout | null>(null);

  useEffect(() => {
    if (layout || !needed || !graph) return;
    let timeout = 0;
    const frame = requestAnimationFrame(() => {
      timeout = window.setTimeout(() => setLayout(resolvePaperLayout(null, graph, true)));
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [layout, graph, needed]);

  return layout;
}
