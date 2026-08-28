import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicConfig } from "@/lib/config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Routes that require an authenticated admin session. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/contacts",
  "/campaigns",
  "/leads",
];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Requests where the answer to "is this user signed in?" changes the response.
 * Everything else (the public form, /privacy, static assets) is served without
 * touching Supabase at all.
 *
 * API routes are deliberately excluded: every protected route handler already
 * calls `getSessionUser()` and returns its own 401, so gating them here only
 * added a second, redundant round-trip to the Auth server on every fetch.
 */
function needsSession(pathname: string): boolean {
  return isProtectedPage(pathname) || pathname === "/" || pathname === "/login";
}

/**
 * Carry the refreshed Supabase auth cookies onto a response we build ourselves.
 *
 * This is essential. `getUser()` may rotate the refresh token, in which case
 * the new tokens exist only on `supabaseResponse`. Returning a bare
 * `NextResponse.redirect()` would drop them while the old refresh token has
 * already been consumed server-side, killing the session and logging the admin
 * out on their next request.
 */
function withSessionCookies(
  response: NextResponse,
  source: NextResponse,
): NextResponse {
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

/**
 * Refresh the Supabase session on every request and enforce auth:
 *  - Unauthenticated users hitting a protected route -> redirected to /login.
 *  - Authenticated users hitting /login -> redirected to /dashboard.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Nothing on this path depends on the session — skip the Auth round-trip.
  if (!needsSession(pathname)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    publicConfig.supabaseUrl,
    publicConfig.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  //
  // The timeout only exists so a hung Auth server cannot burn the whole 25s
  // middleware budget and take the site down with MIDDLEWARE_INVOCATION_TIMEOUT.
  // On timeout we must NOT treat the admin as signed out: `resolved` stays
  // false and we fall through to the page, whose own `getUser()` is the
  // authoritative check. Redirecting to /login here would turn a slow network
  // into a spurious logout.
  let user = null;
  let resolved = true;
  try {
    const { data } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("supabase auth timeout")), 10_000),
      ),
    ]);
    user = data.user;
  } catch {
    resolved = false;
  }

  // Admin pages: bounce to the login screen, preserving the intended path.
  if (!user && resolved && isProtectedPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return withSessionCookies(NextResponse.redirect(url), supabaseResponse);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return withSessionCookies(NextResponse.redirect(url), supabaseResponse);
  }

  return supabaseResponse;
}
