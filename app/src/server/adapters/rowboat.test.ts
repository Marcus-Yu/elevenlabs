import { describe, expect, it, vi } from "vitest";
import { createRowboatAdapter, rowboatFromEnv, RowboatError } from "./rowboat";

// Response bodies follow Harbor's protocol schemas (CreateAssetResult, ReadAssetResult, DeleteAssetResult).

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const { status = 200, body } = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const opts = { baseUrl: "https://harbor.example/", token: "tok", spaceId: "sp_1" };

describe("rowboat adapter", () => {
  it("creates a Markdown asset in the space as the Atlas agent", async () => {
    const { fetch, calls } = fakeFetch([{ body: { asset: { id: "as_1", path: "atlas-memory/g1/fact/i1.md", version: 1, updatedAt: "2026-11-22T00:00:00Z" }, changeSet: {} } }]);
    const ref = await createRowboatAdapter({ ...opts, fetch }).createNote("atlas-memory/g1/fact/i1.md", "# hi");
    expect(ref).toEqual({ assetId: "as_1", path: "atlas-memory/g1/fact/i1.md", version: 1 });
    expect(calls[0]!.url).toBe("https://harbor.example/v1/spaces/sp_1/assets");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ path: "atlas-memory/g1/fact/i1.md", newContent: "# hi", actingMode: "agent", agentName: "Atlas" });
  });

  it("deletes at the current version and retries once on a stale version", async () => {
    const { fetch, calls } = fakeFetch([
      { body: { id: "as_1", path: "p", content: "x", version: 2, recentHistory: [] } },
      { body: { outcome: "stale", current: {} } },
      { body: { id: "as_1", path: "p", content: "y", version: 3, recentHistory: [] } },
      { body: { outcome: "deleted", changeSet: {} } },
    ]);
    await createRowboatAdapter({ ...opts, fetch }).deleteNote("as_1");
    const deletes = calls.filter((c) => c.url.endsWith("/assets/delete")).map((c) => JSON.parse(String(c.init.body)).baseVersion);
    expect(deletes).toEqual([2, 3]);
  });

  it("raises RowboatError on HTTP failure", async () => {
    const { fetch } = fakeFetch([{ status: 401, body: { error: { code: "unauthorized" } } }]);
    await expect(createRowboatAdapter({ ...opts, fetch }).readNote("as_1")).rejects.toBeInstanceOf(RowboatError);
  });

  it("is off unless base URL, token and space are all set", () => {
    expect(rowboatFromEnv({ ROWBOAT_BASE_URL: "https://h", ROWBOAT_TOKEN: "t" })).toBeUndefined();
    expect(rowboatFromEnv({ ROWBOAT_BASE_URL: "https://h", ROWBOAT_TOKEN: "t", ROWBOAT_SPACE_ID: "s" })).toBeDefined();
  });
});
