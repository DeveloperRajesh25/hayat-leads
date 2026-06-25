import { LeadForm } from "@/components/form/lead-form";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function FormByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let defaultName = "";
  let defaultPhone = "";

  // Look up the contact by token (service role — bypasses RLS) to pre-fill the
  // form. Falls back to a blank form if not configured or token is unknown.
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("contacts")
      .select("name, phone")
      .eq("token", token)
      .maybeSingle();
    if (data) {
      defaultName = data.name ?? "";
      defaultPhone = data.phone ? `+${data.phone}` : "";
    }
  } catch {
    // Service role key missing or lookup failed — render an empty form.
  }

  return (
    <>
      <p className="mb-4 text-center text-sm text-slate-600">
        Please confirm your details and tell us about your requirements.
      </p>
      <LeadForm
        token={token}
        defaultName={defaultName}
        defaultPhone={defaultPhone}
      />
    </>
  );
}
