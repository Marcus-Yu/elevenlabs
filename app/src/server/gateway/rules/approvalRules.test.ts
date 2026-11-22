import { describe, expect, it } from "vitest";
import { ruleInput, sendDraft } from "../testing/ruleInput";
import { autonomyPrepare } from "./autonomyPrepare";
import { firstContact } from "./firstContact";
import { introductions } from "./introductions";
import { paidReveal } from "./paidReveal";
import { preferenceConfirm } from "./preferenceConfirm";
import { taintedDraft } from "./taintedDraft";

describe("first_contact", () => {
  it("needs approval for a recipient with no prior approved send", () => {
    expect(firstContact.check(ruleInput("outreach.send", { recipient: "new@x.example", priorApprovedSend: false }))).toMatch(/first contact/);
  });
  it("passes once a send to the recipient was approved", () => {
    expect(firstContact.check(ruleInput("outreach.send", { recipient: "new@x.example", priorApprovedSend: true }))).toBeNull();
  });
});

describe("tainted_draft", () => {
  it("needs approval when the draft cites a web source", () => {
    const draft = sendDraft({ refs: [{ id: "ref_1", matchId: "match_1", provider: "web" }] });
    expect(taintedDraft.check(ruleInput("outreach.send", { draft }))).toMatch(/web-sourced/);
  });
  it("passes for structured-data sources", () => {
    expect(taintedDraft.check(ruleInput("outreach.send", { draft: sendDraft() }))).toBeNull();
  });
});

describe("autonomy_prepare", () => {
  it("needs approval for sends on PREPARE goals", () => {
    expect(autonomyPrepare.check(ruleInput("outreach.send", { goal: { autonomy: "PREPARE" } }))).toMatch(/PREPARE/);
  });
  it("passes on ACT goals and for non-send actions", () => {
    expect(autonomyPrepare.check(ruleInput("outreach.send", { goal: { autonomy: "ACT" } }))).toBeNull();
    expect(autonomyPrepare.check(ruleInput("draft.create", { goal: { autonomy: "PREPARE" } }))).toBeNull();
  });
});

describe("introductions", () => {
  it("needs approval for card.reveal", () => {
    expect(introductions.check(ruleInput("card.reveal"))).toMatch(/approval/);
  });
  it("passes for card.publish", () => {
    expect(introductions.check(ruleInput("card.publish"))).toBeNull();
  });
});

describe("paid_reveal", () => {
  it("needs approval for contact.reveal_email on PREPARE and ACT goals", () => {
    expect(paidReveal.check(ruleInput("contact.reveal_email", { goal: { autonomy: "PREPARE" } }))).toMatch(/credits/);
    expect(paidReveal.check(ruleInput("contact.reveal_email", { goal: { autonomy: "ACT" } }))).toMatch(/credits/);
  });
  it("passes for the free contact.search", () => {
    expect(paidReveal.check(ruleInput("contact.search"))).toBeNull();
  });
});

describe("preference_confirm", () => {
  const preference = { kind: "preference", text: "Avoid 3PLs under 50 staff", source: "rejection" };
  it("needs approval for a preference written by an agent or a schedule", () => {
    expect(preferenceConfirm.check(ruleInput("memory.write", { request: { payload: preference } }))).toMatch(/confirmation/);
    expect(preferenceConfirm.check(ruleInput("memory.write", { request: { payload: preference, actor: { kind: "schedule", id: "nightly" } } }))).toMatch(/confirmation/);
  });
  it("passes for the user's own preference and for other memory kinds", () => {
    expect(preferenceConfirm.check(ruleInput("memory.write", { request: { payload: preference, actor: { kind: "user", id: "user_1" } } }))).toBeNull();
    expect(preferenceConfirm.check(ruleInput("memory.write", { request: { payload: { ...preference, kind: "objection" } } }))).toBeNull();
  });
});
