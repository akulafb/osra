// Permission utilities for 1-degree network access control
// These helpers check if the current user can perform actions on specific nodes

import type { FamilyNode, FamilyLink } from '../types/graph';
import { get1DegreeNodeIds } from './familyGraph';

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
 * Check if target node is within 1-degree of user's node
 * 1-degree = self, parents, children, siblings, spouse, stepparents, stepchildren, co-parents
 */
export function isWithin1Degree(
  targetNodeId: string,
  userNodeId: string,
  links: FamilyLink[]
): boolean {
  if (!userNodeId || !targetNodeId || !links || !Array.isArray(links)) return false;
  return get1DegreeNodeIds(userNodeId, links).includes(targetNodeId);
}

/**
 * Get all nodes within 1-degree of the user's bound node (sync version)
 */
export function get1DegreeNodesSync(
  userNodeId: string | null | undefined,
  _nodes: FamilyNode[], // Kept for backwards compatibility
  links: FamilyLink[]
): string[] {
  return get1DegreeNodeIds(userNodeId, links);
}
