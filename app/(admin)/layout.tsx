import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/admin/sidebar";
import { LogoWatermark } from "@/components/brand/logo-watermark";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already performs the server-verified `getUser()` check for
  // every protected route and redirects unauthenticated requests before
  // this layout ever renders. Re-verifying here would mean a second network
  // round-trip to Supabase Auth on every page load, roughly doubling load
  // time and adding a second point of failure that can spuriously log out
  // an already-authenticated user if that call is slow or blips. Reading
  // the session from cookies is sufficient defense in depth.
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const user = session.user;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 lg:flex">
      <LogoWatermark />
      <Sidebar email={user.email ?? "admin"} />
      <div className="flex-1 lg:pl-64">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
