import { placeNewcomer, type PaperDisc, type PaperLayout } from './paperLayout';
import { NO_OTHER_PARENT, otherParentChoice, resolveOtherParent } from './otherParent';
import { relativeToKinshipLinks } from './treeRecord';
import type { FamilyGraph, RelativeDirection } from '../types/graph';

const GHOST_ID = 'paper-ghost-preview';

/**
 * Where a relative added to `anchorId` will land in the Paper layout, and at
 * what size. Null when the anchor is not placed, or when the card offers a
 * choice of other parent: the pick can change while the preview stays put.
 */
export function paperGhostLanding(
  layout: PaperLayout,
  graph: FamilyGraph,
  anchorId: string,
  relation: RelativeDirection
): PaperDisc | null {
  if (!layout.has(anchorId)) return null;
  const choice = relation === 'child' ? otherParentChoice(anchorId, graph.links) : NO_OTHER_PARENT;
  if (choice.kind === 'choose') return null;
  const otherParentId = resolveOtherParent(choice, null);
  const otherParent = otherParentId ? graph.nodes.find((n) => n.id === otherParentId) ?? { id: otherParentId } : null;
  const pending = relativeToKinshipLinks(anchorId, GHOST_ID, relation, graph.links, undefined, otherParent);
  return placeNewcomer(layout, GHOST_ID, [...graph.links, ...pending]).get(GHOST_ID) ?? null;
}
