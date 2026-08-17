// Permission utilities for 1-degree network access control
// These helpers check if the current user can perform actions on specific nodes

import { FamilyNode, FamilyLink } from '../types/graph';
export type { FamilyNode, FamilyLink };

export type RelationshipType = 'self' | 'parent' | 'child' | 'spouse' | 'sibling' | 'divorce' | 'unrelated';

/**
 * SYNCHRONOUS version: Check if current user can edit a specific node
 * This uses cached data (from graph) which has 'source'/'target' format
 * Rules:
 * - Admin can edit any node
 * - User can edit nodes within their 1-degree network
 */
export function canEdit(
  nodeId: string,
  userNodeId: string | null | undefined,
  isAdmin: boolean,
  links: FamilyLink[]
): boolean {
  // Admins can edit anything
  if (isAdmin) return true;

  // If user has no node binding, they can't edit anything
  if (!userNodeId) return false;

  // User can always edit their own node
  if (nodeId === userNodeId) return true;

  // Check if node is within 1-degree network
  return isWithin1Degree(nodeId, userNodeId, links);
}

/**
 * SYNCHRONOUS version: Check if user can manage invites for a node
 * Same rules as canEdit - 1-degree network + admin
 */
export function canManageInvites(
  nodeId: string,
  userNodeId: string | null | undefined,
  isAdmin: boolean,
  links: FamilyLink[]
): boolean {
  // Same permissions as edit - 1-degree network control
  return canEdit(nodeId, userNodeId, isAdmin, links);
}

/**
 * Safely extracts an ID from a link property (handles string or object)
 */
function getSafeId(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.id) return val.id;
  return null;
}

/**
 * Check if target node is within 1-degree of user's node
 * 1-degree = self, parents, children, siblings, spouse
 */
export function isWithin1Degree(
  targetNodeId: string,
  userNodeId: string,
  links: FamilyLink[]
): boolean {
  if (!links || !Array.isArray(links)) return false;
  
  // Check for direct connection via any link type
  const hasDirectLink = links.some((link: any) => {
    const s = getSafeId(link.source);
    const t = getSafeId(link.target);
    return (s === userNodeId && t === targetNodeId) || (t === userNodeId && s === targetNodeId);
  });

  if (hasDirectLink) return true;

  // Check for siblings (share a parent)
  const userParents = getParents(userNodeId, links);
  const targetParents = getParents(targetNodeId, links);
  const sharesParent = userParents.some(parent => targetParents.includes(parent));

  if (sharesParent) return true;

  // NEW: Check for parent's spouse (e.g. mother if I'm linked to father)
  const isParentsSpouse = userParents.some(parentId => 
    links.some((link: any) => {
      const s = getSafeId(link.source);
      const t = getSafeId(link.target);
      return (link.type === 'marriage' || link.type === 'divorce') && 
             ((s === parentId && t === targetNodeId) || (t === parentId && s === targetNodeId));
    })
  );
  if (isParentsSpouse) return true;

  // NEW: Check for child's parent (e.g. spouse who isn't explicitly linked to me but is linked to my child)
  const userChildren = getChildren(userNodeId, links);
  const isChildsParent = userChildren.some(childId => 
    links.some((link: any) => {
      const s = getSafeId(link.source);
      const t = getSafeId(link.target);
      return link.type === 'parent' && t === childId && s === targetNodeId;
    })
  );
  if (isChildsParent) return true;

  // NEW: Spouse's child (e.g. child of my spouse who isn't explicitly linked to me)
  const userSpouses = links.filter((link: any) => {
    const s = getSafeId(link.source);
    const t = getSafeId(link.target);
    return (link.type === 'marriage' || link.type === 'divorce') && 
           (s === userNodeId || t === userNodeId);
  }).map((link: any) => {
    const s = getSafeId(link.source);
    const t = getSafeId(link.target);
    return s === userNodeId ? t : s;
  });

  const isSpousesChild = userSpouses.some(spouseId => 
    spouseId && links.some((link: any) => {
      const s = getSafeId(link.source);
      const t = getSafeId(link.target);
      return link.type === 'parent' && s === spouseId && t === targetNodeId;
    })
  );
  if (isSpousesChild) return true;

  return false;
}

// Helper: Get parent nodes of a given node
function getParents(nodeId: string, links: FamilyLink[]): string[] {
  if (!links || !Array.isArray(links)) return [];
  return links
    .filter((link: any) => {
      const t = getSafeId(link.target);
      return t === nodeId && link.type === 'parent';
    })
    .map((link: any) => getSafeId(link.source))
    .filter(Boolean) as string[];
}

// Helper: Get child nodes of a given node
function getChildren(nodeId: string, links: FamilyLink[]): string[] {
  if (!links || !Array.isArray(links)) return [];
  return links
    .filter((link: any) => {
      const s = getSafeId(link.source);
      return s === nodeId && link.type === 'parent';
    })
    .map((link: any) => getSafeId(link.target))
    .filter(Boolean) as string[];
}

/**
 * Get all nodes within 1-degree of the user's bound node (sync version)
 */
export function get1DegreeNodesSync(
  userNodeId: string | null | undefined,
  _nodes: FamilyNode[], // Prefix with underscore to ignore unused
  links: FamilyLink[]
): string[] {
  if (!userNodeId || !links || !Array.isArray(links)) return [];

  const oneDegreeIds = new Set<string>([userNodeId]);

  links.forEach((link: any) => {
    const s = getSafeId(link.source);
    const t = getSafeId(link.target);
    if (s === userNodeId && t) oneDegreeIds.add(t);
    else if (t === userNodeId && s) oneDegreeIds.add(s);
  });

  const userParents = getParents(userNodeId, links);
  userParents.forEach(parentId => {
    // Siblings
    const siblings = getChildren(parentId, links).filter(id => id !== userNodeId);
    siblings.forEach(id => oneDegreeIds.add(id));
    
    // Parent's spouse (marriage or divorce)
    links.forEach((link: any) => {
      if (link.type === 'marriage' || link.type === 'divorce') {
        const s = getSafeId(link.source);
        const t = getSafeId(link.target);
        if (s === parentId && t) oneDegreeIds.add(t);
        else if (t === parentId && s) oneDegreeIds.add(s);
      }
    });
  });

  // NEW: Child's other parent
  const userChildren = getChildren(userNodeId, links);
  userChildren.forEach(childId => {
    links.forEach((link: any) => {
      if (link.type === 'parent') {
        const s = getSafeId(link.source);
        const t = getSafeId(link.target);
        if (t === childId && s && s !== userNodeId) oneDegreeIds.add(s);
      }
    });
  });

  // NEW: Spouse's children
  const userSpouses = links.filter((link: any) => {
    const s = getSafeId(link.source);
    const t = getSafeId(link.target);
    return (link.type === 'marriage' || link.type === 'divorce') && 
           (s === userNodeId || t === userNodeId);
  }).map((link: any) => {
    const s = getSafeId(link.source);
    const t = getSafeId(link.target);
    return s === userNodeId ? t : s;
  });

  userSpouses.forEach(spouseId => {
    if (!spouseId) return;
    const spouseChildren = getChildren(spouseId, links);
    spouseChildren.forEach(id => oneDegreeIds.add(id));
  });

  return Array.from(oneDegreeIds);
}
