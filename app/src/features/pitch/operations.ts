import { HttpError, prisma } from "wasp/server";
import type { ListPitchGoals, ScorePitchRun } from "wasp/server/operations";
import { PitchInputSchema, runPitchWorkflow, type PitchInput, type PitchResult } from "./pitch-workflow";
import type { PitchWorkflowPorts } from "./pitch-workflow";
import { panelForRankedMatches } from "./ranked-panel";
import { gateway } from "../../server/gateway";
import { ScoreResponseSchema } from "../../shared/contracts/sim";

const rankedStatus = ["VETTED", "APPROVED", "CONTACTED"] as const;

/** Every score is authorized at time of use, including each live Room segment. */
export const scorePitchThroughGateway: PitchWorkflowPorts["score"] = async (userId, goalId, payload) => {
  const result = await gateway.execute({ actionType: "pitch.score", userId, goalId,
    actor: { kind: "user", id: userId }, origin: "ui", tainted: false, payload });
  if (result.decision.outcome !== "allow") throw new HttpError(403, "Pitch scoring requires an active owned goal and model processing consent.");
  return ScoreResponseSchema.parse(result.data);
};

export const listPitchGoals: ListPitchGoals<void, { id: string; statement: string }[]> = async (_, context) => {
  if (!context.user) throw new HttpError(401, "Sign in to score a pitch.");
  return context.entities.Goal.findMany({
    where: {
      userId: context.user.id,
      status: "ACTIVE",
      OR: [{ panels: { some: {} } }, { matches: { some: { status: { in: [...rankedStatus] } } } }],
    },
    select: { id: true, statement: true },
    orderBy: { createdAt: "desc" },
  });
};

export const scorePitchRun: ScorePitchRun<PitchInput, PitchResult> = async (input, context) => {
  if (!context.user) throw new HttpError(401, "Sign in to score a pitch.");
  if (!PitchInputSchema.safeParse(input).success) throw new HttpError(400, "Enter a goal and a valid pitch.");
  const score = scorePitchThroughGateway;

  return runPitchWorkflow(context.user.id, input, {
    findPanel: (userId, goalId, parentRunId) => findPitchPanel(userId, goalId, parentRunId, "TEXT"),
    score,
    async save(run) {
      return prisma.$transaction(async (transaction) => {
        const panel = await transaction.panel.findFirst({
          where: { id: run.panelId, goalId: run.goalId, goal: { userId: run.userId, status: "ACTIVE" } },
          select: { id: true },
        });
        if (!panel) throw new HttpError(409, "The pitch panel is no longer available.");
        const texts = new Map(run.sentences.map(({ index, text }) => [index, text]));
        const created = await transaction.pitchRun.create({
          data: {
            goalId: run.goalId, panelId: panel.id, parentRunId: run.parentRunId, mode: "TEXT",
            transcript: run.text, engine: run.response.engine, summary: run.response.summary,
            segmentScores: { create: run.response.scores.map((row) => ({
              index: row.segmentIndex, text: texts.get(row.segmentIndex)!, personaId: row.personaId,
              interest: row.interest, objection: row.objection, tier: "MEASURED",
            })) },
          },
          select: { id: true },
        });
        return created.id;
      });
    },
  });
};

export async function findPitchPanel(userId: string, goalId: string, parentRunId: string | undefined, mode: "TEXT" | "ROOM") {
  const ownership = { goalId, goal: { userId, status: "ACTIVE" as const } };
  if (parentRunId) {
    const parent = await prisma.pitchRun.findFirst({
      where: { ...ownership, id: parentRunId, mode },
      select: { panel: { select: { id: true, personas: true } } },
    });
    return parent?.panel ?? null;
  }
  const stored = await prisma.panel.findFirst({
    where: ownership, orderBy: { createdAt: "desc" }, select: { id: true, personas: true },
  });
  if (stored) return stored;
  const matches = await prisma.match.findMany({
    where: { ...ownership, status: { in: [...rankedStatus] } },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    select: {
      company: { select: { domain: true, name: true } },
      sources: { select: { provider: true, claim: true, url: true, fetchedAt: true } },
    },
    take: 40,
  });
  const panel = panelForRankedMatches(matches);
  if (!panel.complete) throw new HttpError(409, "This goal needs more ranked companies with source links.");
  return prisma.panel.create({
    data: { goalId, personas: panel.personas },
    select: { id: true, personas: true },
  });
}
