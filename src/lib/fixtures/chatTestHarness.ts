/**
 * Asks the family chat a chat test question (LIN-74) through the same code the
 * browser and the server use: `askFamilyChat` (Jev's route, code answers, the
 * tool loop) calling the family-chat function's own handler, which calls the
 * real TypeSafe and OpenRouter.
 *
 * The handler runs in this process rather than deployed, so that:
 * - the signed-in Person is the test speaker, Maya Khoury, not a real account;
 * - the tools read the test tree, never the Tree Record;
 * - the 20 questions are not held to the daily limit of 10 messages.
 * Supabase Auth and the database are answered here, and no request reaches
 * any Supabase project. Only TypeSafe and OpenRouter go over the network, and
 * the token usage and cost in each of their answers are added up per question.
 */
import { OPENROUTER_URL } from '../../../supabase/functions/family-chat/openRouter.ts';
import { handleFamilyChat } from '../../../supabase/functions/family-chat/handler.ts';
import type { FetchLike } from '../../../supabase/functions/_shared/http.ts';
import { TYPESAFE_URL } from '../../../supabase/functions/_shared/typeSafe.ts';
import { askFamilyChat, type ChatOutcome } from '../familyChat';
import { readChatReply, readRouteReply } from '../familyChatClient';
import { CHAT_TEST_SPEAKER } from './chatTestQuestions';
import { FIXTURE_PERSONS, KINSHIP_FIXTURE_TREE } from './kinshipFixtureTree';

/** Jev's price, US dollars for each million input tokens (TypeSafe, 2026-09-30). */
export const JEV_PRICE_PER_MILLION_INPUT_TOKENS = 0.042;

/** Not a real project: anything sent here is answered by `fakeSupabase`. */
const FAKE_SUPABASE_URL = 'https://chat-test.supabase.invalid';
const PUBLISHABLE_KEY = 'sb_publishable_chat_test';
const SECRET_KEY = 'sb_secret_chat_test';
const USER_TOKEN = 'chat-test-user-token';
const USER_ID = 'chat-test-user';

export interface ChatTestCost {
  jevInputTokens: number;
  jevCost: number;
  /** Calls to OpenRouter for this question. */
  modelCalls: number;
  /** OpenRouter's `usage.cost` for those calls, in US dollars. */
  modelCost: number;
  /** Model calls whose answer had no `usage.cost`; their cost is not in the total. */
  uncostedModelCalls: number;
  total: number;
}

export interface ChatTestAnswer {
  outcome: ChatOutcome;
  cost: ChatTestCost;
  /** What the function logged, such as a TypeSafe failure. */
  log: string[];
}

export interface ChatTestRunnerOptions {
  openRouterApiKey: string;
  typeSafeApiKey: string;
  /** The real `fetch`, or a scripted one in tests. Only TypeSafe and OpenRouter reach it. */
  network?: FetchLike;
}

/** What one question's calls used, added up as their answers come back. */
type Usage = Omit<ChatTestCost, 'jevCost' | 'total'>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function usageOf(body: unknown): Record<string, unknown> {
  const usage = typeof body === 'object' && body !== null ? (body as { usage?: unknown }).usage : undefined;
  return typeof usage === 'object' && usage !== null ? (usage as Record<string, unknown>) : {};
}

/**
 * Supabase Auth and the family-chat database, as the handler reads them: the
 * test account, claimed by the test speaker, with the daily count kept here.
 */
