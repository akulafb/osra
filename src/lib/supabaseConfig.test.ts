import { describe, expect, it, vi } from 'vitest';
import { fetchWithoutKeyAsBearer, projectRef, publishableKeyFor, supabaseHeaders } from './supabaseConfig';

describe('publishableKeyFor', () => {
  it("picks the dev project's publishable key from its URL", () => {
    expect(publishableKeyFor('https://djwqamcfllqziqiyvyjj.supabase.co')).toMatch(/^sb_publishable_/);
  });

  it("picks the prod project's publishable key, a different one", () => {
    const prod = publishableKeyFor('https://henhqxosjbrvwceuvtyk.supabase.co/');
    expect(prod).toMatch(/^sb_publishable_/);
    expect(prod).not.toBe(publishableKeyFor('https://djwqamcfllqziqiyvyjj.supabase.co'));
  });

  it('throws for a project it has no key for, naming the project', () => {
    expect(() => publishableKeyFor('https://someotherproject.supabase.co')).toThrow(/someotherproject/);
  });

  it('throws when there is no URL', () => {
    expect(() => publishableKeyFor('')).toThrow(/VITE_SUPABASE_URL/);
    expect(() => publishableKeyFor(undefined)).toThrow(/VITE_SUPABASE_URL/);
  });
});

describe('projectRef', () => {
  it('reads the ref from a project URL', () => {
    expect(projectRef('https://djwqamcfllqziqiyvyjj.supabase.co')).toBe('djwqamcfllqziqiyvyjj');
  });

  it('gives null for a URL that is not a Supabase project', () => {
    expect(projectRef('http://127.0.0.1:54321')).toBeNull();
    expect(projectRef('not a url')).toBeNull();
  });
});

describe('supabaseHeaders', () => {
  it('sends the key on apikey only when nobody is signed in: it is not a JWT', () => {
    expect(supabaseHeaders('sb_publishable_x')).toEqual({ apikey: 'sb_publishable_x' });
    expect(supabaseHeaders('sb_publishable_x', null)).toEqual({ apikey: 'sb_publishable_x' });
    expect(supabaseHeaders('sb_publishable_x', '')).toEqual({ apikey: 'sb_publishable_x' });
  });

  it("adds the signed-in user's access token as the bearer", () => {
    expect(supabaseHeaders('sb_publishable_x', 'user-jwt')).toEqual({
      apikey: 'sb_publishable_x',
      Authorization: 'Bearer user-jwt',
    });
  });
});

describe('fetchWithoutKeyAsBearer', () => {
  const sent = (fetchImpl: ReturnType<typeof vi.fn>) => new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);

  it('drops the bearer supabase-js adds when nobody is signed in: the key is not a JWT', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    await fetchWithoutKeyAsBearer('sb_publishable_x', fetchImpl)('https://p.supabase.co/rest/v1/x', {
      headers: { apikey: 'sb_publishable_x', Authorization: 'Bearer sb_publishable_x' },
    });
    expect(sent(fetchImpl).get('apikey')).toBe('sb_publishable_x');
    expect(sent(fetchImpl).has('Authorization')).toBe(false);
  });

  it("keeps a signed-in user's access token as the bearer", async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    await fetchWithoutKeyAsBearer('sb_publishable_x', fetchImpl)('https://p.supabase.co/rest/v1/x', {
      headers: { apikey: 'sb_publishable_x', Authorization: 'Bearer user-jwt' },
    });
    expect(sent(fetchImpl).get('Authorization')).toBe('Bearer user-jwt');
  });
});
