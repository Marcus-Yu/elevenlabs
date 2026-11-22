import { z } from "zod";
import { SourceRefSchema } from "./discovery";

// Sim service contract: HTTP JSON between the app and sim/ (docs/IMPLEMENTATION_PLAN.md §7).
// Endpoints: GET /health, POST /score (ScoreRequest -> ScoreResponse).
// Personas are role archetypes at real companies, never a simulation of a named person.

/** Interest is an integer from 1 to 7. */
export const InterestSchema = z.number().int().min(1).max(7);

export const PersonaSchema = z.object({
  id: z.string().min(1),
  segment: z.string(),
  label: z.string(),
  companyDomain: z.string(),
  role: z.string(),
  traits: z.record(z.string(), z.string()),
  sources: z.array(SourceRefSchema),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const ScoreTierSchema = z.enum(["live", "measured"]);
export type ScoreTier = z.infer<typeof ScoreTierSchema>;

export const ScoreRequestSchema = z.object({
  personas: z.array(PersonaSchema),
  segments: z.array(z.object({ index: z.number().int().min(0), text: z.string() })),
  tier: ScoreTierSchema,
  iterations: z.number().int().min(1).optional(),
});
export type ScoreRequest = z.infer<typeof ScoreRequestSchema>;

export const ScoreResponseSchema = z.object({
  engine: z.enum(["edsl", "direct"]),
  latencyMs: z.number().min(0),
  scores: z.array(
    z.object({
      personaId: z.string(),
      segmentIndex: z.number().int().min(0),
      interest: InterestSchema,
      objection: z.string().optional(),
    }),
  ),
  summary: z
    .object({
      meanInterest: z.number(),
      spread: z.number(),
      meetingRate: z.number(),
      topObjections: z.array(z.object({ segment: z.string(), text: z.string() })),
    })
    .optional(),
});
export type ScoreResponse = z.infer<typeof ScoreResponseSchema>;
