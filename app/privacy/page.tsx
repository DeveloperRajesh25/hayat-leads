import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-slate-800 dark:text-slate-200">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Hayat Interiors — Last updated July 7, 2026
      </p>

      <section className="mt-8 space-y-6 text-sm leading-6">
        <p>
          Hayat Interiors (&quot;we&quot;, &quot;us&quot;) uses this system to
          contact prospective customers about our interior design services,
          including via WhatsApp, and to collect information submitted
          through our enquiry forms.
        </p>

        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Information we collect
          </h2>
          <p className="mt-2">
            When you interact with us — by submitting an enquiry form,
            replying on WhatsApp, or being referred to us — we may collect
            your name, phone number, and any details you choose to share
            about your interior design requirements.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            How we use your information
          </h2>
          <p className="mt-2">We use the information we collect to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Respond to your enquiry and discuss your requirements.</li>
            <li>
              Send you WhatsApp messages about our services, offers, and
              consultation bookings.
            </li>
            <li>Maintain records of our communications with you.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            WhatsApp messaging
          </h2>
          <p className="mt-2">
            We use the WhatsApp Business Platform to send you messages. You
            can stop receiving messages from us at any time by replying
            &quot;STOP&quot;, blocking our number, or contacting us directly.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Data sharing
          </h2>
          <p className="mt-2">
            We do not sell your personal information. Your data is stored
            securely and is only accessible to authorized Hayat Interiors
            staff and the service providers (such as our hosting and
            messaging providers) that help us operate this system.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Data retention &amp; your rights
          </h2>
          <p className="mt-2">
            We retain your information for as long as needed to respond to
            your enquiry and maintain business records. You may request
            access to, correction of, or deletion of your personal
            information at any time by contacting us using the details
            below.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Contact us
          </h2>
          <p className="mt-2">
            If you have any questions about this privacy policy or your
            data, please contact us at{" "}
            <a
              href="mailto:mohammed.siddique44@gmail.com"
              className="text-brand-600 hover:underline"
            >
              mohammed.siddique44@gmail.com
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
