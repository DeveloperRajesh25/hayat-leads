import { NextResponse } from "next/server";
import { isWhatsappConfigured } from "@/lib/config";
import { registerPhoneNumber } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One-off endpoint: registers the WhatsApp number for Cloud API use after a
// display name change is approved. Trigger it once via:
//   curl -X POST https://<your-app>/api/whatsapp/register -H "x-register-secret: YOUR_WHATSAPP_REGISTER_SECRET"
export async function POST(req: Request) {
  const expectedSecret = process.env.WHATSAPP_REGISTER_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      {
        error:
          "WHATSAPP_REGISTER_SECRET is not set. Add a random string to " +
          '.env.local as WHATSAPP_REGISTER_SECRET="choose-a-long-random-string", ' +
          "restart the app, then send it back as the x-register-secret header " +
          "when calling this endpoint.",
      },
      { status: 400 },
    );
  }
  const providedSecret = req.headers.get("x-register-secret");
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWhatsappConfigured()) {
    return NextResponse.json(
      {
        error:
          "WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
      },
      { status: 400 },
    );
  }

  if (!process.env.WHATSAPP_TWO_STEP_PIN) {
    return NextResponse.json(
      {
        error:
          "WHATSAPP_TWO_STEP_PIN is not set. This number has never had two-step " +
          "verification enabled, so you need to choose a brand-new 6-digit PIN " +
          "(not recover an existing one). Pick any 6 digits, add them to " +
          '.env.local as WHATSAPP_TWO_STEP_PIN="123456", restart the app, and ' +
          "call this endpoint again. Meta will set this as the number's " +
          "two-step verification PIN during registration — keep it saved, " +
          "you'll need the same value for future re-registrations.",
      },
      { status: 400 },
    );
  }

  const result = await registerPhoneNumber();

  if (result.ok) {
    return NextResponse.json({
      message: "Phone number successfully registered.",
      response: result.raw,
    });
  }

  return NextResponse.json(
    { error: result.error, response: result.raw },
    { status: 400 },
  );
}
