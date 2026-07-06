import { z } from "zod";

/** Public customer form submission. */
export const responseSchema = z.object({
  token: z.string().trim().max(64).optional().nullable(),
  name: z
    .string()
    .trim()
    .min(1, "Please enter your name")
    .max(120, "Name is too long"),
  phone: z
    .string()
    .trim()
    .min(6, "Please enter a valid phone number")
    .max(20, "Phone number is too long"),
  interest_status: z.enum(["interested", "not_interested"], {
    errorMap: () => ({ message: "Please select your interest" }),
  }),
  requirement_details: z.string().trim().max(2000).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
});

export type ResponseInput = z.infer<typeof responseSchema>;

/** A single contact accepted by the CSV upload route. */
export const uploadContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(15),
});

export const uploadContactsSchema = z.object({
  contacts: z.array(uploadContactSchema).min(1, "No valid contacts to import"),
});

/** Single contact added manually from the admin dashboard. */
export const createContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please enter a name")
    .max(120, "Name is too long"),
  phone: z
    .string()
    .trim()
    .min(6, "Please enter a valid phone number")
    .max(20, "Phone number is too long"),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

/** Campaign send request from the admin dashboard. */
export const sendCampaignSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Campaign name is required")
    .max(120, "Campaign name is too long"),
  templateName: z.string().trim().max(120).optional(),
  imageUrl: z
    .string()
    .trim()
    .url("Image URL must be a valid https URL")
    .optional()
    .or(z.literal("")),
  contactIds: z.array(z.string().uuid()).min(1, "Select at least one contact"),
});

export type SendCampaignInput = z.infer<typeof sendCampaignSchema>;

/** Toggle a lead's converted status from the leads dashboard. */
export const updateLeadSchema = z.object({
  converted: z.boolean(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/** Bulk-delete contacts selected from the contacts table. */
export const bulkDeleteContactsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Select at least one contact").max(500),
});

export type BulkDeleteContactsInput = z.infer<typeof bulkDeleteContactsSchema>;

/** Bulk-delete leads (responses) selected from the leads table. */
export const bulkDeleteLeadsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Select at least one lead").max(500),
});

export type BulkDeleteLeadsInput = z.infer<typeof bulkDeleteLeadsSchema>;
