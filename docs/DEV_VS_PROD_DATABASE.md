# Dev vs Production Database Setup

## Overview

- **Production** (`your-prod-project-id`): Live app data. Used by Vercel deployment.
- **Development** (`your-dev-project-id`): Local testing. Used when running `npm run dev`.

## Current Setup

| File | Purpose |
|------|---------|
| `.env.local` | `VITE_SUPABASE_URL` for dev. Loaded by Vite when running `npm run dev`. May also hold copies of `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY`, used only to set function secrets and run the scripts (see `.env.example`). |
| `.env.production` | `VITE_SUPABASE_URL` for prod. Used for `npm run build` (production mode). Vercel uses its own env vars. |

No key goes in either file: the app picks each project's publishable key from `src/lib/supabaseConfig.ts` by the project ref in the URL (LIN-82).

**Important:** `.env.local` and `.env.production` are gitignored. Never commit them.

## First-time setup

For a new Supabase project, apply the schema with one command: `npx supabase db push` (after linking via `npx supabase link --project-ref YOUR_REF`). Then add the project's ref and `default` publishable key to `PUBLISHABLE_KEYS` in `src/lib/supabaseConfig.ts`; the app refuses any project ref not listed there. See the [README Database Setup](../README.md#database-setup) for full steps.

## Schema (from `supabase/migrations/`)

Both databases are set up with:

- Tables: `users`, `nodes` (with `gender`, LIN-76), `links`, `node_invites`, `audit_log`, `chat_message_usage`
- RLS policies
- Functions: `is_within_1_degree`, `create_relative_secure`, `get_invite_by_token`, `claim_invite_secure`, `chat_use_model_call`, `fill_in_both_parent_links`, etc.
- FK indexes

## Optional: Seed Dev with Sample Data

To populate the dev database with sample family tree data:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your dev project
2. Go to **SQL Editor**
3. Run your seed SQL. `node scripts/run-seed-dev.mjs [path/to/seed.sql]` prints it ready to paste; with no path it reads `supabase/scripts/your-seed.sql` (`supabase/scripts/` is gitignored, so seed files stay local)

**Note:** After sign-in, claim an invite (e.g. the token from your seed SQL) to create your user record and bind to a node. To make yourself admin, run in SQL Editor (replace with your auth user ID from Auth → Users):

```sql
UPDATE users SET role = 'admin' WHERE id = 'your-google-user-uuid';
```

## Google OAuth for Dev

For local sign-in to work:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your dev project
2. Go to **Authentication** → **Providers** → **Google**
3. Enable Google and add your OAuth credentials
4. Under **URL Configuration**:
   - **Redirect URLs**: Add `http://localhost:5173`, `http://127.0.0.1:5173`, and for mobile testing `http://YOUR_IP:5173` (e.g. `http://192.168.1.100:5173`). Find your IP with `ipconfig getifaddr en0` (Mac).
   - **Site URL**: For mobile testing on same Wi‑Fi, temporarily set to `http://YOUR_IP:5173`. Supabase falls back to Site URL when redirectTo doesn't match; changing it ensures OAuth redirects to your phone. Change back to `http://localhost:5173` when done.

## Edge Functions

Server code lives in `supabase/functions/`. Each function is a folder with an `index.ts`; code that more than one function needs is in `supabase/functions/_shared/` (the sign-in check, CORS and JSON responses, retry on 429 and 529, the project keys in `projectKeys.ts`, service-role PostgREST calls in `supabaseRest.ts`, and the TypeSafe call in `typeSafe.ts`).

| Function | What it does | Secrets it reads |
|----------|--------------|------------------|
| `spelling-matches` | Scores given names against a typed name with TypeSafe Jev (LIN-67) | `TYPESAFE_API_KEY` |
| `family-chat` | The family chat's model calls through OpenRouter (`x-ai/grok-4.3`, `CHAT_MODEL` in `openRouter.ts`), with 10 messages per account per UAE day (LIN-71), a 220-token reply cap and a $0.01 cost cap per message (LIN-80, `limits.ts`). Needs the `chat_message_usage` migration. Its `route` operation asks TypeSafe Jev what kind of question a message is, so code can answer the common kinds with no model call (LIN-73). | `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY` |

