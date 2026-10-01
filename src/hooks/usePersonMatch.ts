import { useEffect, useMemo, useRef, useState } from 'react';
import {
  matchExistingPersons,
  MatchExistingPersonsParams,
  MatchResolution,
  SpellingScores,
  spellingLookupQuery,
} from '../lib/personMatch';
import {
  createSpellingMatchLookup,
  FetchSpellingScores,
  SpellingMatchLookup,
  spellingLookupNames,
} from '../lib/spellingMatchLookup';
import { invokeSpellingMatches } from '../lib/spellingMatchesClient';

export type UsePersonMatchParams = Omit<MatchExistingPersonsParams, 'spellingScores'>;

/**
 * The Person Match answer for a query as it is typed, spelling matches included.
 *
 * The substring match is computed on every render, so the list never waits for
 * the network. Spelling matches join it when the spelling-matches function
 * answers; until then, and whenever it is slow or failing, the answer is exactly
 * the substring match. Every caller that matches as the user types (the Ghost
 * Node, the Add Relative modal and the Edit Node modal) uses this hook, so the
 * threshold, debounce and fallback have one home.
 *
 * `fetchScores` is injectable for tests and must be referentially stable.
 */
export function usePersonMatch(
  params: UsePersonMatchParams,
  fetchScores: FetchSpellingScores = invokeSpellingMatches
): MatchResolution {
  const { query, intent, pool, excludePersonId, visibleIds, connectedIds, currentGivenName, limit } =
    params;
  const [spellingScores, setSpellingScores] = useState<SpellingScores>();
  const lookupRef = useRef<SpellingMatchLookup>();

  useEffect(() => {
    const lookup = createSpellingMatchLookup({ fetchScores, onScores: setSpellingScores });
    lookupRef.current = lookup;
    return () => {
      lookup.dispose();
      lookupRef.current = undefined;
    };
  }, [fetchScores]);

  const names = useMemo(() => spellingLookupNames(pool), [pool]);
  const lookupQuery = spellingLookupQuery({ query, intent, currentGivenName });

  // Declared after the effect that creates the lookup, so it runs after it.
  useEffect(() => {
    lookupRef.current?.request(lookupQuery, names);
  }, [lookupQuery, names, fetchScores]);

  return useMemo(
    () =>
      matchExistingPersons({
        query,
        intent,
        pool,
        excludePersonId,
        visibleIds,
        connectedIds,
        currentGivenName,
        limit,
        // Scores for an earlier query are ignored inside, so a stale reply
        // cannot show here even before the next one lands.
        spellingScores,
      }),
    [
      query,
      intent,
      pool,
      excludePersonId,
      visibleIds,
      connectedIds,
      currentGivenName,
      limit,
      spellingScores,
    ]
  );
}
