import { describe, expect, it, vi } from 'vitest';
import {
  MAX_CHAT_BODY_BYTES,
  MAX_TURNS,
  type ChatTurn,
  type ToolCall,
} from '../../supabase/functions/family-chat/request.ts';
import type { ChatUsage } from '../../supabase/functions/family-chat/handler.ts';
import type { QuestionKind } from '../../supabase/functions/family-chat/questionKind.ts';
import {
  askFamilyChat,
  CHAT_LINES,
  type ChatRequestBody,
  type ChatSendResult,
  type RouteRequestBody,
  type RouteSendResult,
} from './familyChat';
import { FIXTURE_IDS as P, KINSHIP_FIXTURE_TREE } from './fixtures/kinshipFixtureTree';

const usage: ChatUsage = {
  messagesUsed: 1,
  dailyLimit: 10,
  modelCalls: 1,
  maxModelCalls: 6,
  resetsAt: '2026-10-01T20:00:00.000Z',
};

function toolsReply(...calls: Array<[string, Record<string, unknown>]>): ChatSendResult {
  const toolCalls: ToolCall[] = calls.map(([name, args], i) => ({ id: `call-${name}-${i}`, name, arguments: args }));
  return { ok: true, reply: { message: { role: 'assistant', content: null, toolCalls }, done: false, usage, cost: null } };
}

function textReply(content: string): ChatSendResult {
  return { ok: true, reply: { message: { role: 'assistant', content }, done: true, usage, cost: null } };
}

/** A scripted reply that cost `cost` US dollars. */
function costing(cost: number, result: ChatSendResult): ChatSendResult {
  return result.ok ? { ok: true, reply: { ...result.reply, cost } } : result;
}

/** A stand-in for the family-chat function: answers each call with the next scripted reply. */
function scriptedModel(...replies: ChatSendResult[]) {
  const requests: ChatRequestBody[] = [];
  const send = vi.fn(async (request: ChatRequestBody) => {
    requests.push(structuredClone(request));
    const next = replies.shift();
    if (!next) throw new Error('the model was called more times than scripted');
    return next;
  });
  return { send, requests };
}

/** The tool results sent back on one call, parsed, in order. */
function toolResults(request: ChatRequestBody) {
  return request.messages
    .filter((t): t is Extract<ChatTurn, { role: 'tool' }> => t.role === 'tool')
    .map((t) => JSON.parse(t.content));
}

/** The turn `n` places from the end: 1 is the last. */
function fromEnd(turns: ChatTurn[], n: number): ChatTurn | undefined {
  return turns[turns.length - n];
}

function ask(question: string, send: (r: ChatRequestBody) => Promise<ChatSendResult>, history: ChatTurn[] = []) {
  return askFamilyChat({ question, history, record: KINSHIP_FIXTURE_TREE, send, messageId: 'message-0001' });
}

