import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { GatewayResult } from "../../shared/contracts";
import { GatewayHandlerError } from "./pipeline";
import { ENGINE_RULE_IDS, RULES } from "./rules/index";
import { createWorld, draftPayload, GOAL, latestWorld, MATCH, OTHER_USER, RECIPIENT, REF, request, sendPayload, USER } from "./testing/world";
import { defineHandler } from "./types";

type World = ReturnType<typeof createWorld>;

/** Records an approved send to RECIPIENT, so first_contact passes. */
function priorApprovedSend(world: World) {
  world.store.approvals.set("approval_prior", {
    id: "approval_prior",
    userId: USER,
    goalId: GOAL,
    actionType: "outreach.send",
    payload: sendPayload(),
    payloadHash: "x",
    status: "EXECUTED",
    decidedVia: "web",
    decidedAt: new Date(),
    createdAt: new Date(),
  });
}

async function pending(world: World, result: GatewayResult) {
  expect(result.decision.outcome).toBe("needs_approval");
  return (result.decision as { approvalId: string }).approvalId;
}

const scenarios: { ruleId: string; outcome: string; run: () => Promise<GatewayResult> }[] = [
  { ruleId: "schema", outcome: "deny", run: () => createWorld().gateway.execute(request("outreach.send", sendPayload({ to: "nope" }))) },
  { ruleId: "unknown_action", outcome: "deny", run: () => createWorld().gateway.execute({ ...request("web.read", {}), actionType: "email.blast" }) },
  { ruleId: "ownership", outcome: "deny", run: () => createWorld().gateway.execute(request("company.search", {}, { goalId: "goal_x" })) },
  { ruleId: "consent", outcome: "deny", run: () => createWorld().gateway.execute(request("meeting.listen", { scope: "this meeting" })) },
  {
    ruleId: "call_target",
    outcome: "deny",
    run: () => {
      const world = createWorld();
      world.store.consents.set(USER, ["phone_calls"]);
      world.store.users.set(USER, { id: USER, phone: "+14155550100", phoneVerifiedAt: new Date() });
      return world.gateway.execute(request("call.place", { toNumber: "+14155550199" }));
    },
  },
  {
    ruleId: "individuals",
    outcome: "deny",
    run: () => {
      const world = createWorld();
      world.store.goals.get(GOAL)!.kind = "intern";
      return world.gateway.execute(request("contact.search", {}));
    },
  },
  { ruleId: "taint", outcome: "deny", run: () => createWorld().gateway.execute(request("outreach.send", sendPayload(), { tainted: true })) },
  { ruleId: "need_to_know", outcome: "deny", run: () => createWorld().gateway.execute(request("draft.create", draftPayload({ usedFactIds: ["fact_budget"] }))) },
  { ruleId: "private_leak", outcome: "deny", run: () => createWorld().gateway.execute(request("draft.create", draftPayload({ body: "Our ceiling is 180k." }))) },
  {
    ruleId: "opt_out",
    outcome: "deny",
    run: () => {
      const world = createWorld();
      world.store.optOuts.add("customer.example");
      return world.gateway.execute(request("outreach.send", sendPayload()));
    },
  },
  {
    ruleId: "personalization",
    outcome: "deny",
    run: () => {
      const world = createWorld();
      world.store.drafts.get("draft_1")!.personalizationRefs = [];
      return world.gateway.execute(request("outreach.send", sendPayload()));
    },
  },
  {
    ruleId: "daily_cap",
    outcome: "deny",
    run: () => {
      const world = createWorld();
      world.store.goals.get(GOAL)!.rules = { dailyCap: 0 };
      return world.gateway.execute(request("outreach.send", sendPayload()));
    },
  },
  { ruleId: "autonomy_watch", outcome: "deny", run: () => createWorld({ autonomy: "WATCH" }).gateway.execute(request("outreach.send", sendPayload())) },
  { ruleId: "first_contact", outcome: "needs_approval", run: () => createWorld({ autonomy: "ACT" }).gateway.execute(request("outreach.send", sendPayload())) },
  {
    ruleId: "tainted_draft",
    outcome: "needs_approval",
    run: () => {
      const world = createWorld({ autonomy: "ACT" });
      priorApprovedSend(world);
      world.store.sourceRefs.get(REF)!.provider = "web";
      return world.gateway.execute(request("outreach.send", sendPayload()));
    },
  },
  {
    ruleId: "autonomy_prepare",
    outcome: "needs_approval",
    run: () => {
      const world = createWorld({ autonomy: "PREPARE" });
      priorApprovedSend(world);
      return world.gateway.execute(request("outreach.send", sendPayload()));
    },
  },
  {
    ruleId: "introductions",
    outcome: "needs_approval",
    run: () => {
      const world = createWorld();
      world.store.consents.set(USER, ["identity_reveal"]);
      return world.gateway.execute(request("card.reveal", { cardMatchId: "cm_1", fields: ["company_name"] }));
    },
  },
  { ruleId: "paid_reveal", outcome: "needs_approval", run: () => createWorld().gateway.execute(request("contact.reveal_email", { fullName: "Sam", companyDomain: "customer.example" })) },
  {
    ruleId: "opt_in_only",
    outcome: "deny",
    run: () => {
      const world = createWorld({ autonomy: "ACT" });
      world.store.goals.get(GOAL)!.kind = "hire";
      return world.gateway.execute(request("outreach.send", sendPayload()));
    },
  },
  {
    ruleId: "card_fields",
    outcome: "allow",
    run: () => {
      const world = createWorld();
      world.store.consents.set(USER, ["matching"]);
      return world.gateway.execute(request("card.publish", { cardId: "card_1", fields: { need: "Gripper housings", budget: "$180,000" }, fieldFacts: { budget: ["fact_budget"] } }));
    },
  },
  { ruleId: "provider_minimum", outcome: "deny", run: () => createWorld().gateway.execute(request("company.search", { keywords: ["contract manufacturer under $180k"] })) },
  {
    ruleId: "selected_prospect",
    outcome: "deny",
    run: () => {
      const world = createWorld();
      world.store.matches.get(MATCH)!.status = "NEW";
      return world.gateway.execute(request("contact.reveal_email", { fullName: "Sam", companyDomain: "customer.example" }));
    },
  },
  {
    ruleId: "preference_confirm",
    outcome: "needs_approval",
    run: () => createWorld().gateway.execute(request("memory.write", { kind: "preference", text: "Avoid 3PLs under 50 staff", source: "rejection" })),
  },
  {
    ruleId: "sandbox",
    outcome: "allow",
    run: () => {
      const world = createWorld({ autonomy: "ACT" });
      priorApprovedSend(world);
      return world.gateway.execute(request("outreach.send", sendPayload()));
    },
  },
  { ruleId: "default", outcome: "allow", run: () => createWorld().gateway.execute(request("company.search", {})) },
  {
    ruleId: "payload_hash",
    outcome: "deny",
    run: async () => {
      const world = createWorld();
      const id = await pending(world, await world.gateway.execute(request("outreach.send", sendPayload())));
      (world.store.approvals.get(id)!.payload as { body: string }).body = "Tampered after approval";
      return world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    },
  },
  {
    ruleId: "approval_state",
    outcome: "deny",
    run: async () => {
      const world = createWorld();
      const id = await pending(world, await world.gateway.execute(request("outreach.send", sendPayload())));
      await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "deny", via: "web" });
      return world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    },
  },
  {
    ruleId: "approval_expired",
    outcome: "deny",
    run: async () => {
      const world = createWorld();
      const id = await pending(world, await world.gateway.execute(request("outreach.send", sendPayload())));
      world.advance(25 * 60 * 60 * 1000);
      return world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    },
  },
  {
    ruleId: "user_denied",
    outcome: "deny",
    run: async () => {
      const world = createWorld();
      const id = await pending(world, await world.gateway.execute(request("outreach.send", sendPayload())));
      return world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "deny", via: "thread" });
    },
  },
];

