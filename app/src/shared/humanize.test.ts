import { describe, expect, it } from "vitest";
import { criteriaMet, describeAction, fitAtK, humanStatus, runLabel } from "./humanize";

describe("describeAction", () => {
  it("maps allowed searches", () => {
    expect(describeAction({ actionType: "company.search", decision: "ALLOW" }).text).toBe("Searched company records (Fiber, replay)");
    expect(describeAction({ actionType: "contact.search", decision: "allow" }).text).toBe("Looked up public profiles");
  });
  it("maps memory writes", () => {
    expect(describeAction({ actionType: "memory.write", decision: "ALLOW", inputSummary: '{"text":"Prefers 4+ years"}' }).text).toBe("Saved your preference: Prefers 4+ years");
    expect(describeAction({ actionType: "memory.write", decision: "NEEDS_APPROVAL" }).text).toBe("Waiting for you to confirm a preference");
  });
  it("maps card events and keeps the rule as a tag", () => {
    const r = describeAction({ actionType: "card.publish", decision: "ALLOW", ruleId: "card_fields", reason: 'execution_backend=local; card_fields: stripped "budget"; stub_handler: no provider called' });
    expect(r).toEqual({ text: "Removed your budget ceiling before sharing the card (demo data)", ruleTag: "card_fields" });
    expect(describeAction({ actionType: "card.reveal", decision: "NEEDS_APPROVAL" }).text).toBe("Waiting for both sides to approve the introduction");
    expect(describeAction({ actionType: "card.reveal", decision: "ALLOW", inputSummary: '{"fields":["name","email"]}' }).text).toBe("Both sides agreed to share: name, email");
  });
  it("maps denials and outreach", () => {
    expect(describeAction({ actionType: "contact.reveal", decision: "DENY", ruleId: "opt_in_only" }).text).toBe("Blocked: contact details stay hidden until both sides opt in");
    expect(describeAction({ actionType: "x.y", decision: "DENY", ruleId: "r", reason: "unknown_action_type" }).text).toBe("Blocked: unknown action type");
    expect(describeAction({ actionType: "outreach.send", decision: "ALLOW" }).text).toBe("Introduction drafted, not sent");
  });
  it("never shows stub_handler", () => {
    const r = describeAction({ actionType: "contact.search", decision: "ALLOW", ruleId: "stub_handler" });
    expect(r).toEqual({ text: "Looked up public profiles (demo data)", ruleTag: null });
  });
});

describe("statuses and scores", () => {
  it("humanizes status words", () => {
    expect(["needs_ok", "approved", "scanning", "done", "PENDING", "EXECUTED"].map(humanStatus))
      .toEqual(["Needs your OK", "Approved", "Searching…", "Done", "Waiting", "Done"]);
  });
  it("words fit scores", () => {
    expect(fitAtK(4, 5)).toBe("4 of the top 5 meet all your criteria");
    expect(runLabel(2, 5, 5, 4)).toBe("Run 2: 5 of 5 now match (was 4 of 5)");
    expect(criteriaMet(3, 3)).toBe("Meets 3 of 3 criteria");
  });
});
