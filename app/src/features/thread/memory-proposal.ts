import { z } from "zod";
export const memoryDraft = z.object({ kind: z.enum(["preference", "objection", "outcome", "fact"]), text: z.string().trim().min(3).max(500) }).strict();
export const memoryPreview = memoryDraft.extend({ id: z.string().min(1).max(200), source: z.string().min(1).max(200) }).strict();
export const memoryConfirmation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remember"), memory: memoryDraft }).strict(),
  z.object({ action: z.literal("forget"), memory: memoryPreview }).strict(),
]);
export type MemoryConfirmation = z.infer<typeof memoryConfirmation>;
