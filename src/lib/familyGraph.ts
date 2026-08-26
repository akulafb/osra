import type { FamilyNode, FamilyLink, LinkEndpoint, RelativeDirection } from '../types/graph';
export type { FamilyNode, FamilyLink, LinkEndpoint, RelativeDirection };

/**
 * Safely extracts a node ID from a string, a FamilyNode, a LiveNodePosition,
 * or any object containing an `id` property. Returns empty string if invalid.
 */
export function getNodeId(nodeOrEndpoint: unknown): string {
  if (!nodeOrEndpoint) return '';
  if (typeof nodeOrEndpoint === 'string') return nodeOrEndpoint;
  if (typeof nodeOrEndpoint === 'object' && nodeOrEndpoint !== null && 'id' in nodeOrEndpoint) {
    const idVal = (nodeOrEndpoint as { id?: unknown }).id;
    if (idVal === null || idVal === undefined) return '';
    return String(idVal);
  }
  return '';
}

/**
 * Normalizes link endpoints into resolved string IDs.
 */
export function getLinkEndpoints(link: FamilyLink): { sourceId: string; targetId: string } {
  return {
    sourceId: getNodeId(link?.source),
    targetId: getNodeId(link?.target),
  };
}

/**
 * Checks if two nodes are directly connected by a link of a given type (or any type if omitted).
 */
export function isDirectlyLinked(
  links: FamilyLink[],
  aId: string,
  bId: string,
  type?: FamilyLink['type']
): boolean {
  if (!links || !Array.isArray(links) || !aId || !bId) return false;
  return links.some(link => {
    if (type !== undefined && link.type !== type) return false;
    const { sourceId, targetId } = getLinkEndpoints(link);
    return (sourceId === aId && targetId === bId) || (sourceId === bId && targetId === aId);
  });
}

/**
 * Returns the parent IDs for a given node.
 */
export function getParents(nodeId: string, links: FamilyLink[]): string[] {
  if (!nodeId || !links || !Array.isArray(links)) return [];
  const parentIds = new Set<string>();
  links.forEach(link => {
    if (link.type === 'parent') {
      const { sourceId, targetId } = getLinkEndpoints(link);
      if (targetId === nodeId && sourceId) {
        parentIds.add(sourceId);
      }
    }
  });
  return Array.from(parentIds);
}

/**
 * Returns the child IDs for a given node.
 */
export function getChildren(nodeId: string, links: FamilyLink[]): string[] {
  if (!nodeId || !links || !Array.isArray(links)) return [];
  const childIds = new Set<string>();
  links.forEach(link => {
    if (link.type === 'parent') {
      const { sourceId, targetId } = getLinkEndpoints(link);
      if (sourceId === nodeId && targetId) {
        childIds.add(targetId);
      }
    }
  });
  return Array.from(childIds);
}

/**
 * Returns the spouse IDs (marriage or divorce) for a given node.
 */
export function getSpouses(nodeId: string, links: FamilyLink[]): string[] {
  if (!nodeId || !links || !Array.isArray(links)) return [];
  const spouseIds = new Set<string>();
  links.forEach(link => {
    if (link.type === 'marriage' || link.type === 'divorce') {
      const { sourceId, targetId } = getLinkEndpoints(link);
      if (sourceId === nodeId && targetId && targetId !== nodeId) {
        spouseIds.add(targetId);
      } else if (targetId === nodeId && sourceId && sourceId !== nodeId) {
        spouseIds.add(sourceId);
      }
    }
  });
  return Array.from(spouseIds);
}

/**
 * Returns the sibling IDs (sharing at least one parent) for a given node.
 */
export function getSiblings(nodeId: string, links: FamilyLink[]): string[] {
  if (!nodeId || !links || !Array.isArray(links)) return [];
  const parents = getParents(nodeId, links);
  const siblingIds = new Set<string>();
  parents.forEach(parentId => {
    const children = getChildren(parentId, links);
    children.forEach(childId => {
      if (childId !== nodeId) {
        siblingIds.add(childId);
      }
    });
  });
  return Array.from(siblingIds);
}

