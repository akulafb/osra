import type { FetchSpellingScores } from './spellingMatchLookup';

/**
 * Calls the `spelling-matches` Edge Function (LIN-67) through the browser
 * Supabase client, which attaches the signed-in session for us.
 *
 * Contract: `{ typedName, names }` in, `{ model, scores: [{ name, score }] }`
 * out, `{ error: { code, message } }` on failure. Any failure or unexpected
 * shape rejects, and the lookup treats a rejection as "no spelling matches".
 */
export const invokeSpellingMatches: FetchSpellingScores = async (request, signal) => {
  // Offline is a known answer; skip the request rather than wait for it to fail.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('spelling-matches: offline');
  }
  // Loaded on first use, not at import: `./supabase` throws without env vars,
  // and the Ghost Node card (which reaches this module) is imported by code
  // that unit tests load.
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.functions.invoke<unknown>('spelling-matches', {
    body: request,
    signal,
  });
  if (error) throw error;
  const scores = (data as { scores?: unknown } | null)?.scores;
  if (!Array.isArray(scores) || !scores.every(isNameScore)) {
    throw new Error('spelling-matches: unexpected reply');
  }
  return scores;
};

function isNameScore(value: unknown): value is { name: string; score: number } {
  const v = value as { name?: unknown; score?: unknown } | null;
  return typeof v?.name === 'string' && typeof v.score === 'number' && Number.isFinite(v.score);
}
