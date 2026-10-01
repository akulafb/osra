/**
 * The one call to TypeSafe Jev, with its failures sorted into the three things a
 * caller can do something about. Used by the Edge Function and by the evaluation
 * script, so the script measures the request the function really sends.
 */

import type { RetryOptions } from '../_shared/retry.ts';
import { askSystemOne } from '../_shared/typeSafe.ts';
import {
  buildTypeSafeRequest,
  mapScores,
  type NameScore,
  type SpellingMatchRequest,
} from './spellingMatches.ts';

export type ScoreOutcome =
  | { ok: true; model: string; scores: NameScore[] }
  /** Still 429 or 529 after the retries. */
  | { ok: false; kind: 'busy'; status: number }
  /** Any other HTTP status, or an answer that does not cover every name. */
  | { ok: false; kind: 'failed'; status: number; detail: string }
  /** The request never got an answer: network error or timeout. */
  | { ok: false; kind: 'unreachable'; detail: string };

export async function scoreNames(
  request: SpellingMatchRequest,
  apiKey: string,
  retryOptions: RetryOptions = {},
): Promise<ScoreOutcome> {
  const body = buildTypeSafeRequest(request);
  const outcome = await askSystemOne(
    body,
    apiKey,
    (json) => {
      const scores = mapScores(request.names, json);
      if (!scores) return null;
      const model = (json as { model?: unknown }).model;
      return { model: typeof model === 'string' ? model : body.model, scores };
    },
    'answer did not cover every name',
    retryOptions,
  );
  return outcome.ok ? { ok: true, ...outcome.answer } : outcome;
}
