import { RelativeDirection } from '../components/NodeCard';

export interface CreateRelativeParams {
  firstName: string;
  relation: RelativeDirection;
  targetNodeId: string;
  userId: string;
  sessionToken?: string | null;
  parentRole?: 'mother' | 'father' | null;
}

export interface LinkExistingRelativeParams {
  existingNodeId: string;
  relation: RelativeDirection;
  targetNodeId: string;
  userId: string;
  sessionToken?: string | null;
  parentRole?: 'mother' | 'father' | null;
}

export async function createRelativeSecure(params: CreateRelativeParams): Promise<void> {
  const sanitizedName = params.firstName.trim().slice(0, 200);
  if (!sanitizedName) {
    throw new Error('Name cannot be empty.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const authToken = params.sessionToken || supabaseKey;

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/create_relative_secure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      new_first_name: sanitizedName,
      rel_type: params.relation,
      target_node_id: params.targetNodeId,
      creator_id: params.userId,
      ...(params.relation === 'child' && params.parentRole && { p_parent_role: params.parentRole }),
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Failed to create relative (HTTP ${response.status})`);
  }

  const result = await response.json();
  if (result && result.success === false) {
    throw new Error(result.message || 'Failed to create relative.');
  }
}

export async function linkExistingRelativeSecure(params: LinkExistingRelativeParams): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const authToken = params.sessionToken || supabaseKey;

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/link_existing_relative_secure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      existing_node_id: params.existingNodeId,
      rel_type: params.relation,
      target_node_id: params.targetNodeId,
      creator_id: params.userId,
      ...(params.relation === 'child' && params.parentRole && { p_parent_role: params.parentRole }),
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Failed to link relative (HTTP ${response.status})`);
  }

  const result = await response.json();
  if (result && result.success === false) {
    throw new Error(result.message || 'Failed to link relative.');
  }
}
