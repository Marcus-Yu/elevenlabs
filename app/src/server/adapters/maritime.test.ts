import { describe, expect, it, vi } from "vitest";
import { createMaritimeAdapter, MaritimeError, watcherEnvVars } from "./maritime";

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const { status = 200, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("maritime adapter", () => {
  it("creates a custom agent box per goal with the token as a secret", async () => {
    const { fetch, calls } = fakeFetch((url, init) => (init.method === "GET" ? { body: [] } : { body: { id: "a1", name: "atlas-watcher-g1", externalId: "atlas-goal-g1", status: "deploying" } }));
    const agent = await createMaritimeAdapter({ apiKey: "mk_x", fetch }).createWatcher({
      goalId: "g1",
      uploadS3Key: "uploads/x/y.tar.gz",
      env: { ATLAS_URL: "https://atlas.example", WATCHER_GOAL_ID: "g1", WATCHER_TOKEN: "wt_secret" },
    });
    expect(agent.id).toBe("a1");
    const create = calls.find((c) => c.init.method === "POST")!;
    expect(create.url).toBe("https://api.maritime.sh/api/agents");
    expect((create.init.headers as Record<string, string>).authorization).toBe("Bearer mk_x");
    expect(JSON.parse(String(create.init.body))).toEqual({
      name: "atlas-watcher-g1",
      externalId: "atlas-goal-g1",
      framework: "custom",
      uploadS3Key: "uploads/x/y.tar.gz",
      memMb: 1024,
      initialEnvVars: [
        { key: "ATLAS_URL", value: "https://atlas.example", isSecret: false },
        { key: "WATCHER_GOAL_ID", value: "g1", isSecret: false },
        { key: "WATCHER_TOKEN", value: "wt_secret", isSecret: true },
      ],
    });
  });

  it("reuses the goal's existing box instead of creating a second one", async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: [{ id: "a1", name: "n", externalId: "atlas-goal-g1" }] }));
    const agent = await createMaritimeAdapter({ apiKey: "k", fetch }).createWatcher({ goalId: "g1", uploadS3Key: "k", env: { ATLAS_URL: "u", WATCHER_GOAL_ID: "g1", WATCHER_TOKEN: "t" } });
    expect(agent.id).toBe("a1");
    expect(calls.every((c) => c.init.method === "GET")).toBe(true);
  });

  it("refuses to give a watcher box any provider key", () => {
    expect(() => watcherEnvVars({ ANTHROPIC_API_KEY: "sk" } as never)).toThrow(/holds only its goal token/);
    expect(() => watcherEnvVars({ FIBER_API_KEY: "sk" } as never)).toThrow();
    expect(watcherEnvVars({ ATLAS_URL: "", WATCHER_TOKEN: "t" })).toEqual([{ key: "WATCHER_TOKEN", value: "t", isSecret: true }]);
  });

  it("raises MaritimeError with the response detail", async () => {
    const { fetch } = fakeFetch(() => ({ status: 402, body: { detail: "payment_required" } }));
    await expect(createMaritimeAdapter({ apiKey: "k", fetch }).deleteWatcher("a1")).rejects.toBeInstanceOf(MaritimeError);
  });
});
