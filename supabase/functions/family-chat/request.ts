/**
 * What the browser may send the family-chat function: one message id and the
 * conversation turns, nothing else (LIN-71). The model, the system prompt and
 * the tool list are the function's; any other field in the body is dropped,
 * and a `system` turn is refused, so the key cannot be used for other work.
 *
 * One user message can take several calls: the model asks for tools, the
 * browser runs them on the Working Record and calls again with the same
 * `messageId` and the results appended.
 */

import { MAX_USER_MESSAGE_CHARS } from './limits.ts';

/** A tool call as the browser runs it: the arguments are already parsed. */
export interface ToolCall {
  /** Echo it back as `toolCallId` on the tool turn that answers this call. */
  id: string;
  name: string;
  /**
   * The model's arguments, parsed from JSON. `null` when the model sent text
   * that is not a JSON object; answer such a call with a tool turn that says so.
   * The model is not trusted: check the arguments before running the tool.
   */
  arguments: Record<string, unknown> | null;
}

export type ChatTurn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface ChatRequest {
  messageId: string;
  turns: ChatTurn[];
  /**
   * The message's last call (LIN-80): the browser sends it once the message
   * has passed its cost cap or is on its last allowed call. The model may then
   * call no tool and must answer from the results so far.
   */
  final: boolean;
}

export type ChatRequestValidation =
  | { ok: true; request: ChatRequest }
  | { ok: false; code: string; message: string };

/** A UUID fits; so does any other id of letters, digits, `-` and `_`. */
const MESSAGE_ID = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Turns in one request. A tool round adds an assistant turn and one turn per
 * tool call, so this is a handful of earlier questions plus the current one;
 * the browser trims older turns, keeping each tool result with its call.
 */
export const MAX_TURNS = 80;
/** A tool result for a long list of relatives fits; the whole tree does not. */
export const MAX_TOOL_RESULT_CHARS = 20_000;
export const MAX_ASSISTANT_CHARS = 8_000;
export const MAX_TOOL_CALLS_PER_TURN = 20;
const MAX_ID_CHARS = 200;
const MAX_TOOL_NAME_CHARS = 64;
const MAX_ARGUMENTS_CHARS = 2_000;

/** The real bound on a request's size; the per-turn caps keep any one turn sane. */
export const MAX_CHAT_BODY_BYTES = 256 * 1024;

class Refusal extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const INVALID_MESSAGE_ID = 'messageId must be 8 to 100 letters, digits, "-" or "_".';
const MESSAGE_TOO_LONG = `A message can be at most ${MAX_USER_MESSAGE_CHARS} characters.`;

/** Length as a person counts it: "محمد" is four, not the UTF-16 unit count. */
function characterCount(s: string): number {
  return [...s].length;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value !== '' && value.length <= max;
}

function badTurn(index: number, why: string): never {
  throw new Refusal('invalid_turns', `messages[${index}]: ${why}`);
}

function parseToolCall(raw: unknown, index: number): ToolCall {
  if (!isObject(raw)) badTurn(index, 'each tool call must be an object');
  const { id, name, arguments: args } = raw;
  if (!boundedString(id, MAX_ID_CHARS)) badTurn(index, 'a tool call needs an id');
  if (!boundedString(name, MAX_TOOL_NAME_CHARS)) badTurn(index, 'a tool call needs a name');
  if (args !== null && !isObject(args)) badTurn(index, 'tool call arguments must be an object or null');
  if (JSON.stringify(args).length > MAX_ARGUMENTS_CHARS) badTurn(index, 'tool call arguments are too long');
  return { id, name, arguments: args };
}

