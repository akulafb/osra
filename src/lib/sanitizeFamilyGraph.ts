import type { FamilyLink, FamilyNode } from '../types/graph';
import { getLinkEndpoints } from './familyGraph';

/**
 * Drop links whose source or target is not present in `nodes`.
 * Prevents force-graph / d3 from throwing "node not found" when the DB has
 * inconsistent rows (e.g. link after deleted node, or partial visibility).
 */
export function dropOrphanLinks(nodes: readonly FamilyNode[], links: readonly FamilyLink[]): FamilyLink[] {
  const ids = new Set(nodes.map((n) => n.id));
  return links.filter((l) => {
    const { sourceId, targetId } = getLinkEndpoints(l);
    return ids.has(sourceId) && ids.has(targetId);
  });
}
