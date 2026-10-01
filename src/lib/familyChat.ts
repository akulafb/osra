/**
 * One family-chat question, answered through the family-chat function
 * (LIN-71) with tools that run on the Working Record (LIN-72).
 *
 * The browser sends the conversation turns; the function asks the model. When
 * the model wants a fact, the reply carries tool calls instead of text: they
 * run here (`chatTools.ts`) and their results go back under the same
 * `messageId`, until the model answers or the call cap is reached. The tree
 * itself is never sent.
 *
 * The transport is passed in, so the whole loop runs under `npm test` with
 * the model scripted.
 */
import type { ChatResponse, ChatUsage, RefusalCause } from '../../supabase/functions/family-chat/handler.ts';
import {
  DAILY_MESSAGE_LIMIT,
  MAX_MODEL_CALLS_PER_MESSAGE,
} from '../../supabase/functions/family-chat/limits.ts';
import {
  MAX_CHAT_BODY_BYTES,
  MAX_TURNS,
  type ChatTurn,
} from '../../supabase/functions/family-chat/request.ts';
import { runChatTool, type ChatRecord } from './chatTools';

/** The body the family-chat function takes. */
export interface ChatRequestBody {
  messageId: string;
  messages: ChatTurn[];
}

/**
 * What one call to the function came to: the model's turn, or the cause the
 * function gave for refusing (`usage` comes with a limit refusal).
 */
export type ChatSendResult =
  | { ok: true; reply: ChatResponse }
  | { ok: false; cause: RefusalCause; usage?: ChatUsage };

export type SendChat = (request: ChatRequestBody) => Promise<ChatSendResult>;

export interface AskFamilyChat {
  question: string;
  /** The turns of earlier questions in this chat, oldest first. */
  history: readonly ChatTurn[];
  /** The Working Record, read at send time. */
  record: ChatRecord;
  send: SendChat;
  /** New for each question; every call for this question repeats it. */
  messageId: string;
}

/** The causes the user sees a line for. Every other refusal is `failed`. */
export type ChatFailureCause = 'daily_limit' | 'credit_gone' | 'failed';

/** The lines the user sees when the chat cannot answer (LIN-72). */
export const CHAT_LINES: Record<ChatFailureCause, string> = {
  credit_gone: "Hey fam. The chat credits I provide have run out. I'll recharge soon.",
  daily_limit: `You have used your ${DAILY_MESSAGE_LIMIT} messages for today. Come back tomorrow.`,
  failed: 'Sorry, the chat did not work. Please try again.',
};

export type ChatOutcome =
  /** `turns` is the history with this question, its tool rounds and the answer added. */
  | { ok: true; answer: string; turns: ChatTurn[] }
  /** `resetsAt` (ISO 8601) is when a daily limit lifts. */
  | { ok: false; cause: ChatFailureCause; line: string; resetsAt?: string };

function failure(cause: ChatFailureCause, resetsAt?: string): ChatOutcome {
  return { ok: false, cause, line: CHAT_LINES[cause], ...(resetsAt && { resetsAt }) };
}

function refusal(cause: RefusalCause, usage: ChatUsage | undefined): ChatOutcome {
  if (cause === 'daily_limit') return failure('daily_limit', usage?.resetsAt);
  if (cause === 'credit_gone') return failure('credit_gone');
  return failure('failed');
}

/** A UUID, the shape of every Person id in the Tree Record. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shorter ids can be ordinary words ("Omar"); a bare one is left alone. */
const MIN_BARE_ID_CHARS = 8;

/**
 * Takes every Person id out of a reply. Ids are in the tool results so the
 * model can chain calls, and the function's prompt forbids showing them, but a
 * live test still wrote "Karim Hajjaj (p8)". An id in brackets goes with its
 * brackets (and a "personId:" label); a bare one goes with the space before it.
 * Any UUID goes too, whether or not it is a Person in the Working Record.
 */
export function hideIds(text: string, personIds: ReadonlySet<string>): string {
  return text
    .replace(/\s*[([]\s*(?:person\s*id|id)?\s*[:=]?\s*([A-Za-z0-9_-]+)\s*[)\]]/gi, (match, id: string) =>
      personIds.has(id) || UUID.test(id) ? '' : match,
    )
    .replace(/(\s*)(?:(?:person\s*id|id)\s*[:=]?\s*)?([A-Za-z0-9_-]+)/gi, (match, _space: string, id: string) =>
      (personIds.has(id) && id.length >= MIN_BARE_ID_CHARS) || UUID.test(id) ? '' : match,
    );
}

/** Size as the function measures its body limit: UTF-8 bytes. */
function bodyBytes(body: ChatRequestBody): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

/** Room left under the function's body limit for the JSON around the turns. */
const BODY_BUDGET_BYTES = MAX_CHAT_BODY_BYTES - 1024;

/** Whether a request is within the function's turn and size caps. */
function fits(messageId: string, messages: ChatTurn[]): boolean {
  return messages.length <= MAX_TURNS && bodyBytes({ messageId, messages }) <= BODY_BUDGET_BYTES;
}

/**
 * The turns to send: the current question's turns, after as many earlier
 * ones as fit the function's turn and size caps. Earlier questions are
 * dropped oldest first and whole, so a tool result never loses its call.
 * Null when the current question's turns do not fit on their own.
 */
function fitTurns(history: readonly ChatTurn[], current: readonly ChatTurn[], messageId: string): ChatTurn[] | null {
  let kept = history;
  while (!fits(messageId, [...kept, ...current])) {
    if (kept.length === 0) return null;
    const nextQuestion = kept.findIndex((turn, i) => i > 0 && turn.role === 'user');
    kept = nextQuestion === -1 ? [] : kept.slice(nextQuestion);
  }
  return [...kept, ...current];
}

export async function askFamilyChat({ question, history, record, send, messageId }: AskFamilyChat): Promise<ChatOutcome> {
  const current: ChatTurn[] = [{ role: 'user', content: question }];
  // The function counts the same cap; stopping here saves a call it would refuse.
  for (let call = 0; call < MAX_MODEL_CALLS_PER_MESSAGE; call++) {
    const turns = fitTurns(history, current, messageId);
    // The function would refuse it; one question asked for more than a request holds.
    if (!turns) return failure('failed');
    let result: ChatSendResult;
    try {
      result = await send({ messageId, messages: turns });
    } catch {
      return failure('failed');
    }
    if (!result.ok) return refusal(result.cause, result.usage);

    const { message, done } = result.reply;
    if (done) {
      const answer = hideIds(message.content ?? '', new Set(record.nodes.map((node) => node.id))).trim();
      if (answer === '') return failure('failed');
      return { ok: true, answer, turns: [...turns, { role: 'assistant', content: answer }] };
    }
    // No call is left to send the results on, so the tools are not run.
    if (call === MAX_MODEL_CALLS_PER_MESSAGE - 1) break;
    current.push(message);
    for (const toolCall of message.toolCalls ?? []) {
      current.push({ role: 'tool', toolCallId: toolCall.id, content: runChatTool(toolCall, record) });
    }
  }
  return failure('failed');
}