describe('askFamilyChat: the tool loop', () => {
  it("answers a question about one relative kind with one tool: Omar's cousins on his mom's side", async () => {
    const model = scriptedModel(
      toolsReply(['getRelatives', { personId: P.omar, kind: 'cousins', side: 'mother' }]),
      textReply('- **Tala Mansour**\n- **Ziad Mansour**\n\nTotal: 2'),
    );

    const outcome = await ask("How many cousins do I have on my mom's side?", model.send);

    expect(model.send).toHaveBeenCalledTimes(2);
    expect(model.requests[0]).toEqual({
      messageId: 'message-0001',
      messages: [{ role: 'user', content: "How many cousins do I have on my mom's side?" }],
    });
    const [cousins] = toolResults(model.requests[1]);
    expect(cousins.total).toBe(2);
    expect(cousins.relatives.map((r: { displayName: string }) => r.displayName).sort()).toEqual([
      'Tala Mansour',
      'Ziad Mansour',
    ]);
    expect(model.requests[1].messageId).toBe('message-0001');
    expect(outcome).toMatchObject({ ok: true, answer: '- **Tala Mansour**\n- **Ziad Mansour**\n\nTotal: 2' });
  });

  it('answers "how are A and B related" with three tools, blood relation first, then the marriage', async () => {
    const model = scriptedModel(
      toolsReply(['findPersonsByName', { name: 'Omar Haddad' }], ['findPersonsByName', { name: 'Sara Khoury' }]),
      toolsReply(['findKinshipPaths', { fromPersonId: P.omar, toPersonId: P.sara }]),
      textReply('**Sara Khoury** is your first cousin on your father\'s side, and also related by marriage: your wife.'),
    );

    const outcome = await ask('How are Omar Haddad and Sara Khoury related?', model.send);

    expect(model.send).toHaveBeenCalledTimes(3);
    const [omar, sara, related] = toolResults(model.requests[2]);
    expect(omar.matches.map((m: { personId: string }) => m.personId)).toEqual([P.omar]);
    expect(sara.matches.map((m: { personId: string }) => m.personId)).toEqual([P.sara]);
    expect(related.paths).toEqual([
      { kind: 'blood', term: "first cousin, father's side" },
      { kind: 'marriage', term: 'wife' },
    ]);
    expect(outcome.ok && outcome.answer).toMatch(/first cousin.*also related by marriage/);
  });

  it('answers a count question with the total from code', async () => {
    const model = scriptedModel(
      toolsReply(['getRelatives', { personId: P.idris, kind: 'descendants' }]),
      textReply('Idris Haddad has 15 descendants.'),
    );

    await ask('How many descendants does Idris Haddad have?', model.send);

    // Yusuf, Mariam, Khalil; Omar, Layla, Sara, Nabil; Yusuf, Rima, Jad, Nour, Hani, Maya; Lina, Sami.
    expect(toolResults(model.requests[1])[0].total).toBe(15);
  });

  it("asks which Person when a name matches two, with each one's father", async () => {
    const question = 'Which Yusuf Haddad do you mean: the son of **Idris Haddad**, or the son of **Omar Haddad**?';
    const model = scriptedModel(toolsReply(['findPersonsByName', { name: 'Yusuf Haddad' }]), textReply(question));

    const outcome = await ask('Who are the children of Yusuf Haddad?', model.send);

    const [found] = toolResults(model.requests[1]);
    expect(found.matches.map((m: { fatherName: string }) => m.fatherName)).toEqual(['Idris Haddad', 'Omar Haddad']);
    expect(found.note).toMatch(/ask the user which one/i);
    expect(outcome).toMatchObject({ ok: true, answer: question });
  });

  it('stops the tool loop once the message passes its cost cap, and still answers from what the tools gave', async () => {
    const model = scriptedModel(
      costing(0.004, toolsReply(['getFamilyOverview', {}])),
      costing(0.004, toolsReply(['findPersonsByName', { name: 'Idris' }])),
      costing(0.004, toolsReply(['getRelatives', { personId: P.idris, kind: 'children' }])),
      costing(0.002, textReply('The tree has **41** Persons over 5 generations.')),
    );

    const outcome = await ask('Tell me about the family', model.send);

    // $0.012 after three calls passes the $0.01 cap: the fourth is the last, with every tool result so far.
    expect(model.send).toHaveBeenCalledTimes(4);
    expect(model.requests.map((r) => r.final)).toEqual([undefined, undefined, undefined, true]);
    expect(toolResults(model.requests[3])).toHaveLength(3);
    expect(outcome).toMatchObject({ ok: true, answeredBy: 'model', answer: 'The tree has **41** Persons over 5 generations.' });
  });

  it('answers with the text of a final call even if the model still asked for a tool', async () => {
    const model = scriptedModel(costing(0.011, toolsReply(['getFamilyOverview', {}])), {
      ok: true,
      reply: {
        message: { role: 'assistant', content: 'The tree has **41** Persons.', toolCalls: [{ id: 'c', name: 'getTreeCounts', arguments: {} }] },
        done: false,
        usage,
        cost: 0.001,
      },
    });
    const outcome = await ask('Tell me about the family', model.send);
    expect(model.send).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ ok: true, answer: 'The tree has **41** Persons.' });
  });

  it('keeps calling under the cost cap, and reads a missing cost as nothing', async () => {
    const model = scriptedModel(
      costing(0.003, toolsReply(['getTreeCounts', {}])),
      toolsReply(['getTreeCounts', {}]),
      costing(0.003, toolsReply(['getTreeCounts', {}])),
      textReply('41'),
    );
    await ask('How many people?', model.send);
    expect(model.requests.every((r) => r.final === undefined)).toBe(true);
  });

  it('makes the last allowed call the final one, so the model answers instead of asking for more tools', async () => {
    const forever = Array.from({ length: 5 }, () => toolsReply(['getTreeCounts', {}]));
    const model = scriptedModel(...forever, textReply('The tree has **41** Persons.'));

    const outcome = await ask('Count everyone, again and again', model.send);

    expect(model.send).toHaveBeenCalledTimes(6);
    expect(model.requests[5].final).toBe(true);
    expect(outcome).toMatchObject({ ok: true, answer: 'The tree has **41** Persons.' });
  });

  it('stops after 6 model calls for one question', async () => {
    const forever = Array.from({ length: 10 }, () => toolsReply(['getTreeCounts', {}]));
    const model = scriptedModel(...forever);

    const outcome = await ask('Count everyone, again and again', model.send);

    expect(model.send).toHaveBeenCalledTimes(6);
    expect(outcome).toEqual({ ok: false, cause: 'failed', line: CHAT_LINES.failed });
  });
});

