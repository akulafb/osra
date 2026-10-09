import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';
import { getChildren } from './familyGraph';
import { filterGraphDataFor3D } from './filterGraphData';
import { paperLines, type PaperLayout, type PaperLine } from './paperLayout';

export interface PaperShown {
  nodes: FamilyNode[];
  lines: PaperLine[];
}

export function paperCollapsible(links: readonly FamilyLink[], id: string): boolean {
  return getChildren(id, links).length > 0;
}

export type PaperPersonClick = 'select' | 'pick' | 'deselect-later' | 'ignore';

/** A double-click arrives as click, click (detail 2), dblclick. */
export function paperPersonClick({
  id,
  detail,
  selectedId,
  connecting,
}: {
  id: string;
  detail: number;
  selectedId: string | null;
  connecting: boolean;
}): PaperPersonClick {
  if (detail > 1) return 'ignore';
  if (connecting) return 'pick';
  return id === selectedId ? 'deselect-later' : 'select';
}

/** What Paper 3D draws: the placed Persons left after the collapse and the VISIBILITY filter, each in its fixed place. */
export function paperShown(
  graph: FamilyGraph,
  layout: PaperLayout | null,
  collapsed: Set<string>,
  visibleClusters: ReadonlySet<string>,
  clusters: readonly string[]
): PaperShown {
  if (!layout) return { nodes: [], lines: [] };
  const visible = filterGraphDataFor3D(graph, collapsed, visibleClusters, clusters);
  const nodes = visible.nodes.filter((n) => layout.has(n.id));
  return { nodes, lines: paperLines(nodes, visible.links) };
}
