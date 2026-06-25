import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the current admin session for Server Components and Route Handlers.
 * Returns the (RLS-scoped) Supabase client plus the authenticated user, or
 * `user: null` when there is no valid session.
 */
export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