function parseTurn(raw: unknown, index: number): ChatTurn {
  if (!isObject(raw)) badTurn(index, 'each turn must be an object');
  switch (raw.role) {
    case 'user': {
      if (typeof raw.content !== 'string' || raw.content.trim() === '') {
        badTurn(index, 'a user turn needs text');
      }
      if (characterCount(raw.content) > MAX_USER_MESSAGE_CHARS) throw new Refusal('message_too_long', MESSAGE_TOO_LONG);
      return { role: 'user', content: raw.content };
    }
    case 'assistant': {
      const { content, toolCalls } = raw;
      if (content !== null && content !== undefined && typeof content !== 'string') {
        badTurn(index, 'assistant content must be text or null');
      }
      if (typeof content === 'string' && content.length > MAX_ASSISTANT_CHARS) {
        throw new Refusal('turn_too_long', `messages[${index}] is too long.`);
      }
      if (toolCalls === undefined || (Array.isArray(toolCalls) && toolCalls.length === 0)) {
        if (typeof content !== 'string' || content === '') badTurn(index, 'an assistant turn needs text or tool calls');
        return { role: 'assistant', content };
      }
      if (!Array.isArray(toolCalls) || toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
        badTurn(index, `toolCalls must be a list of at most ${MAX_TOOL_CALLS_PER_TURN}`);
      }
      return {
        role: 'assistant',
        content: typeof content === 'string' && content !== '' ? content : null,
        toolCalls: toolCalls.map((call) => parseToolCall(call, index)),
      };
    }
    case 'tool': {
      if (!boundedString(raw.toolCallId, MAX_ID_CHARS)) badTurn(index, 'a tool turn needs toolCallId');
      if (typeof raw.content !== 'string') badTurn(index, 'a tool turn needs content');
      if (raw.content.length > MAX_TOOL_RESULT_CHARS) {
        throw new Refusal('turn_too_long', `messages[${index}] is too long.`);
      }
      return { role: 'tool', toolCallId: raw.toolCallId, content: raw.content };
    }
    default:
      return badTurn(index, 'role must be user, assistant or tool');
  }
}

/** The order the model needs: every tool result answers a call made just before it. */
function checkOrder(turns: ChatTurn[]): void {
  let open = new Set<string>();
  turns.forEach((turn, index) => {
    if (turn.role === 'tool') {
      if (!open.has(turn.toolCallId)) badTurn(index, 'a tool result must answer a tool call just before it');
      open.delete(turn.toolCallId);
      return;
    }
    open = new Set(turn.role === 'assistant' ? (turn.toolCalls ?? []).map((c) => c.id) : []);
  });
  const last = turns[turns.length - 1];
  if (last.role === 'assistant') badTurn(turns.length - 1, 'the last turn must be a user message or a tool result');
}

/** Checks a request body of the form `{ messageId, messages, final? }`. */
export function validateChatRequest(body: unknown): ChatRequestValidation {
  if (!isObject(body)) {
    return { ok: false, code: 'invalid_body', message: 'Send a JSON object: { messageId, messages }.' };
  }
  const { messageId, messages, final = false } = body;
  if (typeof messageId !== 'string' || !MESSAGE_ID.test(messageId)) {
    return { ok: false, code: 'invalid_message_id', message: INVALID_MESSAGE_ID };
  }
  if (typeof final !== 'boolean') {
    return { ok: false, code: 'invalid_final', message: 'final must be true or false.' };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, code: 'invalid_turns', message: 'messages must be a non-empty list.' };
  }
  if (messages.length > MAX_TURNS) {
    return { ok: false, code: 'too_many_turns', message: `Send at most ${MAX_TURNS} turns.` };
  }
  try {
    const turns = messages.map(parseTurn);
    checkOrder(turns);
    return { ok: true, request: { messageId, turns, final } };
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}

/**
 * SHA-256 (hex) of the last user turn: the question a message id belongs to.
 * A tool round or a retry repeats the question and gets the same hash; a new
 * question under an id already counted does not, and is refused.
 */
export async function questionHash(turns: ChatTurn[]): Promise<string> {
  const question = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(question));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The second operation (LIN-73): before any model call, the browser asks what
 * kind of question the message is. It sends only the message and its id; the
 * id is the one the model calls for this message will use, if any.
 */
export interface RouteRequest {
  messageId: string;
  message: string;
}

export type RouteRequestValidation =
  | { ok: true; request: RouteRequest }
  | { ok: false; code: string; message: string };

/** Checks a request body of the form `{ operation: 'route', messageId, message }`. */
export function validateRouteRequest(body: Record<string, unknown>): RouteRequestValidation {
  const { messageId, message } = body;
  if (typeof messageId !== 'string' || !MESSAGE_ID.test(messageId)) {
    return { ok: false, code: 'invalid_message_id', message: INVALID_MESSAGE_ID };
  }
  if (typeof message !== 'string' || message.trim() === '') {
    return { ok: false, code: 'invalid_message', message: 'message must be text.' };
  }
  if (characterCount(message) > MAX_USER_MESSAGE_CHARS) {
    return { ok: false, code: 'message_too_long', message: MESSAGE_TOO_LONG };
  }
  return { ok: true, request: { messageId, message } };
}
