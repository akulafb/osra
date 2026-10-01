import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSpellingMatchLookup,
  spellingLookupNames,
  SPELLING_LOOKUP_DEBOUNCE_MS,
  SPELLING_LOOKUP_MAX_NAME_LENGTH,
  SPELLING_LOOKUP_MAX_NAMES,
  SPELLING_LOOKUP_TIMEOUT_MS,
  type FetchSpellingScores,
} from './spellingMatchLookup';
import { MIN_MATCH_QUERY_LENGTH, SpellingScores } from './personMatch';
import { FamilyNode } from '../types/graph';

/** A fetcher whose replies the test resolves by hand, one per call. */
function controllableFetcher() {
  const calls: {
    request: { typedName: string; names: string[] };
    signal: AbortSignal;
    reply: (scores: { name: string; score: number }[]) => void;
    fail: (err: unknown) => void;
  }[] = [];
  const fetchScores: FetchSpellingScores = (request, signal) =>
    new Promise((resolve, reject) => {
      calls.push({ request, signal, reply: resolve, fail: reject });
    });
  return { calls, fetchScores: vi.fn(fetchScores) };
}

function setup() {
  const fetcher = controllableFetcher();
  const received: SpellingScores[] = [];
  const lookup = createSpellingMatchLookup({
    fetchScores: fetcher.fetchScores,
    onScores: (scores) => received.push(scores),
  });
  return { ...fetcher, received, lookup };
}

/** Lets resolved fetcher promises run their continuations. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSpellingMatchLookup', () => {
  it('asks once the user stops typing, and reports the scores for that query', async () => {
    const { calls, fetchScores, received, lookup } = setup();
    lookup.request('Mohamed', ['Mohammed', 'Omar']);

    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS - 1);
    expect(fetchScores).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.map((c) => c.request)).toEqual([
      { typedName: 'Mohamed', names: ['Mohammed', 'Omar'] },
    ]);

    calls[0].reply([
      { name: 'Mohammed', score: 0.93 },
      { name: 'Omar', score: 0.01 },
    ]);
    await flush();
    expect(received).toHaveLength(1);
    expect(received[0].typedName).toBe('mohamed');
    expect(received[0].byGivenName.get('mohammed')).toBe(0.93);
  });

  it('sends only the last query of a burst of typing', async () => {
    const { calls, lookup } = setup();
    lookup.request('Mo', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(100);
    lookup.request('Moh', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(100);
    lookup.request('Mohamed', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    expect(calls.map((c) => c.request.typedName)).toEqual(['Mohamed']);
  });

  it('never reports a reply for a query that is no longer current', async () => {
    const { calls, received, lookup } = setup();
    lookup.request('Moha', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    lookup.request('Mohamed', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);

    // The newer reply lands first, then the old one arrives late.
    calls[1].reply([{ name: 'Mohammed', score: 0.9 }]);
    await flush();
    calls[0].reply([{ name: 'Mohammed', score: 0.1 }]);
    await flush();

    expect(received.map((s) => s.typedName)).toEqual(['mohamed']);
    expect(calls[0].signal.aborted).toBe(true);
  });

  it('drops an in-flight reply once the query is changed, even before the new one is sent', async () => {
    const { calls, received, lookup } = setup();
    lookup.request('Moha', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    lookup.request('Mohamed', ['Mohammed']);
    calls[0].reply([{ name: 'Mohammed', score: 0.9 }]);
    await flush();
    expect(received).toEqual([]);
  });

  it('reports nothing, and throws nothing, when the function fails', async () => {
    const { calls, received, lookup } = setup();
    lookup.request('Mohamed', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    calls[0].fail(new Error('offline'));
    await flush();
    expect(received).toEqual([]);
  });

  it('abandons a reply slower than the timeout', async () => {
    const { calls, received, lookup } = setup();
    lookup.request('Mohamed', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_TIMEOUT_MS);
    expect(calls[0].signal.aborted).toBe(true);
    calls[0].reply([{ name: 'Mohammed', score: 0.9 }]);
    await flush();
    expect(received).toEqual([]);
  });

  it('reports a reply that lands just inside the timeout', async () => {
    const { calls, received, lookup } = setup();
    lookup.request('Mohamed', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_TIMEOUT_MS - 1);
    calls[0].reply([{ name: 'Mohammed', score: 0.9 }]);
    await flush();
    expect(received).toHaveLength(1);
  });

  it('sends nothing for a query shorter than the Person Match minimum', async () => {
    const { fetchScores, lookup } = setup();
    lookup.request(' M ', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS * 2);
    expect(MIN_MATCH_QUERY_LENGTH).toBe(2);
    expect(fetchScores).not.toHaveBeenCalled();
  });

  it('a too-short query still cancels the lookup for the query before it', async () => {
    const { calls, received, lookup } = setup();
    lookup.request('Mo', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    lookup.request('M', ['Mohammed']);
    calls[0].reply([{ name: 'Mohammed', score: 0.9 }]);
    await flush();
    expect(received).toEqual([]);
  });

  it('sends nothing for a query longer than the function accepts, or with no names', async () => {
    const { fetchScores, lookup } = setup();
    lookup.request('x'.repeat(SPELLING_LOOKUP_MAX_NAME_LENGTH + 1), ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    lookup.request('Mohamed', []);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    expect(fetchScores).not.toHaveBeenCalled();
  });

  it('does not ask again for the query it is already answering', async () => {
    // A re-render repeats the request; only a different query or name list is new.
    const { fetchScores, lookup } = setup();
    lookup.request('Mohamed', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    lookup.request(' mohamed', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    expect(fetchScores).toHaveBeenCalledTimes(1);
    lookup.request('Mohamed', ['Mohammed', 'Omar']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    expect(fetchScores).toHaveBeenCalledTimes(2);
  });

  it('reports nothing after dispose', async () => {
    const { calls, fetchScores, received, lookup } = setup();
    lookup.request('Mohamed', ['Mohammed']);
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    lookup.request('Mohamedd', ['Mohammed']);
    lookup.dispose();
    await vi.advanceTimersByTimeAsync(SPELLING_LOOKUP_DEBOUNCE_MS);
    expect(fetchScores).toHaveBeenCalledTimes(1);
    calls[0].reply([{ name: 'Mohammed', score: 0.9 }]);
    await flush();
    expect(received).toEqual([]);
  });
});

describe('spellingLookupNames', () => {
  it('sends each distinct given name once, case-folded, in the order first seen', () => {
    const pool: FamilyNode[] = [
      { id: '1', firstName: 'Mohammed' },
      { id: '2', firstName: ' mohammed ' },
      { id: '3', firstName: 'Omar' },
      { id: '4', firstName: '   ' },
    ];
    expect(spellingLookupNames(pool)).toEqual(['Mohammed', 'Omar']);
  });

  it('leaves out names the function would refuse, and stops at its name limit', () => {
    const long = 'x'.repeat(SPELLING_LOOKUP_MAX_NAME_LENGTH + 1);
    const pool: FamilyNode[] = [
      { id: 'long', firstName: long },
      ...Array.from({ length: SPELLING_LOOKUP_MAX_NAMES + 5 }, (_, i) => ({
        id: `p${i}`,
        firstName: `Name${i}`,
      })),
    ];
    const names = spellingLookupNames(pool);
    expect(names).not.toContain(long);
    expect(names).toHaveLength(SPELLING_LOOKUP_MAX_NAMES);
    expect(names[0]).toBe('Name0');
  });
});
