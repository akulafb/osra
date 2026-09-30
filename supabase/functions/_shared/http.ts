/**
 * What every Edge Function says to the browser: CORS headers, the preflight
 * answer, and one JSON shape for success and for refusal.
 *
 * The app is called from localhost in dev and from the Vercel domain in prod, and
 * it authenticates with a bearer token rather than a cookie, so any origin may
 * ask — the token, not the origin, is what is checked (see auth.ts).
 */

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** The body of every refusal: a stable `code` for code, a `message` for people. */
export interface ErrorBody {
  error: { code: string; message: string };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return jsonResponse(body, status);
}

/**
 * Answers the parts of a request that are the same for every function: the CORS
 * preflight and the method check. Returns null when the request is a POST the
 * function should go on to handle.
 */
export function answerPreflightOrWrongMethod(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST.');
  }
  return null;
}

/** Reads a JSON body without throwing; `undefined` means it was not JSON. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
