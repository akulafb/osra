# Dev vs Production Database Setup

## Overview

- **Production** (`your-prod-project-id`): Live app data. Used by Vercel deployment.
- **Development** (`your-dev-project-id`): Local testing. Used when running `npm run dev`.

## Current Setup

| File | Purpose |
|------|---------|
| `.env.local` | Dev Supabase credentials. Loaded by Vite when running `npm run dev`. |
| `.env.production` | Prod credentials. Used for `npm run build` (production mode). Vercel uses its own env vars. |

**Important:** `.env.local` and `.env.production` are gitignored. Never commit them.

## First-time setup

For a new Supabase project, apply the schema with one command: `npx supabase db push` (after linking via `npx supabase link --project-ref YOUR_REF`). See the [README Database Setup](../README.md#database-setup) for full steps.

## Schema Applied to Dev

The dev database has been set up with:

- Tables: `users`, `nodes`, `links`, `node_invites`, `audit_log`
- RLS policies
- Functions: `is_within_1_degree`, `create_relative_secure`, `get_invite_by_token`, `claim_invite_secure`, etc.
- FK indexes

## Optional: Seed Dev with Sample Data

To populate the dev database with sample family tree data:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your dev project
2. Go to **SQL Editor**
3. Run your seed SQL (e.g. from a local `supabase/scripts/` or `supabase/seed/` folder)

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

Server code lives in `supabase/functions/`. Each function is a folder with an `index.ts`; code that more than one function needs is in `supabase/functions/_shared/` (the sign-in check, CORS and JSON responses, retry on 429 and 529).

| Function | What it does | Secrets it reads |
|----------|--------------|------------------|
| `spelling-matches` | Scores given names against a typed name with TypeSafe Jev (LIN-67) | `TYPESAFE_API_KEY` |

A function's keys are **function secrets**, stored in the Supabase project. They are not in the repo, not in Vercel, and never carry a `VITE_` prefix — a `VITE_` variable is compiled into the browser bundle. Dev and prod are separate projects, so every secret is set twice and every function is deployed twice.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are given to every function by the platform; do not set them.

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

Whether the gateway checks the JWT is set per function in `supabase/config.toml` (`[functions.<name>] verify_jwt`). `spelling-matches` turns it off and checks the session itself, because the gateway check accepts the anon key.

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

### Tests and the evaluation set

The functions' logic is in plain TypeScript modules with no Deno imports, so `npm test` runs their tests (`supabase/functions/**/*.test.ts`). Typecheck them with `npx tsc -p supabase/functions`.

`node scripts/spelling-eval/run.mjs` runs the spelling-match evaluation set against TypeSafe and prints found / wrong extras / missed. It is not part of `npm test`: it needs `TYPESAFE_API_KEY` (from the environment or `.env.local`) and the network. Run it again before changing the pinned model or the question wording.

## Verification

1. Ensure `.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointing to the **dev** project.
2. Run `npm run dev` and visit http://localhost:5173
3. Sign in with Google → data is saved to the dev database only.
4. Production at https://3d-family-tree-vert.vercel.app uses the production database.
