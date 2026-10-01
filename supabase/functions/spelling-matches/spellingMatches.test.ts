import { describe, expect, it, vi } from 'vitest';
import { MIN_MATCH_QUERY_LENGTH } from '../../../src/lib/personMatch';
import { handleSpellingMatches, type HandlerDeps } from './handler.ts';
import {
  buildTypeSafeRequest,
  mapScores,
  MAX_NAMES,
  MIN_TYPED_NAME_LENGTH,
  TYPESAFE_URL,
  validateRequest,
} from './spellingMatches.ts';

describe('validateRequest', () => {
  const codeOf = (body: unknown) => {
    const v = validateRequest(body);
    return v.ok ? 'ok' : v.code;
  };

  it('accepts a typed name and names, trimmed and de-duplicated in order', () => {
    expect(validateRequest({ typedName: '  Mohamed ', names: ['Mohammad', ' Omar ', 'Mohammad'] })).toEqual({
      ok: true,
      request: { typedName: 'Mohamed', names: ['Mohammad', 'Omar'] },
    });
  });

  it('refuses a body that is not an object', () => {
    expect(codeOf(undefined)).toBe('invalid_body');
    expect(codeOf('Mohamed')).toBe('invalid_body');
    expect(codeOf([])).toBe('invalid_body');
  });

  it('refuses an empty typed name', () => {
    expect(codeOf({ typedName: '', names: [] })).toBe('typed_name_empty');
    expect(codeOf({ typedName: '   ', names: [] })).toBe('typed_name_empty');
    expect(codeOf({ names: [] })).toBe('typed_name_empty');
    expect(codeOf({ typedName: 7, names: [] })).toBe('typed_name_empty');
  });

  it('refuses a typed name shorter than the Person Match minimum', () => {
    expect(MIN_TYPED_NAME_LENGTH).toBe(MIN_MATCH_QUERY_LENGTH);
    expect(codeOf({ typedName: 'M', names: [] })).toBe('typed_name_too_short');
    expect(codeOf({ typedName: ' م ', names: [] })).toBe('typed_name_too_short');
    expect(codeOf({ typedName: 'Mo', names: [] })).toBe('ok');
    expect(codeOf({ typedName: 'مح', names: [] })).toBe('ok');
  });

  it('refuses more than 1,000 names and accepts exactly 1,000', () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `Name${i}`);
    expect(codeOf({ typedName: 'Omar', names: names(MAX_NAMES) })).toBe('ok');
    expect(codeOf({ typedName: 'Omar', names: names(MAX_NAMES + 1) })).toBe('too_many_names');
  });

  it('refuses names that are not a list of non-empty strings', () => {
    expect(codeOf({ typedName: 'Omar' })).toBe('names_invalid');
    expect(codeOf({ typedName: 'Omar', names: 'Omer' })).toBe('names_invalid');
    expect(codeOf({ typedName: 'Omar', names: ['Omer', 3] })).toBe('names_invalid');
    expect(codeOf({ typedName: 'Omar', names: ['Omer', ' '] })).toBe('names_invalid');
  });

  it('refuses text too long to be a given name', () => {
    const long = 'a'.repeat(61);
    expect(codeOf({ typedName: long, names: [] })).toBe('typed_name_too_long');
    expect(codeOf({ typedName: 'Omar', names: [long] })).toBe('name_too_long');
  });
});

describe('buildTypeSafeRequest', () => {
  it('sends the pinned model, the typed name as state and one Noul question per name', () => {
    expect(buildTypeSafeRequest({ typedName: 'Mohamed', names: ['Mohammad', 'Omar'] })).toEqual({
      model: 'jev-1.13.0',
      state: { typed_name: 'Mohamed' },
      questions: {
        n0: {
          type: 'noul',
          instructions:
            'Is `typed_name` the same given name as "Mohammad", differing only in spelling or transliteration?',
        },
        n1: {
          type: 'noul',
          instructions:
            'Is `typed_name` the same given name as "Omar", differing only in spelling or transliteration?',
        },
      },
    });
  });

  it('keeps a candidate from closing its own quote or naming a state path', () => {
    const { questions } = buildTypeSafeRequest({ typedName: 'Omar', names: ['Om"ar `x`\n'] });
    expect(questions.n0.instructions).toBe(
      'Is `typed_name` the same given name as "Omar x", differing only in spelling or transliteration?',
    );
  });
});