A function's keys are **function secrets**, stored in the Supabase project. They are not in the repo, not in Vercel, and never carry a `VITE_` prefix — a `VITE_` variable is compiled into the browser bundle. Dev and prod are separate projects, so every secret is set twice and every function is deployed twice.

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` are given to every function by the platform; do not set them. The functions use the `default` key of each (`_shared/projectKeys.ts`), and fall back to the legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` only where those are missing (LIN-82). Neither new key is a JWT: each goes on `apikey` only. (`family-chat` uses the secret key for the one database function that keeps the daily count, which only the service role may run.)

### Set a secret and deploy (run once for dev, once for prod)

The project ref is the first part of the project URL (`https://<ref>.supabase.co`). Log in first with `npx supabase login`.

```bash
REF=your-dev-project-id        # then repeat everything below with the prod ref

# 1. Set the secret. This reads the key from .env.local without printing it or
#    putting it in shell history, and accepts spaces around "=".
KEY="$(sed -nE 's/^[[:space:]]*TYPESAFE_API_KEY[[:space:]]*=[[:space:]]*"?([^"[:space:]]+)"?[[:space:]]*$/\1/p' .env.local)"
npx supabase secrets set "TYPESAFE_API_KEY=$KEY" --project-ref "$REF"
unset KEY

# 2. Deploy the function (leave the name out to deploy every function).
npx supabase functions deploy spelling-matches --project-ref "$REF"

# 3. Check.
npx supabase secrets list --project-ref "$REF"      # names and digests only
npx supabase functions list --project-ref "$REF"
```

For another function or secret, change the secret name and the function name; the steps are the same. A secret can be changed without a new deploy. A code change needs step 2 again, on both projects.

Whether the gateway checks the JWT is set per function in `supabase/config.toml` (`[functions.<name>] verify_jwt`). Both functions turn it off and check the session themselves (`_shared/auth.ts`), because the gateway check accepts the anon key.

### Check a deployed function from `npm run dev`

Run `npm run dev`, sign in, and paste this in the browser console on `http://localhost:5173`. It sends the signed-in session's token from the local origin, so it checks the sign-in check and CORS as well as the function:

```js
const ref = 'your-dev-project-id';
const token = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`)).access_token;
const res = await fetch(`https://${ref}.supabase.co/functions/v1/spelling-matches`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ typedName: 'Mohamed', names: ['Mohammad', 'Omar'] }),
});
console.log(res.status, await res.json());
// 200 { model: 'jev-1.13.0', scores: [{ name: 'Mohammad', score: 0.9… }, { name: 'Omar', score: 0.0… }] }
```

App code calls it with `supabase.functions.invoke('spelling-matches', { body: { typedName, names } })`, which sends the session token for you.

Function logs (including the provider's error text, which is never sent to the browser): Supabase Dashboard → Edge Functions → the function → Logs.

### `family-chat`: migration, secret, deploy (dev, then prod)

The chat function needs a table and a database function first (`supabase/migrations/20261001120000_lin71_chat_message_usage.sql`), then its secret, then the deploy. Use a new OpenRouter key with a credit cap; the old one was public in the site code.

```bash
REF=your-dev-project-id        # then repeat everything below with the prod ref

# 1. Apply the migration. Look at the dry run first: it should list only the
#    migrations you expect (here, 20261001120000_lin71_chat_message_usage.sql).
npx supabase link --project-ref "$REF"
npx supabase db push --dry-run
npx supabase db push

