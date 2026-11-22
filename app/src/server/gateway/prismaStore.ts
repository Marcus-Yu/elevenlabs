import type { Prisma, PrismaClient } from "@prisma/client";
import type { ApprovalRecord, GatewayStore } from "./store";

/** GatewayStore backed by the app's Prisma client. Constructed in gateway/index.ts. */
export function createPrismaStore(prisma: PrismaClient): GatewayStore {
  const toApproval = (row: Prisma.ApprovalGetPayload<object>): ApprovalRecord => ({
    id: row.id,
    userId: row.userId,
    goalId: row.goalId,
    actionType: row.actionType,
    payload: row.payload,
    payloadHash: row.payloadHash,
    status: row.status,
    decidedVia: row.decidedVia,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
  });

  return {
    async getGoal(goalId) {
      return prisma.goal.findUnique({
        where: { id: goalId },
        select: { id: true, userId: true, status: true, kind: true, autonomy: true, rules: true },
      });
    },
    async getUser(userId) {
      return prisma.user.findUnique({ where: { id: userId }, select: { id: true, phone: true, phoneVerifiedAt: true } });
    },
    async activeConsents(userId) {
      const rows = await prisma.consent.findMany({ where: { userId, revokedAt: null }, select: { kind: true } });
      return rows.map((row) => row.kind);
    },
    async getUserFacts(userId) {
      return prisma.profileFact.findMany({
        where: { profile: { userId } },
        select: { id: true, key: true, value: true, sensitivity: true, allowedPurposes: true },
      });
    },
    async getMatch(matchId) {
      return prisma.match.findUnique({ where: { id: matchId }, select: { id: true, goalId: true, status: true } });
    },
    async findMatchByDomain(goalId, domain) {
      return prisma.match.findFirst({
        where: { goalId, company: { domain: domain.trim().toLowerCase() } },
        select: { id: true, goalId: true, status: true },
      });
    },
    async getDraft(draftId) {
      const draft = await prisma.draft.findUnique({
        where: { id: draftId },
        select: { id: true, matchId: true, version: true, personalizationRefs: true, match: { select: { goalId: true } } },
      });
      if (!draft) return null;
      const refs = await prisma.sourceRef.findMany({
        where: { id: { in: draft.personalizationRefs } },
        select: { id: true, matchId: true, provider: true },
      });
      return {
        id: draft.id,
        matchId: draft.matchId,
        goalId: draft.match.goalId,
        version: draft.version,
        personalizationRefs: draft.personalizationRefs,
        refs,
      };
    },
    async isOptedOut(email) {
      const lower = email.toLowerCase();
      const domain = lower.split("@")[1];
      const hit = await prisma.optOut.findFirst({
        where: { emailOrDomain: { in: domain ? [lower, domain] : [lower] } },
        select: { id: true },
      });
      return hit !== null;
    },
    async countAllowedSends(goalId, since) {
      return prisma.actionLog.count({ where: { goalId, actionType: "outreach.send", decision: "ALLOW", ts: { gte: since } } });
    },
    async hasApprovedSendTo(userId, recipient) {
      const hit = await prisma.approval.findFirst({
        where: {
          userId,
          actionType: "outreach.send",
          status: { in: ["APPROVED", "EXECUTED"] },
          payload: { path: ["to"], equals: recipient },
        },
        select: { id: true },
      });
      return hit !== null;
    },
    async createApproval(data) {
      const row = await prisma.approval.create({
        data: { ...data, payload: data.payload as Prisma.InputJsonValue },
      });
      return toApproval(row);
    },
    async getApproval(approvalId) {
      const row = await prisma.approval.findUnique({ where: { id: approvalId } });
      return row ? toApproval(row) : null;
    },
    async transitionApproval(approvalId, from, patch) {
      const { count } = await prisma.approval.updateMany({ where: { id: approvalId, status: { in: from } }, data: patch });
      return count === 1;
    },
    async writeLog(entry) {
      return prisma.actionLog.create({
        data: { ...entry, actor: entry.actor as Prisma.InputJsonValue },
        select: { id: true },
      });
    },
  };
}
