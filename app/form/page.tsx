import { LeadForm } from "@/components/form/lead-form";

export const dynamic = "force-dynamic";

export default function GenericFormPage() {
  return (
    <>
      <p className="mb-4 text-center text-sm text-slate-600">
        Please share your details and requirements below.
      </p>
      <LeadForm />
    </>
  );
}