# 2. Set the secret, read from .env.local without printing it.
KEY="$(sed -nE 's/^[[:space:]]*OPENROUTER_API_KEY[[:space:]]*=[[:space:]]*"?([^"[:space:]]+)"?[[:space:]]*$/\1/p' .env.local)"
npx supabase secrets set "OPENROUTER_API_KEY=$KEY" --project-ref "$REF"
unset KEY

# 3. Deploy.
npx supabase functions deploy family-chat --project-ref "$REF"
npx supabase secrets list --project-ref "$REF"      # OPENROUTER_API_KEY is listed
```

Check it from `npm run dev` (signed in, browser console on `http://localhost:5173`):

```js
const ref = 'your-dev-project-id';
const token = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`)).access_token;
const chat = (body) => fetch(`https://${ref}.supabase.co/functions/v1/family-chat`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async (r) => [r.status, await r.json()]);
const messageId = crypto.randomUUID();
console.log(await chat({ messageId, messages: [{ role: 'user', content: 'How many cousins do I have?' }] }));
// 200 { message: { role: 'assistant', content: null, toolCalls: [{ id, name: 'getRelatives', arguments: {…} }] },
//       done: false, usage: { messagesUsed: 1, dailyLimit: 10, modelCalls: 1, maxModelCalls: 6, resetsAt: '…' }, cost: 0.0004 }
```

Without a session the same call answers 401 with `cause: 'not_signed_in'` (try it with `Authorization` removed). Each new `messageId` uses one of the account's 10 messages for the UAE day; the count starts again at midnight UAE time (20:00 UTC). A `messageId` belongs to one question: tool rounds and retries reuse it, a new question needs a new one (reusing it answers 409 `message_id_reused`). To see the counts: Dashboard → Table Editor → `chat_message_usage`. To give a test account its messages back on dev, delete its rows there.

#### The `route` operation (LIN-73)

Before any model call the browser sends `{ operation: 'route', messageId, message }`. The function counts the message (the route is its first call, so a message that code answers still uses one of the day's 10, and a message sent on to the model has 5 model calls left), asks Jev its five questions (`supabase/functions/family-chat/questionKind.ts`, pinned to `jev-1.13.0`), and answers `200 { questionKind, speaker, usage }`. `questionKind` is `null` when `TYPESAFE_API_KEY` is not set, or Jev failed, took over 2.5 s, or was still busy after one short retry; the browser then sends the message to the model and the user sees no error. The `TYPESAFE_API_KEY` secret is the one the `spelling-matches` function already reads, so a project that has it needs only the deploy:

```bash
npx supabase secrets list --project-ref "$REF"      # TYPESAFE_API_KEY is listed (set for spelling-matches)
npx supabase functions deploy family-chat --project-ref "$REF"
```

```js
console.log(await chat({ operation: 'route', messageId: crypto.randomUUID(), message: 'who are my khalos' }));
// 200 { questionKind: { relation: { value: 'aunts_uncles', confidence: 0.9… }, side: { value: 'maternal', … }, gender: …,
//       subject: …, wantsCount: { value: false, … } }, speaker: { personId, displayName }, usage: { messagesUsed: 1, … } }
```

How the function is called — the request, the answer, the tool round, the route and the refusal causes — is written at the top of `supabase/functions/family-chat/handler.ts` and `request.ts`.

The database rules and RLS have a check script, `supabase/tests/chat_message_usage.sql`, for a local or throwaway database only (never dev or prod). With Docker:

```bash
docker run -d --rm --name osra-pg -e POSTGRES_PASSWORD=pw postgres:16-alpine && sleep 3
for f in supabase/tests/stub_supabase_auth.sql supabase/migrations/20261001120000_lin71_chat_message_usage.sql supabase/tests/chat_message_usage.sql; do
  docker exec -i osra-pg psql -U postgres -v ON_ERROR_STOP=1 -q < "$f" || break
