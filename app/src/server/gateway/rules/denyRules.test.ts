import { describe, expect, it } from "vitest";
import { BUDGET_FACT, ruleInput, sendDraft } from "../testing/ruleInput";
import { autonomyWatch } from "./autonomyWatch";
import { callTarget, normalizePhone } from "./callTarget";
import { consent } from "./consent";
import { dailyCap, dailyCapOf } from "./dailyCap";
import { individuals } from "./individuals";
import { checkNeedToKnow, needToKnow } from "./needToKnow";
import { optOut } from "./optOut";
import { ownership } from "./ownership";
import { personalization } from "./personalization";
import { privateLeak } from "./privateLeak";
import { providerMinimum } from "./providerMinimum";
import { selectedProspect } from "./selectedProspect";
import { taint } from "./taint";

describe("ownership", () => {
  it("allows an active goal owned by the user", () => {
    expect(ownership.check(ruleInput("company.search"))).toBeNull();
    expect(ownership.check(ruleInput("web.read", { request: { goalId: undefined }, goal: null }))).toBeNull();
  });
  it("denies a missing, foreign or inactive goal", () => {
    expect(ownership.check(ruleInput("company.search", { goal: null }))).toMatch(/not found/);
    expect(ownership.check(ruleInput("company.search", { goal: { userId: "user_2" } }))).toMatch(/not found/);
    expect(ownership.check(ruleInput("company.search", { goal: { status: "PAUSED" } }))).toMatch(/PAUSED/);
  });
  it("denies goal-bound actions without a goalId", () => {
    expect(ownership.check(ruleInput("outreach.send", { request: { goalId: undefined }, goal: null }))).toMatch(/requires a goalId/);
  });
  it("denies a draft or match from another goal", () => {
    expect(ownership.check(ruleInput("outreach.send", { draft: sendDraft({ goalId: "goal_9" }) }))).toMatch(/draft/);
    expect(ownership.check(ruleInput("outreach.send", { draft: sendDraft() }))).toBeNull();
    expect(ownership.check(ruleInput("draft.create", { match: null }))).toMatch(/match/);
    expect(ownership.check(ruleInput("draft.create", { match: { id: "match_1", goalId: "goal_1", status: "NEW" } }))).toBeNull();
  });
});

describe("consent", () => {
  it("denies listening, calls and cards without the matching consent", () => {
    expect(consent.check(ruleInput("meeting.listen"))).toMatch(/meeting_listening/);
    expect(consent.check(ruleInput("call.place"))).toMatch(/phone_calls/);
    expect(consent.check(ruleInput("card.publish"))).toMatch(/matching/);
    expect(consent.check(ruleInput("card.reveal"))).toMatch(/identity_reveal/);
  });
  it("denies handing facts to a model without model_processing", () => {
    expect(consent.check(ruleInput("draft.create", { usedFactIds: ["fact_spec"] }))).toMatch(/model_processing/);
  });
  it("allows with the consent, and needs none for plain reads or fact-free drafts", () => {
    expect(consent.check(ruleInput("meeting.listen", { consents: new Set(["meeting_listening"]) }))).toBeNull();
    expect(consent.check(ruleInput("draft.create", { usedFactIds: ["f"], consents: new Set(["model_processing"]) }))).toBeNull();
    expect(consent.check(ruleInput("draft.create"))).toBeNull();
    expect(consent.check(ruleInput("company.search"))).toBeNull();
  });
  it("does not let matching consent stand in for identity_reveal", () => {
    expect(consent.check(ruleInput("card.reveal", { consents: new Set(["matching"]) }))).toMatch(/identity_reveal/);
  });
});

