import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OutreachSendPayload } from "../payloads";
import { ruleInput, sendDraft } from "../testing/ruleInput";
import { resolveAllow } from "./allow";
import { evaluateRules, RULES } from "./index";
import { validatePayload } from "./schema";

const send = { draftId: "d", to: "ops@customer.example", subject: "s", body: "b" };

describe("schema", () => {
  it("returns the handler's parsed payload", () => {
    const result = validatePayload(z.object({ n: z.number().default(3) }), undefined, {});
    expect(result).toEqual({ ok: true, payload: { n: 3 } });
  });
  it("denies a payload failing the handler schema or the core contract", () => {
    expect(validatePayload(OutreachSendPayload, undefined, { ...send, to: "not-an-email" })).toMatchObject({ ok: false, reason: expect.stringMatching(/to:/) });
    expect(validatePayload(z.looseObject({}), OutreachSendPayload, { draftId: "d" })).toMatchObject({ ok: false });
  });
});

describe("sandbox and default", () => {
  it("rewrites the recipient in sandbox mode and keeps the original for the log", () => {
    const result = resolveAllow(ruleInput("outreach.send", { request: { payload: send } }));
    expect(result).toMatchObject({ ok: true, ruleId: "sandbox", payload: { to: "sandbox@atlas.example" }, rewrite: { from: send.to } });
  });
  it("denies a sandbox send with no redirect address", () => {
    const env = { outreachMode: "sandbox" as const, redirectTo: null, adapterMode: "replay" as const };
    expect(resolveAllow(ruleInput("outreach.send", { env, request: { payload: send } }))).toMatchObject({ ok: false, ruleId: "sandbox" });
  });
  it("allows everything else unchanged under default, including live-mode sends", () => {
    expect(resolveAllow(ruleInput("company.search"))).toMatchObject({ ok: true, ruleId: "default" });
    const env = { outreachMode: "live" as const, redirectTo: null, adapterMode: "live" as const };
    expect(resolveAllow(ruleInput("outreach.send", { env, request: { payload: send } }))).toMatchObject({ ok: true, ruleId: "default", payload: send });
  });
});

describe("rule order", () => {
  it("puts every deny rule before every approval rule", () => {
    const firstApproval = RULES.findIndex((rule) => rule.kind === "approval");
    expect(RULES.slice(firstApproval).every((rule) => rule.kind === "approval")).toBe(true);
  });
  it("skips approval rules when executing an approved request", () => {
    const input = ruleInput("outreach.send", { goal: { autonomy: "PREPARE" }, draft: sendDraft(), recipient: send.to, request: { payload: send } });
    expect(evaluateRules(input)?.rule.id).toBe("autonomy_prepare");
    expect(evaluateRules({ ...input, phase: "execute" })).toBeNull();
  });
});
