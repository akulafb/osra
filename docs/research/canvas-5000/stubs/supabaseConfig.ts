// Harness stand-in for src/lib/supabaseConfig.ts: a dummy host that no request leaves the page for.
export function projectRef(): string | null { return null; }
export function publishableKeyFor(): string { return 'harness-dummy-key'; }
export function supabaseUrl(): string { return 'http://harness.invalid'; }
export function supabasePublishableKey(): string { return 'harness-dummy-key'; }
export function supabaseHeaders(apiKey: string, accessToken?: string | null): Record<string, string> {
  return accessToken ? { apikey: apiKey, Authorization: `Bearer ${accessToken}` } : { apikey: apiKey };
}
export function fetchWithoutKeyAsBearer(_apiKey: string, fetchImpl: typeof fetch = fetch): typeof fetch { return fetchImpl; }
