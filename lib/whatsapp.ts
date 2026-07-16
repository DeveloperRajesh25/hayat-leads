import { publicConfig, serverConfig } from "./config";
import { normalizePhone } from "./phone";
import {
  isMediaHeader,
  type TemplateHeaderFormat,
  type WhatsappTemplate,
} from "./templates";

export type { TemplateHeaderFormat, WhatsappTemplate };
export { isMediaHeader };

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

export interface WhatsappRegisterResult {
  ok: boolean;
  raw: unknown;
  error?: string;
}

/**
 * Register the WhatsApp phone number for Cloud API use after a display name
 * change is approved (WhatsApp Manager shows "Register your number" with no
 * UI button for it — this is the documented API-only path). Requires the
 * number's two-step verification PIN.
 */
export async function registerPhoneNumber(): Promise<WhatsappRegisterResult> {
  const accessToken = serverConfig.whatsappAccessToken;
  const phoneNumberId = serverConfig.whatsappPhoneNumberId;
  const apiVersion = serverConfig.whatsappApiVersion;
  const pin = serverConfig.whatsappTwoStepPin;

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/register`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    cache: "no-store",
  });

  const data: unknown = await res.json().catch(() => ({}));

  if (res.ok) {
    return { ok: true, raw: data };
  }

  const err = (data as { error?: { message?: string; code?: number } })?.error;
  return {
    ok: false,
    raw: data,
    error: err?.message ?? `WhatsApp API error (HTTP ${res.status})`,
  };
}

/** Raw shape of the Graph API template list response (only what we read). */
interface RawTemplateComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: { type?: string; text?: string; url?: string }[];
}
interface RawTemplate {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: RawTemplateComponent[];
}

/** Count distinct {{n}} placeholders in a template body. */
function countVariables(text: string): number {
  const found = new Set(
    Array.from(text.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (m) => m[1]),
  );
  return found.size;
}

function parseTemplate(raw: RawTemplate): WhatsappTemplate | null {
  if (!raw.name) return null;

  const components = raw.components ?? [];
  const header = components.find((c) => c.type?.toUpperCase() === "HEADER");
  const body = components.find((c) => c.type?.toUpperCase() === "BODY");
  const buttonsComponent = components.find(
    (c) => c.type?.toUpperCase() === "BUTTONS",
  );

  const headerFormat = (header?.format?.toUpperCase() ??
    (header ? "TEXT" : "NONE")) as TemplateHeaderFormat;

  // The dynamic URL button carries the per-contact form token. Its index must
  // match the button's position within the template's button list.
  const buttons = buttonsComponent?.buttons ?? [];
  const urlButtonIndex = buttons.findIndex(
    (b) => b.type?.toUpperCase() === "URL" && /\{\{\s*\d+\s*\}\}/.test(b.url ?? ""),
  );

  const bodyText = body?.text ?? "";

  return {
    id: raw.id ?? raw.name,
    name: raw.name,
    language: raw.language ?? publicConfig.whatsappTemplateLang,
    status: (raw.status ?? "UNKNOWN").toUpperCase(),
    category: raw.category ?? "",
    headerFormat,
    headerText: headerFormat === "TEXT" ? (header?.text ?? "") : "",
    bodyVariableCount: countVariables(bodyText),
    bodyText,
    urlButtonIndex: urlButtonIndex >= 0 ? urlButtonIndex : null,
  };
}

export interface FetchTemplatesResult {
  ok: boolean;
  templates: WhatsappTemplate[];
  error?: string;
}

/**
 * Cache the template list briefly. The campaigns page and every send resolve
 * templates through here, and the list changes only when someone edits a
 * template in WhatsApp Manager — so a short TTL avoids a Graph round-trip on
 * every page render without going meaningfully stale.
 */
const TEMPLATE_CACHE_TTL_MS = 60_000;
let templateCache: { at: number; result: FetchTemplatesResult } | null = null;

/**
 * List the APPROVED templates on the WhatsApp Business Account, newest-first as
 * Meta returns them. Only approved templates can actually be sent, so drafts,
 * rejected and paused templates are filtered out rather than offered in the UI.
 */
export async function fetchApprovedTemplates(
  options: { force?: boolean } = {},
): Promise<FetchTemplatesResult> {
  if (
    !options.force &&
    templateCache &&
    Date.now() - templateCache.at < TEMPLATE_CACHE_TTL_MS
  ) {
    return templateCache.result;
  }

  let result: FetchTemplatesResult;
  try {
    const accessToken = serverConfig.whatsappAccessToken;
    const wabaId = serverConfig.whatsappBusinessAccountId;
    const apiVersion = serverConfig.whatsappApiVersion;

    const url =
      `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates` +
      `?fields=name,status,category,language,components&limit=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const data: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = (data as { error?: { message?: string } })?.error;
      return {
        ok: false,
        templates: [],
        error: err?.message ?? `WhatsApp API error (HTTP ${res.status})`,
      };
    }

    const templates = ((data as { data?: RawTemplate[] })?.data ?? [])
      .map(parseTemplate)
      .filter((t): t is WhatsappTemplate => t !== null)
      .filter((t) => t.status === "APPROVED");

    result = { ok: true, templates };
  } catch (err) {
    // Missing env vars or a network failure — surface it instead of silently
    // rendering an empty picker.
    return {
      ok: false,
      templates: [],
      error: err instanceof Error ? err.message : "Could not load templates.",
    };
  }

  templateCache = { at: Date.now(), result };
  return result;
}

