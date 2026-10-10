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

/** No other parent to offer: the choice for anything but a child. */
export const NO_OTHER_PARENT: OtherParentChoice = { kind: 'none' };

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

/**
 * The other parent a form sends: the user's pick, or until they pick
 * (`undefined`), a `choose`'s preselected spouse.
 */
export function pickedOtherParent(choice: OtherParentChoice, pick: string | null | undefined): string | null {
  return resolveOtherParent(choice, pick === undefined && choice.kind === 'choose' ? choice.preselectedId : pick);
}

/**
 * What a choice offers, as a string: its kind and candidates, in order. Two
 * choices with the same key offer the same thing, so a pick made from one
 * still stands for the other.
 */
export function otherParentChoiceKey(choice: OtherParentChoice): string {
  switch (choice.kind) {
    case 'none':
      return 'none';
    case 'one':
      return `one:${choice.personId}`;
    case 'choose':
      return `choose:${choice.candidates.map((c) => c.personId).join(',')}`;
  }
}

/**
 * The other parent a form sent, if the current choice still offers them;
 * otherwise `null`, one link. A form may have been showing an older choice,
 * and nobody it did not show is linked.
 */
export function stillOfferedOtherParent(choice: OtherParentChoice, sent: string | null | undefined): string | null {
  if (!sent) return null;
  switch (choice.kind) {
    case 'none':
      return null;
    case 'one':
      return choice.personId === sent ? sent : null;
    case 'choose':
      return choice.candidates.some((c) => c.personId === sent) ? sent : null;
  }
}

/**
 * The other parent a new parent link takes with it (LIN-79): the one the form
 * sent, if `links` still offer them, else none.
 */
export function resolveOtherParentFor(
  links: readonly FamilyLink[],
  parentId: string,
  sent: string | null | undefined,
  childId?: string
): string | null {
  return stillOfferedOtherParent(otherParentChoice(parentId, links, childId), sent);
}
