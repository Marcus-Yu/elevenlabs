import type { SuperJSONValue } from "wasp/core/serialization";
import { HttpError, prisma } from "wasp/server";
import type { GetMatchDemo, RunMatchStep } from "wasp/server/operations";
import { gateway } from "../../../server/gateway";
import { IDENTITY_FIELDS, introDraft, matchRationale, SYNTHETIC_B_FACTS, SYNTHETIC_B_SUMMARY } from "./matchDemo";

// /match: two-user double opt-in. Every card action goes through gateway.execute(); reveals are
// needs_approval and decided with gateway.decideApproval. Nothing is sent anywhere.

const B_MARKER = "Synthetic second user";
const PURPOSE = "match:robotics-engineer";

async function syntheticB(): Promise<string> {
  const existing = await prisma.profile.findFirst({ where: { summary: SYNTHETIC_B_SUMMARY } });
  if (existing) return existing.userId;
  const user = await prisma.user.create({
    data: { profiles: { create: { sourceKind: "oneliner", summary: SYNTHETIC_B_SUMMARY, facts: { create: SYNTHETIC_B_FACTS } } } },
  });
  return user.id;
}

async function facts(userId: string) {
  return prisma.profileFact.findMany({ where: { profile: { userId } } });
}

function factId(list: { id: string; key: string }[], key: string): string | undefined {
  return list.find((f) => f.key === key)?.id;
}

async function draftFields(userId: string, side: "A" | "B") {
  const f = await facts(userId);
  const val = (k: string) => f.find((x) => x.key === k)?.value ?? "";
  const fields: Record<string, string> = {};
  const fieldFacts: Record<string, string[]> = {};
  const add = (field: string, text: string, key: string) => {
    fields[field] = text;
    const id = factId(f, key);
    if (id) fieldFacts[field] = [id];
  };
  if (side === "A") {
    add("hiring_for", `Robotics engineer for ${val("product").toLowerCase()}`, "product");
    add("location", val("hq"), "hq");
    add("budget", `Budget ceiling ${val("manufacturing_budget_ceiling")}`, "manufacturing_budget_ceiling");
  } else {
    add("seeking", val("seeking"), "seeking");
    add("experience", val("experience"), "experience");
    add("salary", `Salary floor ${val("salary_floor")}`, "salary_floor");
  }
  return { fields, fieldFacts };
}

async function cardFor(userId: string) {
  return prisma.shareCard.findFirst({ where: { userId, purpose: PURPOSE }, orderBy: { createdAt: "desc" } });
}

