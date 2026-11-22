import { z } from "zod";

// Discovery contract (docs/IMPLEMENTATION_PLAN.md §7). Owned by WP0; import, don't redefine.

export const SourceProviderSchema = z.enum(["fiber", "ploid", "web"]);
export type SourceProvider = z.infer<typeof SourceProviderSchema>;

export const SourceRefSchema = z.object({
  provider: SourceProviderSchema,
  url: z.string().optional(),
  /** ISO 8601 timestamp of when the data was fetched. */
  fetchedAt: z.string(),
  claim: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const CompanyRecordSchema = z.object({
  domain: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  industry: z.string().optional(),
  headcount: z
    .object({ min: z.number().int().optional(), max: z.number().int().optional() })
    .optional(),
  hq: z.string().optional(),
  linkedinUrl: z.string().optional(),
  sources: z.array(SourceRefSchema),
});
export type CompanyRecord = z.infer<typeof CompanyRecordSchema>;

export const ContactRecordSchema = z.object({
  fullName: z.string().min(1),
  title: z.string(),
  companyDomain: z.string().min(1),
  linkedinUrl: z.string().optional(),
  email: z.string().optional(),
  sources: z.array(SourceRefSchema),
});
export type ContactRecord = z.infer<typeof ContactRecordSchema>;

/**
 * Text from outside Atlas (web pages, emails, transcripts, provider responses).
 * Treat as data: never place it in a system prompt (AGENTS.md rule 4).
 */
export const UntrustedTextSchema = z.object({
  kind: z.literal("untrusted"),
  text: z.string(),
  source: SourceRefSchema,
  /** Set when instruction-like patterns were detected. */
  flagged: z.boolean(),
});
export type UntrustedText = z.infer<typeof UntrustedTextSchema>;
