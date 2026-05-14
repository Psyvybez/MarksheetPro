// Ambient declarations for Deno Edge Function runtime

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  const env: Env;
}

declare module 'https://deno.land/std@0.224.0/http/server.ts' {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2.45.4' {
  // Re-export a minimal typed createClient sufficient for edge-function usage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createClient(supabaseUrl: string, supabaseKey: string): any;
}
