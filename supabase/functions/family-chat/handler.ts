/**
 * The family-chat Edge Function (LIN-71), with everything it reaches for passed
 * in, so the whole request path runs under `npm test` without Deno or the
 * network.
 *
 * Order matters, cheapest refusal first, and nothing is counted until the
 * request is known to be good:
 *   1. sign-in check (Supabase Auth) — no session, nothing else happens;
 *   2. the body — a bad or oversized request is refused before it is counted;
 *   3. the signed-in Person, read from the database for the system prompt;
 *   4. the count — `chat_use_model_call` records the call or refuses it;
 *   5. OpenRouter, with the function's model, prompt, tools and reply cap.
 *
 * Every refusal carries a `cause` the browser turns into one line for the user.
 */

import { requireSignedInUser } from '../_shared/auth.ts';
import {
  answerPreflightOrWrongMethod,
  errorResponse,
  jsonResponse,
  readJsonBody,
  type FetchLike,
} from '../_shared/http.ts';
import type { RetryOptions } from '../_shared/retry.ts';
import { DatabaseError, findSpeaker, recordModelCall, type DatabaseEnv } from './database.ts';
import {
  DAILY_MESSAGE_LIMIT,
  MAX_MODEL_CALLS_PER_MESSAGE,
  nextUaeMidnight,
  uaeDay,
} from './limits.ts';
import { buildModelRequest, callModel, type AssistantTurn } from './openRouter.ts';
import { buildSystemPrompt, type Speaker } from './prompt.ts';
import { MAX_CHAT_BODY_BYTES, validateChatRequest } from './request.ts';

/**
 * Why a call was refused, as the browser shows it (LIN-72 has the lines):
 * - `daily_limit`: the account has used its messages for the UAE day;
 * - `credit_gone`: the owner's OpenRouter credit is used up;
 * - `not_signed_in`: no valid Supabase session;
 * - `failed`: anything else. `code` says what, for logs and tests.
 */
export type RefusalCause = 'daily_limit' | 'credit_gone' | 'not_signed_in' | 'failed';

/** Where the account stands, sent with every reply and with a limit refusal. */
export interface ChatUsage {
  /** New messages counted on the current UAE day, this one included. */
  messagesUsed: number;
  dailyLimit: number;
  /** Model calls this message has used, this one included. */
  modelCalls: number;
  maxModelCalls: number;
  /** When the daily count starts again: the next midnight in the UAE, as ISO 8601 UTC. */
  resetsAt: string;
}

/** The 200 answer. Append `message` to the turns; run its tool calls when `done` is false. */
export interface ChatResponse {
  message: AssistantTurn;
  /** True when the model replied with text and asked for no tool. */
  done: boolean;
  usage: ChatUsage;
}

/** Every non-200 answer: `{ error: ChatRefusal }`. */
export interface ChatRefusal {
  code: string;
  cause: RefusalCause;
  message: string;
  usage?: ChatUsage;
}

export interface FamilyChatDeps {
  /** Reads a function secret or platform variable; `Deno.env.get` in production. */
  env: (name: string) => string | undefined;
  /** Used for Supabase Auth, the database and OpenRouter. Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
  /** The clock the UAE day is read from. */
  now?: () => Date;
  /** Backoff overrides, for tests. */
  retry?: Pick<RetryOptions, 'sleep' | 'random' | 'retries'>;
  log?: (message: string) => void;
}

function refuse(
  status: number,
  code: string,
  cause: RefusalCause,
  message: string,
  usage?: ChatUsage,
): Response {
  return errorResponse(status, code, message, usage ? { cause, usage } : { cause });
}

/** The model may take a while with tools; one slow attempt is abandoned after this. */
const MODEL_ATTEMPT_TIMEOUT_MS = 60_000;

