// src/lib/treeRecordRows.ts

import type { Database } from '../types/database';
import type { FamilyLink, FamilyNode } from '../types/graph';

type NodeRow = Database['public']['Tables']['nodes']['Row'];
type LinkRow = Database['public']['Tables']['links']['Row'];

/**
 * The one place a `public.nodes` row becomes a Person.
 *
 * Both directions of the seam decode these rows now: the read path decodes a
 * whole fetch, and since LIN-64 every write decodes the rows it just wrote. Two
 * decoders would be two answers to "what Person is this row", and the write
 * path's answer would overwrite the read path's on every confirmation.
 *
 * `isClaimed` is deliberately absent. It is derived from `public.users.node_id`
 * via a separate RPC, so no `nodes` row can know it; the reader adds it.
 */
export function personFromRow(row: NodeRow): FamilyNode {
  return {
    id: String(row.id),
    firstName: row.first_name,
    createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
    familyCluster: row.paternal_family_cluster || undefined,
    maternalFamilyCluster: row.maternal_family_cluster || undefined,
  };
}

/** The one place a `public.links` row becomes a Kinship Link. */
export function kinshipLinkFromRow(row: LinkRow): FamilyLink {
  return {
    id: String(row.id),
    source: row.source_node_id,
    target: row.target_node_id,
    type: row.type,
    parentRole: row.parent_role || undefined,
  };
}

/**
 * Decode a body PostgREST or an RPC handed back. Anything that is not an array
 * decodes to no rows: a response that omits them reported nothing written, and
 * that is a fact about the write, not a parse failure.
 */
export function personsFromRows(rows: unknown): FamilyNode[] {
  return Array.isArray(rows) ? (rows as NodeRow[]).map(personFromRow) : [];
}

export function kinshipLinksFromRows(rows: unknown): FamilyLink[] {
  return Array.isArray(rows) ? (rows as LinkRow[]).map(kinshipLinkFromRow) : [];
}