function refused(cause: string, withUsage = false): ChatSendResult {
  return { ok: false, cause, ...(withUsage && { usage }) } as ChatSendResult;
}

describe('askFamilyChat: when the chat cannot answer', () => {
  it("shows the owner's line when the credit is gone", async () => {
    const model = scriptedModel(refused('credit_gone'));
    expect(await ask('Who are my parents?', model.send)).toEqual({
      ok: false,
      cause: 'credit_gone',
      line: "Hey fam. The chat credits I provide have run out. I'll recharge soon.",
    });
  });

  it('shows the daily limit line, with when it lifts', async () => {
    const model = scriptedModel(refused('daily_limit', true));
    expect(await ask('Who are my parents?', model.send)).toEqual({
      ok: false,
      cause: 'daily_limit',
      line: 'You have used your 10 messages for today. Come back tomorrow.',
      resetsAt: usage.resetsAt,
    });
  });

  it.each(['failed', 'not_signed_in', 'something_new'])('shows the plain failure line for cause %s', async (cause) => {
    const model = scriptedModel(refused(cause));
    expect(await ask('Who are my parents?', model.send)).toEqual({
      ok: false,
      cause: 'failed',
      line: 'Sorry, the chat did not work. Please try again.',
    });
  });

  it('shows the plain failure line when the request itself throws', async () => {
    const send = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await ask('Who are my parents?', send)).toMatchObject({ ok: false, cause: 'failed', line: CHAT_LINES.failed });
  });

  it('shows the cause of a refusal that comes after a tool round', async () => {
    const model = scriptedModel(toolsReply(['getTreeCounts', {}]), refused('credit_gone'));
    expect(await ask('How many people are in the tree?', model.send)).toMatchObject({
      ok: false,
      cause: 'credit_gone',
      line: CHAT_LINES.credit_gone,
    });
  });
});

