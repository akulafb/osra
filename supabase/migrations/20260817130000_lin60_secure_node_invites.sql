-- LIN-60: Security fixes for node invites:
-- 1. Restrict node_invites SELECT from public to authenticated users who can manage invites for the node (or admin).
-- 2. Add node_invites UPDATE policy so bulk invite expiry (invalidation) works.
-- 3. Revoke direct table privileges on node_invites from anon role.
-- 4. Fix can_manage_invites_for_node so admins without a bound node_id can manage invites.
-- 5. Enforce expires_at check in claim_invite_secure on the server.

-- 1. Helper function: Allow admins or 1-degree connected users to manage invites
CREATE OR REPLACE FUNCTION public.can_manage_invites_for_node(p_node_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF (SELECT is_admin()) THEN RETURN TRUE; END IF;
  RETURN is_within_1_degree(p_node_id);
END;
$$;

ALTER FUNCTION public.can_manage_invites_for_node(uuid) OWNER TO postgres;

-- 2. RLS policies on public.node_invites
DROP POLICY IF EXISTS node_invites_select ON public.node_invites;
DROP POLICY IF EXISTS node_invites_select_1degree_or_admin ON public.node_invites;

CREATE POLICY node_invites_select_1degree_or_admin ON public.node_invites
  FOR SELECT TO authenticated
  USING (can_manage_invites_for_node(node_id));

DROP POLICY IF EXISTS node_invites_update_1degree ON public.node_invites;

CREATE POLICY node_invites_update_1degree ON public.node_invites
  FOR UPDATE TO authenticated
  USING (can_manage_invites_for_node(node_id))
  WITH CHECK (can_manage_invites_for_node(node_id));

-- 3. Revoke anon table privileges on node_invites (anon access should go exclusively through get_invite_by_token RPC)
REVOKE ALL ON TABLE public.node_invites FROM anon;

-- 4. Clean up legacy single-arg overload if present
DROP FUNCTION IF EXISTS public.claim_invite_secure(text);

-- 5. claim_invite_secure: Enforce token expiration on the server
CREATE OR REPLACE FUNCTION public.claim_invite_secure(invite_token text, claiming_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record public.node_invites%ROWTYPE;
  existing_user_node_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized', 'message', 'You must be signed in');
  END IF;

  IF auth.uid() != claiming_user_id THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized', 'message', 'You can only claim an invite for yourself');
  END IF;

  SELECT * INTO invite_record FROM public.node_invites WHERE token = invite_token;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'invalid_invite', 'message', 'This invite link is not valid');
  END IF;

  IF invite_record.claimed_by_user_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_claimed', 'message', 'This invite has already been claimed');
  END IF;

  IF invite_record.expires_at IS NOT NULL AND invite_record.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'expired_invite', 'message', 'This invite link has expired');
  END IF;

  SELECT node_id INTO existing_user_node_id FROM public.users WHERE id = claiming_user_id;
  IF existing_user_node_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_bound', 'message', 'You are already bound to a node in the family tree');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = claiming_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'auth_not_found', 'message', 'Unable to retrieve profile');
  END IF;

  INSERT INTO public.users (id, node_id, role, full_name, email)
  SELECT
    claiming_user_id,
    invite_record.node_id,
    'user',
    COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name'),
    au.email
  FROM auth.users au
  WHERE au.id = claiming_user_id
  ON CONFLICT (id) DO UPDATE SET
    node_id = EXCLUDED.node_id,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    email = COALESCE(EXCLUDED.email, public.users.email);

  UPDATE public.node_invites SET claimed_by_user_id = claiming_user_id WHERE token = invite_token;

  RETURN json_build_object('success', true, 'node_id', invite_record.node_id);
END;
$$;

ALTER FUNCTION public.claim_invite_secure(text, uuid) OWNER TO postgres;

-- 6. Ensure explicit execute grants
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_invite_secure(text, uuid) TO authenticated, service_role;
