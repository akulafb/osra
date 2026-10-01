/**
 * Calls to the project's own database through PostgREST, as the service role.
 *
 * A function uses this only for what the signed-in user may not do themselves
 * (family-chat records its daily count with a database function only the
 * service role may run). Every query must be pinned to the user id that
 * Supabase Auth returned for the request's token (see auth.ts), never to an id
 * the browser sent.
 */

import type { FetchLike } from './http.ts';

export interface ServiceRoleEnv {
  /** `SUPABASE_URL`, set by the platform for every function. */
  supabaseUrl: string;
  /** `SUPABASE_SERVICE_ROLE_KEY`, set by the platform for every function. */
  serviceRoleKey: string;
}

/** The database could not be asked, or refused. The message is for the log only. */
export class DatabaseError extends Error {}

/** `https://<ref>.supabase.co` + `path`, whether or not the URL ends in a slash. */
export function projectUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}${path}`;
}

function serviceRoleHeaders(key: string): Record<string, string> {
  // A new-style secret key (sb_secret_…) is not a JWT and goes in `apikey`
  // only; the legacy service_role JWT goes in both.
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * GETs `rest/v1/<path>`, or POSTs `body` as JSON when one is given, and returns
 * the parsed answer. Throws DatabaseError for a network failure, a timeout, a
 * non-2xx answer or an answer that is not JSON.
 */
export async function serviceRoleRequest(
  env: ServiceRoleEnv,
  path: string,
  fetchImpl: FetchLike,
  body?: unknown,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(projectUrl(env.supabaseUrl, `/rest/v1/${path}`), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...serviceRoleHeaders(env.serviceRoleKey),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new DatabaseError(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new DatabaseError(`${path}: ${res.status} ${detail}`);
  }
  try {
    return await res.json();
  } catch {
    throw new DatabaseError(`${path}: the answer was not JSON`);
  }
}
