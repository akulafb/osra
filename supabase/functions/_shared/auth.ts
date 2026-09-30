/**
 * The sign-in check every Edge Function runs before doing anything that costs
 * money or reads data.
 *
 * The browser sends the user's Supabase access token as `Authorization: Bearer`.
 * The anon key is also a well-formed JWT, so "the header holds a JWT" proves
 * nothing; the token is shown to Supabase Auth, which says whose session it is.
 * A revoked or expired session is refused there too, which a local signature
 * check would not catch.
 */

import { errorResponse, type FetchLike } from './http.ts';

export interface AuthEnv {
  /** `SUPABASE_URL`, set by the platform for every function. */
  supabaseUrl: string;
  /** `SUPABASE_ANON_KEY`, set by the platform for every function. */
  supabaseAnonKey: string;
}

export type AuthOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: 'missing-token' | 'invalid-session' | 'auth-unavailable' };

const BEARER = /^Bearer\s+(\S+)$/i;

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');
  return header?.match(BEARER)?.[1] ?? null;
}

export async function requireSignedInUser(
  req: Request,
  env: AuthEnv,
  fetchImpl: FetchLike = fetch,
): Promise<AuthOutcome> {
  const token = bearerToken(req);
  // The anon key is what supabase-js sends when nobody is signed in. It is
  // refused here without a round trip.
  if (!token || token === env.supabaseAnonKey) return { ok: false, reason: 'missing-token' };

  let res: Response;
  try {
    res = await fetchImpl(`${env.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.supabaseAnonKey },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: 'auth-unavailable' };
  }
  // A rate-limited or failing Auth has not said the session is bad.
  if (res.status >= 500 || res.status === 429) return { ok: false, reason: 'auth-unavailable' };
  if (!res.ok) return { ok: false, reason: 'invalid-session' };

  const user: unknown = await res.json().catch(() => null);
  const id = (user as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || id === '') return { ok: false, reason: 'invalid-session' };
  return { ok: true, userId: id };
}

/** The refusal a function sends for a failed sign-in check. */
export function authRefusal(outcome: Extract<AuthOutcome, { ok: false }>): Response {
  if (outcome.reason === 'auth-unavailable') {
    return errorResponse(503, 'auth_unavailable', 'Could not check the session. Try again.');
  }
  return errorResponse(401, 'not_signed_in', 'A valid Supabase session is required.');
}
