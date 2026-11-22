import { describe, expect, it, vi } from "vitest";
import type { AlterConfig } from "../../adapters/alter";
import type { HandlerContext } from "../types";
import { assertSandboxRecipient, createOutreachHandlers, identityFor, type OutreachDeps } from "./outreach";

const alter: AlterConfig = { appKey: null, agentKeys: { "atlas-prepare": null, "atlas-act": null }, googleGrantId: null, approverEmail: "approver@example.test" };
const payload = { draftId: "draft_1", to: "inbox@example.test", subject: "Introduction", body: "Hello" };
const ctx: HandlerContext = { userId: "u1", goalId: "g1", actor: { kind: "user", id: "u1" }, origin: "ui", approvalId: "appr_1", recipientRewrite: { from: "real@corp.example", to: "inbox@example.test" } };

function deps(overrides: Partial<OutreachDeps> = {}): OutreachDeps {
  return {
    backend: "local",
    outreachMode: "sandbox",
    redirectTo: "inbox@example.test",
    alter,
    goalAutonomy: async () => "PREPARE",
    recordAlterApproval: vi.fn(async () => undefined),
    ...overrides,
  };
}

function run(d: OutreachDeps, p = payload, c = ctx) {
  return createOutreachHandlers(d)["outreach.send"]!.run(p, c);
}

describe("outreach.send", () => {
  it("local backend sends nothing and says so", async () => {
    const result = await run(deps());
    expect(result.data).toEqual({ delivered: false, backend: "local", to: "inbox@example.test", originalRecipient: "real@corp.example" });
    expect(result.logReason).toMatch(/not sent/);
  });

  it("refuses a sandbox send to anyone but the redirect inbox", async () => {
    await expect(run(deps(), { ...payload, to: "real@corp.example" })).rejects.toThrow(/OUTREACH_REDIRECT_TO/);
    expect(() => assertSandboxRecipient({ outreachMode: "sandbox", redirectTo: null }, "a@b.test")).toThrow(/not set/);
    expect(() => assertSandboxRecipient({ outreachMode: "live", redirectTo: null }, "a@b.test")).not.toThrow();
  });

  it("maps autonomy to an Alter identity; Watch has none", () => {
    expect(identityFor("ACT")).toBe("atlas-act");
    expect(identityFor("PREPARE")).toBe("atlas-prepare");
    expect(identityFor(null)).toBe("atlas-prepare");
    expect(() => identityFor("WATCH")).toThrow(/no Alter identity/);
  });

  it("a Watch goal cannot send through Alter", async () => {
    const send = vi.fn();
    await expect(run(deps({ backend: "alter", goalAutonomy: async () => "WATCH", send }))).rejects.toThrow(/no Alter identity/);
    expect(send).not.toHaveBeenCalled();
  });

  it("an Alter hold on an Atlas-approved send is recorded, approved as the user, then delivered", async () => {
    const send = vi.fn(async () => ({ status: "pending" as const, alterApprovalId: "alt_1", approvalUrl: "https://alter.example/a", expiresAt: "2026-11-22T19:00:00.000Z" }));
    const approve = vi.fn(async () => ({ status: "sent" as const, alterApprovalId: "alt_1", providerStatus: 200, gmailMessageId: "gm_1" }));
    const d = deps({ backend: "alter", send, approve });
    const result = await run(d);
    expect((send.mock.calls[0] as unknown[])[1]).toMatchObject({ identity: "atlas-prepare", message: { to: "inbox@example.test" }, context: { atlas_draft_id: "draft_1", atlas_approval_id: "appr_1" } });
    expect(d.recordAlterApproval).toHaveBeenCalledWith("appr_1", "alt_1");
    expect((approve.mock.calls[0] as unknown[])[1]).toMatchObject({ alterApprovalId: "alt_1", actorEmail: "approver@example.test", identity: "atlas-prepare" });
    expect(result.data).toMatchObject({ delivered: true, backend: "alter", gmailMessageId: "gm_1", originalRecipient: "real@corp.example" });
  });

  it("an Alter hold without an Atlas approval stays pending", async () => {
    const send = vi.fn(async () => ({ status: "pending" as const, alterApprovalId: "alt_2", approvalUrl: "https://alter.example/b", expiresAt: "2026-11-22T19:00:00.000Z" }));
    const approve = vi.fn();
    const { approvalId: _omit, ...noApproval } = ctx;
    const result = await run(deps({ backend: "alter", goalAutonomy: async () => "ACT", send, approve }), payload, noApproval);
    expect(approve).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ delivered: false, identity: "atlas-act", alterApprovalId: "alt_2" });
  });

  it("an Alter error fails the handler, so the gateway logs handler_error", async () => {
    const send = vi.fn(async () => {
      throw new Error("ApprovalDeniedError");
    });
    await expect(run(deps({ backend: "alter", send }))).rejects.toThrow(/ApprovalDenied/);
  });
});
