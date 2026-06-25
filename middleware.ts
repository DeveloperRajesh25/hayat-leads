import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs on every matched request to keep the Supabase session fresh and to
 * guard admin routes. See `lib/supabase/middleware.ts` for the logic.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static, _next/image  (build assets)
     *  - favicon and common static files
     * This still covers the public form & webhook so the session is refreshed,
     * while the auth checks inside updateSession only act on protected paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
