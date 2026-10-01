import { FamilyLink, FamilyNode } from '../types/graph';
import { getNodeId } from './familyGraph';
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

/**
 * A score at or above this, from the spelling-matches function, is a spelling
 * match. Measured on the pinned model (LIN-67); it lives here so no caller can
 * pick a second number.
 */
export const SPELLING_MATCH_THRESHOLD = 0.5;

/** Creation asks "does this Person exist?"; renaming asks "am I colliding with one?" */
export type MatchIntent = 'creating' | 'renaming';

/**
 * The server's spelling scores for one typed name, keyed by case-folded given
 * name. Opaque to callers: they pass it through to `matchExistingPersons`, which
 * alone decides what counts as a spelling match.
 */
export interface SpellingScores {
  /** The query these scores answer, folded. Scores for any other query are ignored. */
  readonly typedName: string;
  readonly byGivenName: ReadonlyMap<string, number>;
}

/** Builds `SpellingScores` from the function's `{ name, score }` list. */
export function spellingScoresFrom(
  typedName: string,
  scores: ReadonlyArray<{ name: string; score: number }>
): SpellingScores {
  const byGivenName = new Map<string, number>();
  for (const { name, score } of scores) {
    const key = fold(name);
    // Two spellings that fold together share a key; keep the stronger score.
    byGivenName.set(key, Math.max(score, byGivenName.get(key) ?? 0));
  }
  return { typedName: fold(typedName), byGivenName };
}

/** An existing Person who might be the one being described, and why we think so. */
export interface PersonMatch {
  person: FamilyNode;
  /** The query is exactly this Person's given name, trimmed and case-folded. */
  isExactGivenName: boolean;
  /**
   * The given name is the query spelled or transliterated differently, per the
   * spelling-matches function. Advice only: never makes a resolution `must-confirm`.
   */
  isSpellingVariant: boolean;
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
  /**
   * Spelling scores for this query, from `useSpellingScores` / the spelling
   * lookup. Omit (or pass scores for another query) for substring matching only.
   */
  spellingScores?: SpellingScores;
  limit?: number;
}

/** Trimmed and case-folded, the form both the query and a given name are compared in. */
function fold(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

const NONE: MatchResolution = { kind: 'none' };

/**
 * The query worth a spelling lookup for these params, or `''` for none: an
 * unchanged rename resolves to `none` whatever the scores, so it is not sent.
 * (Too-short queries are refused by the lookup itself.)
 */
export function spellingLookupQuery({
  query,
  intent,
  currentGivenName,
}: Pick<MatchExistingPersonsParams, 'query' | 'intent' | 'currentGivenName'>): string {
  return intent === 'renaming' && fold(query) === fold(currentGivenName) ? '' : query;
}

export function matchExistingPersons({
  query,
  intent,
  pool,
  excludePersonId,
  visibleIds,
  connectedIds,
  currentGivenName,
  spellingScores,
  limit = MATCH_CANDIDATE_LIMIT,
}: MatchExistingPersonsParams): MatchResolution {
  const q = fold(query);
  if (q.length < MIN_MATCH_QUERY_LENGTH) return NONE;

  // A rename that has not changed the name is not a collision with anything —
  // otherwise merely opening Edit on an Ahmad would block on an untouched field.
  if (intent === 'renaming' && q === fold(currentGivenName)) return NONE;

  // Scores answer one query. Any others are a stale reply and are dropped here,
  // so no caller can show a previous query's spelling matches.
  const scores = spellingScores?.typedName === q ? spellingScores.byGivenName : undefined;

  const matches: PersonMatch[] = [];
  for (const person of pool) {
    if (person.id === excludePersonId) continue;
    const givenName = fold(person.firstName);
    const isExactGivenName = givenName === q;
    const isSpellingVariant =
      !isExactGivenName && (scores?.get(givenName) ?? 0) >= SPELLING_MATCH_THRESHOLD;
    if (!isSpellingVariant && !nodeSearchHaystack(person).toLowerCase().includes(q)) continue;
    matches.push({
      person,
      isExactGivenName,
      isSpellingVariant,
      isVisible: visibleIds ? visibleIds.has(person.id) : true,
      isAlreadyConnected: connectedIds ? connectedIds.has(person.id) : false,
    });
  }

  if (matches.length === 0) return NONE;

  // Exact matches first — they are the ones a caller may have to block on — then
  // spelling matches, then other substring matches, each alphabetical.
  // Visibility and connectedness are labels and do not reorder.
  const rank = (m: PersonMatch) => (m.isExactGivenName ? 0 : m.isSpellingVariant ? 1 : 2);
  matches.sort(
    (a, b) => rank(a) - rank(b) || a.person.firstName.localeCompare(b.person.firstName)
  );

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
