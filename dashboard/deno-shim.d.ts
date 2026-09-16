// Minimal Deno surface for local typechecking of Supabase Edge Functions.
// NOT used at runtime — Supabase provides the real Deno globals.
declare namespace Deno {
  export const env: {
    get(key: string): string | undefined
  }
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: { port?: number }
  ): { finish(): void }
}