import type { Persona, ScoreResponse, ScoreTier } from '../../shared/contracts/sim';

export type PitchSentence = { index: number; text: string };
export type CurvePoint = PitchSentence & { interest: number | null; respondents: number; panelSize: number };
export type SegmentCurve = { segment: string; points: CurvePoint[] };
export type Drop = { index: number; text: string; previousInterest: number; interest: number; amount: number };

// Reject ambiguous inputs instead of silently weighting duplicates or unknown scores.
function validate(personas: Persona[], sentences: PitchSentence[], response: ScoreResponse): void {
  const ids = new Set(personas.map((p) => p.id));
  const indices = new Set(sentences.map((s) => s.index));
  if (ids.size !== personas.length || indices.size !== sentences.length) throw new Error('Duplicate persona or sentence index');
  const seen = new Set<string>();
  for (const score of response.scores) {
    if (!ids.has(score.personaId) || !indices.has(score.segmentIndex)) throw new Error('Score outside requested panel or sentences');
    const key = JSON.stringify([score.personaId, score.segmentIndex]);
    if (seen.has(key)) throw new Error('Duplicate score');
    if (!Number.isInteger(score.interest) || score.interest < 1 || score.interest > 7) throw new Error('Invalid interest');
    seen.add(key);
  }
}

/** Preserve sentence order and expose coverage so missing scores cannot look like a full panel. */
export function segmentCurves(personas: Persona[], sentences: PitchSentence[], response: ScoreResponse): SegmentCurve[] {
  validate(personas, sentences, response);
  const groups = new Map<string, Set<string>>();
  for (const persona of personas) {
    if (!groups.has(persona.segment)) groups.set(persona.segment, new Set());
    groups.get(persona.segment)!.add(persona.id);
  }
  return [...groups].map(([segment, ids]) => ({
    segment,
    points: sentences.map((sentence) => {
      const values = response.scores.filter((s) => ids.has(s.personaId) && s.segmentIndex === sentence.index);
      return { ...sentence, interest: values.length ? values.reduce((sum, s) => sum + s.interest, 0) / values.length : null,
        respondents: values.length, panelSize: ids.size };
    }),
  }));
}

/** Adjacent observed points only; ties go to the earliest sentence in pitch order. */
export function largestDrop(curve: SegmentCurve): Drop | null {
  let best: Drop | null = null;
  for (let i = 1; i < curve.points.length; i++) {
    const previous = curve.points[i - 1];
    const current = curve.points[i];
    if (previous.interest === null || current.interest === null) continue;
    // Changing respondents makes a decline ambiguous, even if both means exist.
    if (previous.respondents !== previous.panelSize || current.respondents !== current.panelSize) continue;
    const amount = previous.interest - current.interest;
    if (amount > 0 && (!best || amount > best.amount)) {
      best = { index: current.index, text: current.text, previousInterest: previous.interest, interest: current.interest, amount };
    }
  }
  return best;
}

/** Select by final interest; ties resolve by persona ID. Missing objections remain missing. */
export function toughestPersona(personas: Persona[], sentences: PitchSentence[], response: ScoreResponse):
  { persona: Persona; interest: number; objection: string | null } | null {
  validate(personas, sentences, response);
  const final = sentences.at(-1);
  if (!final) return null;
  const scores = response.scores.filter((s) => s.segmentIndex === final.index);
  // An absent persona could be the toughest; don't make an unsupported claim.
  if (scores.length !== personas.length || !scores.length) return null;
  scores.sort((a, b) => a.interest - b.interest || (a.personaId < b.personaId ? -1 : a.personaId > b.personaId ? 1 : 0));
  const score = scores[0];
  return { persona: personas.find((p) => p.id === score.personaId)!, interest: score.interest,
    objection: score.objection?.trim() || null };
}

export type MeasuredRun = { personas: Persona[]; tier: ScoreTier; response: ScoreResponse };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Compare measured summaries only for identical persona definitions, regardless of panel order. */
export function compareMeasuredRuns(before: MeasuredRun, after: MeasuredRun):
  { meanInterestDelta: number; meetingRateDelta: number; spreadDelta: number } {
  if (before.tier !== 'measured' || after.tier !== 'measured' || !before.response.summary || !after.response.summary) {
    throw new Error('Both runs require measured summaries');
  }
  const panel = (personas: Persona[]) => {
    if (!personas.length || new Set(personas.map((p) => p.id)).size !== personas.length) throw new Error('Invalid panel');
    return personas.map(canonical).sort();
  };
  if (JSON.stringify(panel(before.personas)) !== JSON.stringify(panel(after.personas))) throw new Error('Panels differ');
  return {
    meanInterestDelta: after.response.summary.meanInterest - before.response.summary.meanInterest,
    meetingRateDelta: after.response.summary.meetingRate - before.response.summary.meetingRate,
    spreadDelta: after.response.summary.spread - before.response.summary.spread,
  };
}
