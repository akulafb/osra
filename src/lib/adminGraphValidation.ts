import type { FamilyGraph, FamilyLink } from '../types/graph';
import { getNodeId } from './familyGraph';

export const MSG_SELF = "A person can't be linked to themselves.";
export const MSG_DUPLICATE = 'These two people are already connected.';
export const MSG_PARTNERS_CANT_BE_PARENT_CHILD =
  "Partners can't be parent and child of each other.";
export const MSG_PARENT_CHILD_CANT_BE_PARTNERS =
  "A parent and child can't be partners.";
export const MSG_PARTNERS_NOT_IN_LINE =
  "Partners can't be in a direct parent–child line.";
export const MSG_PARENT_CYCLE = 'This would create a loop in the family line.';
export const MSG_SIBLINGS_CANT_BE_PARENT_CHILD =
  "Siblings can't be parent and child of each other.";
export const MSG_CHILD_ALREADY_HAS_MOTHER =
  'This child already has a mother. Edit or remove the existing link first.';
export const MSG_CHILD_ALREADY_HAS_FATHER =
  'This child already has a father. Edit or remove the existing link first.';
export const MSG_PARENT_ROLE_ONLY_ON_PARENT =
  'Parent role only applies to parent links.';
export const MSG_ORPHAN_NAME = 'Enter a name for the new person.';

export type ProposedLink = {
  source: string;
  target: string;
  type: 'parent' | 'marriage' | 'divorce';
  parentRole?: 'mother' | 'father' | null;
};

/** Match a link for exclusion when validating an edit (remove-then-add). */
export type ExcludeLinkSpec = {
  source: string;
  target: string;
  type: FamilyLink['type'];
  parentRole?: 'mother' | 'father' | null;
};

function sameLinkEdge(a: FamilyLink, b: ExcludeLinkSpec): boolean {
  return (
    getNodeId(a.source) === b.source &&
    getNodeId(a.target) === b.target &&
    a.type === b.type &&
    (a.parentRole ?? null) === (b.parentRole ?? null)
  );
}

function filterLinks(graph: FamilyGraph, exclude?: ExcludeLinkSpec): FamilyLink[] {
  if (!exclude) return graph.links;
  return graph.links.filter((l) => !sameLinkEdge(l, exclude));
}

function getParents(nodeId: string, links: FamilyLink[]): string[] {
  return links
    .filter((l) => l.type === 'parent' && getNodeId(l.target) === nodeId)
    .map((l) => getNodeId(l.source))
    .filter((id) => id.length > 0);
}

/** True if `ancestorId` is a strict ancestor of `descendantId` (walking up parent edges from descendant). */
export function isAncestorOf(ancestorId: string, descendantId: string, links: FamilyLink[]): boolean {
  const visited = new Set<string>();
  const queue = [descendantId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const p of getParents(cur, links)) {
      if (p === ancestorId) return true;
      if (!visited.has(p)) {
        visited.add(p);
        queue.push(p);
      }
    }
  }
  return false;
}

function hasAnyLinkBetween(a: string, b: string, links: FamilyLink[]): boolean {
  return links.some((l) => {
    const s = getNodeId(l.source);
    const t = getNodeId(l.target);
    return (s === a && t === b) || (s === b && t === a);
  });
}

function hasMarriageOrDivorceBetween(a: string, b: string, links: FamilyLink[]): boolean {
  return links.some(
    (l) =>
      (l.type === 'marriage' || l.type === 'divorce') &&
      ((getNodeId(l.source) === a && getNodeId(l.target) === b) ||
        (getNodeId(l.source) === b && getNodeId(l.target) === a))
  );
}

function hasParentEdgeBetween(a: string, b: string, links: FamilyLink[]): boolean {
  return links.some(
    (l) =>
      l.type === 'parent' &&
      ((getNodeId(l.source) === a && getNodeId(l.target) === b) ||
        (getNodeId(l.source) === b && getNodeId(l.target) === a))
  );
}

function shareParent(a: string, b: string, links: FamilyLink[]): boolean {
  const pa = new Set(getParents(a, links));
  if (pa.size === 0) return false;
  return getParents(b, links).some((p) => pa.has(p));
}

/**
 * Validate adding or replacing a link. For edits, pass `excludeLink` as the row being replaced.
 */
export function validateProposedLink(
  graph: FamilyGraph,
  proposed: ProposedLink,
  options?: { excludeLink?: ExcludeLinkSpec }
): { ok: true } | { ok: false; message: string } {
  const { source, target, type, parentRole } = proposed;
  const pr = parentRole ?? null;

  if (source === target) {
    return { ok: false, message: MSG_SELF };
  }

  if (type !== 'parent' && pr != null) {
    return { ok: false, message: MSG_PARENT_ROLE_ONLY_ON_PARENT };
  }

  const links = filterLinks(graph, options?.excludeLink);

  // Semantic checks before generic duplicate so users see specific reasons (e.g. partners vs parent–child).
  if (type === 'parent') {
    if (hasMarriageOrDivorceBetween(source, target, links)) {
      return { ok: false, message: MSG_PARTNERS_CANT_BE_PARENT_CHILD };
    }
    if (isAncestorOf(target, source, links)) {
      return { ok: false, message: MSG_PARENT_CYCLE };
    }
    if (shareParent(source, target, links)) {
      return { ok: false, message: MSG_SIBLINGS_CANT_BE_PARENT_CHILD };
    }
    if (pr === 'mother') {
      const hasMother = links.some(
        (l) =>
          l.type === 'parent' &&
          getNodeId(l.target) === target &&
          l.parentRole === 'mother'
      );
      if (hasMother) {
        return { ok: false, message: MSG_CHILD_ALREADY_HAS_MOTHER };
      }
    }
    if (pr === 'father') {
      const hasFather = links.some(
        (l) =>
          l.type === 'parent' &&
          getNodeId(l.target) === target &&
          l.parentRole === 'father'
      );
      if (hasFather) {
        return { ok: false, message: MSG_CHILD_ALREADY_HAS_FATHER };
      }
    }
  }

  if (type === 'marriage' || type === 'divorce') {
    if (hasParentEdgeBetween(source, target, links)) {
      return { ok: false, message: MSG_PARENT_CHILD_CANT_BE_PARTNERS };
    }
    if (isAncestorOf(source, target, links) || isAncestorOf(target, source, links)) {
      return { ok: false, message: MSG_PARTNERS_NOT_IN_LINE };
    }
  }

  if (hasAnyLinkBetween(source, target, links)) {
    return { ok: false, message: MSG_DUPLICATE };
  }

  return { ok: true };
}

export function validateOrphanNodeName(name: string): { ok: true } | { ok: false; message: string } {
  if (!name.trim()) {
    return { ok: false, message: MSG_ORPHAN_NAME };
  }
  return { ok: true };
}
