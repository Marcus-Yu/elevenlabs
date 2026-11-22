import { z } from "zod";
import {
  createPostgresMemoryStore,
  MEMORY_KINDS,
  type MemoryItemDelegate,
  type MemoryKind,
  type MemoryRecord,
  type MemoryStore,
} from "../../../features/memory/memoryStore";
import { rowboatFromEnv, type RowboatAdapter } from "../../adapters/rowboat";

// memory.read / memory.write / memory.delete handlers (WP12) and the Rowboat mirror.
//
// Postgres is written first and is the system of record. Each item is then mirrored to one Rowboat
// Space as a Markdown note, and the note's asset id is stored in MemoryItem.externalRef as
// "rowboat:<assetId>". If Rowboat is down, the item stays in Postgres with externalRef null, and the
// handler reports it in logReason. Delete removes the Rowboat note first: if that fails, nothing is
// deleted, so the two stores never disagree about a "forgotten" item.

type PgStore = ReturnType<typeof createPostgresMemoryStore>;

export interface MirroredMemoryStore extends MemoryStore {
  /** Mirror status of the last write, for the ActionLog. */
  lastWriteNote?: string;
}

const REF_PREFIX = "rowboat:";

export function createMirroredMemoryStore(pg: PgStore, rowboat?: RowboatAdapter): MirroredMemoryStore {
  const store: MirroredMemoryStore = {
    async write(input) {
      const item = await pg.write(input);
      store.lastWriteNote = undefined;
      if (!rowboat) return item;
      try {
        const note = await rowboat.createNote(notePath(item), toMarkdown(item), `Atlas memory: ${item.kind}`);
        const externalRef = `${REF_PREFIX}${note.assetId}`;
        await pg.setExternalRef(item.id, externalRef);
        return { ...item, externalRef };
      } catch (error) {
        store.lastWriteNote = `rowboat_mirror_failed: ${(error as Error).message.slice(0, 200)}`;
        return item;
      }
    },
    search: (query) => pg.search(query),
    list: (userId, goalId) => pg.list(userId, goalId),
    async delete(userId, id) {
      const item = await pg.get(userId, id);
      if (!item) return false;
      if (item.externalRef?.startsWith(REF_PREFIX)) {
        if (!rowboat) throw new Error("This memory is mirrored in Rowboat, but Rowboat is not configured; not deleting one copy only.");
        await rowboat.deleteNote(item.externalRef.slice(REF_PREFIX.length));
      }
      return pg.delete(userId, id);
    },
  };
  return store;
}

export function notePath(item: Pick<MemoryRecord, "id" | "kind" | "goalId">): string {
  return `atlas-memory/${item.goalId ?? "general"}/${item.kind}/${item.id}.md`;
}

export function toMarkdown(item: MemoryRecord): string {
  return [
    "---",
    `atlas_memory_id: ${item.id}`,
    `kind: ${item.kind}`,
    `goal: ${item.goalId ?? "none"}`,
    `source: ${JSON.stringify(item.source)}`,
    `created: ${item.createdAt.toISOString()}`,
    "---",
    "",
    item.text,
    "",
    "_Written by Atlas. Delete it in Atlas's Memory page to remove it from both places._",
    "",
  ].join("\n");
}

// ---------- gateway handlers ----------

export const MemoryWritePayload = z.object({
  kind: z.enum(MEMORY_KINDS),
  text: z.string().trim().min(3).max(500),
  source: z.string().trim().min(1).max(200),
});
export const MemoryReadPayload = z.object({
  kinds: z.array(z.enum(MEMORY_KINDS)).optional(),
  text: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export const MemoryDeletePayload = z.object({ id: z.string().min(1) });

interface Ctx {
  userId: string;
  goalId?: string;
}

export function createMemoryHandlers(store: MirroredMemoryStore) {
  return {
    "memory.write": {
      payload: MemoryWritePayload,
      async run(payload: z.infer<typeof MemoryWritePayload>, ctx: Ctx) {
        const item = await store.write({ ...payload, userId: ctx.userId, ...(ctx.goalId ? { goalId: ctx.goalId } : {}) });
        return { data: item, ...(store.lastWriteNote ? { logReason: store.lastWriteNote } : {}) };
      },
    },
    "memory.read": {
      payload: MemoryReadPayload,
      async run(payload: z.infer<typeof MemoryReadPayload>, ctx: Ctx) {
        return { data: await store.search({ userId: ctx.userId, ...(ctx.goalId ? { goalId: ctx.goalId } : {}), ...payload }) };
      },
    },
    "memory.delete": {
      payload: MemoryDeletePayload,
      async run(payload: z.infer<typeof MemoryDeletePayload>, ctx: Ctx) {
        const deleted = await store.delete(ctx.userId, payload.id);
        return { data: { deleted }, ...(deleted ? {} : { logReason: "memory_not_found" }) };
      },
    },
  };
}

export function createMemoryStoreFromEnv(items: MemoryItemDelegate, env: NodeJS.ProcessEnv = process.env): MirroredMemoryStore {
  return createMirroredMemoryStore(createPostgresMemoryStore(items), rowboatFromEnv(env));
}

export type { MemoryKind };
