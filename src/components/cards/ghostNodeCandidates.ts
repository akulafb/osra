import { FamilyNode } from '../../types/graph';
import { nodeSearchHaystack } from '../../utils/nodeDisplayName';

/** Shortest query that triggers a duplicate lookup — one letter matches too much. */
export const MIN_QUERY_LENGTH = 2;

/** Most candidates shown at once, so the dropdown never overruns the card. */
export const DUPLICATE_CANDIDATE_LIMIT = 4;

/**
 * Existing people who might be the one the user is about to create.
 *
 * Matches on first name and either family cluster, so "badran" finds the whole
 * branch rather than only people literally named Badran.
 */
export function findDuplicateCandidates(
  query: string,
  existingNodes: FamilyNode[],
  anchorNodeId: string
): FamilyNode[] {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY_LENGTH) return [];

  return existingNodes
    .filter(
      (node) =>
        node.id !== anchorNodeId && nodeSearchHaystack(node).toLowerCase().includes(q)
    )
    .slice(0, DUPLICATE_CANDIDATE_LIMIT);
}
