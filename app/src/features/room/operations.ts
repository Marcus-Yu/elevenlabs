import { z } from "zod";
import { HttpError, prisma } from "wasp/server";
import type { AppendRoomSentence, FinishRoomRun, StartRoomRun } from "wasp/server/operations";
import { PersonaSchema, type Persona, type ScoreResponse } from "../../shared/contracts/sim";
import type { PitchSentence } from "../pitch/pitch-analysis";
import { findPitchPanel, scorePitchThroughGateway } from "../pitch/operations";
import { requireScoreMatrix, type PitchResult } from "../pitch/pitch-workflow";

const runIdSchema = z.string().min(1);
const startSchema = z.object({ goalId: runIdSchema, parentRunId: runIdSchema.optional() });
const appendSchema = z.object({
  runId: runIdSchema,
  expectedIndex: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(2_000),
});

function requireUser(user: { id: string } | null | undefined) {
  if (!user) throw new HttpError(401, "Sign in to use The Room.");
  return user.id;
}

export const startRoomRun: StartRoomRun<z.input<typeof startSchema>, { runId: string; personas: Persona[] }> =
  async (raw, context) => {
    const userId = requireUser(context.user);
    const input = startSchema.parse(raw);
    const panel = await findPitchPanel(userId, input.goalId, input.parentRunId, "ROOM");
    if (!panel) throw new HttpError(404, "An owned audience panel is required.");
    const personas = z.array(PersonaSchema).min(1).parse(panel.personas);
    const run = await prisma.pitchRun.create({
      data: { goalId: input.goalId, panelId: panel.id, parentRunId: input.parentRunId, mode: "ROOM" },
      select: { id: true },
    });
    return { runId: run.id, personas };
  };

async function readRoomRun(userId: string, runId: string) {
  const run = await prisma.pitchRun.findFirst({
    where: { id: runId, mode: "ROOM", goal: { userId, status: "ACTIVE" } },
    select: {
      id: true, goalId: true, updatedAt: true, engine: true,
      panel: { select: { personas: true } },
      segmentScores: { where: { tier: "LIVE" }, orderBy: { index: "asc" }, select: { index: true, text: true } },
    },
  });
  if (!run?.panel) throw new HttpError(404, "Room run not found.");
  if (run.engine) throw new HttpError(409, "This Room run is already finished.");
  const personas = z.array(PersonaSchema).min(1).parse(run.panel.personas);
  const sentences = [...new Map(run.segmentScores.map((row) => [row.index, row])).values()];
  return { ...run, personas, sentences };
}

function scoreWrites(response: ScoreResponse, sentences: PitchSentence[], tier: "LIVE" | "MEASURED") {
  const texts = new Map(sentences.map(({ index, text }) => [index, text]));
  return response.scores.map((row) => {
    const text = texts.get(row.segmentIndex);
    if (text === undefined) throw new HttpError(502, "The scoring service returned an invalid sentence.");
    return {
      index: row.segmentIndex, text, personaId: row.personaId, interest: row.interest, objection: row.objection, tier,
    };
  });
}

export const appendRoomSentence: AppendRoomSentence<z.input<typeof appendSchema>, {
  sentence: PitchSentence; response: ScoreResponse;
}> = async (raw, context) => {
  const userId = requireUser(context.user);
  const input = appendSchema.parse(raw);
  const score = scorePitchThroughGateway;
  const run = await readRoomRun(userId, input.runId);
  if (input.expectedIndex !== run.sentences.length) {
    throw new HttpError(409, "The Room transcript has changed. Start a new run to continue.");
  }
  const sentence = { index: input.expectedIndex, text: input.text };
  const transcript = [...run.sentences, sentence].map(({ text }) => text).join(" ");
  if (transcript.length > 20_000) throw new HttpError(400, "The pitch is too long.");
  const response = requireScoreMatrix(await score(userId, run.goalId, {
    personas: run.personas, segments: [{ index: sentence.index, text: transcript }], tier: "live",
  }), run.personas, [sentence], "live");
  const rows = scoreWrites(response, [sentence], "LIVE");

  await prisma.$transaction(async (transaction) => {
    const changed = await transaction.pitchRun.updateMany({
      where: { id: run.id, updatedAt: run.updatedAt, engine: null, goal: { userId, status: "ACTIVE" } },
      data: { transcript },
    });
    if (changed.count !== 1) throw new HttpError(409, "The Room transcript has changed.");
    await transaction.segmentScore.createMany({ data: rows.map((row) => ({ ...row, runId: run.id })) });
  });
  return { sentence, response };
};

export const finishRoomRun: FinishRoomRun<{ runId: string }, PitchResult> = async (raw, context) => {
  const userId = requireUser(context.user);
  const runId = runIdSchema.parse(raw?.runId);
  const score = scorePitchThroughGateway;
  const run = await readRoomRun(userId, runId);
  if (!run.sentences.length) throw new HttpError(400, "Add a sentence before finishing.");
  const response = requireScoreMatrix(await score(userId, run.goalId, {
    personas: run.personas, segments: run.sentences, tier: "measured",
  }), run.personas, run.sentences, "measured");
  const rows = scoreWrites(response, run.sentences, "MEASURED");

  await prisma.$transaction(async (transaction) => {
    const changed = await transaction.pitchRun.updateMany({
      where: { id: run.id, updatedAt: run.updatedAt, engine: null, goal: { userId, status: "ACTIVE" } },
      data: { engine: response.engine, summary: response.summary },
    });
    if (changed.count !== 1) throw new HttpError(409, "The Room run changed before it could be saved.");
    await transaction.segmentScore.createMany({ data: rows.map((row) => ({ ...row, runId: run.id })) });
  });
  return { runId, personas: run.personas, sentences: run.sentences, response };
};