describe('askFamilyChat: no Person id in a reply', () => {
  it('takes out every Person id the model wrote, in brackets or bare', async () => {
    const model = scriptedModel(
      textReply(
        "**Karim Qasim** (fx-karim-qasim) is Nour's father. **Layla Haddad** (personId: fx-layla-haddad) is her mother, and **Jad Saleh** [fx-jad-saleh] her half-brother fx-jad-saleh.",
      ),
    );

    const outcome = await ask("Who are Nour's parents?", model.send);

    const expected =
      "**Karim Qasim** is Nour's father. **Layla Haddad** is her mother, and **Jad Saleh** her half-brother.";
    expect(outcome).toMatchObject({ ok: true, answer: expected });
    expect(outcome.ok && fromEnd(outcome.turns, 1)).toEqual({ role: 'assistant', content: expected });
  });

  it('takes out a UUID even when it is not a Person in the Working Record', async () => {
    const model = scriptedModel(textReply('**Karim Qasim** (3f2b8c1e-9a4d-4e6b-8c2a-1d5e7f9a0b3c) is her father.'));
    expect(await ask("Who is Nour's father?", model.send)).toMatchObject({
      ok: true,
      answer: '**Karim Qasim** is her father.',
    });
  });

  it('keeps an ordinary word that happens to be a short Person id, unless it is in brackets', async () => {
    const tree = { nodes: [...KINSHIP_FIXTURE_TREE.nodes, { id: 'Omar', firstName: 'Odd', familyCluster: 'Id' }], links: [] };
    const model = scriptedModel(textReply('Omar is here (Omar).'));
    const outcome = await askFamilyChat({ question: 'Who?', history: [], record: tree, send: model.send, messageId: 'message-0001' });
    expect(outcome).toMatchObject({ ok: true, answer: 'Omar is here.' });
  });

  it('calls a reply that was nothing but an id a failure', async () => {
    const model = scriptedModel(textReply('(fx-omar-haddad)'));
    expect(await ask('Who am I?', model.send)).toMatchObject({ ok: false, cause: 'failed' });
  });

  it('leaves a reply with no id as the model wrote it', async () => {
    const reply = '- **Tala Mansour**\n- **Ziad Mansour**\n\nTotal: 2 (both on your mother\'s side)';
    const model = scriptedModel(textReply(reply));
    expect(await ask('My cousins?', model.send)).toMatchObject({ ok: true, answer: reply });
  });
});

/** One earlier question: the user turn, a tool round, and the answer. */
function earlierRound(n: number, toolResult = '{"total":0}'): ChatTurn[] {
  return [
    { role: 'user', content: `Question ${n}` },
    { role: 'assistant', content: null, toolCalls: [{ id: `old-${n}`, name: 'getTreeCounts', arguments: {} }] },
    { role: 'tool', toolCallId: `old-${n}`, content: toolResult },
    { role: 'assistant', content: `Answer ${n}` },
  ];
}

describe('askFamilyChat: earlier questions', () => {
  it('sends the earlier turns before the new question', async () => {
    const history = earlierRound(1);
    const model = scriptedModel(textReply('Answer 2'));

    const outcome = await ask('Question 2', model.send, history);

    expect(model.requests[0].messages).toEqual([...history, { role: 'user', content: 'Question 2' }]);
    expect(outcome.ok && outcome.turns).toEqual([
      ...history,
      { role: 'user', content: 'Question 2' },
      { role: 'assistant', content: 'Answer 2' },
    ]);
  });

  it('drops the oldest whole questions to stay within the turn cap', async () => {
    const history = Array.from({ length: 30 }, (_, i) => earlierRound(i)).flat();
    const model = scriptedModel(toolsReply(['getTreeCounts', {}]), textReply('Done'));

    await ask('Question 30', model.send, history);

    for (const request of model.requests) {
      expect(request.messages.length).toBeLessThanOrEqual(MAX_TURNS);
      expect(request.messages[0]).toMatchObject({ role: 'user' });
    }
    expect(fromEnd(model.requests[0].messages, 1)).toEqual({ role: 'user', content: 'Question 30' });
    expect(fromEnd(model.requests[0].messages, 2)).toEqual({ role: 'assistant', content: 'Answer 29' });
  });

  it('drops the oldest whole questions to stay within the body size', async () => {
    const big = JSON.stringify({ relatives: 'x'.repeat(19_000) });
    const history = Array.from({ length: 15 }, (_, i) => earlierRound(i, big)).flat();
    const model = scriptedModel(textReply('Done'));

    await ask('Question 15', model.send, history);

    const [request] = model.requests;
    expect(new TextEncoder().encode(JSON.stringify(request)).length).toBeLessThan(MAX_CHAT_BODY_BYTES);
    expect(request.messages[0]).toMatchObject({ role: 'user' });
    expect(fromEnd(request.messages, 2)).toEqual({ role: 'assistant', content: 'Answer 14' });
  });
});

