import { publicConfig, serverConfig } from "./config";
import { normalizePhone } from "./phone";

/** Meta error codes that are transient and worth retrying (rate limits / temporary
 *  server issues). Everything else is a permanent failure we should not retry. */
const RETRYABLE_META_CODES = new Set([
  131056, // (Business Account) pair rate limit hit
  130429, // Cloud API rate limit hit
  133016, // temporary account restriction / try again
  131000, // generic "something went wrong", usually transient
  368, //    temporarily blocked for policy violations (sometimes transient)
]);

/** Small sleep helper for backoff between retries. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * WhatsApp requires the header image URL to point directly at the raw image
 * bytes (with an image/* content-type). A Google Drive "share" or "view" link
 * such as `https://drive.google.com/file/d/<ID>/view` is an HTML page, not an
 * image — Meta accepts the send call (so we mark it "sent") but silently fails
 * to fetch the media, and the customer never receives the message.
 *
 * This rewrites common Google Drive link shapes to a direct, image-serving
 * URL (`https://drive.google.com/uc?export=download&id=<ID>`) so those images
 * actually deliver. Non-Drive URLs are returned unchanged.
 */
export function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const trimmed = url.trim();
  if (!/drive\.google\.com|docs\.google\.com/i.test(trimmed)) return trimmed;

  // Extract the Drive file id from the common URL shapes:
  //   /file/d/<ID>/view       •  ?id=<ID>       •  /d/<ID>
  const id =
    trimmed.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];

  if (!id) return trimmed;
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

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
  const imageUrl = normalizeImageUrl(
    args.imageUrl !== undefined ? args.imageUrl : publicConfig.whatsappImageUrl,
  );

  // Normalize the recipient to WhatsApp-ready E.164 digits (no "+", no spaces).
  // A malformed number is accepted by Meta with a message id but never delivers,
  // so we reject it up front and report a clear, per-contact failure instead.
  const to = normalizePhone(args.to);
  if (!to) {
    return {
      ok: false,
      status: "failed",
      error: `Invalid phone number "${args.to}" — could not be normalized to a valid international number.`,
    };
  }

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
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components,
    },
  };

  // Retry transient failures (rate limits / temporary Meta errors / network
  // blips) with exponential backoff so a big batch doesn't lose recipients to a
  // momentary rate-limit spike. Permanent errors return immediately.
  const MAX_ATTEMPTS = 4;
  let lastError = "Unknown error";
  let lastRaw: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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

      if (res.ok) {
        const messageId = (data as { messages?: { id?: string }[] })
          ?.messages?.[0]?.id;
        return { ok: true, status: "sent", messageId, raw: data };
      }

      const err = (data as {
        error?: { message?: string; code?: number; error_subcode?: number };
      })?.error;
      const code = err?.code;
      // Include the Meta error code so undelivered reasons are diagnosable
      // (e.g. 131049 = throttled to protect ecosystem engagement, 131026 =
      // recipient not on WhatsApp / can't receive).
      lastError = `${err?.message ?? `WhatsApp API error (HTTP ${res.status})`}${
        code ? ` (code ${code}${err?.error_subcode ? `/${err.error_subcode}` : ""})` : ""
      }`;
      lastRaw = data;

      const retryable =
        res.status === 429 ||
        res.status >= 500 ||
        (code !== undefined && RETRYABLE_META_CODES.has(code));
      if (!retryable || attempt === MAX_ATTEMPTS) {
        return { ok: false, status: "failed", error: lastError, raw: lastRaw };
      }
    } catch (err) {
      // Network error — always worth retrying.
      lastError = err instanceof Error ? err.message : "Network error";
      if (attempt === MAX_ATTEMPTS) {
        return { ok: false, status: "failed", error: lastError };
      }
    }

    // Backoff: 0.5s, 1s, 2s (+ jitter) before the next attempt.
    await sleep(500 * 2 ** (attempt - 1) + Math.floor(attempt * 137));
  }

  return { ok: false, status: "failed", error: lastError, raw: lastRaw };
}
