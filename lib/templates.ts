/**
 * WhatsApp message template types and pure helpers.
 *
 * Kept separate from `lib/whatsapp.ts` (which reads `serverConfig` and talks to
 * the Graph API) so client components can import these without pulling server
 * secrets or fetch code into the browser bundle.
 */

/** Header formats a template can declare in WhatsApp Manager. */
export type TemplateHeaderFormat =
  | "NONE"
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "DOCUMENT";

/**
 * A message template as it actually exists in WhatsApp Manager, reduced to the
 * facts we need in order to build a valid send payload for it.
 *
 * Templates are NOT interchangeable: one may have an IMAGE header, another a
 * VIDEO header, another a static TEXT header and no body variables at all.
 * Sending the wrong component shape makes Meta reject the message with
 * "(#132012) Parameter format does not match format in the created template",
 * so every send is built from the live definition rather than assumed.
 */
export interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  headerFormat: TemplateHeaderFormat;
  /** Static text of a TEXT header, if any (shown as a preview in the UI). */
  headerText: string;
  /** Number of {{n}} placeholders in the body — 0 means "send no body params". */
  bodyVariableCount: number;
  /** Full body text, used to preview the template in the campaign form. */
  bodyText: string;
  /** Index of the dynamic URL button ({{1}} = form token), or null if none. */
  urlButtonIndex: number | null;
}

/** Header formats that require a media URL to be supplied at send time. */
const MEDIA_HEADER_FORMATS: TemplateHeaderFormat[] = [
  "IMAGE",
  "VIDEO",
  "DOCUMENT",
];

export function isMediaHeader(format: TemplateHeaderFormat): boolean {
  return MEDIA_HEADER_FORMATS.includes(format);
}

/**
 * Stable identity for a template. A name can exist in several languages, so
 * name alone is not unique — this is what the picker keys its options by.
 */
export function templateKey(t: Pick<WhatsappTemplate, "name" | "language">) {
  return `${t.name}::${t.language}`;
}

/** Human label for the header media field, e.g. "Header video URL". */
export function headerMediaLabel(format: TemplateHeaderFormat): string {
  switch (format) {
    case "IMAGE":
      return "Header image URL";
    case "VIDEO":
      return "Header video URL";
    case "DOCUMENT":
      return "Header document URL";
    default:
      return "Header media URL";
  }
}

/** Fill a template body's {{n}} placeholders for preview purposes. */
export function previewBody(t: WhatsappTemplate, customerName: string): string {
  return t.bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, n: string) =>
    n === "1" ? customerName : "…",
  );
}
