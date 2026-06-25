import { NextResponse } from "next/server";
import { serverConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Webhook verification handshake (Meta calls this once when you subscribe).
 * GET /api/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  try {
    if (
      mode === "subscribe" &&
      token === serverConfig.whatsappWebhookVerifyToken
    ) {
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
  } catch {
    // verify token not configured
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Incoming events. We update message delivery status (sent/delivered/read/
 * failed) by matching the WhatsApp message id. Always returns 200 so Meta
 * does not retry.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    type Status = {
      id?: string;
      status?: string;
      errors?: { title?: string; message?: string }[];
    };

    const entries =
      (body as { entry?: { changes?: { value?: { statuses?: Status[] } }[] }[] })
        ?.entry ?? [];

    const statuses: Status[] = entries.flatMap(
      (e) =>
        e?.changes?.flatMap((ch) => ch?.value?.statuses ?? []) ?? [],
    );

    if (statuses.length > 0) {
      const admin = createAdminClient();
      for (const s of statuses) {
        if (!s?.id || !s?.status) continue;
        const update: Record<string, unknown> = {
          status: s.status,
          updated_at: new Date().toISOString(),
        };
        if (s.status === "failed") {
          update.error =
            s.errors?.[0]?.title ??
            s.errors?.[0]?.message ??
            "Delivery failed";
        }
        await admin.from("messages").update(update).eq("wa_message_id", s.id);
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  return NextResponse.json({ ok: true });
}
