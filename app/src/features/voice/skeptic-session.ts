import type { UntrustedText } from "../../shared/contracts/discovery";
import type { Persona, ScoreResponse } from "../../shared/contracts/sim";

/** The caller selects the final score and weak sentence from the same measured run. */
export interface SkepticContext {
  persona: Persona;
  companyType: UntrustedText;
  score: ScoreResponse["scores"][number];
  weakSegment: { index: number; text: UntrustedText };
  objection: UntrustedText;
  pitchSummary: UntrustedText;
}

/** Values remain marked as untrusted, including when passed as JSON dynamic variables. */
export function skepticDynamicVariables(context: SkepticContext) {
  const { persona, companyType, score, weakSegment, objection, pitchSummary } = context;
  if (score.personaId !== persona.id || !Number.isInteger(weakSegment.index) || weakSegment.index < 0 ||
      !score.objection?.trim() || score.objection !== objection.text ||
      !weakSegment.text.text.trim() || !pitchSummary.text.trim() || !companyType.text.trim()) {
    throw new Error("Skeptic context must match a scored objection and weak segment");
  }
  return {
    persona: { label: persona.label, role: persona.role, segment: persona.segment },
    company_type: companyType,
    objection,
    weak_sentence: weakSegment.text,
    pitch_summary: pitchSummary,
  };
}

export interface TranscriptEntry {
  /** Stable ID supplied by the integration for a final turn. */
  id: string;
  role: "user" | "agent";
  content: UntrustedText;
}

/** Store final turns only. Retries with an identical ID and content are idempotent. */
export function appendTranscriptEntry(
  transcript: readonly TranscriptEntry[], entry: TranscriptEntry,
): TranscriptEntry[] {
  if (!entry.id || !entry.content.text.trim()) throw new Error("Transcript entry must have an ID and text");
  const previous = transcript.find((item) => item.id === entry.id);
  if (previous) {
    if (previous.role !== entry.role || previous.content.text !== entry.content.text ||
        previous.content.flagged !== entry.content.flagged ||
        previous.content.source.provider !== entry.content.source.provider ||
        previous.content.source.url !== entry.content.source.url ||
        previous.content.source.fetchedAt !== entry.content.source.fetchedAt ||
        previous.content.source.claim !== entry.content.source.claim) {
      throw new Error("Conflicting transcript entry ID");
    }
    return [...transcript];
  }
  return [...transcript, entry];
}
