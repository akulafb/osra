/**
 * The project's own API keys, as a function reads them (LIN-82).
 *
 * Supabase injects `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` into
 * every function, each a JSON object of key name to key; the app uses the
 * `default` one. The legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
 * are read only when those are missing (local runs and tests), so the legacy
 * JWT keys can be disabled on the project.
 *
 * Neither new key is a JWT: each goes on `apikey` only, never as a bearer.
 */

export interface ProjectKeys {
  /** `sb_publishable_…`, for asking Supabase Auth about a user's token. */
  publishableKey: string | undefined;
  /** `sb_secret_…`, for the database calls only the service role may make. */
  secretKey: string | undefined;
}

/** The `default` key in an injected JSON object of keys, or undefined. */
function defaultKey(json: string | undefined): string | undefined {
  if (!json) return undefined;
  try {
    const key = (JSON.parse(json) as { default?: unknown } | null)?.default;
    return typeof key === 'string' && key !== '' ? key : undefined;
  } catch {
    return undefined;
  }
}

export function projectKeys(env: (name: string) => string | undefined): ProjectKeys {
  return {
    publishableKey: defaultKey(env('SUPABASE_PUBLISHABLE_KEYS')) ?? (env('SUPABASE_ANON_KEY') || undefined),
    secretKey: defaultKey(env('SUPABASE_SECRET_KEYS')) ?? (env('SUPABASE_SERVICE_ROLE_KEY') || undefined),
  };
}
