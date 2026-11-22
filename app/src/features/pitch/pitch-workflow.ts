import { z } from "zod";
import { PersonaSchema, ScoreResponseSchema, type Persona, type ScoreRequest, type ScoreResponse } from "../../shared/contracts/sim";
import type { PitchSentence } from "./pitch-analysis";

export const PitchInputSchema = z.object({
  goalId: z.string().min(1),
  text: z.string().trim().min(1).max(20_000),
  parentRunId: z.string().min(1).optional(),
});
export type PitchInput = z.input<typeof PitchInputSchema>;
export type PitchResult = { runId: string; personas: Persona[]; sentences: PitchSentence[]; response: ScoreResponse };

export type PitchWorkflowPorts = {
  findPanel: (userId: string, goalId: string, parentRunId?: string) => Promise<{ id: string; personas: unknown } | null>;
  score: (userId: string, goalId: string, input: ScoreRequest) => Promise<ScoreResponse>;
  save: (input: {
    userId: string; goalId: string; panelId: string; parentRunId?: string; text: string;
    sentences: PitchSentence[]; response: ScoreResponse;
  }) => Promise<string>;
};

export async function runPitchWorkflow(userId: string, raw: PitchInput, ports: PitchWorkflowPorts): Promise<PitchResult> {
  const input = PitchInputSchema.parse(raw);
  const panel = await ports.findPanel(userId, input.goalId, input.parentRunId);
  if (!panel) throw new Error("An owned pitch panel is required.");
  const personas = z.array(PersonaSchema).min(1).parse(panel.personas);
  const sentences = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(input.text)]
    .map(({ segment }, index) => ({ index, text: segment.trim() }));
  const response = requireScoreMatrix(await ports.score(userId, input.goalId, {
    personas, segments: sentences, tier: "measured",
  }), personas, sentences, "measured");
  const runId = await ports.save({
    userId, goalId: input.goalId, panelId: panel.id, parentRunId: input.parentRunId,
    text: input.text, sentences, response,
  });
  return { runId, personas, sentences, response };
}

export function requireScoreMatrix(raw: unknown, personas: Persona[], sentences: PitchSentence[], tier: ScoreRequest["tier"]) {
  const response = ScoreResponseSchema.parse(raw);
  if (tier === "measured" && (!response.summary || response.engine !== "edsl")) {
    throw new Error("Measured EDSL scores are required.");
  }
  const expected = new Set(personas.flatMap((persona) =>
    sentences.map((sentence) => JSON.stringify([persona.id, sentence.index])),
  ));
  for (const row of response.scores) {
    if (!expected.delete(JSON.stringify([row.personaId, row.segmentIndex]))) {
      throw new Error("Unexpected or duplicate pitch score.");
    }
  }
  if (expected.size) throw new Error("Incomplete pitch scoring response.");
  return response;
}
