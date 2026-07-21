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

      // WhatsApp reports delivery progress as sent -> delivered -> read (or
      // failed). Never let a later "sent" event clobber a "delivered"/"read"
      // that already arrived out of order, and never touch a row that is still
      // `pending` (it hasn't been claimed by a send yet).
      const RANK: Record<string, number> = {
        pending: 0,
        sent: 1,
        delivered: 2,
        read: 3,
        failed: 4,
      };

      for (const s of statuses) {
        if (!s?.id || !s?.status) continue;
        const incomingRank = RANK[s.status] ?? -1;
        if (incomingRank < 0) continue;

        const { data: existing } = await admin
          .from("messages")
          .select("id, status")
          .eq("wa_message_id", s.id)
          .maybeSingle();
        if (!existing) continue;

        // Only move a message forward along the funnel. `failed` always wins
        // (a delivery failure is terminal and must be visible).
        const currentRank = RANK[existing.status] ?? 0;
        if (s.status !== "failed" && incomingRank <= currentRank) continue;

        const update: Record<string, unknown> = { status: s.status };
        if (s.status === "failed") {
          update.error =
            s.errors?.[0]?.title ??
            s.errors?.[0]?.message ??
            "Delivery failed";
        }
        await admin.from("messages").update(update).eq("id", existing.id);
      }

      // NOTE: we deliberately do NOT recompute campaign counters or status
      // here. Campaign progress is derived live from the `messages` table (the
      // single source of truth) via the `campaign_stats` view, so there are no
      // denormalized numbers to drift. The old code here miscounted `pending`
      // rows as `sent` and force-marked campaigns "completed" mid-send, which
      // is exactly what made the history numbers jump around.
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  return NextResponse.json({ ok: true });
}
