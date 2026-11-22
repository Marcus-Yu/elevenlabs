import { createHash } from "node:crypto";

/** JSON with object keys sorted at every level, so jsonb's key reordering doesn't change the hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Binds an Approval to the user, goal, action and exact payload it was created for. */
export function hashApprovalPayload(parts: { userId: string; goalId: string | null; actionType: string; payload: unknown }): string {
  return createHash("sha256")
    .update(canonicalJson({ userId: parts.userId, goalId: parts.goalId, actionType: parts.actionType, payload: parts.payload }))
    .digest("hex");
}
