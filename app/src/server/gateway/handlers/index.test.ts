import { describe, expect, it, vi } from "vitest";
import type { MemoryItemDelegate } from "../../../features/memory/memoryStore";
import { FixtureMissError } from "../../adapters/http";
import { createGateway } from "../engine";
import { GatewayHandlerError } from "../pipeline";
import { createRegistry } from "../registry";
import { MemoryGatewayStore } from "../testing/memoryStore";
import { GOAL, request, USER } from "../testing/world";
import { DEMO_CUSTOMER_SEARCH } from "./discovery.demo";
import { createHandlerMap, type HandlerDeps } from "./index";
import { createStubHandlers } from "./stubs";

// Replay mode with no provider keys and no Anthropic key: the demo request must come from fixtures.
const REPLAY_ENV = { ADAPTER_MODE: "replay" } as NodeJS.ProcessEnv;
const unusedMemory = new Proxy({}, { get: () => () => Promise.reject(new Error("memory not used in this test")) }) as MemoryItemDelegate;

const deps: HandlerDeps = { memoryItems: unusedMemory, matchDatabase: {} as HandlerDeps["matchDatabase"] };

function replayGateway() {
  const store = new MemoryGatewayStore();
  store.goals.set(GOAL, { id: GOAL, userId: USER, status: "ACTIVE", kind: "customers", autonomy: "PREPARE", rules: {} });
  const gateway = createGateway({
    store,
    registry: createRegistry(createHandlerMap(REPLAY_ENV, deps)),
    env: { outreachMode: "sandbox", redirectTo: "sandbox@atlas.example", adapterMode: "replay" },
  });
  return { store, gateway };
}

describe("createHandlerMap", () => {
  it("registers the real discovery, memory, watcher, and voice handlers", () => {
    const stubs = createStubHandlers();
    const map = createHandlerMap(REPLAY_ENV, deps);
    for (const type of ["company.search", "jobs.search", "contact.search", "contact.reveal_email", "web.read", "memory.read", "memory.write", "memory.delete", "match.submit", "voice.scribe_token", "voice.speak"] as const) {
      expect(map[type], type).not.toBe(stubs[type]);
      expect(map[type]).toBeDefined();
    }
    for (const type of ["draft.create", "outreach.send", "call.place", "meeting.listen", "card.publish", "card.reveal"] as const) {
      expect(map[type]?.payload, type).toBe(stubs[type]?.payload);
    }
  });

  it("keeps voice offline in replay mode even when an ElevenLabs key is present", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      const handlers = createHandlerMap({ ...REPLAY_ENV, ELEVENLABS_API_KEY: "test-key" }, deps);
      await expect(handlers["voice.scribe_token"]!.run({}, {} as never)).rejects.toThrow("Voice service is not configured");
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("serves the demo company search from recorded fixtures through gateway.execute", async () => {
    const { gateway, store } = replayGateway();
    const result = await gateway.execute(request("company.search", DEMO_CUSTOMER_SEARCH));
    expect(result.decision).toEqual({ outcome: "allow", ruleId: "default" });
    const data = result.data as { companies: { domain: string; sources: { provider: string }[] }[]; stub?: boolean };
    expect(data.stub).toBeUndefined();
    expect(data.companies.length).toBeGreaterThan(0);
    expect(data.companies.every((c) => !c.domain.endsWith(".example") && c.sources.some((s) => s.provider === "fiber"))).toBe(true);
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]).toMatchObject({ decision: "ALLOW", actionType: "company.search", adapterMode: "replay" });
  });

  it("fails a request with no fixture as a logged error, with no data", async () => {
    const { gateway, store } = replayGateway();
    const error = await gateway.execute(request("company.search", { keywords: ["no fixture for this query"] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayHandlerError);
    expect((error as GatewayHandlerError).cause).toBeInstanceOf(FixtureMissError);
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]!.reason).toMatch(/^handler_error: Replay miss for fiber/);
  });
});
