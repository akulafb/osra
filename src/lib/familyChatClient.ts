import type {
  ChatResponse,
  ChatUsage,
  RefusalCause,
  RouteResponse,
} from '../../supabase/functions/family-chat/handler.ts';
import { isObject } from '../../supabase/functions/family-chat/request.ts';
import {
  GENDERS,
  RELATIONS,
  SIDES,
  SUBJECTS,
  type QuestionKind,
} from '../../supabase/functions/family-chat/questionKind.ts';
import type { ChatSendResult, RouteChat, RouteSendResult, SendChat } from './familyChat';

/**
 * Calls the `family-chat` Edge Function (LIN-71) through the browser Supabase
 * client, which attaches the signed-in session. The browser holds no model
 * key: the function owns the key, the model, the prompt and the tool list.
 *
 * Contract: `{ messageId, messages, final? }` in; `{ message, done, usage, cost }` out, or
 * `{ error: { code, cause, message, usage? } }` on refusal. Any failure or
 * unexpected shape becomes `{ ok: false, cause: 'failed' }`; this never throws.
 */
export const invokeFamilyChat: SendChat = async (request) => {
  try {
    // Loaded on first use, not at import: `./supabase` throws without env vars.
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.functions.invoke<unknown>('family-chat', { body: request });
    return await readChatReply({ data, error });
  } catch {
    return { ok: false, cause: 'failed' };
  }
};

/**
 * Asks the family-chat function's route operation (LIN-73) what kind of
 * question the message is. Contract: `{ operation: 'route', messageId,
 * message }` in; `{ questionKind, speaker, usage }` out, or a refusal as for a
 * chat call. Never throws.
 */
export const invokeChatRoute: RouteChat = async (request) => {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.functions.invoke<unknown>('family-chat', { body: request });
    return await readRouteReply({ data, error });
  } catch {
    return { ok: false, cause: 'failed' };
  }
};

const CAUSES = ['daily_limit', 'credit_gone', 'not_signed_in', 'failed'] as const satisfies readonly RefusalCause[];
// Fails to compile when the function gains a cause this list does not know.
const everyCauseKnown: Exclude<RefusalCause, (typeof CAUSES)[number]> extends never ? true : never = true;
void everyCauseKnown;

/**
 * Turns what `supabase.functions.invoke` gave back into a result. A refusal
 * (any non-2xx) arrives as an error whose `context` is the Response; its
 * body's `cause` says which line the user sees.
 */
export async function readChatReply({ data, error }: { data: unknown; error: unknown }): Promise<ChatSendResult> {
  if (error) return readRefusal(error);

  if (!isObject(data) || !isObject(data.message) || typeof data.done !== 'boolean' || !isObject(data.usage)) {
    return { ok: false, cause: 'failed' };
  }
  const { message } = data;
  if (message.role !== 'assistant') return { ok: false, cause: 'failed' };
  const hasText = typeof message.content === 'string' && message.content !== '';
  if (message.toolCalls !== undefined && !Array.isArray(message.toolCalls)) return { ok: false, cause: 'failed' };
  const hasToolCalls = Array.isArray(message.toolCalls) && message.toolCalls.length > 0;
  // `done` means a reply with no tool call; anything else is a shape the loop cannot follow.
  if (!hasText && !hasToolCalls) return { ok: false, cause: 'failed' };
  if (data.done === hasToolCalls) return { ok: false, cause: 'failed' };
  // Checked as far as the loop relies on; each tool call's arguments are checked when it runs.
  return { ok: true, reply: data as unknown as ChatResponse };
}

/** A refusal (any non-2xx) arrives as an error whose `context` is the Response. */
async function readRefusal(error: unknown): Promise<{ ok: false; cause: RefusalCause; usage?: ChatUsage }> {
  const response = isObject(error) ? error.context : undefined;
  if (!(response instanceof Response)) return { ok: false, cause: 'failed' };
  const body: unknown = await response.json().catch(() => null);
  const refusal = isObject(body) && isObject(body.error) ? body.error : null;
  const cause = refusal && CAUSES.find((c) => c === refusal.cause);
  if (!cause) return { ok: false, cause: 'failed' };
  // `usage` is only read for when a daily limit lifts.
  return isObject(refusal.usage) ? { ok: false, cause, usage: refusal.usage as unknown as ChatUsage } : { ok: false, cause };
}

/** The values each of Jev's five answers may take; the code that answers reads no other. */
const ANSWER_VALUES: Record<keyof QuestionKind, readonly unknown[]> = {
  relation: RELATIONS,
  side: SIDES,
  gender: GENDERS,
  subject: SUBJECTS,
  wantsCount: [true, false],
};

/** The function's reading, when each answer is one the code knows, with a confidence; otherwise null. */
function usableQuestionKind(value: unknown): QuestionKind | null {
  if (!isObject(value)) return null;
  const usable = (Object.keys(ANSWER_VALUES) as Array<keyof QuestionKind>).every((field) => {
    const answer = value[field];
    return isObject(answer) && ANSWER_VALUES[field].includes(answer.value) && typeof answer.confidence === 'number';
  });
  return usable ? (value as unknown as QuestionKind) : null;
}

/** Turns what `supabase.functions.invoke` gave back for a route into a result. */
export async function readRouteReply({ data, error }: { data: unknown; error: unknown }): Promise<RouteSendResult> {
  if (error) return readRefusal(error);
  if (!isObject(data) || !isObject(data.usage) || typeof data.usage.modelCalls !== 'number') {
    return { ok: false, cause: 'failed' };
  }
  const { speaker } = data;
  if (speaker !== null && !(isObject(speaker) && typeof speaker.personId === 'string' && typeof speaker.displayName === 'string')) {
    return { ok: false, cause: 'failed' };
  }
  return {
    ok: true,
    reply: {
      questionKind: usableQuestionKind(data.questionKind),
      speaker: speaker as RouteResponse['speaker'],
      usage: data.usage as unknown as ChatUsage,
    },
  };
}
