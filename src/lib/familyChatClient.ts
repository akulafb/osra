import type { ChatResponse, ChatUsage, RefusalCause } from '../../supabase/functions/family-chat/handler.ts';
import { isObject } from '../../supabase/functions/family-chat/request.ts';
import type { ChatSendResult, SendChat } from './familyChat';

/**
 * Calls the `family-chat` Edge Function (LIN-71) through the browser Supabase
 * client, which attaches the signed-in session. The browser holds no model
 * key: the function owns the key, the model, the prompt and the tool list.
 *
 * Contract: `{ messageId, messages }` in; `{ message, done, usage }` out, or
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
  if (error) {
    const response = isObject(error) ? error.context : undefined;
    if (!(response instanceof Response)) return { ok: false, cause: 'failed' };
    const body: unknown = await response.json().catch(() => null);
    const refusal = isObject(body) && isObject(body.error) ? body.error : null;
    const cause = refusal && CAUSES.find((c) => c === refusal.cause);
    if (!cause) return { ok: false, cause: 'failed' };
    // `usage` is only read for when a daily limit lifts.
    return isObject(refusal.usage) ? { ok: false, cause, usage: refusal.usage as unknown as ChatUsage } : { ok: false, cause };
  }

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
