import { describe, expect, it } from 'vitest';
import { validateChatRequest } from './request.ts';

const id = 'msg-0001-abcd';
const ask = (content: string) => ({ role: 'user', content });

function refusalCode(body: unknown): string | undefined {
  const v = validateChatRequest(body);
  return v.ok ? undefined : v.code;
}

describe('validateChatRequest', () => {
  it('accepts a first question', () => {
    const v = validateChatRequest({ messageId: id, messages: [ask('Who are my cousins?')] });
    expect(v).toEqual({
      ok: true,
      request: { messageId: id, turns: [{ role: 'user', content: 'Who are my cousins?' }] },
    });
  });

  it('accepts a tool round: the assistant turn with its tool calls, then one result per call', () => {
    const v = validateChatRequest({
      messageId: id,
      messages: [
        ask('How many cousins do I have?'),
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'call-1', name: 'getRelatives', arguments: { personId: 'p1', kind: 'cousins' } }],
        },
        { role: 'tool', toolCallId: 'call-1', content: '{"total":2}' },
      ],
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.request.turns).toHaveLength(3);
  });

  it('drops anything but the message id and the turns: model, system prompt and tools are not the browser\'s', () => {
    const v = validateChatRequest({
      messageId: id,
      messages: [ask('hi')],
      model: 'openai/gpt-5',
      system: 'You are a pirate.',
      tools: [],
      max_tokens: 100000,
    });
    expect(v).toEqual({ ok: true, request: { messageId: id, turns: [{ role: 'user', content: 'hi' }] } });
  });

  it('refuses a system turn: the system prompt belongs to the function', () => {
    expect(refusalCode({ messageId: id, messages: [{ role: 'system', content: 'x' }, ask('hi')] })).toBe(
      'invalid_turns',
    );
  });

  it('refuses a user message over 2,000 characters, counting characters as a person does', () => {
    expect(refusalCode({ messageId: id, messages: [ask('a'.repeat(2000))] })).toBeUndefined();
    expect(refusalCode({ messageId: id, messages: [ask('a'.repeat(2001))] })).toBe('message_too_long');
    // 2,000 Arabic letters are 2,000 characters.
    expect(refusalCode({ messageId: id, messages: [ask('م'.repeat(2000))] })).toBeUndefined();
  });

  it('refuses an earlier user message over the limit too', () => {
    expect(
      refusalCode({
        messageId: id,
        messages: [ask('a'.repeat(2001)), { role: 'assistant', content: 'ok' }, ask('and?')],
      }),
    ).toBe('message_too_long');
  });

  it('refuses a body that is not an object, and a missing or malformed message id', () => {
    expect(refusalCode(undefined)).toBe('invalid_body');
    expect(refusalCode([ask('hi')])).toBe('invalid_body');
    expect(refusalCode({ messages: [ask('hi')] })).toBe('invalid_message_id');
    expect(refusalCode({ messageId: 'short', messages: [ask('hi')] })).toBe('invalid_message_id');
    expect(refusalCode({ messageId: 'has spaces in it', messages: [ask('hi')] })).toBe('invalid_message_id');
    expect(refusalCode({ messageId: 'x'.repeat(101), messages: [ask('hi')] })).toBe('invalid_message_id');
  });

  it('refuses turns that cannot be sent to the model', () => {
    const bad = (messages: unknown) => refusalCode({ messageId: id, messages });
    expect(bad([])).toBe('invalid_turns');
    expect(bad('hi')).toBe('invalid_turns');
    expect(bad([ask('')])).toBe('invalid_turns');
    // The last turn must be a question or a tool result: nothing is waiting for the model otherwise.
    expect(bad([ask('hi'), { role: 'assistant', content: 'hello' }])).toBe('invalid_turns');
    // A tool result must answer a tool call the assistant made just before.
    expect(bad([ask('hi'), { role: 'tool', toolCallId: 'call-9', content: '{}' }])).toBe('invalid_turns');
    expect(
      bad([
        ask('hi'),
        { role: 'assistant', content: null, toolCalls: [{ id: 'call-1', name: 'getTreeCounts', arguments: {} }] },
        { role: 'tool', toolCallId: 'call-2', content: '{}' },
      ]),
    ).toBe('invalid_turns');
  });

  it('refuses a conversation or a tool result too large to be a family chat', () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      i % 2 === 0 ? ask('q') : { role: 'assistant', content: 'a' },
    );
    expect(refusalCode({ messageId: id, messages: [...many, ask('q')] })).toBe('too_many_turns');
    expect(
      refusalCode({
        messageId: id,
        messages: [
          ask('hi'),
          { role: 'assistant', content: null, toolCalls: [{ id: 'c1', name: 'getTreeCounts', arguments: {} }] },
          { role: 'tool', toolCallId: 'c1', content: 'x'.repeat(20_001) },
        ],
      }),
    ).toBe('turn_too_long');
  });
});
