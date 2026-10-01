/**
 * What the family-chat function reads and writes in the database, through
 * PostgREST with the service_role key (set by the platform for every function).
 * The service role is needed because only it may execute
 * `chat_use_model_call`; every query here is pinned to the user id that
 * Supabase Auth returned for the request's own token, never to anything the
 * browser sent.
 */

import type { FetchLike } from '../_shared/http.ts';
import type { Speaker } from './prompt.ts';

export interface DatabaseEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface QuotaOutcome {
  outcome: 'ok' | 'daily_limit' | 'message_call_limit';
  /** Messages counted on the UAE day, after this call. */
  messagesUsed: number;
  /** Model calls of this message, after this call. */
  modelCalls: number;
}

export class DatabaseError extends Error {}

const TIMEOUT_MS = 8000;

function headers(env: DatabaseEnv, json = false): Record<string, string> {
  // A new-style secret key (sb_secret_…) is not a JWT and goes in `apikey`
  // only; the legacy service_role JWT goes in both.
  const h: Record<string, string> = { apikey: env.serviceRoleKey };
  if (!env.serviceRoleKey.startsWith('sb_')) h.Authorization = `Bearer ${env.serviceRoleKey}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function request(env: DatabaseEnv, path: string, fetchImpl: FetchLike, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(`${env.supabaseUrl.replace(/\/+$/, '')}/rest/v1/${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new DatabaseError(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new DatabaseError(`${path}: ${res.status} ${detail}`);
  }
  return res.json().catch(() => {
    throw new DatabaseError(`${path}: the answer was not JSON`);
  });
}

function firstRow(rows: unknown): Record<string, unknown> | null {
  const row = Array.isArray(rows) ? rows[0] : null;
  return typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : null;
}

/** "Given name Cluster", as formatNodeDisplayName in src/utils/nodeDisplayName.ts. */
function displayName(firstName: unknown, cluster: unknown): string {
  const f = typeof firstName === 'string' ? firstName.trim() : '';
  const c = typeof cluster === 'string' ? cluster.trim() : '';
  if (f && c) return `${f} ${c}`;
  return f || c || 'Unknown';
}

/**
 * The Person the account has claimed, or null when it has claimed none.
 * Throws DatabaseError when the database cannot be read.
 */
export async function findSpeaker(env: DatabaseEnv, userId: string, fetchImpl: FetchLike): Promise<Speaker | null> {
  const user = firstRow(
    await request(env, `users?select=node_id&id=eq.${encodeURIComponent(userId)}`, fetchImpl, {
      headers: headers(env),
    }),
  );
  const nodeId = user?.node_id;
  if (typeof nodeId !== 'string' || nodeId === '') return null;

  const node = firstRow(
    await request(
      env,
      `nodes?select=id,first_name,paternal_family_cluster&id=eq.${encodeURIComponent(nodeId)}`,
      fetchImpl,
      { headers: headers(env) },
    ),
  );
  if (!node) return null;
  return { personId: nodeId, displayName: displayName(node.first_name, node.paternal_family_cluster) };
}

/**
 * Records one model call for a message, or learns why it is refused
 * (`chat_use_model_call` in the LIN-71 migration). Throws DatabaseError when
 * the count cannot be kept; the caller must then not call the model.
 */
export async function recordModelCall(
  env: DatabaseEnv,
  args: { userId: string; messageId: string; uaeDay: string; dailyLimit: number; maxModelCalls: number },
  fetchImpl: FetchLike,
): Promise<QuotaOutcome> {
  const result = await request(env, 'rpc/chat_use_model_call', fetchImpl, {
    method: 'POST',
    headers: headers(env, true),
    body: JSON.stringify({
      p_user_id: args.userId,
      p_message_id: args.messageId,
      p_uae_day: args.uaeDay,
      p_daily_limit: args.dailyLimit,
      p_max_model_calls: args.maxModelCalls,
    }),
  });
  const r = (typeof result === 'object' && result !== null ? result : {}) as Record<string, unknown>;
  if (
    (r.outcome !== 'ok' && r.outcome !== 'daily_limit' && r.outcome !== 'message_call_limit') ||
    typeof r.messages_used !== 'number' ||
    typeof r.model_calls !== 'number'
  ) {
    throw new DatabaseError(`rpc/chat_use_model_call: unexpected answer ${JSON.stringify(result).slice(0, 200)}`);
  }
  return { outcome: r.outcome, messagesUsed: r.messages_used, modelCalls: r.model_calls };
}
