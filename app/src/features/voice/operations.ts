import { HttpError, prisma } from "wasp/server";
import { z } from "zod";
import type { SpeakBriefing } from "wasp/server/operations";
import { gateway } from "../../server/gateway";
import { HireCriteria } from "../matches/candidates";
import { getHireRuns } from "../matches/operations";

type Context = { user?: { id: string } | null };

function owner(context: Context) {
  if (!context.user?.id) throw new HttpError(401);
  return context.user.id;
}

export async function createScribeToken(_args: void, context: Context) {
  const userId = owner(context);
  const result = await gateway.execute({
    actionType: "voice.scribe_token",
    userId,
    actor: { kind: "user", id: userId },
    origin: "voice",
    tainted: false,
    payload: {},
  });
  if (result.decision.outcome !== "allow") throw new HttpError(403, "Voice transcription requires model processing consent.");
  return result.data as { token: string };
}

const goalInput = z.object({ goalId: z.string().trim().min(1).max(160) }).strict();

export const speakBriefing: SpeakBriefing<{ goalId: string }, { text: string; audio: string }> = async (args, context) => {
  const userId = owner(context);
  const input = goalInput.safeParse(args);
  if (!input.success) throw new HttpError(400, "Invalid hiring goal.");
  const { goalId } = input.data;
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId, kind: "hire", status: "ACTIVE" },
    select: { icp: true },
  });
  if (!goal) throw new HttpError(404, "Hiring goal not found.");

  const icp = goal.icp as { hireCriteria?: unknown } | null;
  const now = new Date();
  const ownCard = { goalId, userId, status: "ACTIVE", expiresAt: { gt: now } } as const;
  const otherCard = { status: "ACTIVE", expiresAt: { gt: now }, userId: { not: userId } } as const;
  const [runs, activeMatches, introductions] = await Promise.all([
    HireCriteria.safeParse(icp?.hireCriteria).success
      ? getHireRuns({ goalId }, context)
      : [],
    prisma.cardMatch.groupBy({
      by: ["aAccepted", "bAccepted"],
      where: { revealedAt: null, OR: [{ cardA: ownCard, cardB: otherCard }, { cardA: otherCard, cardB: ownCard }] },
      _count: { _all: true },
    }),
    prisma.cardMatch.count({
      where: { revealedAt: { not: null }, OR: [{ cardA: { goalId, userId } }, { cardB: { goalId, userId } }] },
    }),
  ]);

  const latest = runs.at(-1);
  const reviewedCount = latest?.topK.length ?? 0;
  const shortlist = reviewedCount > 0 && latest
    ? `Your latest shortlist has ${reviewedCount} ranked ${reviewedCount === 1 ? "candidate" : "candidates"}. ${latest.evaluation.fitAtK} ${latest.evaluation.fitAtK === 1 ? "meets" : "meet"} the required criteria.`
    : "There are no candidates in your saved hiring shortlist.";
  const mutual = activeMatches.find(group => group.aAccepted && group.bAccepted)?._count._all ?? 0;
  const waiting = activeMatches.reduce((total, group) => total + group._count._all, 0) - mutual;
  const text = `${shortlist} Candidate introductions for this goal. Waiting for both sides to opt in: ${waiting}. Both sides opted in, reveal pending: ${mutual}. Introductions revealed: ${introductions}.`;
  const result = await gateway.execute({
    actionType: "voice.speak",
    userId,
    goalId,
    actor: { kind: "user", id: userId },
    origin: "voice",
    tainted: false,
    payload: { text },
  });
  if (result.decision.outcome !== "allow") throw new HttpError(403, "Spoken briefings require model processing consent.");
  return { text, audio: (result.data as { audio: string }).audio };
};
