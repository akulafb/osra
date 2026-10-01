/**
 * The one call to OpenRouter for the family chat: the request the function
 * builds (its model, its system prompt, its tools, its reply cap) and the
 * answer sorted into a reply, a tool call, or a failure the browser can name.
 *
 * Shapes checked with live calls to x-ai/grok-4.3 on 2026-10-01: a tool call
 * comes back with `finish_reason: "tool_calls"`, `content: null` and
 * `tool_calls[].function.arguments` as a JSON string; the model also returns
 * `reasoning`, which is never passed on.
 */

import { fetchWithRetry, RETRYABLE_STATUSES, type RetryOptions } from '../_shared/retry.ts';
import { MAX_REPLY_TOKENS } from './limits.ts';
import { FINAL_CALL_NOTE } from './prompt.ts';
import { isObject, type ChatTurn, type ToolCall } from './request.ts';
import { CHAT_TOOLS } from './tools.ts';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const CHAT_MODEL = 'x-ai/grok-4.3';

/** An assistant turn as the browser gets it, ready to append to its turns. */
export type AssistantTurn = Extract<ChatTurn, { role: 'assistant' }>;

export type ModelOutcome =
  /** `cost` is OpenRouter's `usage.cost` for the call, in US dollars; null when it gave none. */
  | { ok: true; message: AssistantTurn; cost: number | null }
  /** OpenRouter says the account or the key has no credit left (402, or a key limit). */
  | { ok: false; kind: 'credit_gone'; status: number; detail: string }
  /** Still 429 or 529 after the retries. */
  | { ok: false; kind: 'busy'; status: number }
  /** Any other refusal, or an answer that is neither a reply nor a tool call. */
  | { ok: false; kind: 'failed'; status: number; detail: string }
  /** No answer at all: network error or timeout. */
  | { ok: false; kind: 'unreachable'; detail: string };

type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

function toWire(turn: ChatTurn): WireMessage {
  switch (turn.role) {
    case 'user':
      return { role: 'user', content: turn.content };
    case 'tool':
      return { role: 'tool', tool_call_id: turn.toolCallId, content: turn.content };
    case 'assistant':
      if (!turn.toolCalls?.length) return { role: 'assistant', content: turn.content };
      return {
        role: 'assistant',
        content: turn.content,
        tool_calls: turn.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
        })),
      };
  }
}

/**
 * Everything but the turns is fixed here; nothing the browser sends can change
 * it. On a message's final call (LIN-80) the model may call no tool, and the
 * system prompt tells it to answer now.
 */
export function buildModelRequest(systemPrompt: string, turns: ChatTurn[], { final = false } = {}) {
  const system = final ? `${systemPrompt}\n\n${FINAL_CALL_NOTE}` : systemPrompt;
  return {
    model: CHAT_MODEL,
    messages: [{ role: 'system', content: system } as WireMessage, ...turns.map(toWire)],
    tools: CHAT_TOOLS,
    tool_choice: final ? 'none' : 'auto',
    max_tokens: MAX_REPLY_TOKENS,
  };
}

/**
 * A reply the reply cap cut off, back to its last whole sentence or line, so
 * the user never sees half a word. Unchanged when no sentence ended.
 */
function toLastWholeSentence(text: string): string {
  const ends = [...text.matchAll(/[.!?](?:\*\*)?(?=\s|$)|\n/g)];
  const last = ends[ends.length - 1];
  if (!last || last.index === undefined) return text;
  const cut = text.slice(0, last.index + last[0].length).trim();
  return cut === '' ? text : cut;
}

function parseArguments(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') return isObject(raw) ? raw : null;
  try {
    const parsed: unknown = JSON.parse(raw === '' ? '{}' : raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The assistant turn in a 200 answer, or null when there is neither text nor a tool call. */
function readAssistantTurn(json: unknown): AssistantTurn | null {
  const choice = isObject(json) && Array.isArray(json.choices) ? json.choices[0] : undefined;
  const message = isObject(choice) ? choice.message : undefined;
  if (!isObject(message)) return null;

  const toolCalls: ToolCall[] = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
    .filter(isObject)
    .map((call) => {
      const fn = isObject(call.function) ? call.function : {};
      return {
        id: typeof call.id === 'string' ? call.id : '',
        name: typeof fn.name === 'string' ? fn.name : '',
        arguments: parseArguments(fn.arguments),
      };
    })
    .filter((call) => call.id !== '' && call.name !== '');

  let content = typeof message.content === 'string' && message.content.trim() !== '' ? message.content : null;
  if (content !== null && toolCalls.length === 0 && isObject(choice) && choice.finish_reason === 'length') {
    content = toLastWholeSentence(content);
  }
  if (toolCalls.length > 0) return { role: 'assistant', content, toolCalls };
  if (content !== null) return { role: 'assistant', content };
  return null;
}

/**
 * OpenRouter answers 402 when the account or the key is out of credit. A key
 * whose own limit is reached has also been reported as a 403 "Key limit
 * exceeded"; that wording is matched so the browser shows the credit line.
 */
function isCreditGone(status: number, message: string): boolean {
  return status === 402 || (status === 403 && /key limit|credit/i.test(message));
}

function errorOf(json: unknown): { code: number | null; message: string } | null {
  if (!isObject(json) || !isObject(json.error)) return null;
  const { code, message } = json.error;
  return { code: typeof code === 'number' ? code : null, message: typeof message === 'string' ? message : '' };
}

export async function callModel(
  body: ReturnType<typeof buildModelRequest>,
  apiKey: string,
  retryOptions: RetryOptions = {},
): Promise<ModelOutcome> {
  let res: Response;
  try {
    res = await fetchWithRetry(
      OPENROUTER_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Osra - 3D Family Tree',
        },
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

  const text = await res.text().catch(() => '');
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON; handled below.
  }
  const error = errorOf(json);

  if (!res.ok) {
    const message = error?.message ?? text.slice(0, 300);
    if (isCreditGone(res.status, message)) {
      return { ok: false, kind: 'credit_gone', status: res.status, detail: message };
    }
    return { ok: false, kind: 'failed', status: res.status, detail: message.slice(0, 500) };
  }

  // A 200 can carry only an error object when the provider failed.
  if (error) {
    const status = error.code ?? res.status;
    if (isCreditGone(status, error.message)) {
      return { ok: false, kind: 'credit_gone', status, detail: error.message };
    }
    return { ok: false, kind: 'failed', status, detail: error.message.slice(0, 500) };
  }

  const message = readAssistantTurn(json);
  if (!message) {
    return { ok: false, kind: 'failed', status: res.status, detail: 'the answer had no text and no tool call' };
  }
  const usage = isObject(json) && isObject(json.usage) ? json.usage : {};
  const cost = typeof usage.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : null;
  return { ok: true, message, cost };
}
