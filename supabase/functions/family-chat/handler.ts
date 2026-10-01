/**
 * The family-chat Edge Function (LIN-71), with everything it reaches for passed
 * in, so the whole request path runs under `npm test` without Deno or the
 * network.
 *
 * Order matters, cheapest refusal first, and nothing is counted until the
 * request is known to be good:
 *   1. sign-in check (Supabase Auth) — no session, nothing else happens;
 *   2. the body — a bad or oversized request is refused before it is counted;
 *   3. the count — `chat_use_model_call` records the call or refuses it;
 *   4. the signed-in Person, read from the database for the system prompt;
 *   5. OpenRouter, with the function's model, prompt, tools and reply cap.
 *
 * A body with `operation: 'route'` (LIN-73) takes the same first three steps,
 * then asks TypeSafe Jev what kind of question the message is instead of
 * calling the model. The route is counted as the message's first call, so a
 * message that code answers still uses one of the day's messages, and a
 * message sent on to the model uses the same message with the calls left.
 *
 * Every refusal carries a `cause` the browser turns into one line for the user.
 */

import { authRefusal, requireSignedInUser } from '../_shared/auth.ts';
import {
  answerPreflightOrWrongMethod,
  errorResponse,
  jsonResponse,
  readJsonBody,
  type FetchLike,
} from '../_shared/http.ts';
import type { RetryOptions } from '../_shared/retry.ts';
import { DatabaseError, type ServiceRoleEnv } from '../_shared/supabaseRest.ts';
import { findSpeaker, recordModelCall, type QuotaOutcome } from './database.ts';
import {
  DAILY_MESSAGE_LIMIT,
  MAX_MODEL_CALLS_PER_MESSAGE,
  nextUaeMidnight,
  uaeDay,
} from './limits.ts';
import { buildModelRequest, callModel, type AssistantTurn } from './openRouter.ts';
import { buildSystemPrompt, type Speaker } from './prompt.ts';
import { askQuestionKind, type QuestionKind } from './questionKind.ts';
import {
  isObject,
  MAX_CHAT_BODY_BYTES,
  questionHash,
  validateChatRequest,
  validateRouteRequest,
  type ChatTurn,
} from './request.ts';

/**
 * Why a call was refused, as the browser shows it (LIN-72 has the lines):
 * - `daily_limit`: the account has used its messages for the UAE day;
 * - `credit_gone`: the owner's OpenRouter credit is used up;
 * - `not_signed_in`: no valid Supabase session;
 * - `failed`: anything else. `code` says what, for logs and tests.
 * Read the cause, not the HTTP status: `daily_limit` and `message_call_limit`
 * are both 429.
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

/**
 * The 200 answer to a route (LIN-73). `questionKind` is null when TypeSafe is
 * not set up, failed, was slow or was busy: the browser then sends the message
 * to the model, and the user sees no error. `speaker` is the signed-in
 * Person, for questions about "me" and "my".
 */
