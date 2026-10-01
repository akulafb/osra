-- =============================================================================
-- LIN-71: checks for public.chat_message_usage and chat_use_model_call
-- =============================================================================
-- Runs against a database where the LIN-71 migration has been applied, as a
-- superuser (postgres). Everything happens inside one transaction that is
-- rolled back, so it leaves no rows behind. A failed check stops with an error
-- that names it; success prints "chat_message_usage: all checks passed".
--
-- Local Supabase stack:   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/chat_message_usage.sql
-- Plain Postgres (no Supabase): first run supabase/tests/stub_supabase_auth.sql,
-- then the migration, then this file. Never run it against dev or prod.
-- =============================================================================

BEGIN;

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2');

-- ---------------------------------------------------------------------------
-- The limit rules, called the way the function calls them (service_role)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;

DO $$
DECLARE
  u1 uuid := '00000000-0000-0000-0000-0000000000a1';
  u2 uuid := '00000000-0000-0000-0000-0000000000b2';
  r jsonb;
  i integer;
BEGIN
  -- Ten new messages on one UAE day are accepted.
  FOR i IN 1..10 LOOP
    r := public.chat_use_model_call(u1, 'msg-' || i, '2026-10-01', 10, 6);
    ASSERT r->>'outcome' = 'ok', format('message %s should be accepted: %s', i, r);
    ASSERT (r->>'new_message')::boolean, format('message %s should be new: %s', i, r);
    ASSERT (r->>'messages_used')::int = i, format('message %s should be number %s: %s', i, i, r);
  END LOOP;

  -- The 11th new message that day (23:59 UAE time) is refused, and not recorded.
  r := public.chat_use_model_call(u1, 'msg-11', '2026-10-01', 10, 6);
  ASSERT r->>'outcome' = 'daily_limit', format('11th message should hit the daily limit: %s', r);
  ASSERT NOT EXISTS (SELECT 1 FROM public.chat_message_usage WHERE user_id = u1 AND message_id = 'msg-11'),
    'a refused message must not be recorded';

  -- A repeat call for a message already counted does not use one of the 10.
  r := public.chat_use_model_call(u1, 'msg-1', '2026-10-01', 10, 6);
  ASSERT r->>'outcome' = 'ok', format('repeat id should be accepted: %s', r);
  ASSERT NOT (r->>'new_message')::boolean, format('repeat id is not new: %s', r);
  ASSERT (r->>'model_calls')::int = 2, format('repeat id should be its 2nd call: %s', r);
  ASSERT (r->>'messages_used')::int = 10, format('repeat id should not add a message: %s', r);

  -- A message started yesterday keeps going after midnight without a new place.
  r := public.chat_use_model_call(u1, 'msg-2', '2026-10-02', 10, 6);
  ASSERT r->>'outcome' = 'ok' AND NOT (r->>'new_message')::boolean,
    format('a message that crosses midnight is not new: %s', r);

  -- At 00:01 UAE time the next day the count starts again.
  r := public.chat_use_model_call(u1, 'msg-11', '2026-10-02', 10, 6);
  ASSERT r->>'outcome' = 'ok' AND (r->>'new_message')::boolean,
    format('the next UAE day should accept a new message: %s', r);
  ASSERT (r->>'messages_used')::int = 1, format('the next day starts at 1: %s', r);

  -- Another user's limit is their own.
  r := public.chat_use_model_call(u2, 'msg-1', '2026-10-01', 10, 6);
  ASSERT r->>'outcome' = 'ok' AND (r->>'new_message')::boolean,
    format('another user with the same message id has their own count: %s', r);

  -- Six model calls for one message are accepted; the 7th is refused.
  FOR i IN 1..6 LOOP
    r := public.chat_use_model_call(u2, 'tools', '2026-10-01', 10, 6);
    ASSERT r->>'outcome' = 'ok', format('call %s of one message should be accepted: %s', i, r);
    ASSERT (r->>'model_calls')::int = i, format('call %s should be counted: %s', i, r);
  END LOOP;
  r := public.chat_use_model_call(u2, 'tools', '2026-10-01', 10, 6);
  ASSERT r->>'outcome' = 'message_call_limit', format('the 7th call should be refused: %s', r);
  ASSERT (SELECT model_calls FROM public.chat_message_usage WHERE user_id = u2 AND message_id = 'tools') = 6,
    'a refused call must not be counted';
END $$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- What a signed-in user can do from the browser (authenticated + their JWT)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

DO $$
DECLARE
  n integer;
BEGIN
  -- Reads their own rows, and no one else's.
  SELECT count(*) INTO n FROM public.chat_message_usage;
  ASSERT n = 11, format('user a1 should see exactly their own 11 rows, saw %s', n);
  SELECT count(*) INTO n FROM public.chat_message_usage
  WHERE user_id = '00000000-0000-0000-0000-0000000000b2';
  ASSERT n = 0, format('user a1 must not see user b2''s rows, saw %s', n);

  -- Cannot change their own count.
  BEGIN
    UPDATE public.chat_message_usage SET model_calls = 1;
    RAISE EXCEPTION 'UPDATE by authenticated should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.chat_message_usage;
    RAISE EXCEPTION 'DELETE by authenticated should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.chat_message_usage (user_id, message_id, uae_day)
    VALUES ('00000000-0000-0000-0000-0000000000a1', 'forged', '2026-10-03');
    RAISE EXCEPTION 'INSERT by authenticated should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Cannot call the function that records calls (for themselves or anyone).
  BEGIN
    PERFORM public.chat_use_model_call('00000000-0000-0000-0000-0000000000b2', 'x', '2026-10-01', 10, 6);
    RAISE EXCEPTION 'chat_use_model_call by authenticated should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Someone not signed in (anon) can do nothing
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.chat_message_usage;
    RAISE EXCEPTION 'SELECT by anon should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.chat_use_model_call('00000000-0000-0000-0000-0000000000a1', 'x', '2026-10-01', 10, 6);
    RAISE EXCEPTION 'chat_use_model_call by anon should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT 'chat_message_usage: all checks passed' AS result;

ROLLBACK;
