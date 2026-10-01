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
 * The cap on one model reply, in tokens. Grok 4.3 reasons before it answers and
 * the reasoning counts against this cap (about 100 to 200 tokens in a live test),
 * so the cap leaves room for that plus a brief answer.
 */
export const MAX_REPLY_TOKENS = 1500;

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
