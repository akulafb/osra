/**
 * The one call to TypeSafe's System One endpoint, with its failures sorted
 * into the three things a caller can do something about. Each function owns
 * its own questions, pinned model and reading of the answers; this is only
 * the request and the sorting.
 */

import { fetchWithRetry, RETRYABLE_STATUSES, type RetryOptions } from './retry.ts';

export const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';

export type SystemOneOutcome<T> =
  | { ok: true; answer: T }
  /** Still 429 or 529 after the retries. */
  | { ok: false; kind: 'busy'; status: number }
  /** Any other HTTP status, or an answer `read` could not use. */
  | { ok: false; kind: 'failed'; status: number; detail: string }
  /** The request never got an answer: network error or timeout. */
  | { ok: false; kind: 'unreachable'; detail: string };

/**
 * Sends `body` and reads the 200 answer with `read`, which returns null when
 * the answer is not usable; `unusable` then says why, for the log. Never throws.
 */
export async function askSystemOne<T>(
  body: unknown,
  apiKey: string,
  read: (json: unknown) => T | null,
  unusable: string,
  retryOptions: RetryOptions = {},
): Promise<SystemOneOutcome<T>> {
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

  const answer = read(await res.json().catch(() => null));
  if (answer === null) return { ok: false, kind: 'failed', status: res.status, detail: unusable };
  return { ok: true, answer };
}
