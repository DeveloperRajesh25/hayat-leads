import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicConfig, serverConfig } from "@/lib/config";

/**
 * Privileged Supabase client using the SERVICE ROLE key.
 *
 * This BYPASSES Row Level Security. Use it ONLY in trusted server code:
 *   - the public form submission route (anon users, no session)
 *   - the campaign send route (writing message rows)
 *
 * The `server-only` import guarantees a build error if this module is ever
 * pulled into a client bundle.
 */
export function createAdminClient() {
  return createClient(
    publicConfig.supabaseUrl,
    serverConfig.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
