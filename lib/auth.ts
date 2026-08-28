import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the current admin session for Server Components and Route Handlers.
 * Returns the (RLS-scoped) Supabase client plus the authenticated user, or
 * `user: null` when there is no valid session.
 *
 * `getUser()` is a network round-trip to the Supabase Auth server, so only
 * reach for this when the answer actually gates the response — every API route
 * handler does, since middleware no longer guards `/api`. Pages under
 * `(admin)` should use `getRlsClient()` instead.
 */
export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * RLS-scoped Supabase client with no Auth round-trip.
 *
 * For pages under `(admin)`, which are already guarded twice over: middleware
 * runs the authoritative `getUser()` for the navigation and redirects anyone
 * signed out, and the admin layout re-checks the session before rendering.
 * Row Level Security remains the boundary on the data itself — the client
 * carries the user's JWT, so a request without a valid one reads nothing.
 *
 * These pages only ever used `supabase` from `getSessionUser()` and discarded
 * `user`, meaning they each paid a full Auth round-trip for a client they
 * could build locally.
 */
export async function getRlsClient() {
  return createClient();
}