describe('askFamilyChat: a question too large to send', () => {
  it('fails without another call when its own tool results pass the size cap', async () => {
    // Each descendants list on a 900-Person line is close to the 20,000-character cap.
    const nodes = Array.from({ length: 900 }, (_, i) => ({
      id: `person-0000-0000-0000-${String(i).padStart(12, '0')}`,
      firstName: `Person${i}`,
      familyCluster: 'Longfamilyname',
    }));
    const links = nodes.slice(1).map((n, i) => ({ source: nodes[i].id, target: n.id, type: 'parent' as const }));
    const ask14 = Array.from({ length: 14 }, () => ['getRelatives', { personId: nodes[0].id, kind: 'descendants' }] as [string, Record<string, unknown>]);
    const model = scriptedModel(toolsReply(...ask14), textReply('never sent'));

    const outcome = await askFamilyChat({ question: 'Everyone?', history: [], record: { nodes, links }, send: model.send, messageId: 'message-0001' });

    expect(model.send).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, cause: 'failed', line: CHAT_LINES.failed });
  });
});

// ---------------------------------------------------------------------------
// LIN-73: Jev reads the message first; code answers the common kinds.
// ---------------------------------------------------------------------------

const OMAR = { personId: P.omar, displayName: 'Omar Haddad' };

function sure(value: string, confidence = 0.9) {
  return { value, confidence };
}

/** Jev's reading of "who are my khalos". */
const KHALOS: QuestionKind = {
  relation: sure('aunts_uncles'),
  side: sure('maternal'),
  gender: sure('male'),
  subject: sure('speaker'),
  wantsCount: { value: false, confidence: 0.92 },
} as QuestionKind;

function routeReply(questionKind: QuestionKind | null, speaker: typeof OMAR | null = OMAR): RouteSendResult {
  return { ok: true, reply: { questionKind, speaker, usage } };
}

/** A stand-in for the route operation: answers with `result`, and records what it was sent. */
function scriptedRoute(result: RouteSendResult | (() => never)) {
  const requests: RouteRequestBody[] = [];
  const route = vi.fn(async (request: RouteRequestBody) => {
    requests.push(structuredClone(request));
    return typeof result === 'function' ? result() : result;
  });
  return { route, requests };
}

function askRouted(question: string, send: (r: ChatRequestBody) => Promise<ChatSendResult>, route: ReturnType<typeof scriptedRoute>['route']) {
  return askFamilyChat({ question, history: [], record: KINSHIP_FIXTURE_TREE, send, route, messageId: 'message-0001' });
}

