import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway } from "./engine";
import { createStubHandlers } from "./handlers/stubs";
import { createPrismaStore } from "./prismaStore";
import { createRegistry } from "./registry";

// Runs the gateway against a real Postgres through prismaStore. Opt-in, because it writes rows:
//   GATEWAY_DB_TEST_URL=postgresql://you@localhost:5432/atlas_wp1 npx vitest run prismaStore.db
// Use a scratch database with the migrations applied (wasp db migrate-dev). Rows are removed afterwards.

const url = process.env.GATEWAY_DB_TEST_URL;
const run = `dbtest${Date.now()}`;

describe.skipIf(!url)("prismaStore against Postgres", () => {
  // Only constructed when the suite runs; vitest still evaluates a skipped describe's body.
  const prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient);
  const store = createPrismaStore(prisma);
  const gateway = createGateway({
    store,
    registry: createRegistry(createStubHandlers()),
    env: { outreachMode: "sandbox", redirectTo: "sandbox@atlas.example", adapterMode: "replay" },
  });
  const ids = { user: "", goal: "", hireGoal: "", match: "", draft: "", ref: "" };
  const base = () => ({ userId: ids.user, goalId: ids.goal, actor: { kind: "agent" as const, id: "thread" }, origin: "thread" as const, tainted: false });
  const send = { draftId: "", to: `ops@${run}.example`, subject: "Gripper pilot", body: "Saw your new Reno site." };

  beforeAll(async () => {
    const user = await prisma.user.create({ data: {} });
    ids.user = user.id;
    const profile = await prisma.profile.create({ data: { userId: user.id, sourceKind: "oneliner" } });
    await prisma.profileFact.create({
      data: { profileId: profile.id, key: "manufacturing_budget_ceiling", value: "$180,000", sensitivity: "private", allowedPurposes: [] },
    });
    await prisma.consent.create({ data: { userId: user.id, kind: "matching" } });
    const goal = await prisma.goal.create({ data: { userId: user.id, direction: "SELL", kind: "customers", statement: "test", autonomy: "PREPARE" } });
    const hireGoal = await prisma.goal.create({ data: { userId: user.id, direction: "BUY", kind: "hire", statement: "hire test" } });
    ids.goal = goal.id;
    ids.hireGoal = hireGoal.id;
    const company = await prisma.company.create({ data: { domain: `${run}.example`, name: "Test Co" } });
    const talent = await prisma.company.create({ data: { domain: `talent-${run}.example`, name: "Talent Co" } });
    const match = await prisma.match.create({ data: { goalId: goal.id, companyId: company.id, score: 0.9, rationale: "test", status: "APPROVED" } });
    ids.match = match.id;
    const hireMatch = await prisma.match.create({ data: { goalId: hireGoal.id, companyId: talent.id, score: 0.8, rationale: "test" } });
    await prisma.contact.create({ data: { matchId: hireMatch.id, fullName: "Riley Candidate", title: "Engineer", provider: "fiber", email: `riley@talent-${run}.example` } });
    const ref = await prisma.sourceRef.create({ data: { matchId: match.id, claim: "test", provider: "fiber", fetchedAt: new Date() } });
    const draft = await prisma.draft.create({ data: { matchId: match.id, subject: "s", body: "b", personalizationRefs: [ref.id] } });
    ids.draft = draft.id;
    send.draftId = draft.id;
  });

  afterAll(async () => {
    if (ids.user) {
      await prisma.actionLog.deleteMany({ where: { userId: ids.user } });
      await prisma.draft.deleteMany({ where: { matchId: ids.match } });
      await prisma.user.delete({ where: { id: ids.user } });
      await prisma.company.deleteMany({ where: { domain: { endsWith: `${run}.example` } } });
    }
    await prisma.$disconnect();
  });

  it("holds a first send for approval, executes it once, and logs one row per call", async () => {
    const pending = await gateway.execute({ ...base(), actionType: "outreach.send", payload: send });
    expect(pending.decision).toMatchObject({ outcome: "needs_approval", ruleId: "first_contact" });
    const approvalId = (pending.decision as { approvalId: string }).approvalId;
    expect(await store.hasApprovedSendTo(ids.user, send.to)).toBe(false);

    const done = await gateway.decideApproval({ approvalId, userId: ids.user, decision: "approve", via: "web" });
    expect(done.decision).toEqual({ outcome: "allow", ruleId: "sandbox" });
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } })).status).toBe("EXECUTED");
    expect(await store.hasApprovedSendTo(ids.user, send.to)).toBe(true);
    expect(await store.countAllowedSends(ids.goal, new Date(Date.now() - 60_000))).toBe(1);

    const again = await gateway.decideApproval({ approvalId, userId: ids.user, decision: "approve", via: "web" });
    expect(again.decision).toMatchObject({ ruleId: "approval_state" });
    expect(await prisma.actionLog.count({ where: { userId: ids.user } })).toBe(3);
  });

  it("refuses a payload changed in the database after the approval was created", async () => {
    const pending = await gateway.execute({ ...base(), actionType: "outreach.send", payload: { ...send, to: `new@${run}.example` } });
    const approvalId = (pending.decision as { approvalId: string }).approvalId;
    await prisma.approval.update({ where: { id: approvalId }, data: { payload: { ...send, to: `attacker@${run}.example` } } });
    const result = await gateway.decideApproval({ approvalId, userId: ids.user, decision: "approve", via: "web" });
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "payload_hash" });
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } })).status).toBe("FAILED");
  });

  it("keeps the hash stable through jsonb storage", async () => {
    const pending = await gateway.execute({ ...base(), actionType: "outreach.send", payload: { ...send, to: `third@${run}.example` } });
    const approvalId = (pending.decision as { approvalId: string }).approvalId;
    const result = await gateway.decideApproval({ approvalId, userId: ids.user, decision: "approve", via: "thread" });
    expect(result.decision.outcome).toBe("allow");
  });

  it("finds matches by domain and researched candidates on hire goals", async () => {
    expect(await store.findMatchByDomain(ids.goal, `${run.toUpperCase()}.example`)).toMatchObject({ id: ids.match, status: "APPROVED" });
    expect(await store.isResearchedCandidate(ids.user, { email: `RILEY@talent-${run}.example` })).toBe(true);
    expect(await store.isResearchedCandidate(ids.user, { fullName: "riley candidate", companyDomain: `talent-${run}.example` })).toBe(true);
    expect(await store.isResearchedCandidate(ids.user, { email: send.to })).toBe(false);
  });

  it("strips the private fact from a card and writes the reason", async () => {
    const result = await gateway.execute({ ...base(), actionType: "card.publish", payload: { cardId: "c", fields: { need: "Gripper housings", budget: "about 180k" } } });
    expect(result.decision).toEqual({ outcome: "allow", ruleId: "card_fields" });
    const log = await prisma.actionLog.findUniqueOrThrow({ where: { id: result.logId } });
    expect(log.reason).toContain('"budget" (fact "manufacturing_budget_ceiling"');
    expect(log.inputSummary).not.toContain("180");
  });

  it("denies a hire-goal reveal with opt_in_only", async () => {
    const result = await gateway.execute({ ...base(), goalId: ids.hireGoal, actionType: "contact.reveal_email", payload: { fullName: "Riley Candidate", companyDomain: `talent-${run}.example` } });
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "opt_in_only" });
  });
});