function fakeSupabase() {
  const callsByMessage = new Map<string, { hash: string; calls: number }>();
  const speaker = FIXTURE_PERSONS.find((person) => person.id === CHAT_TEST_SPEAKER.personId)!;

  return (url: string, init?: RequestInit): Response => {
    const path = url.slice(FAKE_SUPABASE_URL.length);
    if (path === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization');
      return token === `Bearer ${USER_TOKEN}` ? json({ id: USER_ID }) : json({ message: 'bad token' }, 401);
    }
    // The secret key is not a JWT: on apikey only, never as the bearer.
    const headers = new Headers(init?.headers);
    if (headers.get('apikey') !== SECRET_KEY || headers.has('Authorization')) {
      return json({ message: 'permission denied' }, 401);
    }
    if (path.startsWith('/rest/v1/users?')) return json([{ node_id: speaker.id }]);
    if (path.startsWith('/rest/v1/nodes?')) {
      return json([{ first_name: speaker.firstName, paternal_family_cluster: speaker.familyCluster }]);
    }
    if (path === '/rest/v1/rpc/chat_use_model_call') {
      // The same rules as the LIN-71 migration, but for the daily limit.
      const args = JSON.parse(String(init?.body)) as Record<string, string | number>;
      const messageId = String(args.p_message_id);
      const row = callsByMessage.get(messageId) ?? { hash: String(args.p_question_hash), calls: 0 };
      const answer = (outcome: string) =>
        json({ outcome, messages_used: callsByMessage.size, model_calls: row.calls });
      if (row.hash !== args.p_question_hash) return answer('message_id_reused');
      if (row.calls >= Number(args.p_max_model_calls)) return answer('message_call_limit');
      row.calls += 1;
      callsByMessage.set(messageId, row);
      return answer('ok');
    }
    throw new Error(`chat test: no fake for Supabase ${init?.method ?? 'GET'} ${path}`);
  };
}

export function createChatTestRunner({ openRouterApiKey, typeSafeApiKey, network = fetch }: ChatTestRunnerOptions) {
  const supabase = fakeSupabase();
  const env: Record<string, string> = {
    SUPABASE_URL: FAKE_SUPABASE_URL,
    // As Supabase injects them: JSON objects of key name to key.
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_KEY }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_KEY }),
    OPENROUTER_API_KEY: openRouterApiKey,
    TYPESAFE_API_KEY: typeSafeApiKey,
  };

  /** `fetch` for the handler: Supabase answered here, the two services metered into `usage`. */
  function meteredFetch(usage: Usage): FetchLike {
    return async (url, init) => {
      if (url.startsWith(FAKE_SUPABASE_URL)) return supabase(url, init);
      if (url !== TYPESAFE_URL && url !== OPENROUTER_URL) throw new Error(`chat test: unexpected request to ${url}`);
      const res = await network(url, init);
      const reported = usageOf(await res.clone().json().catch(() => null));
      if (url === TYPESAFE_URL) {
        if (typeof reported.input_tokens === 'number') usage.jevInputTokens += reported.input_tokens;
      } else {
        usage.modelCalls += 1;
        if (typeof reported.cost === 'number') usage.modelCost += reported.cost;
        else if (res.ok) usage.uncostedModelCalls += 1;
      }
      return res;
    };
  }

  return {
    async ask(question: string): Promise<ChatTestAnswer> {
      const usage: Usage = { jevInputTokens: 0, modelCalls: 0, modelCost: 0, uncostedModelCalls: 0 };
      const log: string[] = [];
      const deps = { env: (name: string) => env[name], fetchImpl: meteredFetch(usage), log: (m: string) => log.push(m) };

      /** What `supabase.functions.invoke('family-chat')` gives back, from the handler itself. */
      async function invoke(body: unknown): Promise<{ data: unknown; error: unknown }> {
        const req = new Request('http://localhost/functions/v1/family-chat', {
          method: 'POST',
          headers: { Authorization: `Bearer ${USER_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const res = await handleFamilyChat(req, deps);
        return res.ok ? { data: await res.json(), error: null } : { data: null, error: { context: res } };
      }

      const outcome = await askFamilyChat({
        question,
        history: [],
        record: KINSHIP_FIXTURE_TREE,
        route: async (request) => readRouteReply(await invoke(request)),
        send: async (request) => readChatReply(await invoke(request)),
        messageId: crypto.randomUUID(),
      });
      const jevCost = (usage.jevInputTokens * JEV_PRICE_PER_MILLION_INPUT_TOKENS) / 1e6;
      return { outcome, cost: { ...usage, jevCost, total: jevCost + usage.modelCost }, log };
    },
  };
}
