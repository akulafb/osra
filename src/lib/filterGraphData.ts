import type { FamilyGraph, FamilyLink } from '../types/graph';
import { getNodeId } from './familyGraph';

/**
 * Filter graph data by preset (cluster) and collapsed nodes.
 * Used by 2D view and by FamilyTree for search scope.
 */
export function filterGraphData(
  graphData: FamilyGraph,
  collapsedNodes: Set<string>,
  activePreset?: string | null
): FamilyGraph {
  let nodes = graphData.nodes;
  let links = graphData.links;

  const getLinkKey = (sourceId: string, targetId: string, type: string) =>
    `${sourceId}|${targetId}|${type}`;

  if (activePreset) {
    nodes = nodes.filter(
      (n) => n.familyCluster === activePreset || n.maternalFamilyCluster === activePreset
    );
    const nodeIds = new Set(nodes.map((n) => n.id));
    const visibleLinkKeys = new Set<string>();

    links = links.filter((l) => {
      const sourceId = getNodeId(l.source);
      const targetId = getNodeId(l.target);
      if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return false;

      const key = getLinkKey(sourceId, targetId, l.type);
      if (visibleLinkKeys.has(key)) return false;
      visibleLinkKeys.add(key);
      return true;
    });

    // Spouse / ex-spouse edges (marriage and divorce) — when one co-parent is outside the
    // preset, parent→child edges are dropped by the filter; reconnect via the co-parent who
    // is still in scope (applies to any child cluster mix, not only "maternal-only" rows).
    const spouseByNode = new Map<string, string>();
    graphData.links.forEach((l) => {
      if (l.type === 'marriage' || l.type === 'divorce') {
        const a = getNodeId(l.source);
        const b = getNodeId(l.target);
        if (a && b) {
          spouseByNode.set(a, b);
          spouseByNode.set(b, a);
        }
      }
    });
    graphData.links.forEach((l) => {
      if (l.type !== 'parent') return;
      const parentId = getNodeId(l.source);
      const childId = getNodeId(l.target);
      if (!parentId || !childId || !nodeIds.has(childId)) return;
      if (nodeIds.has(parentId)) return;

      const altParentId = spouseByNode.get(parentId);
      if (!altParentId || !nodeIds.has(altParentId)) return;

      const key = getLinkKey(altParentId, childId, 'parent');
      if (visibleLinkKeys.has(key)) return;

      visibleLinkKeys.add(key);
      const parentRole =
        l.parentRole === 'father'
          ? ('mother' as const)
          : l.parentRole === 'mother'
            ? ('father' as const)
            : undefined;
      links.push({
        source: altParentId,
        target: childId,
        type: 'parent',
        ...(parentRole ? { parentRole } : {}),
      });
    });
  }

  return applyCollapsedNodesFilter(nodes, links, collapsedNodes);
}

function applyCollapsedNodesFilter(
  nodes: FamilyGraph['nodes'],
  links: FamilyGraph['links'],
  collapsedNodes: Set<string>
): FamilyGraph {
  if (collapsedNodes.size === 0) return { nodes, links };

  const hiddenNodes = new Set<string>();

  const getDescendants = (nodeId: string): string[] => {
    const descendants: string[] = [];
    const queue = [nodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const children = links
        .filter((l) => {
          const sourceId = getNodeId(l.source);
          return sourceId === currentId && l.type === 'parent';
        })
        .map((l) => getNodeId(l.target));

      descendants.push(...children);
      queue.push(...children);
    }

    return descendants;
  };

  collapsedNodes.forEach((id) => {
    getDescendants(id).forEach((dId) => hiddenNodes.add(dId));
  });

  return {
    nodes: nodes.filter((n) => !hiddenNodes.has(n.id)),
    links: links.filter((l) => {
      const sourceId = getNodeId(l.source);
      const targetId = getNodeId(l.target);
      return !hiddenNodes.has(sourceId) && !hiddenNodes.has(targetId);
    }),
  };
}

function allClustersVisible(
  visibleClusters: ReadonlySet<string>,
  allClusterNames: readonly string[]
): boolean {
  if (allClusterNames.length === 0) return true;
  if (visibleClusters.size !== allClusterNames.length) return false;
  return allClusterNames.every((c) => visibleClusters.has(c));
}

/**
 * 3D-only: filter by union of selected **paternal** family clusters (`familyCluster` only — same
 * field as the visibility checkboxes). Does not match `maternalFamilyCluster`, so children whose
 * surname line is another family (e.g. mother’s cluster) are excluded when only her line is selected.
 * 2D {@link filterGraphData} still uses paternal OR maternal for its single-preset view.
 * Then collapsed subtrees. Empty `visibleClusters` → empty graph; all names selected → full graph.
 */
export function filterGraphDataFor3D(
  graphData: FamilyGraph,
  collapsedNodes: Set<string>,
  visibleClusters: ReadonlySet<string>,
  allClusterNames: readonly string[]
): FamilyGraph {
  if (!graphData?.nodes) return { nodes: [], links: [] };

  if (allClusterNames.length === 0) {
    return applyCollapsedNodesFilter(graphData.nodes, graphData.links, collapsedNodes);
  }

  if (visibleClusters.size === 0) {
    return { nodes: [], links: [] };
  }

  if (allClustersVisible(visibleClusters, allClusterNames)) {
    return applyCollapsedNodesFilter(graphData.nodes, graphData.links, collapsedNodes);
  }

  const V = visibleClusters;
  let nodes = graphData.nodes;
  let links = graphData.links;

  const getLinkKey = (sourceId: string, targetId: string, type: string) =>
    `${sourceId}|${targetId}|${type}`;

  nodes = nodes.filter((n) => !!(n.familyCluster && V.has(n.familyCluster)));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const visibleLinkKeys = new Set<string>();

  links = links.filter((l) => {
    const sourceId = getNodeId(l.source);
    const targetId = getNodeId(l.target);
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return false;

    const key = getLinkKey(sourceId, targetId, l.type);
    if (visibleLinkKeys.has(key)) return false;
    visibleLinkKeys.add(key);
    return true;
  });

  return applyCollapsedNodesFilter(nodes, links, collapsedNodes);
}

/**
 * Get visible nodes for 3D view (filtered by collapsed only; no preset).
 */
export function getVisibleNodes3D(
  graphData: FamilyGraph,
  collapsedNodes: Set<string>
): FamilyGraph['nodes'] {
  if (!graphData?.nodes) return [];

  const hiddenNodes = new Set<string>();
  const links = graphData.links as FamilyLink[];

  const getDescendantIds = (nodeId: string): string[] => {
    const descendants: string[] = [];
    const queue = [nodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const children = links
        .filter((l) => getNodeId(l.source) === currentId && l.type === 'parent')
        .map((l) => getNodeId(l.target));

      descendants.push(...children);
      queue.push(...children);
    }
    return descendants;
  };

  collapsedNodes.forEach((id) => {
    getDescendantIds(id).forEach((dId) => hiddenNodes.add(dId));
  });

  return graphData.nodes.filter((n) => !hiddenNodes.has(n.id));
}
