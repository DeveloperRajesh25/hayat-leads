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
      const affectedCampaigns = new Set<string>();

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
        // Update the message row and find out which campaign it belongs to so
        // we can refresh that campaign's aggregate counters below.
        const { data: updated } = await admin
          .from("messages")
          .update(update)
          .eq("wa_message_id", s.id)
          .select("campaign_id");
        for (const row of updated ?? []) {
          if (row?.campaign_id) affectedCampaigns.add(row.campaign_id);
        }
      }

      // Recompute Sent/Failed for each touched campaign from the source of
      // truth (the messages table) so the campaign history reflects REAL
      // delivery — not just what Meta accepted at send time. A message counts
      // as "failed" only when its final status is `failed`; anything that
      // reached the customer (sent/delivered/read) counts as delivered.
      for (const campaignId of affectedCampaigns) {
        const { data: rows } = await admin
          .from("messages")
          .select("status")
          .eq("campaign_id", campaignId);
        if (!rows) continue;
        const failed = rows.filter((r) => r.status === "failed").length;
        const sent = rows.length - failed;
        await admin
          .from("campaigns")
          .update({
            messages_sent: sent,
            messages_failed: failed,
            status: sent > 0 ? "completed" : "failed",
          })
          .eq("id", campaignId);
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  return NextResponse.json({ ok: true });
}
