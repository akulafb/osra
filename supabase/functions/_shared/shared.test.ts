import { describe, expect, it, vi } from 'vitest';
import { bearerToken, requireSignedInUser } from './auth.ts';
import { answerPreflightOrWrongMethod, CORS_HEADERS, errorResponse, readJsonBody } from './http.ts';
import { backoffDelayMs, fetchWithRetry } from './retry.ts';
import { projectKeys } from './projectKeys.ts';
import { DatabaseError, serviceRoleRequest } from './supabaseRest.ts';

const env = { supabaseUrl: 'https://proj.supabase.co', publishableKey: 'anon-key' };

function requestWith(authorization?: string, method = 'POST'): Request {
  return new Request('https://proj.supabase.co/functions/v1/x', {
    method,
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe('http', () => {
  it('answers a CORS preflight with the headers the Supabase client sends', async () => {
    const res = answerPreflightOrWrongMethod(requestWith(undefined, 'OPTIONS'));
    expect(res?.status).toBe(204);
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res?.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(res?.headers.get('Access-Control-Allow-Headers')).toContain('apikey');
  });

  it('refuses a method other than POST', () => {
    expect(answerPreflightOrWrongMethod(requestWith(undefined, 'GET'))?.status).toBe(405);
  });

  it('lets a POST through', () => {
    expect(answerPreflightOrWrongMethod(requestWith())).toBeNull();
  });

  it('reads a JSON body, and gives undefined for one that is not JSON or is too large', async () => {
    const body = (text: string) => new Request('https://x', { method: 'POST', body: text });
    expect(await readJsonBody(body('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonBody(body('{nope'))).toBeUndefined();
    expect(await readJsonBody(body('{"a":"' + 'x'.repeat(50) + '"}'), 20)).toBeUndefined();
  });

  it('puts CORS headers on refusals, so the browser can read them', async () => {
    const res = errorResponse(401, 'not_signed_in', 'no');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(CORS_HEADERS['Access-Control-Allow-Origin']);
    expect(await res.json()).toEqual({ error: { code: 'not_signed_in', message: 'no' } });
  });
});

describe('requireSignedInUser', () => {
  it('reads the bearer token', () => {
    expect(bearerToken(requestWith('Bearer abc'))).toBe('abc');
    expect(bearerToken(requestWith('Basic abc'))).toBeNull();
    expect(bearerToken(requestWith())).toBeNull();
  });

  it('refuses a request with no token without asking Supabase', async () => {
    const fetchImpl = vi.fn();
    expect(await requireSignedInUser(requestWith(), env, fetchImpl)).toEqual({
      ok: false,
      reason: 'missing-token',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses the anon key: it is a JWT, but it is nobody', async () => {
    const fetchImpl = vi.fn();
    const outcome = await requireSignedInUser(requestWith('Bearer anon-key'), env, fetchImpl);
    expect(outcome).toEqual({ ok: false, reason: 'missing-token' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a publishable key as the bearer: it is not a JWT, and it is nobody', async () => {
    const fetchImpl = vi.fn();
    const keyEnv = { ...env, publishableKey: 'sb_publishable_x' };
    for (const key of ['sb_publishable_x', 'sb_secret_y']) {
      expect(await requireSignedInUser(requestWith(`Bearer ${key}`), keyEnv, fetchImpl)).toEqual({
        ok: false,
        reason: 'missing-token',
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks Supabase Auth with the publishable key on apikey and the user token as bearer', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: 'user-1' }));
    const keyEnv = { ...env, publishableKey: 'sb_publishable_x' };
    expect(await requireSignedInUser(requestWith('Bearer user-jwt'), keyEnv, fetchImpl)).toEqual({
      ok: true,
      userId: 'user-1',
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({ Authorization: 'Bearer user-jwt', apikey: 'sb_publishable_x' });
  });

  it('asks Supabase Auth whose token it is', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: 'user-1' }));
    const outcome = await requireSignedInUser(requestWith('Bearer user-jwt'), env, fetchImpl);
    expect(outcome).toEqual({ ok: true, userId: 'user-1' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/auth/v1/user');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer user-jwt', apikey: 'anon-key' });
  });

  it('refuses a token Supabase Auth does not accept', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    expect(await requireSignedInUser(requestWith('Bearer stale'), env, fetchImpl)).toEqual({
      ok: false,
      reason: 'invalid-session',
    });
  });

  it('refuses an answer that names no user', async () => {
    const fetchImpl = vi.fn(async () => Response.json({}));
    expect(await requireSignedInUser(requestWith('Bearer odd'), env, fetchImpl)).toEqual({
      ok: false,
      reason: 'invalid-session',
    });
  });

  it('refuses, as unavailable, when Supabase Auth cannot be asked', async () => {
    for (const status of [503, 429]) {
      const down = vi.fn(async () => new Response('', { status }));
      expect(await requireSignedInUser(requestWith('Bearer t'), env, down)).toEqual({
        ok: false,
        reason: 'auth-unavailable',
      });
    }
    const throws = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await requireSignedInUser(requestWith('Bearer t'), env, throws)).toEqual({
      ok: false,
      reason: 'auth-unavailable',
    });
  });
});

describe('projectKeys', () => {
  const reader = (vars: Record<string, string>) => (name: string) => vars[name];

  it("reads the `default` publishable and secret keys Supabase injects", () => {
    const env = reader({
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_a', other: 'sb_publishable_b' }),
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_a' }),
      SUPABASE_ANON_KEY: 'legacy-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service',
    });
    expect(projectKeys(env)).toEqual({ publishableKey: 'sb_publishable_a', secretKey: 'sb_secret_a' });
  });

  it('falls back to the legacy keys only when the new ones are missing', () => {
    const env = reader({ SUPABASE_ANON_KEY: 'legacy-anon', SUPABASE_SERVICE_ROLE_KEY: 'legacy-service' });
    expect(projectKeys(env)).toEqual({ publishableKey: 'legacy-anon', secretKey: 'legacy-service' });
  });

  it('falls back when the injected value is not JSON or has no `default`', () => {
    const env = reader({
      SUPABASE_PUBLISHABLE_KEYS: 'not json',
      SUPABASE_SECRET_KEYS: JSON.stringify({ other: 'sb_secret_b' }),
      SUPABASE_ANON_KEY: 'legacy-anon',
    });
    expect(projectKeys(env)).toEqual({ publishableKey: 'legacy-anon', secretKey: undefined });
  });

  it('gives undefined for a key that is set nowhere', () => {
    expect(projectKeys(reader({}))).toEqual({ publishableKey: undefined, secretKey: undefined });
  });
});

describe('backoffDelayMs', () => {
  const base = { baseDelayMs: 250, maxDelayMs: 4000, random: () => 0 };

  it('doubles for each retry', () => {
    expect([0, 1, 2].map((n) => backoffDelayMs(n, base))).toEqual([250, 500, 1000]);
  });

  it('adds up to a quarter of jitter', () => {
    expect(backoffDelayMs(0, { ...base, random: () => 1 })).toBe(313);
  });

  it('waits as long as Retry-After asks, but never past the cap', () => {
    expect(backoffDelayMs(0, { ...base, retryAfterHeader: '2' })).toBe(2000);
    expect(backoffDelayMs(0, { ...base, retryAfterHeader: '60' })).toBe(4000);
    expect(backoffDelayMs(0, { ...base, retryAfterHeader: 'soon' })).toBe(250);
  });
});

describe('fetchWithRetry', () => {
  function sequence(...statuses: number[]) {
    const queue = [...statuses];
    return vi.fn(async () => new Response('x', { status: queue.shift() ?? 200 }));
  }
  const sleep = vi.fn(async () => undefined);
  const opts = (fetchImpl: ReturnType<typeof sequence>) => ({ fetchImpl, sleep, random: () => 0 });

  it('returns a success without waiting', async () => {
    sleep.mockClear();
    const fetchImpl = sequence(200);
    const res = await fetchWithRetry('https://x', {}, opts(fetchImpl));
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 429 and 529 with growing waits', async () => {
    sleep.mockClear();
    const fetchImpl = sequence(429, 529, 200);
    const res = await fetchWithRetry('https://x', {}, opts(fetchImpl));
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it('gives back the last 429 when the retries run out', async () => {
    const fetchImpl = sequence(429, 429, 429, 429, 429);
    const res = await fetchWithRetry('https://x', {}, { ...opts(fetchImpl), retries: 3 });
    expect(res.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([400, 401, 422, 500, 503])('does not retry %i', async (status) => {
    sleep.mockClear();
    const fetchImpl = sequence(status, 200);
    const res = await fetchWithRetry('https://x', {}, opts(fetchImpl));
    expect(res.status).toBe(status);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('keeps its limit when an option is passed as undefined', async () => {
    const fetchImpl = sequence(429, 429, 429, 429, 429, 429);
    const res = await fetchWithRetry('https://x', {}, { ...opts(fetchImpl), retries: undefined });
    expect(res.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not retry a network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network');
    });
    await expect(fetchWithRetry('https://x', {}, { fetchImpl, sleep })).rejects.toThrow('network');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('serviceRoleRequest', () => {
  const ok = () => vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => Response.json([{ id: 1 }]));

  it('sends a legacy service_role JWT as apikey and bearer, and reads the JSON answer', async () => {
    const fetchImpl = ok();
    const env = { supabaseUrl: 'https://proj.supabase.co/', serviceRoleKey: 'eyJ.jwt' };
    expect(await serviceRoleRequest(env, 'users?id=eq.1', fetchImpl)).toEqual([{ id: 1 }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/rest/v1/users?id=eq.1');
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ apikey: 'eyJ.jwt', Authorization: 'Bearer eyJ.jwt' });
  });

  it('sends a new-style secret key as apikey only, and POSTs a body as JSON', async () => {
    const fetchImpl = ok();
    const env = { supabaseUrl: 'https://proj.supabase.co', serviceRoleKey: 'sb_secret_x' };
    await serviceRoleRequest(env, 'rpc/f', fetchImpl, { a: 1 });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"a":1}');
    expect(init?.headers).toEqual({ apikey: 'sb_secret_x', 'Content-Type': 'application/json' });
  });

  it('throws DatabaseError for a refusal or a network failure', async () => {
    const env = { supabaseUrl: 'https://proj.supabase.co', serviceRoleKey: 'k' };
    const refused = vi.fn(async () => new Response('no', { status: 401 }));
    const down = vi.fn(async () => {
      throw new Error('down');
    });
    await expect(serviceRoleRequest(env, 'x', refused)).rejects.toBeInstanceOf(DatabaseError);
    await expect(serviceRoleRequest(env, 'x', down)).rejects.toBeInstanceOf(DatabaseError);
  });
});
