import { describe, expect, it } from "vitest";
import { ACTION_TYPES } from "../../../shared/contracts";
import { createWorld, draftPayload, request, sendPayload } from "../testing/world";
import { createStubHandlers } from "./stubs";

describe("stub handlers", () => {
  it("cover every §7 action type", () => {
    expect(Object.keys(createStubHandlers()).sort()).toEqual([...ACTION_TYPES].sort());
  });

  it("return labelled stub data through the engine and log the stub", async () => {
    const { gateway, store } = createWorld();
    const result = await gateway.execute(request("company.search", { keywords: ["3PL"] }));
    expect(result.decision).toEqual({ outcome: "allow", ruleId: "default" });
    expect(result.data).toMatchObject({ stub: true });
    const companies = (result.data as { companies: { domain: string; sources: { claim: string }[] }[] }).companies;
    expect(companies.every((c) => c.domain.endsWith(".example") && c.sources[0]!.claim.includes("SYNTHETIC STUB"))).toBe(true);
    expect(store.logs.at(-1)).toMatchObject({ decision: "ALLOW", reason: expect.stringContaining("stub_handler") });
  });

  it("draft.create stub echoes the draft without persisting it", async () => {
    const { gateway } = createWorld();
    const result = await gateway.execute(request("draft.create", draftPayload()));
    expect(result.decision.outcome).toBe("allow");
    expect(result.data).toMatchObject({ stub: true, draft: { matchId: "match_1", version: 1 } });
  });

  it("outreach.send stub reports the sandbox redirect and does not deliver", async () => {
    const { gateway } = createWorld({ autonomy: "ACT" });
    const first = await gateway.execute(request("outreach.send", sendPayload()));
    expect(first.decision).toMatchObject({ outcome: "needs_approval", ruleId: "first_contact" });
    const approved = await gateway.decideApproval({ approvalId: (first.decision as { approvalId: string }).approvalId, userId: "user_1", decision: "approve", via: "web" });
    expect(approved.decision).toEqual({ outcome: "allow", ruleId: "sandbox" });
    expect(approved.data).toMatchObject({ stub: true, delivered: false, to: "sandbox@atlas.example", originalRecipient: "ops@customer.example" });
  });
});
