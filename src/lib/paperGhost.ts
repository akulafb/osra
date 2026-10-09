import { placeNewcomer, type PaperDisc, type PaperLayout } from './paperLayout';
import { NO_OTHER_PARENT, otherParentChoice, resolveOtherParent } from './otherParent';
import { relativeToKinshipLinks } from './treeRecord';
import type { FamilyGraph, RelativeDirection } from '../types/graph';

const GHOST_ID = 'paper-ghost-preview';

/**
 * Where a relative added to `anchorId` will land in the Paper layout, and at
 * what size. Null when the anchor is not placed, or when the card offers a
 * choice of other parent: the pick can change while the preview stays put.
 * `shown` is the layout on screen when it differs from the still one (a
 * search packs the matches into a cluster): the landing moves with the
 * anchor, so the preview stays beside the disc it was opened from.
 */
export function paperGhostLanding(
  layout: PaperLayout,
  graph: FamilyGraph,
  anchorId: string,
  relation: RelativeDirection,
  shown: PaperLayout = layout
): PaperDisc | null {
  const still = layout.get(anchorId);
  const drawn = shown.get(anchorId);
  if (!still || !drawn) return null;
  const choice = relation === 'child' ? otherParentChoice(anchorId, graph.links) : NO_OTHER_PARENT;
  if (choice.kind === 'choose') return null;
  const otherParentId = resolveOtherParent(choice, null);
  const otherParent = otherParentId ? graph.nodes.find((n) => n.id === otherParentId) ?? { id: otherParentId } : null;
  const pending = relativeToKinshipLinks(anchorId, GHOST_ID, relation, graph.links, undefined, otherParent);
  const landing = placeNewcomer(layout, GHOST_ID, [...graph.links, ...pending]).get(GHOST_ID);
  if (!landing) return null;
  if (drawn === still) return landing;
  return { ...landing, x: landing.x + drawn.x - still.x, y: landing.y + drawn.y - still.y, z: landing.z + drawn.z - still.z };
}
