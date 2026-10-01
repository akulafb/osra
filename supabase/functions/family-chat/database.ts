/**
 * What the family-chat function reads and writes in the database, as the
 * service role (needed because only it may execute `chat_use_model_call`).
 * Every query is pinned to the user id Supabase Auth returned for the
 * request's own token, never to anything the browser sent.
 */

import type { FetchLike } from '../_shared/http.ts';
import { DatabaseError, serviceRoleRequest, type ServiceRoleEnv } from '../_shared/supabaseRest.ts';
import type { Speaker } from './prompt.ts';

export interface QuotaOutcome {
  outcome: 'ok' | 'daily_limit' | 'message_call_limit' | 'message_id_reused';
  /** Messages counted on the UAE day, after this call. */
  messagesUsed: number;
  /** Model calls of this message, after this call. */
  modelCalls: number;
}

const QUOTA_OUTCOMES: readonly string[] = ['ok', 'daily_limit', 'message_call_limit', 'message_id_reused'];

function firstRow(rows: unknown): Record<string, unknown> | null {
  const row = Array.isArray(rows) ? rows[0] : null;
  return typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : null;
}

/**
 * "Given name Cluster", the same label as `formatNodeDisplayName` in
 * src/utils/nodeDisplayName.ts. Copied, not imported: a deployed function only
 * has the files under supabase/functions.
 */
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
export async function findSpeaker(env: ServiceRoleEnv, userId: string, fetchImpl: FetchLike): Promise<Speaker | null> {
  const user = firstRow(
    await serviceRoleRequest(env, `users?select=node_id&id=eq.${encodeURIComponent(userId)}`, fetchImpl),
  );
  const nodeId = user?.node_id;
  if (typeof nodeId !== 'string' || nodeId === '') return null;

  const node = firstRow(
    await serviceRoleRequest(
      env,
      `nodes?select=first_name,paternal_family_cluster&id=eq.${encodeURIComponent(nodeId)}`,
      fetchImpl,
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
  env: ServiceRoleEnv,
  args: {
    userId: string;
    messageId: string;
    /** SHA-256 hex of the user's question: an id cannot be reused for another. */
    questionHash: string;
    uaeDay: string;
    dailyLimit: number;
    maxModelCalls: number;
  },
  fetchImpl: FetchLike,
): Promise<QuotaOutcome> {
  const result = await serviceRoleRequest(env, 'rpc/chat_use_model_call', fetchImpl, {
    p_user_id: args.userId,
    p_message_id: args.messageId,
    p_question_hash: args.questionHash,
    p_uae_day: args.uaeDay,
    p_daily_limit: args.dailyLimit,
    p_max_model_calls: args.maxModelCalls,
  });
  const r = (typeof result === 'object' && result !== null ? result : {}) as Record<string, unknown>;
  if (
    typeof r.outcome !== 'string' ||
    !QUOTA_OUTCOMES.includes(r.outcome) ||
    typeof r.messages_used !== 'number' ||
    typeof r.model_calls !== 'number'
  ) {
    throw new DatabaseError(`rpc/chat_use_model_call: unexpected answer ${JSON.stringify(result).slice(0, 200)}`);
  }
  return {
    outcome: r.outcome as QuotaOutcome['outcome'],
    messagesUsed: r.messages_used,
    modelCalls: r.model_calls,
  };
}
