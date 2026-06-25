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

/** Admin-only API namespaces (the public form + webhook stay open). */
const PROTECTED_API_PREFIXES = [
  "/api/contacts",
  "/api/campaigns",
  "/api/stats",
];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

function isProtectedApi(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Refresh the Supabase session on every request and enforce auth:
 *  - Unauthenticated users hitting a protected route -> redirected to /login.
 *  - Authenticated users hitting /login -> redirected to /dashboard.
 */
export async function updateSession(request: NextRequest) {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Admin API routes: respond with JSON 401 rather than an HTML redirect.
  if (!user && isProtectedApi(pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin pages: bounce to the login screen, preserving the intended path.
  if (!user && isProtectedPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
