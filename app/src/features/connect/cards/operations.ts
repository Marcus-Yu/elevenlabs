import { createHash } from "node:crypto";
import type { SuperJSONValue } from "wasp/core/serialization";
import { HttpError, prisma } from "wasp/server";
import type { ShareCard } from "wasp/entities";
import type { GetMatchDemo, RunMatchStep } from "wasp/server/operations";
import { gateway } from "../../../server/gateway";
import { IDENTITY_FIELDS, introDraft, matchRationale, SYNTHETIC_B_FACTS, SYNTHETIC_B_SUMMARY } from "./matchDemo";

// /match: two-user double opt-in. Every card action goes through gateway.execute(); reveals are
// needs_approval and decided with gateway.decideApproval. Nothing is sent anywhere.

const B_MARKER = "Synthetic second user";
const PURPOSE = "match:robotics-engineer";

function syntheticUserId(ownerId: string): string {
  // Authenticated user IDs are UUIDs. The prefix reserves a separate namespace for demo accounts.
  return `match-demo-b-${createHash("sha256").update(ownerId).digest("hex")}`;
}

async function ensureSyntheticUser(id: string) {
  const user = { where: { id }, select: { id: true } } as const;
  if (await prisma.user.findUnique(user)) return;
  try {
    await prisma.user.create({
      data: {
        id,
        profiles: { create: { sourceKind: "oneliner", summary: SYNTHETIC_B_SUMMARY, facts: { create: SYNTHETIC_B_FACTS } } },
      },
    });
  } catch (error) {
    // Another request may have created this same synthetic user while we were checking.
    const duplicate = typeof error === "object" && error && "code" in error && error.code === "P2002";
    if (!duplicate || !await prisma.user.findUnique(user)) throw error;
  }
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
  return prisma.shareCard.findFirst({
    where: { userId, purpose: PURPOSE, status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

type PublishedCard = {
  published: Record<string, string>;
  stripped: string[];
  ruleId: string;
  logReason: string | null;
};

function publishedCard(fields: ShareCard["fields"]): PublishedCard {
  // Old rows still include the raw draft. Send only the public projection.
  const { published, stripped, ruleId, logReason } = fields as PublishedCard;
  return { published, stripped, ruleId, logReason };
}

/** Records the opt-in the clicking user (or the simulated synthetic B) just gave. */
async function ensureConsent(userId: string, kind: "matching" | "identity_reveal") {
  const active = await prisma.consent.findFirst({ where: { userId, kind, scope: PURPOSE, revokedAt: null } });
  if (!active) await prisma.consent.create({ data: { userId, kind, scope: PURPOSE } });
}

async function publish(userId: string, side: "A" | "B") {
  await ensureConsent(userId, "matching");
  const draft = await draftFields(userId, side);
  const card = await prisma.shareCard.create({
    data: { userId, purpose: PURPOSE, fields: {}, expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  const result = await gateway.execute({
    actionType: "card.publish", userId, actor: { kind: "user", id: userId }, origin: "ui", tainted: false,
    payload: { cardId: card.id, ...draft },
  });
  const log = await prisma.actionLog.findUnique({ where: { id: result.logId } });
  // The gateway stripped the private field; keep only what its log says survived.
  const stripped = Object.keys(draft.fields).filter((k) => log?.reason?.includes(`"${k}"`));
  if (result.decision.outcome !== "allow" || !log || (result.decision.ruleId === "card_fields" && stripped.length === 0)) {
    await prisma.shareCard.delete({ where: { id: card.id } });
    throw new HttpError(409, `card.publish ${result.decision.outcome}: ${log?.reason ?? ""}`);
  }
  const published = Object.fromEntries(Object.entries(draft.fields).filter(([k]) => !stripped.includes(k)));
  await prisma.shareCard.updateMany({
    where: { id: card.id, status: "DRAFT" },
    data: { status: "ACTIVE", fields: { published, stripped, ruleId: result.decision.ruleId, logReason: log.reason } },
  });
}

function identityOf(list: { key: string; value: string }[], side: "A" | "B"): Record<string, string> {
  const v = (k: string) => list.find((f) => f.key === k)?.value;
  if (side === "A") return { name: "demo (hiring manager)", company: v("company_name") ?? "", email: "demo@example.invalid" };
  return { name: v("name") ?? "", company: "Independent", email: v("email") ?? "" };
}

async function reveal(userId: string, matchId: string, fields: string[]) {
  const chosen = fields.filter((f) => (IDENTITY_FIELDS as readonly string[]).includes(f));
  if (chosen.length === 0) throw new HttpError(400, "Pick at least one field");
  await ensureConsent(userId, "identity_reveal");
  const result = await gateway.execute({
    actionType: "card.reveal", userId, actor: { kind: "user", id: userId }, origin: "ui", tainted: false,
    payload: { cardMatchId: matchId, fields: chosen },
  });
  if (result.decision.outcome !== "needs_approval") throw new HttpError(409, `card.reveal expected needs_approval, got ${result.decision.outcome}`);
  const approval = await gateway.decideApproval({ approvalId: result.decision.approvalId, userId, decision: "approve", via: "web" });
  if (approval.decision.outcome !== "allow") throw new HttpError(409, "Identity reveal approval failed");
}

async function revealApproval(userId: string, matchId: string) {
  const rows = await prisma.approval.findMany({ where: { userId, actionType: "card.reveal" }, orderBy: { createdAt: "desc" } });
  return rows.find((r) => (r.payload as { cardMatchId?: string })?.cardMatchId === matchId) ?? null;
}

const done = (a: { status: string } | null) => a?.status === "EXECUTED";

type Step = "publishA" | "publishB" | "match" | "acceptA" | "acceptB" | "revealA" | "revealB" | "reset";

export const runMatchStep: RunMatchStep<{ step: Step; fields?: string[] }, { ok: true }> = async ({ step, fields }, context) => {
  if (!context.user) throw new HttpError(401);
  const a = context.user.id;
  const b = syntheticUserId(a);
  const [cardA, cardB] = [await cardFor(a), await cardFor(b)];
  const match = cardA && cardB ? await prisma.cardMatch.findFirst({ where: { cardAId: cardA.id, cardBId: cardB.id } }) : null;
  switch (step) {
    case "publishA": if (!cardA) await publish(a, "A"); break;
    case "publishB": {
      if (!cardA) throw new HttpError(400, "Publish A's card first");
      if (!cardB) {
        await ensureSyntheticUser(b);
        await publish(b, "B");
      }
      break;
    }
    case "match": {
      if (!cardA || !cardB) throw new HttpError(400, "Publish both cards first");
      const pa = publishedCard(cardA.fields).published;
      const pb = publishedCard(cardB.fields).published;
      await prisma.cardMatch.upsert({
        where: { cardAId_cardBId: { cardAId: cardA.id, cardBId: cardB.id } },
        create: { cardAId: cardA.id, cardBId: cardB.id, rationale: matchRationale(pa, pb) },
        update: {},
      });
      break;
    }
    case "acceptA": if (match) await prisma.cardMatch.update({ where: { id: match.id }, data: { aAccepted: true } }); break;
    case "acceptB": if (match?.aAccepted) await prisma.cardMatch.update({ where: { id: match.id }, data: { bAccepted: true } }); break;
    case "revealA": case "revealB": {
      if (!match?.aAccepted || !match.bAccepted) throw new HttpError(400, "Both sides must accept first");
      const userId = step === "revealA" ? a : b;
      if (!done(await revealApproval(userId, match.id))) await reveal(userId, match.id, fields ?? []);
      const [ra, rb] = [await revealApproval(a, match.id), await revealApproval(b, match.id)];
      if (done(ra) && done(rb)) await prisma.cardMatch.update({ where: { id: match.id }, data: { revealedAt: new Date() } });
      break;
    }
    case "reset":
      await prisma.shareCard.updateMany({
        where: { userId: { in: [a, b] }, purpose: PURPOSE, status: { in: ["ACTIVE", "DRAFT"] } },
        data: { status: "REVOKED" },
      });
      break;
  }
  return { ok: true };
};

export const getMatchDemo: GetMatchDemo<void, SuperJSONValue> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const a = context.user.id;
  const b = syntheticUserId(a);
  const [cardA, cardB] = [await cardFor(a), await cardFor(b)];
  const match = cardA && cardB ? await prisma.cardMatch.findFirst({ where: { cardAId: cardA.id, cardBId: cardB.id } }) : null;
  const [ra, rb] = match ? [await revealApproval(a, match.id), await revealApproval(b, match.id)] : [null, null];
  const pick = (id: Record<string, string>, appr: typeof ra) => {
    const chosen = done(appr) && appr ? ((appr.payload as { fields?: string[] }).fields ?? []) : [];
    return Object.fromEntries(Object.entries(id).filter(([k]) => chosen.includes(k)));
  };
  const revealed = match?.revealedAt && match.aAccepted && match.bAccepted && done(ra) && done(rb);
  const revealedA = revealed ? pick(identityOf(await facts(a), "A"), ra) : null;
  const revealedB = revealed ? pick(identityOf(await facts(b), "B"), rb) : null;
  return {
    draftA: cardA ? null : (await draftFields(a, "A")).fields,
    cardA: cardA ? publishedCard(cardA.fields) : null,
    cardB: cardB ? publishedCard(cardB.fields) : null,
    match: match && { id: match.id, rationale: match.rationale, aAccepted: match.aAccepted, bAccepted: match.bAccepted, revealedAt: match.revealedAt },
    revealA: ra && { status: ra.status, fields: (ra.payload as { fields?: string[] }).fields },
    revealB: rb && { status: rb.status, fields: (rb.payload as { fields?: string[] }).fields },
    intro: revealedA && revealedB ? introDraft(revealedA, revealedB) : null,
    marker: B_MARKER,
  } as SuperJSONValue;
};
