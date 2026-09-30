// Supabase Edge Function entry point (Deno). All behaviour is in handler.ts,
// which is tested under `npm test`; this file only hands it the real runtime.
import { handleSpellingMatches } from './handler.ts';

Deno.serve((req) => handleSpellingMatches(req, { env: (name) => Deno.env.get(name) }));
