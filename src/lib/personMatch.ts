import { FamilyLink, FamilyNode } from '../types/graph';
import { getNodeId } from '../utils/getNodeId';
import { nodeSearchHaystack } from '../utils/nodeDisplayName';

/**
 * One answer to "is this Person already in the Tree Record?".
 *
 * Every path that asks — the Ghost Node, Add Relative, Edit Node — asks the same
 * question; only what they do with the answer differs. Matching lives here so a
 * new caller cannot invent a fourth threshold.
 */

/** Shortest query worth a lookup — one letter matches too much. */
export const MIN_MATCH_QUERY_LENGTH = 2;

/** Most matches handed to a caller at once, so a 190px card never overruns. */
export const MATCH_CANDIDATE_LIMIT = 4;

/** Creation asks "does this Person exist?"; renaming asks "am I colliding with one?" */
export type MatchIntent = 'creating' | 'renaming';

/** An existing Person who might be the one being described, and why we think so. */
export interface PersonMatch {
  person: FamilyNode;
  /** The query is exactly this Person's given name, trimmed and case-folded. */
  isExactGivenName: boolean;
  /** False when hidden by a cluster preset or a collapsed subtree. Labelling only. */
  isVisible: boolean;
  /** Already has a Kinship Link to the anchor. Marking only — never excluded. */
  isAlreadyConnected: boolean;
}

/** What the caller must do about the matches. */
export type MatchResolution =
  | { kind: 'none' }
  | { kind: 'candidates'; matches: PersonMatch[]; totalMatchCount: number }
  | { kind: 'must-confirm'; matches: PersonMatch[]; totalMatchCount: number };

export interface MatchExistingPersonsParams {
  query: string;
  intent: MatchIntent;
  /** The whole Tree Record, unfiltered — narrowing it would create duplicates. */
  pool: FamilyNode[];
  /** Anchor Person when creating, the Person being edited when renaming. */
  excludePersonId: string;
  /** Ids currently drawn. Omit to treat everything as visible. */
  visibleIds?: ReadonlySet<string>;
  /** Ids already linked to the anchor. Omit to mark nothing. */
  connectedIds?: ReadonlySet<string>;
  /** `renaming` only: the Person's current given name; an unchanged name resolves to `none`. */
  currentGivenName?: string;
  limit?: number;
}

/** Trimmed and case-folded, the form both the query and a given name are compared in. */
function fold(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

const NONE: MatchResolution = { kind: 'none' };

export function matchExistingPersons({
  query,
  intent,
  pool,
  excludePersonId,
  visibleIds,
  connectedIds,
  currentGivenName,
  limit = MATCH_CANDIDATE_LIMIT,
}: MatchExistingPersonsParams): MatchResolution {
  const q = fold(query);
  if (q.length < MIN_MATCH_QUERY_LENGTH) return NONE;

  // A rename that has not changed the name is not a collision with anything —
  // otherwise merely opening Edit on an Ahmad would block on an untouched field.
  if (intent === 'renaming' && q === fold(currentGivenName)) return NONE;

  const matches: PersonMatch[] = pool
    .filter(
      (person) =>
        person.id !== excludePersonId && nodeSearchHaystack(person).toLowerCase().includes(q)
    )
    .map((person) => ({
      person,
      isExactGivenName: fold(person.firstName) === q,
      isVisible: visibleIds ? visibleIds.has(person.id) : true,
      isAlreadyConnected: connectedIds ? connectedIds.has(person.id) : false,
    }));

  if (matches.length === 0) return NONE;

  // Exact matches first — they are the ones a caller may have to block on — then
  // alphabetical. Visibility and connectedness are labels and do not reorder.
  matches.sort((a, b) => {
    if (a.isExactGivenName !== b.isExactGivenName) return a.isExactGivenName ? -1 : 1;
    return a.person.firstName.localeCompare(b.person.firstName);
  });

  // Exactness is judged before the cap: an exact match hidden behind the limit is
  // still the question the user needs to answer.
  const kind = matches.some((m) => m.isExactGivenName) ? 'must-confirm' : 'candidates';

  return { kind, matches: matches.slice(0, limit), totalMatchCount: matches.length };
}

/**
 * What a caller renders and enforces, without re-branching on `kind`.
 *
 * Every caller wants the same three things out of a Match Resolution, and doing
 * that unwrapping at three call sites is how the policy leaked out last time.
 */
export function readMatchResolution(resolution: MatchResolution): {
  matches: PersonMatch[];
  /** Matches the cap left out, so a caller can stay honest about what it hides. */
  hiddenMatchCount: number;
  /** The user has to resolve this before the write is allowed. */
  mustConfirm: boolean;
} {
  if (resolution.kind === 'none') {
    return { matches: [], hiddenMatchCount: 0, mustConfirm: false };
  }
  return {
    matches: resolution.matches,
    hiddenMatchCount: resolution.totalMatchCount - resolution.matches.length,
    mustConfirm: resolution.kind === 'must-confirm',
  };
}

/**
 * Ids sharing a Kinship Link with the anchor, for `connectedIds`.
 *
 * Endpoints arrive as ids from the Tree Record and as node objects once the
 * force simulation has mutated them, so both are read through `getNodeId`.
 */
export function connectedPersonIds(links: FamilyLink[], anchorId: string): Set<string> {
  const connected = new Set<string>();
  for (const link of links) {
    const sourceId = getNodeId(link.source);
    const targetId = getNodeId(link.target);
    if (sourceId === anchorId) connected.add(targetId);
    else if (targetId === anchorId) connected.add(sourceId);
  }
  return connected;
}
