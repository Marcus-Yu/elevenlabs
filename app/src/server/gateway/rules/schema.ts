import type { z } from "zod";

export const SCHEMA_RULE_ID = "schema";

export type SchemaResult = { ok: true; payload: unknown } | { ok: false; reason: string };

/**
 * §8 `schema`: the payload must pass the handler's schema and, for actions whose payload the
 * rules read, the gateway's core contract. The handler's parsed output is what runs.
 */
export function validatePayload(handlerSchema: z.ZodType, coreSchema: z.ZodType | undefined, payload: unknown): SchemaResult {
  const parsed = handlerSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: describeIssues(parsed.error) };
  if (coreSchema) {
    const core = coreSchema.safeParse(parsed.data);
    if (!core.success) return { ok: false, reason: describeIssues(core.error) };
  }
  return { ok: true, payload: parsed.data };
}

function describeIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return `invalid payload: ${issues.join("; ")}`;
}
