import type { Metadata } from "next";
import { Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Enquiry Form · Hayat Interiors",
  description: "Tell us about your interior design requirements.",
};

export default function FormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Hayat Interiors</h1>
          <p className="mt-1 text-sm text-slate-500">
            Designing spaces you&apos;ll love to live in.
          </p>
        </div>

        <div className="flex-1">{children}</div>

        <p className="mt-8 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Hayat Interiors. All rights reserved.
        </p>
      </div>
    </div>
  );
}
