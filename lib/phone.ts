import { publicConfig } from "./config";

/**
 * Normalize a raw phone string into WhatsApp-ready E.164 *digits* (no "+").
 *
 * Rules (intentionally pragmatic, documented in the README):
 *  - Strips spaces, dashes, parentheses, etc.
 *  - A leading "+" is treated as a complete international number.
 *  - Otherwise a single leading 0 (national trunk prefix) is removed and, for
 *    numbers that look local (<= 10 digits), the default country code is added.
 *  - Returns null when the result can't be a valid number (8–15 digits).
 *
 * Examples (default country code = 91):
 *   "+971 50 123 4567" -> "971501234567"
 *   "098765 43210"     -> "919876543210"
 *   "9876543210"       -> "919876543210"
 *   "919876543210"     -> "919876543210"
 */
export function normalizePhone(
  raw: string | number | null | undefined,
  defaultCountryCode: string = publicConfig.defaultCountryCode,
): string | null {
  if (raw === null || raw === undefined) return null;
  const original = String(raw).trim();
  if (!original) return null;

  const hadPlus = original.startsWith("+") || original.startsWith("00");
  let digits = original.replace(/\D/g, "");
  // "00" international prefix -> treat like "+"
  if (original.startsWith("00")) digits = digits.replace(/^00/, "");
  if (!digits) return null;

  const cc = (defaultCountryCode || "91").replace(/\D/g, "") || "91";

  if (!hadPlus) {
    digits = digits.replace(/^0+/, ""); // drop national trunk zero(s)
    if (digits.length <= 10) {
      digits = cc + digits;
    }
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function isValidPhone(
  raw: string | number | null | undefined,
  defaultCountryCode?: string,
): boolean {
  return normalizePhone(raw, defaultCountryCode) !== null;
}

/** Pretty display, e.g. "+91 98765 43210" (best-effort grouping). */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "—";
  return `+${digits}`;
}

/** Build a "click to chat" wa.me link for the leads quick action. */
export function whatsappChatLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
