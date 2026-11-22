import { z } from "zod";
import { prisma } from "wasp/server";
import { MatchSubmitPayload } from "../payloads";
import { defineHandler } from "../types";

const persistedSource = z.object({
  provider: z.enum(["fiber", "ploid", "web"]),
  url: z.url({ protocol: /^https?$/ }),
  claim: z.string().trim().min(1).max(2_000),
  fetchedAt: z.iso.datetime({ offset: true }),
});

function companyDomain(raw: string): string {
  const domain = raw.trim().toLowerCase().replace(/\.$/, "");
  if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) {
    throw new Error("Match company domain is invalid.");
  }
  return domain;
}

export const matchSubmission = defineHandler({
  payload: MatchSubmitPayload,
  async run({ company, rationale, score, runId }, context) {
    if (!context.goalId) throw new Error("A goal is required for match submission.");
    const goalId = context.goalId;
    const domain = companyDomain(company.domain);
    const sources = z.array(persistedSource).min(1).max(50).parse(company.sources);
    const key = (companyId: string) => ({ goalId_companyId: { goalId, companyId } });
    try {
      const match = await prisma.$transaction(async (transaction) => {
        const goal = await transaction.goal.findFirst({
          where: { id: goalId, userId: context.userId, status: "ACTIVE" }, select: { id: true },
        });
        if (!goal) throw new Error("The goal is unavailable.");

        if (context.origin === "watcher") {
          const run = runId && await transaction.watcherRun.findFirst({
            where: { id: runId, goalId, finishedAt: null }, select: { id: true },
          });
          if (!run) throw new Error("A current watcher run is required.");
        }

        const entry = await transaction.company.upsert({
          where: { domain },
          update: {},
          create: { domain, name: company.name, description: company.description },
          select: { id: true },
        });
        return transaction.match.upsert({
          where: key(entry.id),
          update: {},
          create: {
            goalId, companyId: entry.id, rationale, score: score ?? 0,
            sources: { create: sources.map((source) => ({
              ...source, fetchedAt: new Date(source.fetchedAt),
            })) },
          },
          select: { id: true },
        });
      });
      return { data: { accepted: true, matchId: match.id, domain } };
    } catch (error) {
      // Prisma can implement nested upserts as read-then-write. A concurrent
      // retry may win the unique constraint while this transaction rolls back.
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
      const winner = await prisma.match.findFirst({
        where: { goalId, goal: { userId: context.userId, status: "ACTIVE" }, company: { domain } },
        select: { id: true },
      });
      if (!winner) throw error;
      return { data: { accepted: true, matchId: winner.id, domain } };
    }
  },
});