describe("gateway.execute and decideApproval", () => {
  it.each(scenarios)("produces $ruleId ($outcome) end to end", async ({ ruleId, outcome, run }) => {
    const result = await run();
    expect(result.decision.outcome).toBe(outcome);
    expect(result.decision.ruleId).toBe(ruleId);
    const world = latestWorld();
    expect(world.store.logs).toHaveLength(world.calls);
    expect(world.store.logs.at(-1)!.id).toBe(result.logId);
    expect(world.store.logs.at(-1)!.ruleId).toBe(ruleId);
  });

  it("covers every rule id the gateway can emit", () => {
    const emitted = new Set([...RULES.map((rule) => rule.id), ...Object.values(ENGINE_RULE_IDS)]);
    expect(new Set(scenarios.map((s) => s.ruleId))).toEqual(emitted);
  });
});

describe("WP1 acceptance", () => {
  it("a WATCH goal cannot send, even with a prior approved send", async () => {
    const world = createWorld({ autonomy: "WATCH" });
    priorApprovedSend(world);
    const result = await world.gateway.execute(request("outreach.send", sendPayload()));
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "autonomy_watch" });
    expect(world.store.logs).toHaveLength(1);
    expect(world.store.approvals.size).toBe(1);
  });

  it("a private fact in a draft is denied and logged without copying the text", async () => {
    const world = createWorld();
    for (const body of ["Budget is $180,000.", "We can do 180000 total.", "Ceiling around 180 thousand."]) {
      const result = await world.gateway.execute(request("draft.create", draftPayload({ body })));
      expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "private_leak" });
    }
    expect(world.store.logs).toHaveLength(3);
    for (const log of world.store.logs) {
      expect(log).toMatchObject({ decision: "DENY", ruleId: "private_leak", actionType: "draft.create", userId: USER, goalId: GOAL });
      expect(log.inputSummary).not.toMatch(/180/);
      expect(log.factIdsSent).toEqual([]);
    }
  });

  it("a payload tampered with after approval is refused and the approval fails", async () => {
    const world = createWorld();
    const id = await pending(world, await world.gateway.execute(request("outreach.send", sendPayload())));
    (world.store.approvals.get(id)!.payload as { to: string }).to = "attacker@evil.example";
    const result = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "payload_hash" });
    expect(world.store.approvals.get(id)!.status).toBe("FAILED");
  });

  it("every call writes exactly one ActionLog row", async () => {
    const world = createWorld({ autonomy: "ACT" });
    const calls = [
      () => world.gateway.execute(request("company.search", {})),
      () => world.gateway.execute(request("outreach.send", sendPayload({ to: "bad" }))),
      () => world.gateway.execute({ nonsense: true }),
      () => world.gateway.execute(request("outreach.send", sendPayload())),
      () => world.gateway.decideApproval({ approvalId: "approval_1", userId: OTHER_USER, decision: "approve", via: "voice" }),
      () => world.gateway.decideApproval({ approvalId: "approval_1", userId: USER, decision: "approve", via: "web" }),
      () => world.gateway.decideApproval({ approvalId: "approval_1", userId: USER, decision: "approve", via: "web" }),
      () => world.gateway.execute(request("outreach.send", sendPayload())),
    ];
    for (const call of calls) {
      const before = world.store.logs.length;
      const result = await call();
      expect(world.store.logs.length).toBe(before + 1);
      expect(world.store.logs.at(-1)!.id).toBe(result.logId);
    }
  });

  it("a failing handler still writes exactly one row, then throws with its id", async () => {
    const failing = defineHandler({ payload: z.looseObject({}), run: async () => Promise.reject(new Error("provider down")) });
    const world = createWorld({ handlers: { "web.read": failing } });
    const error = await world.gateway.execute(request("web.read", {})).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayHandlerError);
    expect(world.store.logs).toHaveLength(1);
    expect(world.store.logs[0]).toMatchObject({ decision: "ALLOW", reason: expect.stringContaining("handler_error: provider down") });
    expect((error as GatewayHandlerError).logId).toBe(world.store.logs[0]!.id);
  });

  it("the 11th send of the day is denied", async () => {
    const world = createWorld({ autonomy: "ACT" });
    priorApprovedSend(world);
    for (let i = 0; i < 10; i++) {
      expect((await world.gateway.execute(request("outreach.send", sendPayload()))).decision.outcome).toBe("allow");
    }
    const eleventh = await world.gateway.execute(request("outreach.send", sendPayload()));
    expect(eleventh.decision).toMatchObject({ outcome: "deny", ruleId: "daily_cap" });
    world.advance(24 * 60 * 60 * 1000);
    expect((await world.gateway.execute(request("outreach.send", sendPayload()))).decision.outcome).toBe("allow");
  });

  it("the budget ceiling inside a company.search query is denied with provider_minimum", async () => {
    const world = createWorld();
    for (const keywords of [["budget $180,000"], ["robotics", "180k"]]) {
      const result = await world.gateway.execute(request("company.search", { keywords }));
      expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "provider_minimum" });
    }
    expect((await world.gateway.execute(request("company.search", { keywords: ["3PL", "warehouse"] }))).decision.outcome).toBe("allow");
  });

  it("a watcher request carrying a private fact is denied with provider_minimum", async () => {
    const world = createWorld();
    const company = { domain: "acme.example", name: "Acme", sources: [] };
    const watcher = { origin: "watcher" as const, tainted: true, actor: { kind: "agent" as const, id: "watcher:goal_1" } };
    const leak = await world.gateway.execute(request("match.submit", { company, rationale: "Fits our $180,000 ceiling" }, watcher));
    expect(leak.decision).toMatchObject({ outcome: "deny", ruleId: "provider_minimum" });
    const clean = await world.gateway.execute(request("match.submit", { company, rationale: "Runs 12 warehouses" }, watcher));
    expect(clean.decision.outcome).toBe("allow");
  });

  it("revealing an email for an unreviewed match is denied with selected_prospect", async () => {
    const world = createWorld({ autonomy: "ACT" });
    world.store.matches.get(MATCH)!.status = "VETTED";
    const result = await world.gateway.execute(request("contact.reveal_email", { fullName: "Sam", companyDomain: "customer.example" }));
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "selected_prospect" });
    expect(world.store.approvals.size).toBe(0);
  });

  it("an agent-written preference waits for approval, and confirming it writes the item", async () => {
    const written: unknown[] = [];
    const memoryWrite = defineHandler({
      payload: z.object({ kind: z.string(), text: z.string(), source: z.string() }),
      run: async (payload, ctx) => {
        written.push({ ...payload, by: ctx.actor });
        return { data: { id: "memory_1" } };
      },
    });
    const world = createWorld({ handlers: { "memory.write": memoryWrite } });
    const proposed = await world.gateway.execute(request("memory.write", { kind: "preference", text: "Avoid 3PLs under 50 staff", source: "rejection of match_1" }));
    expect(proposed.decision).toMatchObject({ outcome: "needs_approval", ruleId: "preference_confirm" });
    expect(written).toEqual([]);
    const approvalId = (proposed.decision as { approvalId: string }).approvalId;
    const confirmed = await world.gateway.decideApproval({ approvalId, userId: USER, decision: "approve", via: "web" });
    expect(confirmed.decision.outcome).toBe("allow");
    expect(written).toEqual([{ kind: "preference", text: "Avoid 3PLs under 50 staff", source: "rejection of match_1", by: { kind: "user", id: USER } }]);
    const ownWrite = await world.gateway.execute(request("memory.write", { kind: "preference", text: "Prefer Midwest", source: "user" }, { actor: { kind: "user", id: USER } }));
    expect(ownWrite.decision.outcome).toBe("allow");
  });

  it("strips user A's salary ceiling from a published card, logs it and passes only the rest on", async () => {
    let published: unknown;
    let stripped: unknown;
    const cardPublish = defineHandler({
      payload: z.object({ cardId: z.string(), fields: z.record(z.string(), z.string()), fieldFacts: z.record(z.string(), z.array(z.string())).default({}) }),
      run: async (payload, ctx) => {
        published = payload;
        stripped = ctx.strippedFields;
        return { data: { cardId: payload.cardId } };
      },
    });
    const world = createWorld({ handlers: { "card.publish": cardPublish } });
    world.store.consents.set(USER, ["matching"]);
    world.store.facts.get(USER)!.push(
      { id: "fact_role", key: "open_role", value: "Robotics engineer", sensitivity: "public", allowedPurposes: ["matching"] },
      { id: "fact_salary", key: "salary_ceiling", value: "$185,000", sensitivity: "private", allowedPurposes: [] },
    );
    const result = await world.gateway.execute(
      request("card.publish", {
        cardId: "card_1",
        fields: { need: "Robotics engineer", compensation: "Up to $185,000" },
        fieldFacts: { need: ["fact_role"], compensation: ["fact_salary"] },
      }),
    );
    expect(result.decision).toEqual({ outcome: "allow", ruleId: "card_fields" });
    expect(published).toEqual({ cardId: "card_1", fields: { need: "Robotics engineer" }, fieldFacts: { need: ["fact_role"] } });
    expect(stripped).toEqual([{ field: "compensation", factKey: "salary_ceiling", why: "declared_fact_not_allowed" }]);
    const log = world.store.logs.at(-1)!;
    expect(log).toMatchObject({ decision: "ALLOW", ruleId: "card_fields", reason: expect.stringContaining('"compensation" (fact "salary_ceiling"') });
    expect(log.inputSummary).not.toMatch(/185/);
  });

  it("denies a card whose every field was stripped", async () => {
    const world = createWorld();
    world.store.consents.set(USER, ["matching"]);
    const result = await world.gateway.execute(request("card.publish", { cardId: "card_1", fields: { budget: "180k" } }));
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "card_fields" });
  });

  it("a hire goal can research people but never reveal or send; contact goes through card.reveal", async () => {
    const world = createWorld({ autonomy: "ACT" });
    world.store.goals.get(GOAL)!.kind = "hire";
    world.store.consents.set(USER, ["identity_reveal"]);
    expect((await world.gateway.execute(request("contact.search", { roles: ["Robotics engineer"] }))).decision.outcome).toBe("allow");
    const reveal = await world.gateway.execute(request("contact.reveal_email", { fullName: "Sam", companyDomain: "customer.example" }));
    expect(reveal.decision).toMatchObject({ outcome: "deny", ruleId: "opt_in_only" });
    expect(world.store.approvals.size).toBe(0);
    const intro = await world.gateway.execute(request("card.reveal", { cardMatchId: "cm_1", fields: ["full_name"] }));
    expect(intro.decision).toMatchObject({ outcome: "needs_approval", ruleId: "introductions" });
  });

  it("a candidate found for a hire goal can't be emailed from another goal either", async () => {
    const world = createWorld({ autonomy: "ACT" });
    world.store.goals.set("goal_hire", { id: "goal_hire", userId: USER, status: "ACTIVE", kind: "hire", autonomy: "PREPARE", rules: {} });
    world.store.matches.set("match_hire", { id: "match_hire", goalId: "goal_hire", status: "APPROVED", domain: "talent.example" });
    world.store.contacts.push({ matchId: "match_hire", fullName: "Riley Candidate", email: RECIPIENT });
    const result = await world.gateway.execute(request("outreach.send", sendPayload()));
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "opt_in_only" });
    const byName = await world.gateway.execute(request("contact.reveal_email", { fullName: "riley candidate", companyDomain: "talent.example" }));
    expect(byName.decision).toMatchObject({ outcome: "deny", ruleId: "opt_in_only" });
  });

  it("records the facts a draft sent and the adapter mode", async () => {
    const world = createWorld();
    await world.gateway.execute(request("draft.create", draftPayload()));
    expect(world.store.logs[0]).toMatchObject({ decision: "ALLOW", factIdsSent: ["fact_spec"], adapterMode: "replay" });
  });

  it("never sends to the real recipient in sandbox mode", async () => {
    const world = createWorld({ autonomy: "ACT" });
    priorApprovedSend(world);
    const result = await world.gateway.execute(request("outreach.send", sendPayload()));
    expect(result.data).toMatchObject({ to: "sandbox@atlas.example", originalRecipient: RECIPIENT });
    expect(world.store.logs[0]!.reason).toContain(`rewritten to sandbox@atlas.example`);
  });
});
