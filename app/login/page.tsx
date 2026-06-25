import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin Login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo =
    params?.redirect && params.redirect.startsWith("/")
      ? params.redirect
      : "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Hayat Interiors</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lead Manager — Admin sign in
          </p>
        </div>

        <LoginForm redirectTo={redirectTo} />

        <p className="mt-6 text-center text-xs text-slate-400">
          Authorized personnel only. All activity is logged.
        </p>
      </div>
    </main>
  );
}
