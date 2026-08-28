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
     *  - api            (every protected route handler authenticates itself and
     *                    returns its own 401; running auth here too meant a
     *                    second round-trip to Supabase on every single fetch)
     *  - _next/static, _next/image  (build assets)
     *  - favicon and common static files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
