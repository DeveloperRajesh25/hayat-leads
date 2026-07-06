import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./login-form";
import { LogoWatermark } from "@/components/brand/logo-watermark";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <LogoWatermark />
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg shadow-brand-600/20 ring-1 ring-slate-200 dark:ring-slate-700">
            <Image
              src="/hayat-logo.png"
              alt="Hayat Interiors"
              width={64}
              height={64}
              className="h-full w-full object-contain p-1.5"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Hayat Interiors
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Lead Manager — Admin sign in
          </p>
        </div>

        <LoginForm redirectTo={redirectTo} />

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          Authorized personnel only. All activity is logged.
        </p>
      </div>
    </main>
  );
}
