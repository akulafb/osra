import { describe, expect, it } from 'vitest';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { readChatReply } from './familyChatClient';

const usage = {
  messagesUsed: 3,
  dailyLimit: 10,
  modelCalls: 1,
  maxModelCalls: 6,
  resetsAt: '2026-10-01T20:00:00.000Z',
};

function refusalResponse(status: number, error: Record<string, unknown>) {
  return new FunctionsHttpError(
    new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('readChatReply', () => {
  it("passes on the model's turn", async () => {
    const reply = {
      message: {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'c1', name: 'getTreeCounts', arguments: {} }],
      },
      done: false,
      usage,
    };
    expect(await readChatReply({ data: reply, error: null })).toEqual({ ok: true, reply });
  });

  it('reads the cause and usage of a daily limit refusal', async () => {
    const error = refusalResponse(429, { code: 'daily_limit', cause: 'daily_limit', message: 'x', usage });
    expect(await readChatReply({ data: null, error })).toEqual({ ok: false, cause: 'daily_limit', usage });
  });

  it('reads the cause of a credit refusal', async () => {
    const error = refusalResponse(402, { code: 'credit_gone', cause: 'credit_gone', message: 'x' });
    expect(await readChatReply({ data: null, error })).toEqual({ ok: false, cause: 'credit_gone' });
  });

  it.each([
    ['a refusal with an unknown cause', refusalResponse(500, { code: 'x', cause: 'mystery', message: 'x' })],
    ['a refusal that is not JSON', new FunctionsHttpError(new Response('Bad gateway', { status: 502 }))],
    ['no answer at all', new FunctionsFetchError(new TypeError('Failed to fetch'))],
  ])('calls %s a failure', async (_why, error) => {
    expect(await readChatReply({ data: null, error })).toEqual({ ok: false, cause: 'failed' });
  });

  it.each([
    ['nothing', null],
    ['no message', { done: true, usage }],
    ['a message from someone else', { message: { role: 'user', content: 'hi' }, done: true, usage }],
    ['a reply with no text', { message: { role: 'assistant', content: null }, done: true, usage }],
    ['done set with tool calls', { message: { role: 'assistant', content: null, toolCalls: [{ id: 'c', name: 'getTreeCounts', arguments: {} }] }, done: true, usage }],
    ['text but not done', { message: { role: 'assistant', content: 'hi' }, done: false, usage }],
    ['tool calls that are not a list', { message: { role: 'assistant', content: null, toolCalls: 'x' }, done: false, usage }],
  ])('calls a 200 with %s a failure', async (_why, data) => {
    expect(await readChatReply({ data, error: null })).toEqual({ ok: false, cause: 'failed' });
  });
});