done
docker stop osra-pg
```

### Tests and the evaluation set

The functions' logic is in plain TypeScript modules with no Deno imports, so `npm test` runs their tests (`supabase/functions/**/*.test.ts`). Typecheck them with `npx tsc -p supabase/functions`.

`node scripts/spelling-eval/run.mjs` runs the spelling-match evaluation set against TypeSafe and prints found / wrong extras / missed. It is not part of `npm test`: it needs `TYPESAFE_API_KEY` (from the environment or `.env.local`) and the network. Run it again before changing the pinned model or the question wording.

`node scripts/chat-routing-eval/run.mjs` does the same for the chat route (LIN-73): it sends the 46 prototype messages in `scripts/chat-routing-eval/messages.json` to Jev as the `family-chat` route does, and prints how many of the tuned (32) and new (14) messages Jev read right, and where each would go at the confidence gate. Same key, same rule: run it before changing the model or the wording in `questionKind.ts`.

`npm run chat-questions` asks the 20 chat test questions (LIN-74, `src/lib/fixtures/chatTestQuestions.ts`) on the made-up test tree, signed in as its Person Maya Khoury, through the same chat code the browser uses with the real Jev and OpenRouter. For each question it prints correct or wrong, whether code or the model answered, the model calls and the cost (Jev's input tokens at `JEV_PRICE_PER_MILLION_INPUT_TOKENS` in `chatTestHarness.ts`, plus OpenRouter's `usage.cost`), then the totals: correct, routed to code, mean cost, highest cost. It needs `OPENROUTER_API_KEY` and `TYPESAFE_API_KEY` (from the environment, `.env.local`, or the file named by `$ENV_FILE`) and costs under a cent a run. It needs no deployed function: it runs the `family-chat` handler in-process with Supabase Auth and the database faked, so it reaches no Supabase project, makes no change to the Tree Record and does not use the daily limit. Add `-- --replies` to print each reply, or `-- --only <id>,<id>` to ask some of them. It exits 1 below 18 of 20. Run it after any change to the chat, the routing or the prompt.

## Both parents linked: the one-time fill-in (LIN-78)

A child has a `parent` Kinship Link to each parent the family knows (ADR 0012). Most children used to be linked to their father only. This fill-in fixes the existing children; a child added in the app still gets a link to the chosen parent only, until LIN-79. Migration `20261001140000_lin78_fill_in_both_parent_links.sql` adds `fill_in_both_parent_links`, which only an admin or the service role may call, and `scripts/both-parents/fill-in.ts` calls it. For each child linked to one parent, it links the parent's only spouse, when that parent has had exactly one spouse ever (by marriage, no divorce) and the spouse has the other gender. Every other child goes on a list in `/tmp` for the owner to name the other parent. Nothing is guessed for a child on the list.

Run order: dev, then prod. On each, push the migration, run the dry run, check both files, then apply. The apply writes exactly the links in the will-link file from the last dry run, or nothing.

```bash
REF=your-dev-project-id; ENV=dev        # then prod
npx supabase link --project-ref "$REF"
npx supabase db push --dry-run          # lists only 20261001140000_lin78_fill_in_both_parent_links.sql
npx supabase db push

# Dry run: writes /tmp/both-parents-$ENV-will-link.csv (review) and /tmp/both-parents-$ENV-list.csv
SUPABASE_SERVICE_ROLE_KEY=… npx vite-node scripts/both-parents/fill-in.ts $ENV
# Put the other parent's id in named_parent_id on the list where you know it, then check the answers:
SUPABASE_SERVICE_ROLE_KEY=… npx vite-node scripts/both-parents/fill-in.ts $ENV --names /tmp/both-parents-$ENV-list.csv
# Apply, with the same --names (or none):
SUPABASE_SERVICE_ROLE_KEY=… npx vite-node scripts/both-parents/fill-in.ts $ENV --apply --names /tmp/both-parents-$ENV-list.csv
```

Running it again links no one twice. The SQL checks are in `supabase/tests/both_parent_links.sql`, for a throwaway database only (as above for `chat_message_usage.sql`: the stub, then the schema migrations, then the checks).

## Verification

1. Ensure `.env.local` has `VITE_SUPABASE_URL` pointing to the **dev** project. The app picks that project's publishable key from `src/lib/supabaseConfig.ts`.
2. Run `npm run dev` and visit http://localhost:5173
3. Sign in with Google → data is saved to the dev database only.
4. Production at https://3d-family-tree-vert.vercel.app uses the production database.
