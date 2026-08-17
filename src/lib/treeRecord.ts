import { RelativeDirection } from '../types/graph';

export type TreeRecordErrorKind = 'refused' | 'not-authorized' | 'network' | 'conflict' | 'unknown';

export class TreeRecordError extends Error {
  readonly kind: TreeRecordErrorKind;
  readonly status?: number;

  constructor(kind: TreeRecordErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'TreeRecordError';
    this.kind = kind;
    this.status = status;
  }
}

export function isTreeRecordError(err: unknown): err is TreeRecordError {
  return err instanceof TreeRecordError;
}

export interface TreeRecordIdentity {
  userId: string;
  isAdmin: boolean;
  sessionToken?: string | null;
}

export interface TreeRecordConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  fetch?: typeof fetch;
}

export interface AddPersonLinkSpec {
  targetId: string;
  relation: RelativeDirection | 'sibling';
  parentRole?: 'mother' | 'father' | null;
}

export interface AddPersonParams {
  firstName: string;
  paternalCluster?: string | null;
  maternalCluster?: string | null;
  /**
   * If present, creates and links atomically via `create_relative_secure` RPC.
   * If absent, creates a standalone Person via REST `POST /nodes` (admin only).
   */
  link?: AddPersonLinkSpec;
}

export interface AddLinkParams {
  sourceId: string;
  targetId: string;
  type: 'parent' | 'marriage' | 'divorce';
  parentRole?: 'mother' | 'father' | null;
}

export interface EditPersonParams {
  id: string;
  firstName?: string;
  paternalCluster?: string | null;
  maternalCluster?: string | null;
}

export interface EditLinkParams {
  id: string;
  sourceId?: string;
  targetId?: string;
  type?: 'parent' | 'marriage' | 'divorce';
  parentRole?: 'mother' | 'father' | null;
}

export interface RemovePersonParams {
  id: string;
}

export interface RemoveLinkParams {
  id: string;
}

export interface TreeRecord {
  addPerson(params: AddPersonParams): Promise<{ id?: string }>;
  addLink(params: AddLinkParams): Promise<void>;
  editPerson(params: EditPersonParams): Promise<void>;
  editLink(params: EditLinkParams): Promise<void>;
  removePerson(params: RemovePersonParams): Promise<void>;
  removeLink(params: RemoveLinkParams): Promise<void>;
}

/**
 * Named edge helper: converts a Relative Direction (relative to an anchor target)
 * into an absolute Kinship Link specification.
 */
export function relativeToKinshipLink(
  anchorTargetId: string,
  otherNodeId: string,
  relation: RelativeDirection,
  parentRole?: 'mother' | 'father' | null
): AddLinkParams {
  switch (relation) {
    case 'child':
      return {
        sourceId: anchorTargetId,
        targetId: otherNodeId,
        type: 'parent',
        parentRole: parentRole ?? null,
      };
    case 'parent':
      return {
        sourceId: otherNodeId,
        targetId: anchorTargetId,
        type: 'parent',
        parentRole: parentRole ?? null,
      };
    case 'spouse':
      return {
        sourceId: anchorTargetId,
        targetId: otherNodeId,
        type: 'marriage',
        parentRole: null,
      };
  }
}

function resolveEnv(config?: TreeRecordConfig) {
  const supabaseUrl = config?.supabaseUrl ?? (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : undefined) ?? '';
  const supabaseKey = config?.supabaseKey ?? (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined) ?? '';
  const fetchFn = config?.fetch ?? fetch;
  return { supabaseUrl, supabaseKey, fetchFn };
}

function buildHeaders(identity: TreeRecordIdentity, supabaseKey: string, prefer?: string): HeadersInit {
  const authToken = identity.sessionToken || supabaseKey;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (supabaseKey) {
    headers['apikey'] = supabaseKey;
  }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (prefer) {
    headers['Prefer'] = prefer;
  }
  return headers;
}

function parseErrorMessage(text: string, status: number): string {
  try {
    const j = JSON.parse(text) as { message?: string; error?: string; hint?: string };
    if (j.message) return String(j.message);
    if (j.error) return String(j.error);
    if (j.hint) return String(j.hint);
  } catch {
    /* ignore */
  }
  return text || `Request failed (${status})`;
}

async function handleResponseError(res: Response): Promise<never> {
  const text = await res.text().catch(() => '');
  const message = parseErrorMessage(text, res.status);
  const isConflict = res.status === 409 || message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('conflict');

  if (res.status === 401 || res.status === 403) {
    throw new TreeRecordError('not-authorized', message, res.status);
  }
  if (isConflict) {
    throw new TreeRecordError('conflict', message, res.status);
  }
  throw new TreeRecordError('network', message, res.status);
}

