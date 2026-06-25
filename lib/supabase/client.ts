import { createBrowserClient } from "@supabase/ssr";
import { publicConfig } from "@/lib/config";

/**
 * Supabase client for use in Client Components ("use client").
 * Uses the public anon key and the browser's cookie store.
 */
export function createClient() {
  return createBrowserClient(
    publicConfig.supabaseUrl,
    publicConfig.supabaseAnonKey,
  );
}
