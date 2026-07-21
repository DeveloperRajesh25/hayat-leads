/**
 * Shared application & database row types.
 *
 * These mirror the Supabase SQL schema in `supabase/schema.sql`. They are
 * hand-written (rather than generated) to keep the project self-contained.
 */

export type InterestStatus = "interested" | "not_interested";

export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type CampaignStatus =
  | "draft"
  | "sending"
  | "completed"
  | "failed";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  token: string;
  source: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  template_name: string;
  template_lang: string | null;
  image_url: string | null;
  form_base_url: string | null;
  message_body: string | null;
  total_contacts: number;
  messages_sent: number;
  messages_failed: number;
  status: CampaignStatus;
  created_at: string;
  sent_at: string | null;
  created_by: string | null;
}

export interface Message {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  phone: string;
  wa_message_id: string | null;
  status: MessageStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Live delivery breakdown for one campaign, counted directly from the
 * `messages` rows (the single source of truth). See the `campaign_stats` view.
 * `sent + delivered + read + failed + pending === total`.
 */
export interface CampaignStats {
  total: number;
  pending: number;
  /** Accepted by Meta, not yet confirmed delivered. */
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  /** Convenience rollups (derived): accepted = sent+delivered+read. */
  accepted: number;
  /** delivered + read. */
  deliveredTotal: number;
}

export interface LeadResponse {
  id: string;
  contact_id: string | null;
  name: string;
  phone: string;
  interest_status: InterestStatus;
  requirement_details: string | null;
  notes: string | null;
  converted: boolean;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A response row joined with its originating contact (for the leads table). */
export interface LeadResponseWithContact extends LeadResponse {
  contact?: Pick<Contact, "id" | "name" | "phone"> | null;
}

export interface DashboardStats {
  totalContacts: number;
  messagesSent: number;
  /** Messages confirmed delivered or read by the WhatsApp webhook. */
  delivered: number;
  /** Messages that failed to send or deliver. */
  failed: number;
  interested: number;
  notInterested: number;
  pending: number;
  totalResponses: number;
  totalCampaigns: number;
  converted: number;
}