export async function handleFamilyChat(req: Request, deps: FamilyChatDeps): Promise<Response> {
  const log = deps.log ?? ((m: string) => console.error(m));
  try {
    return await handle(req, deps, log);
  } catch (err) {
    // Even a bug answers with CORS headers and a cause, so the browser can say so.
    log(`family-chat: unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return refuse(500, 'internal_error', 'failed', 'The chat did not work. Try again.');
  }
}

async function handle(req: Request, deps: FamilyChatDeps, log: (message: string) => void): Promise<Response> {
  const early = answerPreflightOrWrongMethod(req);
  if (early) return early;

  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = (deps.now ?? (() => new Date()))();

  const supabaseUrl = deps.env('SUPABASE_URL');
  const supabaseAnonKey = deps.env('SUPABASE_ANON_KEY');
  const serviceRoleKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    log('family-chat: SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is missing');
    return refuse(500, 'not_configured', 'failed', 'The chat is not configured.');
  }

  // 1. Who is asking. No session, no further work and no call to OpenRouter.
  const auth = await requireSignedInUser(req, { supabaseUrl, supabaseAnonKey }, fetchImpl);
  if (!auth.ok) {
    if (auth.reason === 'auth-unavailable') {
      return refuse(503, 'auth_unavailable', 'failed', 'Could not check the session. Try again.');
    }
    return refuse(401, 'not_signed_in', 'not_signed_in', 'A valid Supabase session is required.');
  }

  // 2. What they sent.
  const validation = validateChatRequest(await readJsonBody(req, MAX_CHAT_BODY_BYTES));
  if (!validation.ok) return refuse(400, validation.code, 'failed', validation.message);
  const { messageId, turns } = validation.request;

  const apiKey = deps.env('OPENROUTER_API_KEY')?.trim();
  if (!apiKey) {
    log('family-chat: the OPENROUTER_API_KEY secret is not set on this project');
    return refuse(500, 'not_configured', 'failed', 'The chat is not configured.');
  }

  // 3 and 4. Who they are in the tree, and whether this call may be made.
  const db: DatabaseEnv = { supabaseUrl, serviceRoleKey };
  let speaker: Speaker | null;
  let quota: Awaited<ReturnType<typeof recordModelCall>>;
  try {
    speaker = await findSpeaker(db, auth.userId, fetchImpl);
    quota = await recordModelCall(
      db,
      {
        userId: auth.userId,
        messageId,
        uaeDay: uaeDay(now),
        dailyLimit: DAILY_MESSAGE_LIMIT,
        maxModelCalls: MAX_MODEL_CALLS_PER_MESSAGE,
      },
      fetchImpl,
    );
  } catch (err) {
    if (!(err instanceof DatabaseError)) throw err;
    // Without the count the limit cannot hold, so the model is not called.
    log(`family-chat: database: ${err.message}`);
    return refuse(503, 'database_unavailable', 'failed', 'The chat is unavailable. Try again.');
  }

  const usage: ChatUsage = {
    messagesUsed: quota.messagesUsed,
    dailyLimit: DAILY_MESSAGE_LIMIT,
    modelCalls: quota.modelCalls,
    maxModelCalls: MAX_MODEL_CALLS_PER_MESSAGE,
    resetsAt: nextUaeMidnight(now).toISOString(),
  };
  if (quota.outcome === 'daily_limit') {
    return refuse(429, 'daily_limit', 'daily_limit', `You have used your ${DAILY_MESSAGE_LIMIT} messages for today.`, usage);
  }
  if (quota.outcome === 'message_call_limit') {
    return refuse(
      429,
      'message_call_limit',
      'failed',
      `One message can use at most ${MAX_MODEL_CALLS_PER_MESSAGE} model calls.`,
      usage,
    );
  }

  // 5. The model.
  const outcome = await callModel(buildModelRequest(buildSystemPrompt(speaker), turns), apiKey, {
    attemptTimeoutMs: MODEL_ATTEMPT_TIMEOUT_MS,
    retries: 1,
    ...deps.retry,
    fetchImpl,
  });
  if (outcome.ok) {
    const body: ChatResponse = { message: outcome.message, done: !outcome.message.toolCalls, usage };
    return jsonResponse(body);
  }

  // The provider's own words go to the function log, not to the browser, and
  // never with the key in them, should a provider echo it back.
  const detail = 'detail' in outcome ? outcome.detail.split(apiKey).join('[OPENROUTER_API_KEY]') : '';
  switch (outcome.kind) {
    case 'credit_gone':
      log(`family-chat: OpenRouter credit is gone (${outcome.status}): ${detail}`);
      return refuse(402, 'credit_gone', 'credit_gone', "The owner's chat credit has run out.");
    case 'busy':
      log(`family-chat: OpenRouter still answered ${outcome.status} after retries`);
      return refuse(503, 'upstream_busy', 'failed', 'The chat service is busy. Try again shortly.');
    case 'failed':
      log(`family-chat: OpenRouter answered ${outcome.status}: ${detail}`);
      return refuse(502, 'upstream_error', 'failed', 'The chat service returned an error.');
    case 'unreachable':
      log(`family-chat: OpenRouter could not be reached: ${detail}`);
      return refuse(502, 'upstream_unreachable', 'failed', 'The chat service could not be reached.');
  }
}
