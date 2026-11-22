import { HttpError } from "wasp/server";
import type { ConfirmThreadMemory } from "wasp/server/operations";
import { gateway } from "../../server/gateway";
import { gatewayDisplay } from "./gateway-result";
import { memoryConfirmation, memoryPreview, type MemoryConfirmation } from "./memory-proposal";

/** Only the authenticated browser action can apply the displayed proposal. */
export const confirmThreadMemory: ConfirmThreadMemory<MemoryConfirmation, { kind: string; deleted?: boolean; ruleId?: string; approvalId?: string }> = async (input, context) => {
  if (!context.user) throw new HttpError(401, "Sign in to change memory.");
  const parsed = memoryConfirmation.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid memory confirmation.");
  const userId = context.user.id;
  const request = { userId, actor: { kind: "user" as const, id: userId }, origin: "thread" as const, tainted: false };
  if (parsed.data.action === "forget") {
    const preview = parsed.data.memory;
    const read = gatewayDisplay(await gateway.execute({ ...request, actionType: "memory.read", payload: { limit: 200 } }));
    if (read.kind !== "allowed") return read.kind === "denied" ? { kind: "denied", ruleId: read.ruleId } : { kind: "pending_approval", approvalId: read.approvalId };
    if (read.stub || !Array.isArray(read.data)) throw new HttpError(503, "Memory is unavailable.");
    const current = read.data.map((item) => memoryPreview.strip().safeParse(item)).find((item) => item.success && item.data.id === preview.id);
    if (!current?.success || JSON.stringify(current.data) !== JSON.stringify(preview)) throw new HttpError(409, "Memory changed or is unavailable. Review it again.");
  }
  const result = parsed.data.action === "remember"
    ? await gateway.execute({ ...request, actionType: "memory.write", payload: { ...parsed.data.memory, source: "User request in thread" } })
    : await gateway.execute({ ...request, actionType: "memory.delete", payload: { id: parsed.data.memory.id } });
  const display = gatewayDisplay(result);
  if (display.kind === "denied") return { kind: "denied", ruleId: display.ruleId };
  if (display.kind === "pending_approval") return { kind: "pending_approval", approvalId: display.approvalId };
  if (display.stub || !display.data) throw new HttpError(503, "Memory is unavailable.");
  if (parsed.data.action === "forget") return { kind: "allowed", deleted: (display.data as { deleted?: unknown }).deleted === true };
  return { kind: "allowed" };
};
