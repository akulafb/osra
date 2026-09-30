/**
 * The one call to TypeSafe Jev, with its failures sorted into the three things a
 * caller can do something about. Used by the Edge Function and by the evaluation
 * script, so the script measures the request the function really sends.
 */

import { fetchWithRetry, RETRYABLE_STATUSES, type RetryOptions } from '../_shared/retry.ts';
import {
  buildTypeSafeRequest,
  mapScores,
  TYPESAFE_URL,
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

  let res: Response;
  try {
    res = await fetchWithRetry(
      TYPESAFE_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      retryOptions,
    );
  } catch (err) {
    return { ok: false, kind: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
  }

  if (RETRYABLE_STATUSES.includes(res.status)) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: false, kind: 'busy', status: res.status };
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    return { ok: false, kind: 'failed', status: res.status, detail };
  }

  const json: unknown = await res.json().catch(() => null);
  const scores = mapScores(request.names, json);
  if (!scores) {
    return { ok: false, kind: 'failed', status: res.status, detail: 'answer did not cover every name' };
  }
  const model = (json as { model?: unknown }).model;
  return { ok: true, model: typeof model === 'string' ? model : body.model, scores };
}
