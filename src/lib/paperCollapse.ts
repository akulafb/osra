import type { FamilyGraph, FamilyLink, FamilyNode } from '../types/graph';
import { getNodeId } from './familyGraph';
import { filterGraphDataFor3D } from './filterGraphData';
import { paperLines, type PaperLayout, type PaperLine } from './paperLayout';

export interface PaperShown {
  nodes: FamilyNode[];
  lines: PaperLine[];
}

/** Whether a double-click collapses this Person: only a parent has descendants to hide. */
export function paperCollapsible(links: readonly FamilyLink[], id: string): boolean {
  return links.some((l) => l.type === 'parent' && getNodeId(l.source) === id);
}

/**
 * The Persons and lines Paper 3D draws: the placed Persons left after the
 * collapse and the VISIBILITY filter, as in Cosmos. Each keeps its place in
 * the fixed layout, so hiding and showing moves nobody (ADR 0014).
 */
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
