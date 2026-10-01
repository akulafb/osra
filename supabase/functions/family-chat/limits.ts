/**
 * The numbers that bound what one Osra account can spend on the family chat,
 * and the day they are counted in (LIN-71).
 *
 * The database enforces the daily and per-message limits atomically
 * (`chat_use_model_call` in the LIN-71 migration); the numbers are passed in
 * from here so there is one place to change them.
 */

/** New user messages per account per UAE day. */
export const DAILY_MESSAGE_LIMIT = 10;

/** Model calls one user message may use (its first call and the tool rounds after it). */
export const MAX_MODEL_CALLS_PER_MESSAGE = 6;

/** A user message longer than this, in characters as a person counts them, is refused. */
export const MAX_USER_MESSAGE_CHARS = 2000;

/**
 * The cap on one model reply, in tokens: about 150 words (LIN-80), at about
 * 1.3 tokens a word, with room for Markdown. Grok 4.3 reasons before it
 * answers, but on OpenRouter the reasoning is not held to this cap (checked
 * live on 2026-10-01: `max_tokens: 30` still reasoned 689 tokens, then cut the
 * answer at 30), so the whole cap is the answer's.
 */
export const MAX_REPLY_TOKENS = 220;

/**
 * What one user message may cost in model calls, in US dollars (LIN-80). Once
 * the calls so far pass it, the browser stops the tool loop and asks for the
 * best answer from what the tools have returned. On top of the call and daily
 * limits, which the database holds.
 */
export const MAX_MESSAGE_COST_USD = 0.01;

/**
 * The UAE is UTC+4 all year (`Asia/Dubai` has no daylight saving), so a fixed
 * offset is exact and does not depend on the runtime's time-zone data.
 */
const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar day in the UAE at `now`, as `YYYY-MM-DD`. */
export function uaeDay(now: Date): string {
  return new Date(now.getTime() + UAE_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant the count starts again: the next midnight in the UAE after `now`. */
export function nextUaeMidnight(now: Date): Date {
  const uaeMidnightToday = Date.parse(`${uaeDay(now)}T00:00:00Z`) - UAE_OFFSET_MS;
  return new Date(uaeMidnightToday + DAY_MS);
}
