/**
 * Which Supabase project the app talks to, and the key it uses there.
 *
 * The project comes from `VITE_SUPABASE_URL`. Its key is the project's
 * `default` publishable key, kept here in code: a publishable key is public by
 * design (Supabase docs), like the legacy anon key it replaces (LIN-82).
 *
 * A publishable key is not a JWT. It goes on `apikey` only; `Authorization:
 * Bearer` carries a signed-in user's access token, and is left out when there
 * is none.
 */

/** Each project's `default` publishable key, by project ref. */
const PUBLISHABLE_KEYS: Record<string, string> = {
  djwqamcfllqziqiyvyjj: 'sb_publishable_6tE3UPEFqnlGw-vCIMO4rA_eND9I4tv', // dev
  henhqxosjbrvwceuvtyk: 'sb_publishable_RfLbjoeysYfZNZQZ0PRlig_3sEmA1Ik', // prod
};

/** `<ref>` from `https://<ref>.supabase.co`, or null for any other URL. */
export function projectRef(supabaseUrl: string): string | null {
  try {
    return new URL(supabaseUrl).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The publishable key for the project at `supabaseUrl`. Throws for a project not listed above. */
export function publishableKeyFor(supabaseUrl: string | undefined): string {
  if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL is not set. Please check your .env.local file.');
  }
  const ref = projectRef(supabaseUrl);
  const key = ref ? PUBLISHABLE_KEYS[ref] : undefined;
  if (!key) {
    throw new Error(
      `No publishable key for the Supabase project at ${supabaseUrl}. Add it to src/lib/supabaseConfig.ts.`
    );
  }
  return key;
}

/** `VITE_SUPABASE_URL`, read when called. */
export function supabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL;
}

/** The publishable key for the project in `VITE_SUPABASE_URL`. Throws when there is none. */
export function supabasePublishableKey(): string {
  return publishableKeyFor(supabaseUrl());
}

/** `apikey`, plus `Authorization: Bearer` only when there is a user's access token. */
export function supabaseHeaders(apiKey: string, accessToken?: string | null): Record<string, string> {
  return accessToken ? { apikey: apiKey, Authorization: `Bearer ${accessToken}` } : { apikey: apiKey };
}

/**
 * `fetchImpl`, minus the `Authorization: Bearer <key>` that supabase-js adds
 * when nobody is signed in (it falls back to the key as the token). The
 * request keeps the key on `apikey`; a user's access token is left alone.
 */
export function fetchWithoutKeyAsBearer(apiKey: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get('Authorization') !== `Bearer ${apiKey}`) return fetchImpl(input, init);
    headers.delete('Authorization');
    return fetchImpl(input, { ...init, headers });
  };
}
