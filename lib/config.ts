/**
 * Centralized, type-safe access to environment variables.
 *
 * - `publicConfig` values are inlined into the client bundle (NEXT_PUBLIC_*).
 *   They are safe to read from client components.
 * - `serverConfig` values are SECRETS. They are lazily read via getters so the
 *   app can still build without them, but accessing one at runtime without a
 *   value throws a clear error. NEVER import `serverConfig` into a client
 *   component.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Add it to your .env.local (see .env.example).`,
    );
  }
  return value;
}

/** Strip a trailing slash so we can safely concatenate paths. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export const publicConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: trimTrailingSlash(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  whatsappTemplateName:
    process.env.NEXT_PUBLIC_WHATSAPP_TEMPLATE_NAME ?? "hayat_interiors_intro",
  whatsappTemplateLang:
    process.env.NEXT_PUBLIC_WHATSAPP_TEMPLATE_LANG ?? "en",
  whatsappImageUrl: process.env.NEXT_PUBLIC_WHATSAPP_IMAGE_URL ?? "",
  defaultCountryCode:
    process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE ?? "91",
} as const;

/** Build the public customer-form URL for a given contact token. */
export function buildFormUrl(token: string): string {
  return `${publicConfig.appUrl}/form/${token}`;
}

export const serverConfig = {
  get supabaseServiceRoleKey(): string {
    return requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  get whatsappAccessToken(): string {
    return requireEnv(
      "WHATSAPP_ACCESS_TOKEN",
      process.env.WHATSAPP_ACCESS_TOKEN,
    );
  },
  get whatsappPhoneNumberId(): string {
    return requireEnv(
      "WHATSAPP_PHONE_NUMBER_ID",
      process.env.WHATSAPP_PHONE_NUMBER_ID,
    );
  },
  get whatsappApiVersion(): string {
    return process.env.WHATSAPP_API_VERSION ?? "v21.0";
  },
  get whatsappWebhookVerifyToken(): string {
    return requireEnv(
      "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    );
  },
} as const;

/** True when WhatsApp sending is configured (used to surface helpful UI hints). */
export function isWhatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}
