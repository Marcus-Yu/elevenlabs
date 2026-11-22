import { describe, expect, it } from "vitest";
import { MemoryGatewayStore } from "../gateway/testing/memoryStore";
import { withLogStamp } from "./logStamp";

const entry = {
  userId: "u1",
  goalId: null,
  actor: { kind: "user" as const, id: "u1" },
  origin: "ui" as const,
  actionType: "outreach.send",
  decision: "ALLOW" as const,
  ruleId: "allow",
  reason: "sandbox_redirect",
  inputSummary: null,
  factIdsSent: [],
  adapterMode: "replay" as const,
};

describe("withLogStamp", () => {
  it("stamps the local backend and the trace id, keeping class methods", async () => {
    const inner = new MemoryGatewayStore();
    const store = withLogStamp(inner, "local", () => "trace_1");
    await store.writeLog(entry);
    expect(inner.logs[0]).toMatchObject({ reason: "execution_backend=local; sandbox_redirect", traceId: "trace_1" });
    expect(await store.getGoal("missing")).toBeNull();
  });

  it("leaves the reason alone on the alter backend and tolerates no trace", async () => {
    const inner = new MemoryGatewayStore();
    await withLogStamp(inner, "alter", () => null).writeLog({ ...entry, reason: null });
    expect(inner.logs[0]).toMatchObject({ reason: null, traceId: null });
  });
});
