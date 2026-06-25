import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicConfig } from "@/lib/config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads/writes the auth session from Next.js cookies (anon key + RLS).
 *
 * Next.js 15: `cookies()` is async, so this helper is async too.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicConfig.supabaseUrl,
    publicConfig.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` can be called from a Server Component where setting
            // cookies is not allowed. Session refresh is handled in
            // middleware, so this is safe to ignore.
          }
        },
      },
    },
  );
}
