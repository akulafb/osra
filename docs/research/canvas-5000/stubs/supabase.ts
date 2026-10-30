// Harness stand-in for src/lib/supabase.ts: every call answers "nothing", nothing leaves the page.
const quiet: unknown = new Proxy(function () {}, {
  get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) : quiet),
  apply: () => quiet,
});
export const supabase = quiet as never;
