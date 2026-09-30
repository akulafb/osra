/**
 * The spelling-match Edge Function, with everything it reaches for passed in, so
 * the whole request path runs under `npm test` without Deno or the network.
 *
 * Order matters: the sign-in check comes before the body is even read, and
 * TypeSafe is called only after both the session and the body are accepted.
 */

import { authRefusal, requireSignedInUser, type FetchLike } from '../_shared/auth.ts';
import {
  answerPreflightOrWrongMethod,
  errorResponse,
  jsonResponse,
  readJsonBody,
} from '../_shared/http.ts';
import type { RetryOptions } from '../_shared/retry.ts';
import { TYPESAFE_MODEL, validateRequest, type SpellingMatchResponse } from './spellingMatches.ts';
import { scoreNames } from './typeSafe.ts';

export interface HandlerDeps {
  /** Reads a function secret or platform variable; `Deno.env.get` in production. */
  env: (name: string) => string | undefined;
  /** Used for the session check and for TypeSafe. Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
  /** Backoff overrides, for tests. */
  retry?: Pick<RetryOptions, 'sleep' | 'random' | 'retries'>;
  log?: (message: string) => void;
}

export async function handleSpellingMatches(req: Request, deps: HandlerDeps): Promise<Response> {
  const early = answerPreflightOrWrongMethod(req);
  if (early) return early;

  const log = deps.log ?? ((m: string) => console.error(m));
  const supabaseUrl = deps.env('SUPABASE_URL');
  const supabaseAnonKey = deps.env('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    log('spelling-matches: SUPABASE_URL or SUPABASE_ANON_KEY is missing');
    return errorResponse(500, 'not_configured', 'The function is not configured.');
  }

  const auth = await requireSignedInUser(req, { supabaseUrl, supabaseAnonKey }, deps.fetchImpl);
  if (!auth.ok) return authRefusal(auth);

  const validation = validateRequest(await readJsonBody(req));
  if (!validation.ok) return errorResponse(400, validation.code, validation.message);
  const { request } = validation;

  // Nothing to compare against is an answer, not an error, and costs nothing.
  if (request.names.length === 0) {
    const empty: SpellingMatchResponse = { model: TYPESAFE_MODEL, scores: [] };
    return jsonResponse(empty);
  }

  const apiKey = deps.env('TYPESAFE_API_KEY')?.trim();
  if (!apiKey) {
    log('spelling-matches: the TYPESAFE_API_KEY secret is not set on this project');
    return errorResponse(500, 'not_configured', 'The function is not configured.');
  }

  const outcome = await scoreNames(request, apiKey, { ...deps.retry, fetchImpl: deps.fetchImpl });
  if (outcome.ok) {
    const body: SpellingMatchResponse = { model: outcome.model, scores: outcome.scores };
    return jsonResponse(body);
  }

  // The provider's own words go to the function log, not to the browser.
  switch (outcome.kind) {
    case 'busy':
      log(`spelling-matches: TypeSafe still answered ${outcome.status} after retries`);
      return errorResponse(503, 'upstream_busy', 'The name service is busy. Try again shortly.');
    case 'failed':
      log(`spelling-matches: TypeSafe answered ${outcome.status}: ${outcome.detail}`);
      return errorResponse(502, 'upstream_error', 'The name service returned an error.');
    case 'unreachable':
      log(`spelling-matches: TypeSafe could not be reached: ${outcome.detail}`);
      return errorResponse(502, 'upstream_unreachable', 'The name service could not be reached.');
  }
}
