import { describe, expect, it } from 'vitest';
import { OPENROUTER_URL } from '../../../supabase/functions/family-chat/openRouter.ts';
import { TYPESAFE_URL } from '../../../supabase/functions/_shared/typeSafe.ts';
import { createChatTestRunner } from './chatTestHarness';

const KEYS = { openRouterApiKey: 'or-test-key', typeSafeApiKey: 'ts-test-key' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Jev's answers for "Who are my parents?". */
function jevParents(inputTokens: number) {
  return json({
    model: 'jev-1.13.0',
    usage: { input_tokens: inputTokens, output_tokens: 200 },
    answers: {
      relation: { choice: 'parents', confidence: 0.95 },
      side: { choice: 'both', confidence: 0.9 },
      gender: { choice: 'any', confidence: 0.9 },
      subject: { choice: 'speaker', confidence: 0.95 },
      wants_count: { noul: 0.02 },
    },
  });
}

function jevOther(inputTokens: number) {
  return json({
    model: 'jev-1.13.0',
    usage: { input_tokens: inputTokens, output_tokens: 200 },
    answers: {
      relation: { choice: 'other', confidence: 0.9 },
      side: { choice: 'both', confidence: 0.9 },
      gender: { choice: 'any', confidence: 0.9 },
      subject: { choice: 'nobody', confidence: 0.9 },
      wants_count: { noul: 0.9 },
    },
  });
}

function modelTurn(message: Record<string, unknown>, cost: number) {
  return json({ id: 'gen-1', choices: [{ message: { role: 'assistant', ...message } }], usage: { cost } });
}

/** A scripted network: each URL answers from its own queue, and every request is kept. */
function scripted(answers: Record<string, Response[]>) {
  const requests: Array<{ url: string; body: unknown; authorization: string | null }> = [];
  const network = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: new Headers(init?.headers).get('Authorization'),
    });
    const next = answers[url]?.shift();
    if (!next) throw new Error(`no scripted answer for ${url}`);
    return next;
  };
  return { network, requests };
}

describe('createChatTestRunner', () => {
  it('answers in code when Jev routes the question, with Jev\'s cost and no model call', async () => {
    const { network, requests } = scripted({ [TYPESAFE_URL]: [jevParents(1000)] });
    const runner = createChatTestRunner({ ...KEYS, network });

    const answer = await runner.ask('Who are my parents?');

    expect(answer.outcome).toMatchObject({ ok: true, answeredBy: 'code' });
    expect(answer.outcome.ok && answer.outcome.answer).toContain('**Nabil Khoury**');
    expect(answer.outcome.ok && answer.outcome.answer).toContain('**Dina Aziz**');
    expect(answer.cost).toEqual({
      jevInputTokens: 1000,
      jevCost: 0.000042,
      modelCalls: 0,
      modelCost: 0,
      uncostedModelCalls: 0,
      total: 0.000042,
    });
    // Only TypeSafe went over the network, with the TypeSafe key.
    expect(requests.map((r) => [r.url, r.authorization])).toEqual([[TYPESAFE_URL, 'Bearer ts-test-key']]);
  });

  it('runs the model\'s tools on the test tree and adds up each model call\'s cost', async () => {
    const { network, requests } = scripted({
      [TYPESAFE_URL]: [jevOther(1200)],
      [OPENROUTER_URL]: [
        modelTurn({ content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'getTreeCounts', arguments: '{}' } }] }, 0.002),
        modelTurn({ content: 'The tree has **41** people.' }, 0.0015),
      ],
    });
    const runner = createChatTestRunner({ ...KEYS, network });

    const answer = await runner.ask('How many people are in the family tree?');

    expect(answer.outcome).toMatchObject({ ok: true, answeredBy: 'model', answer: 'The tree has **41** people.' });
    expect(answer.cost.modelCalls).toBe(2);
    expect(answer.cost.modelCost).toBeCloseTo(0.0035, 10);
    expect(answer.cost.total).toBeCloseTo(0.0035 + 1200 * 0.042e-6, 10);

    const [first, second] = requests.filter((r) => r.url === OPENROUTER_URL);
    expect(first.authorization).toBe('Bearer or-test-key');
    const system = (first.body as { messages: Array<{ content: string }> }).messages[0].content;
    expect(system).toContain('**Maya Khoury**');
    const toolTurn = (second.body as { messages: Array<{ role: string; content: string }> }).messages.find((m) => m.role === 'tool');
    expect(JSON.parse(toolTurn!.content)).toMatchObject({ persons: 43 });
  });

  it('stops the tool loop at the cost cap and still replies (LIN-80)', async () => {
    const overview = (id: string) => ({
      content: null,
      tool_calls: [{ id, type: 'function', function: { name: 'getFamilyOverview', arguments: '{}' } }],
    });
    const { network, requests } = scripted({
      [TYPESAFE_URL]: [jevOther(1000)],
      [OPENROUTER_URL]: [
        modelTurn(overview('c1'), 0.004),
        modelTurn(overview('c2'), 0.004),
        modelTurn(overview('c3'), 0.004),
        modelTurn({ content: 'The tree has **41** Persons over 5 generations.' }, 0.001),
      ],
    });
    const runner = createChatTestRunner({ ...KEYS, network });

    const answer = await runner.ask('Tell me about the family');

    expect(answer.outcome).toMatchObject({ ok: true, answeredBy: 'model', answer: 'The tree has **41** Persons over 5 generations.' });
    const bodies = requests.filter((r) => r.url === OPENROUTER_URL).map((r) => r.body as { tool_choice: string });
    // $0.012 after three calls: the fourth may call no tool.
    expect(bodies.map((b) => b.tool_choice)).toEqual(['auto', 'auto', 'auto', 'none']);
    expect(answer.cost.modelCost).toBeCloseTo(0.013, 10);
  });

  it('keeps the counts of each question apart', async () => {
    const { network } = scripted({ [TYPESAFE_URL]: [jevParents(1000), jevParents(500)] });
    const runner = createChatTestRunner({ ...KEYS, network });
    await runner.ask('Who are my parents?');
    const second = await runner.ask('Who are my parents?');
    expect(second.cost.jevInputTokens).toBe(500);
  });

  it('keeps the counts of questions asked at the same time apart', async () => {
    const { network } = scripted({ [TYPESAFE_URL]: [jevParents(1000), jevParents(500)] });
    const runner = createChatTestRunner({ ...KEYS, network });
    const answers = await Promise.all([runner.ask('Who are my parents?'), runner.ask('Who are my parents?')]);
    expect(answers.map((a) => a.cost.jevInputTokens).sort()).toEqual([1000, 500]);
  });

  it('notes a TypeSafe failure, and the message still goes to the model', async () => {
    const { network } = scripted({
      [TYPESAFE_URL]: [json({ error: 'bad' }, 500)],
      [OPENROUTER_URL]: [modelTurn({ content: 'Your parents are **Nabil Khoury** and **Dina Aziz**.' }, 0.001)],
    });
    const runner = createChatTestRunner({ ...KEYS, network });
    const answer = await runner.ask('Who are my parents?');
    expect(answer.outcome).toMatchObject({ ok: true, answeredBy: 'model' });
    expect(answer.log.join('\n')).toContain('TypeSafe failed 500');
    expect(answer.cost.jevInputTokens).toBe(0);
  });

  it('never reaches a real Supabase project', async () => {
    const { network, requests } = scripted({ [TYPESAFE_URL]: [jevParents(1000)] });
    await createChatTestRunner({ ...KEYS, network }).ask('Who are my parents?');
    expect(requests.some((r) => r.url.includes('supabase'))).toBe(false);
  });
});