describe('mapScores', () => {
  const names = ['Mohammad', 'Omar'];

  it('returns the raw score for each name, in request order', () => {
    const body = { answers: { n1: { type: 'noul', noul: 0.02 }, n0: { type: 'noul', noul: 0.97 } } };
    expect(mapScores(names, body)).toEqual([
      { name: 'Mohammad', score: 0.97 },
      { name: 'Omar', score: 0.02 },
    ]);
  });

  it('applies no threshold', () => {
    const body = { answers: { n0: { noul: 0.49 }, n1: { noul: 0.5 } } };
    expect(mapScores(names, body)?.map((s) => s.score)).toEqual([0.49, 0.5]);
  });

  it('is null when an answer is missing or is not a probability', () => {
    expect(mapScores(names, { answers: { n0: { noul: 0.9 } } })).toBeNull();
    expect(mapScores(names, { answers: { n0: { noul: 0.9 }, n1: { noul: '0.1' } } })).toBeNull();
    expect(mapScores(names, { answers: { n0: { noul: 0.9 }, n1: { noul: 1.5 } } })).toBeNull();
    expect(mapScores(names, {})).toBeNull();
    expect(mapScores(names, null)).toBeNull();
  });
});

describe('handleSpellingMatches', () => {
  const FUNCTION_URL = 'https://proj.supabase.co/functions/v1/spelling-matches';
  const AUTH_URL = 'https://proj.supabase.co/auth/v1/user';
  const ENV: Record<string, string> = {
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_test' }),
    TYPESAFE_API_KEY: 'ts-secret',
  };

  type Route = (init?: RequestInit) => Response;

  /** A fake network: Supabase Auth accepts `user-jwt`; TypeSafe does what the test says. */
  function setup(typeSafe: Route[] = [], env = ENV) {
    const typeSafeQueue = [...typeSafe];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === AUTH_URL) {
        const auth = (init?.headers as Record<string, string>).Authorization;
        return auth === 'Bearer user-jwt'
          ? Response.json({ id: 'user-1' })
          : new Response('{}', { status: 401 });
      }
      if (url === TYPESAFE_URL) {
        const next = typeSafeQueue.shift();
        if (!next) throw new Error('unexpected TypeSafe call');
        return next(init);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const log = vi.fn();
    const sleep = vi.fn(async () => undefined);
    const deps: HandlerDeps = { env: (n) => env[n], fetchImpl, log, retry: { sleep, random: () => 0 } };
    const typeSafeCalls = () => fetchImpl.mock.calls.filter(([url]) => url === TYPESAFE_URL);
    return { deps, fetchImpl, log, sleep, typeSafeCalls };
  }

  function post(body: unknown, token: string | null = 'user-jwt'): Request {
    return new Request(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  const answers = (...nouls: number[]): Route => () =>
    Response.json({
      model: 'jev-1.13.0',
      answers: Object.fromEntries(nouls.map((noul, i) => [`n${i}`, { type: 'noul', noul }])),
    });
  const status = (code: number): Route => () => new Response('provider detail', { status: code });

  const VALID = { typedName: 'Mohamed', names: ['Mohammad', 'Omar'] };

  it('returns a raw score for each name', async () => {
    const { deps, typeSafeCalls } = setup([answers(0.97, 0.02)]);
    const res = await handleSpellingMatches(post(VALID), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      model: 'jev-1.13.0',
      scores: [
        { name: 'Mohammad', score: 0.97 },
        { name: 'Omar', score: 0.02 },
      ],
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const [, init] = typeSafeCalls()[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ts-secret');
    expect(JSON.parse(init?.body as string)).toEqual(buildTypeSafeRequest(VALID));
  });

  it.each([
    ['no Authorization header', null],
    ['the publishable key', 'sb_publishable_test'],
    ['a token Supabase Auth rejects', 'forged'],
  ])('refuses %s and makes no call to TypeSafe', async (_label, token) => {
    const { deps, typeSafeCalls } = setup([answers(1, 1)]);
    const res = await handleSpellingMatches(post(VALID, token), deps);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('not_signed_in');
    expect(typeSafeCalls()).toHaveLength(0);
  });

  it.each([
    ['an empty typed name', { typedName: ' ', names: ['Omar'] }, 'typed_name_empty'],
    ['a one-character typed name', { typedName: 'M', names: ['Omar'] }, 'typed_name_too_short'],
    [
      'more than 1,000 names',
      { typedName: 'Omar', names: Array.from({ length: 1001 }, (_, i) => `N${i}`) },
      'too_many_names',
    ],
    ['a body that is not JSON', '{nope', 'invalid_body'],
  ])('refuses %s and makes no call to TypeSafe', async (_label, body, code) => {
    const { deps, typeSafeCalls } = setup([answers(1)]);
    const res = await handleSpellingMatches(post(body), deps);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(code);
    expect(typeSafeCalls()).toHaveLength(0);
  });

  it('answers an empty list of names without calling TypeSafe', async () => {
    const { deps, typeSafeCalls } = setup();
    const res = await handleSpellingMatches(post({ typedName: 'Omar', names: [] }), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).scores).toEqual([]);
    expect(typeSafeCalls()).toHaveLength(0);
  });

  it('retries 429 and 529, then answers', async () => {
    const { deps, typeSafeCalls, sleep } = setup([status(429), status(529), answers(0.9, 0.1)]);
    const res = await handleSpellingMatches(post(VALID), deps);
    expect(res.status).toBe(200);
    expect(typeSafeCalls()).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('says the service is busy when the retries run out', async () => {
    const { deps, typeSafeCalls } = setup([status(429), status(429), status(529), status(429)]);
    const res = await handleSpellingMatches(post(VALID), deps);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('upstream_busy');
    expect(typeSafeCalls()).toHaveLength(4);
  });

  it.each([401, 422, 500])('fails at once on a TypeSafe %i, without leaking its body', async (code) => {
    const { deps, typeSafeCalls, sleep, log } = setup([status(code)]);
    const res = await handleSpellingMatches(post(VALID), deps);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe('upstream_error');
    expect(text).not.toContain('provider detail');
    expect(typeSafeCalls()).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining(String(code)));
  });

  it('fails clearly when TypeSafe cannot be reached', async () => {
    const { deps } = setup([
      () => {
        throw new Error('connection reset');
      },
    ]);
    const res = await handleSpellingMatches(post(VALID), deps);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('upstream_unreachable');
  });

  it('fails clearly when TypeSafe leaves a name unanswered', async () => {
    const { deps } = setup([answers(0.9)]);
    const res = await handleSpellingMatches(post(VALID), deps);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('upstream_error');
  });

  it('fails clearly, and never logs a key, when the secret is not set', async () => {
    const withoutKey = { ...ENV, TYPESAFE_API_KEY: '' };
    const { deps, typeSafeCalls, log } = setup([], withoutKey);
    const res = await handleSpellingMatches(post(VALID), deps);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('not_configured');
    expect(typeSafeCalls()).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('TYPESAFE_API_KEY'));
  });

  it('answers the CORS preflight without a session', async () => {
    const { deps, fetchImpl } = setup();
    const res = await handleSpellingMatches(new Request(FUNCTION_URL, { method: 'OPTIONS' }), deps);
    expect(res.status).toBe(204);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
