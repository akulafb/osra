import { FamilyNode } from '../types/graph';
import {
  foldName,
  MIN_MATCH_QUERY_LENGTH,
  SpellingScores,
  spellingScoresFrom,
} from './personMatch';

/**
 * Asks the spelling-matches function (LIN-67) which given names in the Tree
 * Record are the typed name spelled differently, and hands back the scores.
 *
 * The timing rules live here so every Person Match caller shares them: wait for
 * a pause in typing, never report a reply for a query that is no longer current,
 * and on any failure or slowness report nothing, so matching falls back to the
 * substring match alone. What counts as a spelling match is decided in
 * `personMatch.ts`, not here.
 */

/** Pause in typing before a lookup is sent. */
export const SPELLING_LOOKUP_DEBOUNCE_MS = 300;

/**
 * A reply slower than this is abandoned. Late spelling matches would reshuffle a
 * list the user is already reading, and the substring matches are already shown.
 */
export const SPELLING_LOOKUP_TIMEOUT_MS = 5000;

/** The function's own limits (`MAX_NAMES`, `MAX_NAME_LENGTH` in spellingMatches.ts). */
export const SPELLING_LOOKUP_MAX_NAMES = 1000;
export const SPELLING_LOOKUP_MAX_NAME_LENGTH = 60;

export interface SpellingLookupRequest {
  typedName: string;
  names: string[];
}

/** Fetches raw scores for one request. Rejects on any failure; honours `signal`. */
export type FetchSpellingScores = (
  request: SpellingLookupRequest,
  signal: AbortSignal
) => Promise<ReadonlyArray<{ name: string; score: number }>>;

export interface SpellingMatchLookup {
  /** The current query and the names to score it against. Replaces any earlier request. */
  request(query: string, names: readonly string[]): void;
  /** Cancels whatever is pending. Nothing is reported afterwards. */
  dispose(): void;
}

export interface CreateSpellingMatchLookupOptions {
  fetchScores: FetchSpellingScores;
  /** Called only with scores for the query that is current when they arrive. */
  onScores: (scores: SpellingScores) => void;
  debounceMs?: number;
  timeoutMs?: number;
}

/** Length as the function counts it: code points, so "محمد" is four. */
function characterCount(s: string): number {
  return [...s].length;
}

export function createSpellingMatchLookup({
  fetchScores,
  onScores,
  debounceMs = SPELLING_LOOKUP_DEBOUNCE_MS,
  timeoutMs = SPELLING_LOOKUP_TIMEOUT_MS,
}: CreateSpellingMatchLookupOptions): SpellingMatchLookup {
  /** What the latest request asked, so a repeat of it (a re-render) is not sent again. */
  let currentKey: string | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  /** The one lookup whose reply may still be reported; replaced on every new request. */
  let inFlight: AbortController | undefined;

  const cancel = () => {
    clearTimeout(debounceTimer);
    clearTimeout(timeoutTimer);
    inFlight?.abort();
    inFlight = undefined;
  };

  const send = (request: SpellingLookupRequest) => {
    const controller = new AbortController();
    inFlight = controller;
    timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);
    fetchScores(request, controller.signal).then(
      (scores) => {
        // Aborted means superseded, timed out or disposed: nothing to report.
        if (controller.signal.aborted) return;
        clearTimeout(timeoutTimer);
        inFlight = undefined;
        onScores(spellingScoresFrom(request.typedName, scores));
      },
      () => {
        // Any failure falls back to substring matching. The user sees no error:
        // a missing suggestion is not something they can act on.
        if (!controller.signal.aborted) clearTimeout(timeoutTimer);
      }
    );
  };

  return {
    request(query, names) {
      const typedName = query.trim();
      const key = `${foldName(typedName)}\u0000${names.join('\u0001')}`;
      if (key === currentKey) return;
      currentKey = key;
      cancel();

      const length = characterCount(typedName);
      if (
        length < MIN_MATCH_QUERY_LENGTH ||
        length > SPELLING_LOOKUP_MAX_NAME_LENGTH ||
        names.length === 0
      ) {
        return;
      }
      const request = { typedName, names: [...names] };
      debounceTimer = setTimeout(() => send(request), debounceMs);
    },
    dispose() {
      currentKey = undefined;
      cancel();
    },
  };
}

/**
 * The names to send for a Tree Record: each distinct given name once (compared
 * case-folded, sent as first spelled), leaving out any the function would refuse.
 * The whole pool is used, not the filtered view (ADR-0005, decision 3); the
 * scores are mapped back to every Person with that name by `matchExistingPersons`.
 */
export function spellingLookupNames(pool: readonly FamilyNode[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const person of pool) {
    const name = (person.firstName ?? '').trim();
    const key = foldName(name);
    if (!name || characterCount(name) > SPELLING_LOOKUP_MAX_NAME_LENGTH || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    // Past the function's limit the request would be refused outright; a
    // partial list still finds what it can.
    if (names.length === SPELLING_LOOKUP_MAX_NAMES) break;
  }
  return names;
}
