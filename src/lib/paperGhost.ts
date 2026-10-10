import { placeNewcomer, type PaperDisc, type PaperLayout } from './paperLayout';
import { resolveOtherParentFor } from './otherParent';
import { relativeToKinshipLinks } from './treeRecord';
import type { FamilyGraph, RelativeDirection } from '../types/graph';

const GHOST_ID = 'paper-ghost-preview';

/**
 * Where a relative added to `anchorId` will land in the Paper layout, and at
 * what size; null when the anchor is not placed. `otherParentSent` is the
 * other parent the card would send now, resolved as FamilyTree resolves it.
 * `shown` is the layout on screen when it differs from the still one (a
 * search packs the matches into a cluster): the landing moves with the
 * anchor, so the preview stays beside the disc it was opened from.
 */
export function paperGhostLanding(
  layout: PaperLayout,
  graph: FamilyGraph,
  anchorId: string,
  relation: RelativeDirection,
  otherParentSent: string | null,
  shown: PaperLayout = layout
): PaperDisc | null {
  const still = layout.get(anchorId);
  const drawn = shown.get(anchorId);
  if (!still || !drawn) return null;
  const otherParentId = relation === 'child' ? resolveOtherParentFor(graph.links, anchorId, otherParentSent) : null;
  const otherParent = otherParentId ? graph.nodes.find((n) => n.id === otherParentId) ?? { id: otherParentId } : null;
  const pending = relativeToKinshipLinks(anchorId, GHOST_ID, relation, graph.links, undefined, otherParent);
  const landing = placeNewcomer(layout, GHOST_ID, [...graph.links, ...pending]).get(GHOST_ID);
  if (!landing) return null;
  if (drawn === still) return landing;
  return { ...landing, x: landing.x + drawn.x - still.x, y: landing.y + drawn.y - still.y, z: landing.z + drawn.z - still.z };
}