async function publish(userId: string, side: "A" | "B") {
  const draft = await draftFields(userId, side);
  const card = await prisma.shareCard.create({
    data: { userId, purpose: PURPOSE, fields: draft.fields, expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  const result = await gateway.execute({
    actionType: "card.publish", userId, actor: { kind: "user", id: userId }, origin: "ui", tainted: false,
    payload: { cardId: card.id, ...draft },
  });
  const log = await prisma.actionLog.findUnique({ where: { id: result.logId } });
  if (result.decision.outcome !== "allow") {
    await prisma.shareCard.delete({ where: { id: card.id } });
    throw new HttpError(409, `card.publish ${result.decision.outcome}: ${log?.reason ?? ""}`);
  }
  // The gateway stripped the private field; keep only what its log says survived.
  const stripped = Object.keys(draft.fields).filter((k) => log?.reason?.includes(`"${k}"`));
  const published = Object.fromEntries(Object.entries(draft.fields).filter(([k]) => !stripped.includes(k)));
  await prisma.shareCard.update({
    where: { id: card.id },
    data: { status: "ACTIVE", fields: { published, draft: draft.fields, stripped, ruleId: result.decision.ruleId, logReason: log?.reason ?? null } },
  });
}

function identityOf(userId: string, list: { key: string; value: string }[], side: "A" | "B"): Record<string, string> {
  const v = (k: string) => list.find((f) => f.key === k)?.value;
  if (side === "A") return { name: "demo (hiring manager)", company: v("company_name") ?? "", email: "demo@example.invalid" };
  return { name: v("name") ?? "", company: "Independent", email: v("email") ?? "" };
}

async function reveal(userId: string, matchId: string, fields: string[]) {
  const chosen = fields.filter((f) => (IDENTITY_FIELDS as readonly string[]).includes(f));
  if (chosen.length === 0) throw new HttpError(400, "Pick at least one field");
  const result = await gateway.execute({
    actionType: "card.reveal", userId, actor: { kind: "user", id: userId }, origin: "ui", tainted: false,
    payload: { cardMatchId: matchId, fields: chosen },
  });
  if (result.decision.outcome !== "needs_approval") throw new HttpError(409, `card.reveal expected needs_approval, got ${result.decision.outcome}`);
  await gateway.decideApproval({ approvalId: result.decision.approvalId, userId, decision: "approve", via: "web" });
}

async function revealApproval(userId: string, matchId: string) {
  const rows = await prisma.approval.findMany({ where: { userId, actionType: "card.reveal" }, orderBy: { createdAt: "desc" } });
  return rows.find((r) => (r.payload as { cardMatchId?: string })?.cardMatchId === matchId) ?? null;
}

const done = (a: { status: string } | null) => a?.status === "APPROVED" || a?.status === "EXECUTED";

type Step = "publishA" | "publishB" | "match" | "acceptA" | "acceptB" | "revealA" | "revealB" | "reset";

export const runMatchStep: RunMatchStep<{ step: Step; fields?: string[] }, { ok: true }> = async ({ step, fields }, context) => {
  if (!context.user) throw new HttpError(401);
  const a = context.user.id;
  const b = await syntheticB();
  const [cardA, cardB] = [await cardFor(a), await cardFor(b)];
  const match = cardA && cardB ? await prisma.cardMatch.findFirst({ where: { cardAId: cardA.id, cardBId: cardB.id } }) : null;
  switch (step) {
    case "publishA": await publish(a, "A"); break;
    case "publishB": await publish(b, "B"); break;
    case "match": {
      if (!cardA || !cardB) throw new HttpError(400, "Publish both cards first");
      const pa = (cardA.fields as { published: Record<string, string> }).published;
      const pb = (cardB.fields as { published: Record<string, string> }).published;
      await prisma.cardMatch.upsert({
        where: { cardAId_cardBId: { cardAId: cardA.id, cardBId: cardB.id } },
        create: { cardAId: cardA.id, cardBId: cardB.id, rationale: matchRationale(pa, pb) },
        update: {},
      });
      break;
    }
    case "acceptA": if (match) await prisma.cardMatch.update({ where: { id: match.id }, data: { aAccepted: true } }); break;
    case "acceptB": if (match) await prisma.cardMatch.update({ where: { id: match.id }, data: { bAccepted: true } }); break;
    case "revealA": case "revealB": {
      if (!match?.aAccepted || !match.bAccepted) throw new HttpError(400, "Both sides must accept first");
      await reveal(step === "revealA" ? a : b, match.id, fields ?? []);
      const [ra, rb] = [await revealApproval(a, match.id), await revealApproval(b, match.id)];
      if (done(ra) && done(rb)) await prisma.cardMatch.update({ where: { id: match.id }, data: { revealedAt: new Date() } });
      break;
    }
    case "reset":
      await prisma.shareCard.deleteMany({ where: { userId: { in: [a, b] }, purpose: PURPOSE } });
      break;
  }
  return { ok: true };
};

export const getMatchDemo: GetMatchDemo<void, SuperJSONValue> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const a = context.user.id;
  const b = await syntheticB();
  const [cardA, cardB] = [await cardFor(a), await cardFor(b)];
  const match = cardA && cardB ? await prisma.cardMatch.findFirst({ where: { cardAId: cardA.id, cardBId: cardB.id } }) : null;
  const [ra, rb] = match ? [await revealApproval(a, match.id), await revealApproval(b, match.id)] : [null, null];
  const pick = (id: Record<string, string>, appr: typeof ra) => {
    const chosen = done(appr) && appr ? ((appr.payload as { fields?: string[] }).fields ?? []) : [];
    return Object.fromEntries(Object.entries(id).filter(([k]) => chosen.includes(k)));
  };
  const revealedA = match?.revealedAt ? pick(identityOf(a, await facts(a), "A"), ra) : null;
  const revealedB = match?.revealedAt ? pick(identityOf(b, await facts(b), "B"), rb) : null;
  return {
    draftA: cardA ? null : (await draftFields(a, "A")).fields,
    cardA: cardA?.fields ?? null,
    cardB: cardB?.fields ?? null,
    match: match && { id: match.id, rationale: match.rationale, aAccepted: match.aAccepted, bAccepted: match.bAccepted, revealedAt: match.revealedAt },
    revealA: ra && { status: ra.status, fields: (ra.payload as { fields?: string[] }).fields },
    revealB: rb && { status: rb.status, fields: (rb.payload as { fields?: string[] }).fields },
    intro: revealedA && revealedB ? introDraft(revealedA, revealedB) : null,
    marker: B_MARKER,
  } as SuperJSONValue;
};
