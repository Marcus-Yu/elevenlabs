import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createPostgresMemoryStore,
  memoryContextFor,
  preferenceFromMatchDecision,
  type MemoryItemDelegate,
  type MemoryRecord,
} from "../../../features/memory/memoryStore";
import type { RowboatAdapter } from "../../adapters/rowboat";
import { createMemoryHandlers, createMirroredMemoryStore, notePath, toMarkdown } from "./memory";

/** In-memory stand-in for Prisma's MemoryItem delegate, covering the filters the store uses. */
function fakeItems(): MemoryItemDelegate & { rows: MemoryRecord[] } {
  const rows: MemoryRecord[] = [];
  let clock = 0;
  const matches = (row: MemoryRecord, where: Record<string, any>) =>
    Object.entries(where).every(([key, cond]) => {
      const value = (row as any)[key];
      if (cond && typeof cond === "object" && "in" in cond) return cond.in.includes(value);
      if (cond && typeof cond === "object" && "contains" in cond) return String(value).toLowerCase().includes(String(cond.contains).toLowerCase());
      return value === cond;
    });
  return {
    rows,
    async create({ data }) {
      const row = { id: randomUUID(), createdAt: new Date(Date.UTC(2026, 10, 22, 0, 0, clock++)), externalRef: null, ...data } as MemoryRecord;
      rows.push(row);
      return row;
    },
    async findMany({ where, take }) {
      return rows.filter((r) => matches(r, where)).sort((a, b) => +b.createdAt - +a.createdAt).slice(0, take);
    },
    async findFirst({ where }) {
      return rows.find((r) => matches(r, where)) ?? null;
    },
    async update({ where, data }) {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
    async delete({ where }) {
      const i = rows.findIndex((r) => r.id === where.id);
      return rows.splice(i, 1)[0]!;
    },
  };
}

function fakeRowboat(): RowboatAdapter & { notes: Map<string, { path: string; content: string }> } {
  const notes = new Map<string, { path: string; content: string }>();
  return {
    notes,
    createNote: vi.fn(async (path: string, content: string) => {
      const assetId = `asset-${notes.size + 1}`;
      notes.set(assetId, { path, content });
      return { assetId, path, version: 1 };
    }),
    readNote: vi.fn(async (id: string) => ({ ...notes.get(id)!, version: 1 })),
    deleteNote: vi.fn(async (id: string) => {
      notes.delete(id);
    }),
  };
}

describe("postgres memory store", () => {
  it("validates input: goal-relevant kinds only, short text, a source", async () => {
    const store = createPostgresMemoryStore(fakeItems());
    await expect(store.write({ userId: "u1", kind: "gossip" as never, text: "x y z", source: "s" })).rejects.toThrow();
    await expect(store.write({ userId: "u1", kind: "fact", text: "x".repeat(501), source: "s" })).rejects.toThrow();
    await expect(store.write({ userId: "u1", kind: "fact", text: "ok text", source: "" })).rejects.toThrow();
  });

  it("searches by goal, kind and text, newest first, and never across users", async () => {
    const store = createPostgresMemoryStore(fakeItems());
    await store.write({ userId: "u1", goalId: "g1", kind: "preference", text: "Prefers 3PLs over 500 staff", source: "s" });
    await store.write({ userId: "u1", goalId: "g1", kind: "objection", text: "Payback period too long", source: "s" });
    await store.write({ userId: "u2", goalId: "g1", kind: "preference", text: "Someone else's 3PL note", source: "s" });
    expect((await store.search({ userId: "u1", goalId: "g1", text: "3pl" })).map((m) => m.text)).toEqual(["Prefers 3PLs over 500 staff"]);
    expect((await store.search({ userId: "u1", kinds: ["objection"] })).map((m) => m.kind)).toEqual(["objection"]);
    expect((await store.list("u1")).map((m) => m.kind)).toEqual(["objection", "preference"]);
  });

  it("refuses to delete another user's item", async () => {
    const items = fakeItems();
    const store = createPostgresMemoryStore(items);
    const item = await store.write({ userId: "u1", kind: "fact", text: "Ships from Ohio", source: "s" });
    expect(await store.delete("u2", item.id)).toBe(false);
    expect(items.rows).toHaveLength(1);
  });
});

describe("rowboat mirror", () => {
  it("WP12 acceptance: a rejection becomes a preference in both stores; deleting removes both and drops it from ranking context", async () => {
    const items = fakeItems();
    const rowboat = fakeRowboat();
    const store = createMirroredMemoryStore(createPostgresMemoryStore(items), rowboat);

    const pref = await store.write(
      preferenceFromMatchDecision({ userId: "u1", goalId: "g1", matchId: "m1", companyName: "Example Logistics", decision: "REJECTED", reason: "too small for a pilot" }),
    );
    expect(pref).toMatchObject({ kind: "preference", text: "Rejected Example Logistics: too small for a pilot", source: "match:m1 rejected", externalRef: "rowboat:asset-1" });
    expect((await store.list("u1", "g1")).map((m) => m.id)).toEqual([pref.id]);
    expect(rowboat.notes.get("asset-1")).toMatchObject({ path: `atlas-memory/g1/preference/${pref.id}.md` });
    expect(rowboat.notes.get("asset-1")!.content).toContain("Rejected Example Logistics: too small for a pilot");
    expect(await memoryContextFor(store, "u1", "g1")).toEqual(["[preference] Rejected Example Logistics: too small for a pilot"]);

    expect(await store.delete("u1", pref.id)).toBe(true);
    expect(items.rows).toHaveLength(0);
    expect(rowboat.notes.size).toBe(0);
    expect(await memoryContextFor(store, "u1", "g1")).toEqual([]);
  });

  it("keeps the Postgres copy and reports it when Rowboat is down", async () => {
    const rowboat = fakeRowboat();
    vi.mocked(rowboat.createNote).mockRejectedValueOnce(new Error("Rowboat /assets failed with HTTP 503"));
    const handlers = createMemoryHandlers(createMirroredMemoryStore(createPostgresMemoryStore(fakeItems()), rowboat));
    const result = await handlers["memory.write"].run({ kind: "fact", text: "Uses Locus robots", source: "web:locusrobotics.com" }, { userId: "u1", goalId: "g1" });
    expect(result.data.externalRef).toBeNull();
    expect(result.logReason).toMatch(/^rowboat_mirror_failed: .*503/);
  });

  it("deletes nothing when the Rowboat delete fails, so the stores never disagree", async () => {
    const items = fakeItems();
    const rowboat = fakeRowboat();
    const store = createMirroredMemoryStore(createPostgresMemoryStore(items), rowboat);
    const item = await store.write({ userId: "u1", kind: "outcome", text: "Replied: not now", source: "s" });
    vi.mocked(rowboat.deleteNote).mockRejectedValueOnce(new Error("HTTP 500"));
    await expect(store.delete("u1", item.id)).rejects.toThrow("HTTP 500");
    expect(items.rows).toHaveLength(1);
    expect(rowboat.notes.size).toBe(1);
  });

  it("refuses to delete only one copy when Rowboat is no longer configured", async () => {
    const items = fakeItems();
    const mirrored = createMirroredMemoryStore(createPostgresMemoryStore(items), fakeRowboat());
    const item = await mirrored.write({ userId: "u1", kind: "fact", text: "Mirrored fact", source: "s" });
    const unmirrored = createMirroredMemoryStore(createPostgresMemoryStore(items));
    await expect(unmirrored.delete("u1", item.id)).rejects.toThrow(/not deleting one copy only/);
  });

  it("works without Rowboat as the Postgres-only fallback", async () => {
    const handlers = createMemoryHandlers(createMirroredMemoryStore(createPostgresMemoryStore(fakeItems())));
    const written = await handlers["memory.write"].run({ kind: "preference", text: "No companies under 100 staff", source: "user" }, { userId: "u1" });
    expect(written.data.externalRef).toBeNull();
    expect(written.logReason).toBeUndefined();
    expect((await handlers["memory.read"].run({}, { userId: "u1" })).data).toHaveLength(1);
    expect(await handlers["memory.delete"].run({ id: written.data.id }, { userId: "u1" })).toEqual({ data: { deleted: true } });
    expect(await handlers["memory.delete"].run({ id: written.data.id }, { userId: "u1" })).toEqual({ data: { deleted: false }, logReason: "memory_not_found" });
  });

  it("writes a note with front matter and the source", () => {
    const md = toMarkdown({ id: "i1", userId: "u1", goalId: null, kind: "fact", text: "A fact", source: 'web:"x"', externalRef: null, createdAt: new Date("2026-11-22T00:00:00Z") });
    expect(md).toContain("kind: fact\ngoal: none\nsource: \"web:\\\"x\\\"\"");
    expect(notePath({ id: "i1", kind: "fact", goalId: null })).toBe("atlas-memory/general/fact/i1.md");
  });
});
