import { describe, expect, it } from 'vitest';
import type { Persona, ScoreResponse } from '../../shared/contracts/sim';
import { compareMeasuredRuns, largestDrop, segmentCurves, toughestPersona } from './pitch-analysis';

const persona = (id: string, segment = 'ops'): Persona => ({ id, segment, label: id, companyDomain: `${id}.example`, role: 'Operations leader', traits: {}, sources: [] });
const panel = [persona('a'), persona('b'), persona('c', 'finance')];
const sentences = [{ index: 0, text: 'First.' }, { index: 1, text: 'Second.' }, { index: 2, text: 'Third.' }];
const response: ScoreResponse = { engine: 'edsl', latencyMs: 2, scores: [
  { personaId: 'a', segmentIndex: 0, interest: 6 }, { personaId: 'b', segmentIndex: 0, interest: 4 },
  { personaId: 'a', segmentIndex: 1, interest: 3 }, { personaId: 'b', segmentIndex: 1, interest: 3 },
  { personaId: 'a', segmentIndex: 2, interest: 1, objection: 'Too costly' }, { personaId: 'b', segmentIndex: 2, interest: 1, objection: 'Other' },
  { personaId: 'c', segmentIndex: 2, interest: 4, objection: 'Risk' },
], summary: { meanInterest: 3, spread: 1, meetingRate: .5, topObjections: [] } };

describe('pitch analysis', () => {
  it('averages segments and reports coverage; chooses the first equally large drop', () => {
    const curves = segmentCurves(panel, sentences, response);
    expect(curves[0].points.map((p) => p.interest)).toEqual([5, 3, 1]);
    expect(curves[1].points.map((p) => [p.interest, p.respondents, p.panelSize])).toEqual([[null, 0, 1], [null, 0, 1], [4, 1, 1]]);
    expect(largestDrop(curves[0])).toEqual({ index: 1, text: 'Second.', previousInterest: 5, interest: 3, amount: 2 });
    expect(largestDrop(curves[1])).toBeNull();
  });
  it('does not infer drops from partial panels or across missing points', () => {
    const partial = { ...response, scores: response.scores.filter((s) => !(s.personaId === 'b' && s.segmentIndex === 1)) };
    expect(largestDrop(segmentCurves(panel, sentences, partial)[0])).toBeNull();
    const increasing = { ...response, scores: response.scores.map((s) => ({ ...s, interest: 4 })) };
    expect(largestDrop(segmentCurves(panel, sentences, increasing)[0])).toBeNull();
  });
  it('selects final toughest persona and its actual objection, with deterministic ties', () => {
    expect(toughestPersona(panel, sentences, response)).toEqual({ persona: panel[0], interest: 1, objection: 'Too costly' });
    const missing = { ...response, scores: response.scores.filter((s) => !(s.personaId === 'c' && s.segmentIndex === 2)) };
    expect(toughestPersona(panel, sentences, missing)).toBeNull();
  });
  it('rejects duplicate or unrelated scores', () => {
    expect(() => segmentCurves(panel, sentences, { ...response, scores: [...response.scores, response.scores[0]] })).toThrow();
    expect(() => segmentCurves(panel, sentences, { ...response, scores: [{ personaId: 'x', segmentIndex: 0, interest: 1 }] })).toThrow();
  });
  it('compares only measured runs with identical panels', () => {
    const before = { personas: panel, tier: 'measured' as const, response };
    const after = { ...before, personas: [...panel].reverse(), response: { ...response, summary: { ...response.summary!, meanInterest: 4, meetingRate: .75, spread: .5 } } };
    expect(compareMeasuredRuns(before, after)).toEqual({ meanInterestDelta: 1, meetingRateDelta: .25, spreadDelta: -.5 });
    expect(() => compareMeasuredRuns(before, { ...after, tier: 'live' })).toThrow();
    expect(() => compareMeasuredRuns(before, { ...after, personas: [persona('a')] })).toThrow();
    expect(() => compareMeasuredRuns(before, { ...after, personas: panel.map((p) => p.id === 'a' ? { ...p, role: 'changed' } : p) })).toThrow();
  });
});
