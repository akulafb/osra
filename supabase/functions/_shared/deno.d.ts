/**
 * The two Deno globals the function entry points use, declared so
 * `npx tsc -p supabase/functions` can typecheck them under Node. Nothing imports
 * this file; the Edge runtime has the real `Deno`.
 */
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
  env: { get(name: string): string | undefined };
};
