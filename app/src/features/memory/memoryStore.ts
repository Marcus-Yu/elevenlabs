import { z } from "zod";

// MemoryStore (docs/IMPLEMENTATION_PLAN.md WP12 step 1): what Atlas remembers about a user's goals.
// Postgres is the system of record. Rowboat mirroring wraps this store in gateway/handlers/memory.ts,
// because only gateway handlers may import adapters (AGENTS.md rule 2).

export const MEMORY_KINDS = ["preference", "objection", "outcome", "fact"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Step 4: only goal-relevant items, short, and always with a source a person can check. */
export const MemoryInput = z.object({
  userId: z.string().min(1),
  goalId: z.string().min(1).optional(),
  kind: z.enum(MEMORY_KINDS),
  text: z.string().trim().min(3).max(500),
  /** Where it came from, e.g. "match:<id> rejected", "pitch run <id>". */
  source: z.string().trim().min(1).max(200),
});
export type MemoryInput = z.infer<typeof MemoryInput>;

export interface MemoryRecord {
  id: string;
  userId: string;
  goalId: string | null;
  kind: MemoryKind;
  text: string;
  source: string;
  externalRef: string | null;
  createdAt: Date;
}

export interface MemoryQuery {
  userId: string;
  goalId?: string;
  kinds?: MemoryKind[];
  /** Case-insensitive substring match on text. */
  text?: string;
  limit?: number;
}

export interface MemoryStore {
  write(input: MemoryInput): Promise<MemoryRecord>;
  search(query: MemoryQuery): Promise<MemoryRecord[]>;
  list(userId: string, goalId?: string): Promise<MemoryRecord[]>;
  /** Returns false when the item does not exist or belongs to someone else. */
  delete(userId: string, id: string): Promise<boolean>;
}

/** The slice of Prisma's MemoryItem delegate this store uses (context.entities.MemoryItem in Wasp). */
export interface MemoryItemDelegate {
  create(args: { data: Omit<MemoryRecord, "id" | "createdAt" | "externalRef"> & { externalRef?: string | null } }): Promise<MemoryRecord>;
  findMany(args: { where: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc">; take?: number }): Promise<MemoryRecord[]>;
  findFirst(args: { where: Record<string, unknown> }): Promise<MemoryRecord | null>;
  update(args: { where: { id: string }; data: Partial<MemoryRecord> }): Promise<MemoryRecord>;
  delete(args: { where: { id: string } }): Promise<MemoryRecord>;
}

export function createPostgresMemoryStore(items: MemoryItemDelegate): MemoryStore & { setExternalRef(id: string, ref: string | null): Promise<void>; get(userId: string, id: string): Promise<MemoryRecord | null> } {
  return {
    async write(input) {
      const data = MemoryInput.parse(input);
      return items.create({ data: { userId: data.userId, goalId: data.goalId ?? null, kind: data.kind, text: data.text, source: data.source } });
    },

    async search(query) {
      return items.findMany({
        where: {
          userId: query.userId,
          ...(query.goalId ? { goalId: query.goalId } : {}),
          ...(query.kinds?.length ? { kind: { in: query.kinds } } : {}),
          ...(query.text ? { text: { contains: query.text, mode: "insensitive" } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(query.limit ?? 50, 200),
      });
    },

    async list(userId, goalId) {
      return this.search({ userId, ...(goalId ? { goalId } : {}), limit: 200 });
    },

    async get(userId, id) {
      return items.findFirst({ where: { id, userId } });
    },

    async delete(userId, id) {
      // Ownership check first: never delete by id alone.
      const item = await items.findFirst({ where: { id, userId } });
      if (!item) return false;
      await items.delete({ where: { id } });
      return true;
    },

    async setExternalRef(id, ref) {
      await items.update({ where: { id }, data: { externalRef: ref } });
    },
  };
}

/** Context for a ranking or drafting prompt. Deleted items are gone from here at once. */
export async function memoryContextFor(store: MemoryStore, userId: string, goalId: string): Promise<string[]> {
  const items = await store.search({ userId, goalId, kinds: ["preference", "objection", "outcome"], limit: 30 });
  return items.map((m) => `[${m.kind}] ${m.text}`);
}

/** WP5 match review → preference memory (step 4). */
export function preferenceFromMatchDecision(input: {
  userId: string;
  goalId: string;
  matchId: string;
  companyName: string;
  decision: "APPROVED" | "REJECTED";
  reason?: string;
}): MemoryInput {
  const verb = input.decision === "APPROVED" ? "Approved" : "Rejected";
  const why = input.reason?.trim() ? `: ${input.reason.trim()}` : "";
  return {
    userId: input.userId,
    goalId: input.goalId,
    kind: "preference",
    text: `${verb} ${input.companyName}${why}`.slice(0, 500),
    source: `match:${input.matchId} ${input.decision.toLowerCase()}`,
  };
}