describe("call_target", () => {
  const user = { id: "user_1", phone: "+1 (415) 555-0100", phoneVerifiedAt: new Date() };
  it("allows the verified number in any formatting", () => {
    expect(callTarget.check(ruleInput("call.place", { user, request: { payload: { toNumber: "+14155550100" } } }))).toBeNull();
    expect(normalizePhone(" +1 415-555-0100 ")).toBe("+14155550100");
  });
  it("denies any other number or an unverified phone", () => {
    expect(callTarget.check(ruleInput("call.place", { user, request: { payload: { toNumber: "+14155550199" } } }))).toMatch(/not the user's/);
    const unverified = { ...user, phoneVerifiedAt: null };
    expect(callTarget.check(ruleInput("call.place", { user: unverified, request: { payload: { toNumber: "+14155550100" } } }))).toMatch(/verified/);
  });
});

describe("individuals", () => {
  it("denies contact.search on intern goals with a pointer to opt-in channels", () => {
    expect(individuals.check(ruleInput("contact.search", { goal: { kind: "intern" } }))).toMatch(/jobs\.search, share cards/);
  });
  it("allows contact.search for company goals and jobs.search for intern goals", () => {
    expect(individuals.check(ruleInput("contact.search"))).toBeNull();
    expect(individuals.check(ruleInput("jobs.search", { goal: { kind: "intern" } }))).toBeNull();
  });
});

describe("taint", () => {
  it("allows reads, match.submit and draft.create when tainted", () => {
    for (const type of ["company.search", "web.read", "memory.read", "match.submit", "draft.create"] as const) {
      expect(taint.check(ruleInput(type, { request: { tainted: true } }))).toBeNull();
    }
  });
  it("denies sends, reveals, calls and writes when tainted", () => {
    for (const type of ["outreach.send", "contact.reveal_email", "call.place", "memory.write", "card.reveal"] as const) {
      expect(taint.check(ruleInput(type, { request: { tainted: true } }))).toMatch(/tainted/);
    }
  });
  it("allows anything untainted", () => {
    expect(taint.check(ruleInput("outreach.send"))).toBeNull();
  });
});

describe("need_to_know", () => {
  const spec = { id: "fact_spec", key: "spec", value: "6061", sensitivity: "shareable" as const, allowedPurposes: ["draft.create"] };
  it("allows facts whose purposes include this action", () => {
    expect(needToKnow.check(ruleInput("draft.create", { facts: [spec, BUDGET_FACT], usedFactIds: ["fact_spec"] }))).toBeNull();
  });
  it("denies a fact whose purposes exclude this action, or an unknown fact", () => {
    expect(needToKnow.check(ruleInput("draft.create", { facts: [spec, BUDGET_FACT], usedFactIds: ["fact_budget"] }))).toMatch(/manufacturing_budget_ceiling/);
    expect(needToKnow.check(ruleInput("draft.create", { facts: [spec], usedFactIds: ["fact_other"] }))).toMatch(/not one of/);
  });
  it("checks model-call purposes outside the gateway", () => {
    expect(checkNeedToKnow([spec], ["fact_spec"], "model:rank_matches")).toMatch(/not allowed/);
  });
});

describe("private_leak", () => {
  const leak = (text: string) => privateLeak.check(ruleInput("draft.create", { facts: [BUDGET_FACT], outgoingText: [text] }));
  it.each([
    "Our budget is $180,000 for the run.",
    "We can spend 180000.",
    "Up to 180k all in.",
    "Ceiling: USD 180,000.00",
    "Roughly $0.18M.",
    "about 180 thousand dollars",
    "one hundred eighty thousand dollars",
  ])("denies %s", (text) => {
    expect(leak(text)).toMatch(/manufacturing_budget_ceiling/);
  });
  it.each(["We need 500 housings, 6061 aluminium, 2 mm wall.", "Budget around $250,000.", "Order of 18,000 units", "Call me in 2026."])(
    "allows %s",
    (text) => {
      expect(leak(text)).toBeNull();
    },
  );
  it("matches non-numeric private values regardless of case and punctuation", () => {
    const fact = { ...BUDGET_FACT, key: "codename", value: "Project Bluefin" };
    expect(privateLeak.check(ruleInput("outreach.send", { facts: [fact], outgoingText: ["re: project-bluefin"] }))).toMatch(/codename/);
  });
  it("ignores public and shareable facts", () => {
    const fact = { ...BUDGET_FACT, sensitivity: "shareable" as const };
    expect(privateLeak.check(ruleInput("draft.create", { facts: [fact], outgoingText: ["$180,000"] }))).toBeNull();
  });
});

describe("opt_out", () => {
  it("denies an opted-out recipient", () => {
    expect(optOut.check(ruleInput("outreach.send", { recipient: "a@b.example", recipientOptedOut: true }))).toMatch(/opted out/);
  });
  it("allows a recipient who has not opted out", () => {
    expect(optOut.check(ruleInput("outreach.send", { recipient: "a@b.example" }))).toBeNull();
  });
});

describe("personalization", () => {
  it("allows a draft personalised from its own match's sources", () => {
    expect(personalization.check(ruleInput("outreach.send", { draft: sendDraft() }))).toBeNull();
  });
  it("denies a draft with no refs", () => {
    expect(personalization.check(ruleInput("outreach.send", { draft: sendDraft({ personalizationRefs: [], refs: [] }) }))).toMatch(/no personalization/);
  });
  it("denies refs from another match or refs that don't exist", () => {
    const foreign = sendDraft({ refs: [{ id: "ref_1", matchId: "match_9", provider: "fiber" }] });
    expect(personalization.check(ruleInput("outreach.send", { draft: foreign }))).toMatch(/ref_1/);
    const missing = sendDraft({ personalizationRefs: ["ref_1", "ref_x"] });
    expect(personalization.check(ruleInput("outreach.send", { draft: missing }))).toMatch(/ref_x/);
  });
});

describe("daily_cap", () => {
  it("allows the 10th send and denies the 11th by default", () => {
    expect(dailyCap.check(ruleInput("outreach.send", { sendsToday: 9 }))).toBeNull();
    expect(dailyCap.check(ruleInput("outreach.send", { sendsToday: 10 }))).toMatch(/10\/10/);
  });
  it("uses the goal's own cap", () => {
    expect(dailyCap.check(ruleInput("outreach.send", { goal: { rules: { dailyCap: 2 } }, sendsToday: 2 }))).toMatch(/2\/2/);
    expect(dailyCapOf({ dailyCap: "lots" })).toBe(10);
  });
});

describe("autonomy_watch", () => {
  it("denies sends and paid reveals on WATCH goals", () => {
    expect(autonomyWatch.check(ruleInput("outreach.send", { goal: { autonomy: "WATCH" } }))).toMatch(/WATCH/);
    expect(autonomyWatch.check(ruleInput("contact.reveal_email", { goal: { autonomy: "WATCH" } }))).toMatch(/WATCH/);
  });
  it("allows reads on WATCH goals and sends on other levels", () => {
    expect(autonomyWatch.check(ruleInput("company.search", { goal: { autonomy: "WATCH" } }))).toBeNull();
    expect(autonomyWatch.check(ruleInput("outreach.send", { goal: { autonomy: "PREPARE" } }))).toBeNull();
  });
});

describe("provider_minimum", () => {
  const product = { id: "fact_product", key: "product", value: "Autonomous gripper", sensitivity: "public" as const, allowedPurposes: ["company.search"] };
  const stage = { id: "fact_stage", key: "stage", value: "Seed stage, 14 employees", sensitivity: "shareable" as const, allowedPurposes: ["draft.create"] };
  const facts = [BUDGET_FACT, product, stage];
  const check = (actionType: "company.search" | "contact.search", text: string) =>
    providerMinimum.check(ruleInput(actionType, { facts, providerText: [text] }));
  it("denies a private fact in a provider query in any number format", () => {
    expect(check("company.search", "manufacturers under $180,000")).toMatch(/private fact "manufacturing_budget_ceiling"/);
    expect(check("company.search", "budget 180k")).toMatch(/manufacturing_budget_ceiling/);
  });
  it("denies a fact whose purposes exclude this action", () => {
    expect(check("company.search", "seed stage, 14 employees robotics")).toMatch(/shareable fact "stage"/);
    expect(check("contact.search", "autonomous gripper buyers")).toMatch(/public fact "product"/);
  });
  it("allows a minimal query and facts allowed for this action", () => {
    expect(check("company.search", "3PL warehouses in Ohio")).toBeNull();
    expect(check("company.search", "buyers of an autonomous gripper")).toBeNull();
  });
  it("does nothing for actions that are not provider-bound", () => {
    expect(providerMinimum.check(ruleInput("draft.create", { facts }))).toBeNull();
  });
});

describe("selected_prospect", () => {
  const match = (status: "NEW" | "VETTED" | "APPROVED" | "REJECTED") => ({ id: "match_1", goalId: "goal_1", status });
  it("allows a reveal for a match the user approved", () => {
    expect(selectedProspect.check(ruleInput("contact.reveal_email", { revealMatch: match("APPROVED") }))).toBeNull();
  });
  it("denies a reveal for an unreviewed, vetted or rejected match, or no match", () => {
    for (const status of ["NEW", "VETTED", "REJECTED"] as const) {
      expect(selectedProspect.check(ruleInput("contact.reveal_email", { revealMatch: match(status) }))).toMatch(status);
    }
    expect(selectedProspect.check(ruleInput("contact.reveal_email"))).toMatch(/no match/);
  });
  it("ignores other actions", () => {
    expect(selectedProspect.check(ruleInput("contact.search"))).toBeNull();
  });
});