/** 1-Degree Kinship category for immediate network */
export type KinshipDegree1Category = RelativeDirection;

export interface Degree1Relative {
  nodeId: string;
  relationship: KinshipDegree1Category;
  /** True for blended family connections (stepparent, stepchild, co-parent) */
  isBlended?: boolean;
}

/**
 * Computes all 1-degree relatives for an anchor node:
 * - Direct parents and stepparents (parent's spouse) -> 'parent'
 * - Direct children and stepchildren (spouse's child) -> 'child'
 * - Direct spouses and co-parents (child's other parent) -> 'spouse'
 * - Siblings (shared parent) -> 'sibling'
 */
export function get1DegreeRelatives(
  anchorNodeId: string,
  links: FamilyLink[]
): Degree1Relative[] {
  if (!anchorNodeId || !links || !Array.isArray(links)) return [];

  const relativesMap = new Map<string, Degree1Relative>();

  // 1. Direct parents
  const parents = getParents(anchorNodeId, links);
  parents.forEach(pId => {
    if (pId !== anchorNodeId) {
      relativesMap.set(pId, { nodeId: pId, relationship: 'parent', isBlended: false });
    }
  });

  // 2. Direct children
  const children = getChildren(anchorNodeId, links);
  children.forEach(cId => {
    if (cId !== anchorNodeId && !relativesMap.has(cId)) {
      relativesMap.set(cId, { nodeId: cId, relationship: 'child', isBlended: false });
    }
  });

  // 3. Direct spouses (marriage or divorce)
  const spouses = getSpouses(anchorNodeId, links);
  spouses.forEach(sId => {
    if (sId !== anchorNodeId && !relativesMap.has(sId)) {
      relativesMap.set(sId, { nodeId: sId, relationship: 'spouse', isBlended: false });
    }
  });

  // 4. Siblings (sharing at least one parent)
  const siblings = getSiblings(anchorNodeId, links);
  siblings.forEach(sibId => {
    if (sibId !== anchorNodeId && !relativesMap.has(sibId)) {
      relativesMap.set(sibId, { nodeId: sibId, relationship: 'sibling', isBlended: false });
    }
  });

  // 5. Stepparents (parent's spouse)
  parents.forEach(pId => {
    const parentSpouses = getSpouses(pId, links);
    parentSpouses.forEach(psId => {
      if (psId !== anchorNodeId && !relativesMap.has(psId)) {
        relativesMap.set(psId, { nodeId: psId, relationship: 'parent', isBlended: true });
      }
    });
  });

  // 6. Stepchildren (spouse's child)
  spouses.forEach(sId => {
    const spouseChildren = getChildren(sId, links);
    spouseChildren.forEach(scId => {
      if (scId !== anchorNodeId && !relativesMap.has(scId)) {
        relativesMap.set(scId, { nodeId: scId, relationship: 'child', isBlended: true });
      }
    });
  });

  // 7. Co-parents (child's other parent)
  children.forEach(cId => {
    const childParents = getParents(cId, links);
    childParents.forEach(cpId => {
      if (cpId !== anchorNodeId && !relativesMap.has(cpId)) {
        relativesMap.set(cpId, { nodeId: cpId, relationship: 'spouse', isBlended: true });
      }
    });
  });

  return Array.from(relativesMap.values());
}

/**
 * Returns the set of node IDs in the anchor's 1-degree network (including the anchor).
 */
export function get1DegreeNodeIds(
  anchorNodeId: string | null | undefined,
  links: FamilyLink[]
): string[] {
  if (!anchorNodeId || !links || !Array.isArray(links)) return [];
  const relatives = get1DegreeRelatives(anchorNodeId, links);
  const ids = new Set<string>([anchorNodeId, ...relatives.map(r => r.nodeId)]);
  return Array.from(ids);
}