/** Find an approved template by name (and optionally language). */
export async function resolveTemplate(
  name: string,
  language?: string,
): Promise<WhatsappTemplate | null> {
  const { templates } = await fetchApprovedTemplates();
  return (
    templates.find(
      (t) => t.name === name && (!language || t.language === language),
    ) ??
    templates.find((t) => t.name === name) ??
    null
  );
}

export interface SendTemplateArgs {
  /** Recipient in E.164 digits, no leading "+". */
  to: string;
  /** Value for the body {{1}} variable (customer name). */
  customerName: string;
  /** Value appended to the URL button (the per-contact form token). */
  token: string;
  /** The live template definition the payload is built from. */
  template: WhatsappTemplate;
  /** Header media URL — only used when the template has a media header. */
  mediaUrl?: string;
}

export interface WhatsappSendResult {
  ok: boolean;
  status: "sent" | "failed";
  messageId?: string;
  error?: string;
  raw?: unknown;
}

/**
 * Build the `components` array for a send, matching the template's real shape.
 *
 * Each piece is included only when the template actually declares it:
 *   - Header:  a media parameter for IMAGE/VIDEO/DOCUMENT headers. TEXT and
 *              headerless templates take no header component — sending one
 *              anyway is rejected with "(#132012) Parameter format does not
 *              match format in the created template".
 *   - Body:    exactly as many text parameters as the body has {{n}} vars. The
 *              first is the customer name; a body with no vars gets no
 *              component at all.
 *   - Button:  the token for the dynamic URL button, at that button's index.
 */
export function buildTemplateComponents(args: {
  template: WhatsappTemplate;
  customerName: string;
  token: string;
  mediaUrl?: string;
}): Record<string, unknown>[] {
  const { template } = args;
  const components: Record<string, unknown>[] = [];

  if (isMediaHeader(template.headerFormat)) {
    const link = normalizeImageUrl(args.mediaUrl);
    if (link) {
      const kind = template.headerFormat.toLowerCase(); // image | video | document
      components.push({
        type: "header",
        parameters: [{ type: kind, [kind]: { link } }],
      });
    }
  }

  if (template.bodyVariableCount > 0) {
    // {{1}} is the customer name; any further vars are unknown to this app, so
    // they are sent empty rather than silently shifting the name into them.
    const parameters = Array.from(
      { length: template.bodyVariableCount },
      (_, i) => ({
        type: "text",
        text: i === 0 ? args.customerName || "there" : " ",
      }),
    );
    components.push({ type: "body", parameters });
  }

  if (template.urlButtonIndex !== null) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(template.urlButtonIndex),
      parameters: [{ type: "text", text: args.token }],
    });
  }

  return components;
}

/**
 * Send a personalized WhatsApp template message via the Meta Cloud API.
 *
 * The payload is built from the live template definition (see
 * `buildTemplateComponents`), so any approved template can be sent — whether
 * its header is an image, a video, static text, or absent.
 */
export async function sendTemplateMessage(
  args: SendTemplateArgs,
): Promise<WhatsappSendResult> {
  const accessToken = serverConfig.whatsappAccessToken;
  const phoneNumberId = serverConfig.whatsappPhoneNumberId;
  const apiVersion = serverConfig.whatsappApiVersion;

  const { template } = args;

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

  if (isMediaHeader(template.headerFormat) && !args.mediaUrl?.trim()) {
    return {
      ok: false,
      status: "failed",
      error: `Template "${template.name}" has a ${template.headerFormat} header, so a header ${template.headerFormat.toLowerCase()} URL is required.`,
    };
  }

  const components = buildTemplateComponents({
    template,
    customerName: args.customerName,
    token: args.token,
    mediaUrl: args.mediaUrl,
  });

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
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
