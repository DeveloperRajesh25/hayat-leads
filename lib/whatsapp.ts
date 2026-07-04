import { publicConfig, serverConfig } from "./config";

export interface SendTemplateArgs {
  /** Recipient in E.164 digits, no leading "+". */
  to: string;
  /** Value for the body {{1}} variable (customer name). */
  customerName: string;
  /** Value appended to the URL button (the per-contact form token). */
  token: string;
  templateName?: string;
  templateLang?: string;
  imageUrl?: string;
}

export interface WhatsappSendResult {
  ok: boolean;
  status: "sent" | "failed";
  messageId?: string;
  error?: string;
  raw?: unknown;
}

/**
 * Send a personalized WhatsApp template message via the Meta Cloud API.
 *
 * Expected template structure (created in WhatsApp Manager — see README):
 *   - Header:  IMAGE (required — this template's header format is IMAGE, so
 *              every send must include a header component with an image
 *              link, or Meta rejects the call with "(#132012) Parameter
 *              format does not match format in the created template")
 *   - Body:    "Hi {{1}}, Thank you for your interest in Hayat Interiors..."
 *   - Button:  URL (dynamic) with base ".../form/" and {{1}} = token
 */
export async function sendTemplateMessage(
  args: SendTemplateArgs,
): Promise<WhatsappSendResult> {
  const accessToken = serverConfig.whatsappAccessToken;
  const phoneNumberId = serverConfig.whatsappPhoneNumberId;
  const apiVersion = serverConfig.whatsappApiVersion;

  const templateName = args.templateName || publicConfig.whatsappTemplateName;
  const lang = args.templateLang || publicConfig.whatsappTemplateLang;
  const imageUrl =
    args.imageUrl !== undefined ? args.imageUrl : publicConfig.whatsappImageUrl;

  const components: Record<string, unknown>[] = [];

  if (imageUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: imageUrl } }],
    });
  }

  components.push({
    type: "body",
    parameters: [{ type: "text", text: args.customerName || "there" }],
  });

  // Dynamic URL button — the token is appended to the template's base URL.
  components.push({
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: args.token }],
  });

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: args.to,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      // Each message is independent; don't let Next cache it.
      cache: "no-store",
    });

    const data: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message =
        (data as { error?: { message?: string } })?.error?.message ??
        `WhatsApp API error (HTTP ${res.status})`;
      return { ok: false, status: "failed", error: message, raw: data };
    }

    const messageId = (data as { messages?: { id?: string }[] })?.messages?.[0]
      ?.id;
    return { ok: true, status: "sent", messageId, raw: data };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