describe('askFamilyChat: Jev routes common questions to code', () => {
  it('answers "who are my khalos" in code, with no model call', async () => {
    const model = scriptedModel();
    const jev = scriptedRoute(routeReply(KHALOS));

    const outcome = await askRouted('who are my khalos', model.send, jev.route);

    expect(jev.requests).toEqual([{ operation: 'route', messageId: 'message-0001', message: 'who are my khalos' }]);
    expect(model.send).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, answeredBy: 'code' });
    expect(outcome.ok && outcome.answer).toContain('Your khalo is **Samir Mansour**.');
    // The answer is in the history, so a follow-up to the model has it.
    expect(outcome.ok && outcome.turns.slice(-2)).toEqual([
      { role: 'user', content: 'who are my khalos' },
      { role: 'assistant', content: outcome.ok ? outcome.answer : '' },
    ]);
  });

  it('sends a message Jev marks other to the model with tools, under the same message id', async () => {
    const model = scriptedModel(textReply('Hello!'));
    const jev = scriptedRoute(routeReply({ ...KHALOS, relation: sure('other') } as QuestionKind));

    const outcome = await askRouted('hello!', model.send, jev.route);

    expect(model.send).toHaveBeenCalledTimes(1);
    expect(model.requests[0].messageId).toBe('message-0001');
    expect(outcome).toMatchObject({ ok: true, answer: 'Hello!', answeredBy: 'model' });
  });

  it('sends an answer below the confidence gate to the model', async () => {
    const model = scriptedModel(textReply('**Samir Mansour**'));
    const jev = scriptedRoute(routeReply({ ...KHALOS, side: sure('maternal', 0.45) } as QuestionKind));

    const outcome = await askRouted('who are my khalos', model.send, jev.route);

    expect(model.send).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ ok: true, answeredBy: 'model' });
  });

  it('sends a name with two matches to the model, and the chat asks which Person', async () => {
    const model = scriptedModel(
      toolsReply(['findPersonsByName', { name: 'Layla' }]),
      textReply('Which Layla do you mean: **Layla Haddad** (father **Yusuf Haddad**) or **Layla Zaher** (father **Munir Zaher**)?'),
    );
    const jev = scriptedRoute(
      routeReply({ ...KHALOS, relation: sure('children'), side: sure('both'), gender: sure('any'), subject: sure('named_person') } as QuestionKind),
    );

    const outcome = await askRouted("Who are Layla's children?", model.send, jev.route);

    const [matches] = toolResults(model.requests[1]);
    expect(matches.total).toBe(2);
    expect(outcome).toMatchObject({ ok: true, answeredBy: 'model' });
    expect(outcome.ok && outcome.answer).toContain('Which Layla');
  });

  it('with TypeSafe off or failing, the model answers and no error shows', async () => {
    for (const jev of [
      scriptedRoute(routeReply(null)),
      scriptedRoute({ ok: false, cause: 'failed' }),
      scriptedRoute(() => {
        throw new Error('network down');
      }),
    ]) {
      const model = scriptedModel(textReply('**Samir Mansour**'));
      const outcome = await askRouted('who are my khalos', model.send, jev.route);
      expect(outcome).toMatchObject({ ok: true, answer: '**Samir Mansour**', answeredBy: 'model' });
    }
  });

  it('shows the daily limit line when the route is refused for it, with no model call', async () => {
    const model = scriptedModel();
    const jev = scriptedRoute({ ok: false, cause: 'daily_limit', usage: { ...usage, messagesUsed: 10 } });

    const outcome = await askRouted('who are my khalos', model.send, jev.route);

    expect(model.send).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: false, cause: 'daily_limit', line: CHAT_LINES.daily_limit, resetsAt: usage.resetsAt });
  });

  it('leaves the model the calls the route did not use', async () => {
    const model = scriptedModel(
      toolsReply(['getTreeCounts', {}]),
      toolsReply(['getTreeCounts', {}]),
      toolsReply(['getTreeCounts', {}]),
      toolsReply(['getTreeCounts', {}]),
      toolsReply(['getTreeCounts', {}]),
    );
    const jev = scriptedRoute(routeReply(null));

    const outcome = await askRouted('how many people are in the tree?', model.send, jev.route);

    // The route was the message's first call; the function allows 6 in all.
    expect(model.send).toHaveBeenCalledTimes(5);
    expect(outcome).toEqual({ ok: false, cause: 'failed', line: CHAT_LINES.failed });
  });
});