export interface RouteResponse {
  questionKind: QuestionKind | null;
  speaker: Speaker | null;
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

function databaseRefusal(err: unknown, log: (message: string) => void): Response {
  if (!(err instanceof DatabaseError)) throw err;
  log(`family-chat: database: ${err.message}`);
  return refuse(503, 'database_unavailable', 'failed', 'The chat is unavailable. Try again.');
}

/** The model may take a while with tools; one slow attempt is abandoned after this. */
const MODEL_ATTEMPT_TIMEOUT_MS = 60_000;

/**
 * Jev answers in about half a second. Past this the message goes to the
 * model instead: the user is waiting, and the model can answer it anyway.
 */
const JEV_ATTEMPT_TIMEOUT_MS = 2_500;
/** One short retry for a 429 or 529, whatever `Retry-After` asks for. */
const JEV_RETRY = { retries: 1, baseDelayMs: 200, maxDelayMs: 500 } as const;

/**
 * Records one call for a message, or refuses it. The quota itself, or the
 * response to send back when the call may not be made.
 */
async function countCall(
  db: ServiceRoleEnv,
  args: { userId: string; messageId: string; turns: ChatTurn[]; now: Date },
  fetchImpl: FetchLike,
  log: (message: string) => void,
): Promise<{ usage: ChatUsage } | { refusal: Response }> {
  let quota: QuotaOutcome;
  try {
    quota = await recordModelCall(
      db,
      {
        userId: args.userId,
        messageId: args.messageId,
        questionHash: await questionHash(args.turns),
        uaeDay: uaeDay(args.now),
        dailyLimit: DAILY_MESSAGE_LIMIT,
        maxModelCalls: MAX_MODEL_CALLS_PER_MESSAGE,
      },
      fetchImpl,
    );
  } catch (err) {
    return { refusal: databaseRefusal(err, log) };
  }

  const usage: ChatUsage = {
    messagesUsed: quota.messagesUsed,
    dailyLimit: DAILY_MESSAGE_LIMIT,
    modelCalls: quota.modelCalls,
    maxModelCalls: MAX_MODEL_CALLS_PER_MESSAGE,
    resetsAt: nextUaeMidnight(args.now).toISOString(),
  };
  switch (quota.outcome) {
    case 'ok':
      return { usage };
    case 'daily_limit':
      return {
        refusal: refuse(429, 'daily_limit', 'daily_limit', `You have used your ${DAILY_MESSAGE_LIMIT} messages for today.`, usage),
      };
    case 'message_call_limit':
      return {
        refusal: refuse(
          429,
          'message_call_limit',
          'failed',
          `One message can use at most ${MAX_MODEL_CALLS_PER_MESSAGE} model calls.`,
          usage,
        ),
      };
    case 'message_id_reused':
      return { refusal: refuse(409, 'message_id_reused', 'failed', 'Each new question needs a new messageId.', usage) };
  }
}

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
    const cause: RefusalCause = auth.reason === 'auth-unavailable' ? 'failed' : 'not_signed_in';
    return authRefusal(auth, { cause });
  }

  // 2. What they sent.
  const body = await readJsonBody(req, MAX_CHAT_BODY_BYTES);
  const db: ServiceRoleEnv = { supabaseUrl, serviceRoleKey };
  if (isObject(body) && body.operation === 'route') {
    return route(body, { db, userId: auth.userId, now, fetchImpl, deps, log });
  }
  if (isObject(body) && body.operation !== undefined && body.operation !== 'chat') {
    return refuse(400, 'invalid_operation', 'failed', 'operation must be "chat" or "route".');
  }
  const validation = validateChatRequest(body);
  if (!validation.ok) return refuse(400, validation.code, 'failed', validation.message);
  const { messageId, turns } = validation.request;

  const apiKey = deps.env('OPENROUTER_API_KEY')?.trim();
  if (!apiKey) {
    log('family-chat: the OPENROUTER_API_KEY secret is not set on this project');
    return refuse(500, 'not_configured', 'failed', 'The chat is not configured.');
  }

  // 3. Whether this call may be made. Without the count the limit cannot
  //    hold, so a database failure means the model is not called.
  const counted = await countCall(db, { userId: auth.userId, messageId, turns, now }, fetchImpl, log);
  if ('refusal' in counted) return counted.refusal;
  const { usage } = counted;

  // 4. Who is asking, in the tree.
  let speaker: Speaker | null;
  try {
    speaker = await findSpeaker(db, auth.userId, fetchImpl);
  } catch (err) {
    return databaseRefusal(err, log);
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

/**
 * The route operation (LIN-73): count the message, then ask Jev what kind of
 * question it is. Any TypeSafe failure is logged and answered with no reading,
 * never refused: the browser then sends the message to the model.
 */
async function route(
  body: Record<string, unknown>,
  ctx: {
    db: ServiceRoleEnv;
    userId: string;
    now: Date;
    fetchImpl: FetchLike;
    deps: FamilyChatDeps;
    log: (message: string) => void;
  },
): Promise<Response> {
  const { db, userId, now, fetchImpl, deps, log } = ctx;
  const validation = validateRouteRequest(body);
  if (!validation.ok) return refuse(400, validation.code, 'failed', validation.message);
  const { messageId, message } = validation.request;

  // The same hash a model call for this message takes, so the calls after a
  // route continue its row.
  const turns: ChatTurn[] = [{ role: 'user', content: message }];
  const counted = await countCall(db, { userId, messageId, turns, now }, fetchImpl, log);
  if ('refusal' in counted) return counted.refusal;

  const apiKey = deps.env('TYPESAFE_API_KEY')?.trim();
  if (!apiKey) log('family-chat: the TYPESAFE_API_KEY secret is not set; the message goes to the model');

  let speaker: Speaker | null;
  let questionKind: QuestionKind | null = null;
  try {
    const [found, outcome] = await Promise.all([
      findSpeaker(db, userId, fetchImpl),
      apiKey
        ? askQuestionKind(message, apiKey, {
            attemptTimeoutMs: JEV_ATTEMPT_TIMEOUT_MS,
            ...JEV_RETRY,
            ...deps.retry,
            fetchImpl,
          })
        : null,
    ]);
    speaker = found;
    if (outcome?.ok) {
      questionKind = outcome.answer;
    } else if (outcome) {
      // The provider's own words go to the log only, and never with the key.
      const detail = 'detail' in outcome && apiKey ? outcome.detail.split(apiKey).join('[TYPESAFE_API_KEY]') : '';
      const status = 'status' in outcome ? ` ${outcome.status}` : '';
      log(`family-chat: TypeSafe ${outcome.kind}${status}: ${detail}; the message goes to the model`);
    }
  } catch (err) {
    return databaseRefusal(err, log);
  }

  const answer: RouteResponse = { questionKind, speaker, usage: counted.usage };
  return jsonResponse(answer);
}