export function createTreeRecord(
  identity: TreeRecordIdentity,
  config?: TreeRecordConfig
): TreeRecord {
  const { supabaseUrl, supabaseKey, fetchFn } = resolveEnv(config);

  const addPerson = async (params: AddPersonParams): Promise<{ id?: string }> => {
    const sanitizedName = params.firstName.trim().slice(0, 200);
    if (!sanitizedName) {
      throw new TreeRecordError('refused', 'Name cannot be empty.');
    }

    if (params.link) {
      // Relative creation via RPC create_relative_secure
      const bodyPayload: Record<string, unknown> = {
        new_first_name: sanitizedName,
        rel_type: params.link.relation,
        target_node_id: params.link.targetId,
        creator_id: identity.userId,
      };
      if (params.link.relation === 'child' && params.link.parentRole) {
        bodyPayload.p_parent_role = params.link.parentRole;
      }

      let res: Response;
      try {
        res = await fetchFn(`${supabaseUrl}/rest/v1/rpc/create_relative_secure`, {
          method: 'POST',
          headers: buildHeaders(identity, supabaseKey),
          body: JSON.stringify(bodyPayload),
        });
      } catch (err) {
        throw new TreeRecordError('network', err instanceof Error ? err.message : 'Network request failed');
      }

      if (!res.ok) {
        await handleResponseError(res);
      }

      const text = await res.text().catch(() => '');
      let result: { success?: boolean; new_node_id?: string; message?: string } = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        throw new TreeRecordError('network', 'Invalid JSON response from server');
      }

      if (result.success === false) {
        const msg = result.message || 'Failed to create relative.';
        const kind = msg.toLowerCase().includes('unauthorized') ? 'not-authorized' : 'refused';
        throw new TreeRecordError(kind, msg);
      }

      return { id: result.new_node_id };
    }

    // Standalone node creation via REST POST /nodes (admin only)
    if (!identity.isAdmin) {
      throw new TreeRecordError('refused', 'Only administrators can create standalone persons without a link.');
    }

    const payload = {
      first_name: sanitizedName,
      paternal_family_cluster: params.paternalCluster?.trim().slice(0, 100) || null,
      maternal_family_cluster: params.maternalCluster?.trim().slice(0, 100) || null,
      created_by_user_id: identity.userId,
    };

    let res: Response;
    try {
      res = await fetchFn(`${supabaseUrl}/rest/v1/nodes`, {
        method: 'POST',
        headers: buildHeaders(identity, supabaseKey, 'return=representation'),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new TreeRecordError('network', err instanceof Error ? err.message : 'Network request failed');
    }

    if (!res.ok) {
      await handleResponseError(res);
    }

    const text = await res.text().catch(() => '');
    try {
      const rows = text ? JSON.parse(text) : [];
      if (Array.isArray(rows) && rows[0]?.id) {
        return { id: rows[0].id };
      }
    } catch {
      /* ignore */
    }

    return {};
  };

  const addLink = async (params: AddLinkParams): Promise<void> => {
    if (identity.isAdmin) {
      // Admin: REST POST /links
      const payload = {
        source_node_id: params.sourceId,
        target_node_id: params.targetId,
        type: params.type,
        parent_role: params.type === 'parent' ? (params.parentRole ?? null) : null,
        created_by_user_id: identity.userId,
      };

      let res: Response;
      try {
        res = await fetchFn(`${supabaseUrl}/rest/v1/links`, {
          method: 'POST',
          headers: buildHeaders(identity, supabaseKey, 'return=minimal'),
          body: JSON.stringify(payload),
        });
      } catch (err) {
        throw new TreeRecordError('network', err instanceof Error ? err.message : 'Network request failed');
      }

      if (!res.ok) {
        await handleResponseError(res);
      }
      return;
    }

    // Non-admin: Route to link_existing_relative_secure RPC
    if (params.type === 'divorce') {
      throw new TreeRecordError('refused', 'Only administrators can record a divorce.');
    }

    let relType: 'spouse' | 'child';
    let existingNodeId: string;
    let targetNodeId: string;

    if (params.type === 'marriage') {
      relType = 'spouse';
      targetNodeId = params.sourceId;
      existingNodeId = params.targetId;
    } else {
      // parent link: sourceId is parent, targetId is child
      // link_existing_relative_secure with rel_type: 'child' sets source_node_id = target_node_id and target_node_id = existing_node_id
      relType = 'child';
      targetNodeId = params.sourceId;
      existingNodeId = params.targetId;
    }

    const payload: Record<string, unknown> = {
      existing_node_id: existingNodeId,
      rel_type: relType,
      target_node_id: targetNodeId,
      creator_id: identity.userId,
    };
    if (relType === 'child' && params.parentRole) {
      payload.p_parent_role = params.parentRole;
    }

    let res: Response;
    try {
      res = await fetchFn(`${supabaseUrl}/rest/v1/rpc/link_existing_relative_secure`, {
        method: 'POST',
        headers: buildHeaders(identity, supabaseKey),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new TreeRecordError('network', err instanceof Error ? err.message : 'Network request failed');
    }

    if (!res.ok) {
      await handleResponseError(res);
    }

    const text = await res.text().catch(() => '');
    let result: { success?: boolean; message?: string } = {};
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      throw new TreeRecordError('network', 'Invalid JSON response from server');
    }

    if (result.success === false) {
      const msg = result.message || 'Failed to link relative.';
      const kind = msg.toLowerCase().includes('unauthorized') ? 'not-authorized' : 'refused';
      throw new TreeRecordError(kind, msg);
    }
  };

  const editPerson = async (params: EditPersonParams): Promise<void> => {
    const updateData: Record<string, unknown> = {};

    if (params.firstName !== undefined) {
      const sanitizedName = params.firstName.trim().slice(0, 200);
      if (!sanitizedName) {
        throw new TreeRecordError('refused', 'Name cannot be empty.');
      }
      updateData.first_name = sanitizedName;
    }

    if (identity.isAdmin) {
      if (params.paternalCluster !== undefined) {
        updateData.paternal_family_cluster = params.paternalCluster ? params.paternalCluster.trim().slice(0, 100) : null;
      }
      if (params.maternalCluster !== undefined) {
        updateData.maternal_family_cluster = params.maternalCluster ? params.maternalCluster.trim().slice(0, 100) : null;
      }
    }

    const lid = encodeURIComponent(params.id);
    let res: Response;
    try {
      res = await fetchFn(`${supabaseUrl}/rest/v1/nodes?id=eq.${lid}`, {
        method: 'PATCH',
        headers: buildHeaders(identity, supabaseKey, 'return=minimal'),
        body: JSON.stringify(updateData),
      });
    } catch (err) {
      throw new TreeRecordError('network', err instanceof Error ? err.message : 'Network request failed');
    }

    if (!res.ok) {
      await handleResponseError(res);
    }
  };

  const editLink = async (params: EditLinkParams): Promise<void> => {
    if (!identity.isAdmin) {
      throw new TreeRecordError('not-authorized', 'Only administrators can edit links.');
    }

    const payload: Record<string, unknown> = {};
    if (params.sourceId !== undefined) payload.source_node_id = params.sourceId;
    if (params.targetId !== undefined) payload.target_node_id = params.targetId;
    if (params.type !== undefined) payload.type = params.type;
    if (params.parentRole !== undefined) {
      payload.parent_role = params.type === 'parent' ? (params.parentRole ?? null) : null;
    }

    const lid = encodeURIComponent(params.id);
    let res: Response;
    try {
      res = await fetchFn(`${supabaseUrl}/rest/v1/links?id=eq.${lid}`, {
        method: 'PATCH',
        headers: buildHeaders(identity, supabaseKey, 'return=minimal'),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new TreeRecordError('network', err instanceof Error ? err.message : 'Network request failed');
    }

    if (!res.ok) {
      await handleResponseError(res);
    }
  };

  const removePerson = async (params: RemovePersonParams): Promise<void> => {
    if (!identity.isAdmin) {
      throw new TreeRecordError('not-authorized', 'Only administrators can delete persons.');
    }

    let res: Response;
    try {
      res = await fetchFn(`${supabaseUrl}/rest/v1/rpc/admin_delete_node_secure`, {
        method: 'POST',
        headers: buildHeaders(identity, supabaseKey),
        body: JSON.stringify({ p_node_id: params.id }),
      });
    } catch (err) {
      throw new TreeRecordError('network', err instanceof Error ? err.message : 'Network request failed');
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new TreeRecordError('network', parseErrorMessage(text, res.status), res.status);
    }

    let payload: { success?: boolean; message?: string } = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new TreeRecordError('network', 'Unexpected response when deleting node.');
    }

    if (!payload.success) {
      throw new TreeRecordError(
        'not-authorized',
        payload.message || 'Could not delete this node. Confirm your account has role admin in the database.'
      );
    }
  };

  const removeLink = async (params: RemoveLinkParams): Promise<void> => {
    if (!identity.isAdmin) {
      throw new TreeRecordError('not-authorized', 'Only administrators can delete links.');
    }

    const lid = encodeURIComponent(params.id);
    let res: Response;
    try {
      res = await fetchFn(`${supabaseUrl}/rest/v1/links?id=eq.${lid}`, {
        method: 'DELETE',
        headers: buildHeaders(identity, supabaseKey, 'return=representation'),
      });
    } catch (err) {
      throw new TreeRecordError('network', err instanceof Error ? err.message : 'Network request failed');
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new TreeRecordError('network', parseErrorMessage(text, res.status), res.status);
    }

    let rows: unknown[] = [];
    try {
      rows = text ? (JSON.parse(text) as unknown[]) : [];
    } catch {
      rows = [];
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new TreeRecordError(
        'not-authorized',
        'No link was deleted. Confirm your account has role admin in the database, then refresh and try again.'
      );
    }
  };

  return {
    addPerson,
    addLink,
    editPerson,
    editLink,
    removePerson,
    removeLink,
  };
}
