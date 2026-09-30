/**
 * Retry for the two "come back in a moment" answers an AI provider gives:
 * 429 (rate limited) and 529 (overloaded). Everything else — a 4xx, a 500, a
 * network failure, a timeout — is returned or thrown at once, because callers
 * have a fallback and a slow failure is worse than a fast one.
 */

import type { FetchLike } from './http.ts';

export const RETRYABLE_STATUSES: readonly number[] = [429, 529];

export interface RetryOptions {
  /** Retries after the first attempt. */
  retries?: number;
  /** Wait before the first retry; doubled for each one after. */
  baseDelayMs?: number;
  /** No single wait is longer than this, whatever `Retry-After` says. */
  maxDelayMs?: number;
  /** Each attempt is abandoned after this long. */
  attemptTimeoutMs?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** 0..1; injected so tests are exact. */
  random?: () => number;
}

const DEFAULTS = {
  retries: 3,
  baseDelayMs: 250,
  maxDelayMs: 4000,
  attemptTimeoutMs: 15000,
};

/**
 * The wait before retry number `attempt` (0 for the first retry): exponential,
 * with up to 25% added so parallel callers do not retry in step. A `Retry-After`
 * longer than that is honoured, up to `maxDelayMs`.
 */
export function backoffDelayMs(
  attempt: number,
  opts: {
    baseDelayMs: number;
    maxDelayMs: number;
    retryAfterHeader?: string | null;
    random?: () => number;
  },
): number {
  const jitter = 1 + (opts.random ?? Math.random)() * 0.25;
  const exponential = opts.baseDelayMs * 2 ** attempt * jitter;
  const retryAfterSeconds = Number(opts.retryAfterHeader);
  const retryAfterMs =
    opts.retryAfterHeader && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;
  return Math.round(Math.min(Math.max(exponential, retryAfterMs), opts.maxDelayMs));
}

/**
 * `fetch`, repeated while the answer is 429 or 529. Resolves with the last
 * response — which is still a 429/529 if the retries ran out — and rejects only
 * when the attempt itself failed (network error or timeout).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  // Each option falls back on its own: spreading over the defaults would let an
  // explicit `retries: undefined` remove the limit and retry for ever.
  const retries = options.retries ?? DEFAULTS.retries;
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULTS.attemptTimeoutMs;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(attemptTimeoutMs) });
    if (!RETRYABLE_STATUSES.includes(res.status) || attempt >= retries) return res;
    // Release the connection before waiting.
    await res.body?.cancel().catch(() => undefined);
    await sleep(
      backoffDelayMs(attempt, {
        baseDelayMs,
        maxDelayMs,
        retryAfterHeader: res.headers.get('Retry-After'),
        random: options.random,
      }),
    );
  }
}
