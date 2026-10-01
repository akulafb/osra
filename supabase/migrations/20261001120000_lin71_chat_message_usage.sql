-- =============================================================================
-- LIN-71: the family chat's daily limit, counted on the server
-- =============================================================================
--
-- One row per user message sent to the `family-chat` Edge Function. The browser
-- gives each user message an id; the first model call with a new id uses one of
-- the account's messages for the day, and later calls with the same id (the
-- rounds where the model asks the browser to run a tool) add to that row's
-- `model_calls` instead.
--
--   * 10 new messages per account per UAE day (`uae_day`, Asia/Dubai, UTC+4).
--   * 6 model calls per message; the 7th is refused.
--
-- The numbers are passed in by the function (supabase/functions/family-chat/
-- limits.ts); the rules, and the lock that makes them hold under concurrent
-- calls, are here.
--
-- WHO CAN DO WHAT
--
--   * Only the function writes. It calls `chat_use_model_call` with the
--     service_role key; anon and authenticated cannot execute it and have no
--     INSERT, UPDATE or DELETE on the table. So a user cannot change any count,
--     their own included, from the browser.
--   * A signed-in user can read their own rows (to show "n of 10 used") and no
--     one else's (RLS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chat_message_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Chosen by the browser; unique per user, not globally.
  message_id text NOT NULL CHECK (char_length(message_id) BETWEEN 1 AND 100),
  -- The UAE day of the message's first model call. A message that starts at
  -- 23:59 and finishes its tool rounds after midnight still counts on that day.
  uae_day date NOT NULL,
  model_calls integer NOT NULL DEFAULT 1 CHECK (model_calls >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_call_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS chat_message_usage_user_day_idx
  ON public.chat_message_usage (user_id, uae_day);

ALTER TABLE public.chat_message_usage ENABLE ROW LEVEL SECURITY;

-- Start from nothing, then give back exactly what each role needs. The explicit
-- REVOKE matters on Supabase, where default privileges grant new public tables
-- to anon and authenticated.
REVOKE ALL ON TABLE public.chat_message_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.chat_message_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_message_usage TO service_role;

DROP POLICY IF EXISTS chat_message_usage_select_own ON public.chat_message_usage;
CREATE POLICY chat_message_usage_select_own ON public.chat_message_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- chat_use_model_call: records one model call, or says why it is refused
-- -----------------------------------------------------------------------------
-- Returns one JSON object:
--   { "outcome": "ok" | "daily_limit" | "message_call_limit",
--     "new_message": boolean,      -- this call started a new message
--     "messages_used": integer,    -- messages counted on p_uae_day, after this call
--     "model_calls": integer }     -- model calls of this message, after this call
-- A refused call changes nothing.
CREATE OR REPLACE FUNCTION public.chat_use_model_call(
  p_user_id uuid,
  p_message_id text,
  p_uae_day date,
  p_daily_limit integer,
  p_max_model_calls integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_calls integer;
  v_used integer;
BEGIN
  IF p_user_id IS NULL OR p_message_id IS NULL OR p_uae_day IS NULL
     OR p_daily_limit IS NULL OR p_max_model_calls IS NULL THEN
    RAISE EXCEPTION 'chat_use_model_call: every argument is required';
  END IF;

  -- One user's calls are serialised, so two new messages sent at once cannot
  -- both take the 10th place. Other users are not blocked.
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_message_usage:' || p_user_id::text, 0));

  SELECT model_calls INTO v_calls
  FROM public.chat_message_usage
  WHERE user_id = p_user_id AND message_id = p_message_id;

  IF FOUND THEN
    -- A call for a message already counted: it uses a model call, not a message.
    IF v_calls >= p_max_model_calls THEN
      SELECT count(*) INTO v_used FROM public.chat_message_usage
      WHERE user_id = p_user_id AND uae_day = p_uae_day;
      RETURN jsonb_build_object('outcome', 'message_call_limit', 'new_message', false,
        'messages_used', v_used, 'model_calls', v_calls);
    END IF;

    UPDATE public.chat_message_usage
    SET model_calls = model_calls + 1, last_call_at = now()
    WHERE user_id = p_user_id AND message_id = p_message_id
    RETURNING model_calls INTO v_calls;

    SELECT count(*) INTO v_used FROM public.chat_message_usage
    WHERE user_id = p_user_id AND uae_day = p_uae_day;
    RETURN jsonb_build_object('outcome', 'ok', 'new_message', false,
      'messages_used', v_used, 'model_calls', v_calls);
  END IF;

  SELECT count(*) INTO v_used FROM public.chat_message_usage
  WHERE user_id = p_user_id AND uae_day = p_uae_day;

  IF v_used >= p_daily_limit THEN
    RETURN jsonb_build_object('outcome', 'daily_limit', 'new_message', true,
      'messages_used', v_used, 'model_calls', 0);
  END IF;

  INSERT INTO public.chat_message_usage (user_id, message_id, uae_day, model_calls)
  VALUES (p_user_id, p_message_id, p_uae_day, 1);

  RETURN jsonb_build_object('outcome', 'ok', 'new_message', true,
    'messages_used', v_used + 1, 'model_calls', 1);
END;
$$;

-- Only the Edge Function (service_role) may record a call. Supabase's default
-- privileges grant EXECUTE on new public functions to anon and authenticated
-- directly, so revoking from PUBLIC alone would not be enough.
REVOKE ALL ON FUNCTION public.chat_use_model_call(uuid, text, date, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_use_model_call(uuid, text, date, integer, integer)
  TO service_role;
