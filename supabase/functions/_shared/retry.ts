/**
 * Retry for the two "come back in a moment" answers an AI provider gives:
 * 429 (rate limited) and 529 (overloaded). Everything else — a 4xx, a 500, a
 * network failure, a timeout — is returned or thrown at once, because callers
 * have a fallback and a slow failure is worse than a fast one.
 */

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
  retryOn?: readonly number[];
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
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
  const o = { ...DEFAULTS, ...options };
  const fetchImpl = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retryOn = o.retryOn ?? RETRYABLE_STATUSES;

  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(o.attemptTimeoutMs) });
    if (!retryOn.includes(res.status) || attempt >= o.retries) return res;
    // Release the connection before waiting.
    await res.body?.cancel().catch(() => undefined);
    await sleep(
      backoffDelayMs(attempt, {
        baseDelayMs: o.baseDelayMs,
        maxDelayMs: o.maxDelayMs,
        retryAfterHeader: res.headers.get('Retry-After'),
        random: o.random,
      }),
    );
  }
}
