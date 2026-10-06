import { getLinkEndpoints, getParents, getSpouses } from './familyGraph';
import type { FamilyLink } from '../types/graph';

/** A spouse, current or former, who could be a new child's other parent. */
export interface OtherParentCandidate {
  personId: string;
  /** A `marriage` link to the parent and no `divorce` link. */
  current: boolean;
}

/**
 * Who else is linked as a parent when a child is added to a parent (ADR 0012).
 *
 * - `none`: the parent has had no spouse, or the existing child already has a
 *   parent besides this one. One link, as before LIN-79.
 * - `one`: the parent has had exactly one spouse, current or former, who is
 *   linked without asking.
 * - `choose`: more than one spouse, current ones first. `preselectedId` is the
 *   first current spouse, or `null` ("Not known") when every spouse is former.
 */
export type OtherParentChoice =
  | { kind: 'none' }
  | { kind: 'one'; personId: string }
  | { kind: 'choose'; candidates: OtherParentCandidate[]; preselectedId: string | null };

function hasLink(a: string, b: string, type: FamilyLink['type'], links: readonly FamilyLink[]): boolean {
  return links.some((link) => {
    if (link.type !== type) return false;
    const { sourceId, targetId } = getLinkEndpoints(link);
    return (sourceId === a && targetId === b) || (sourceId === b && targetId === a);
  });
}

/**
 * The other-parent choice for a child of `parentId`. Pass `childId` for an
 * existing child: a child is never given a third parent, and never itself.
 */
export function otherParentChoice(
  parentId: string,
  links: readonly FamilyLink[],
  childId?: string
): OtherParentChoice {
  if (childId && getParents(childId, links).some((id) => id !== parentId)) {
    return { kind: 'none' };
  }

  const candidates = getSpouses(parentId, links)
    .filter((id) => id !== childId)
    .map((personId) => ({
      personId,
      current: hasLink(parentId, personId, 'marriage', links) && !hasLink(parentId, personId, 'divorce', links),
    }));

  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length === 1) return { kind: 'one', personId: candidates[0].personId };

  const ordered = [...candidates.filter((c) => c.current), ...candidates.filter((c) => !c.current)];
  return { kind: 'choose', candidates: ordered, preselectedId: ordered[0].current ? ordered[0].personId : null };
}

/** The other parent to link, given what the user picked; `null` links none. */
export function resolveOtherParent(choice: OtherParentChoice, picked: string | null | undefined): string | null {
  switch (choice.kind) {
    case 'none':
      return null;
    case 'one':
      return choice.personId;
    case 'choose':
      return choice.candidates.find((c) => c.personId === picked)?.personId ?? null;
  }
}
