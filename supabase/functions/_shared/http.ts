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

/** `fetch`, narrowed to what the functions use, so tests can stand in for the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The body of every refusal: a stable `code` for code, a `message` for people,
 * and any fields a function adds for its own callers (family-chat adds `cause`).
 */
export interface ErrorBody {
  error: { code: string; message: string; [field: string]: unknown };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  const body: ErrorBody = { error: { ...extra, code, message } };
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

/** Far more than any request a function accepts; a larger body is not parsed. */
export const MAX_BODY_BYTES = 512 * 1024;

/**
 * Reads a JSON body without throwing; `undefined` means it was not JSON, or was
 * larger than `maxBytes`.
 */
export async function readJsonBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  if (Number(req.headers.get('Content-Length') ?? 0) > maxBytes) return undefined;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
