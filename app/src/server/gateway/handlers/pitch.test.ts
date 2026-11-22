import { describe, expect, it, vi } from 'vitest';
import type { ScoreRequest, ScoreResponse } from '../../../shared/contracts/sim';
import type { HttpClient, HttpResponse } from '../../adapters/http';
import { createWorld, GOAL, OTHER_USER, request, USER } from '../testing/world';
import { createPitchHandlers } from './pitch';

const input: ScoreRequest = { tier: 'live', personas: [{ id: 'p', segment: 'ops', label: 'Buyer',
  companyDomain: 'example.com', role: 'Lead', traits: {}, sources: [] }],
  segments: [{ index: 0, text: 'Private synthetic pitch text' }] };
const score: ScoreResponse = { engine: 'edsl', latencyMs: 1, scores: [{ personaId: 'p', segmentIndex: 0, interest: 4 }] };
function setup(response: unknown = score, mode: HttpClient['mode'] = 'live') {
  const send = vi.fn(async () => ({ body: response, status: 200, ok: true, mode }));
  const client: HttpClient = { mode, request: async <T>() => await send() as HttpResponse<T> };
  return { ...createWorld({ handlers: createPitchHandlers(client, 'http://localhost:8000') }), send };
}

describe('pitch scoring gateway', () => {
  it('allows an owned, consented score and never logs its payload', async () => {
    const world = setup();
    const result = await world.gateway.execute(request('pitch.score', input));
    expect(result.decision.outcome).toBe('allow');
    expect(result.data).toEqual(score);
    expect(world.send).toHaveBeenCalledOnce();
    expect(world.store.logs[0]).toMatchObject({ actionType: 'pitch.score', inputSummary: null });
    expect(JSON.stringify(world.store.logs)).not.toContain(input.segments[0].text);
  });
  it('denies absent consent, missing goal, and another user before sending', async () => {
    for (const scenario of ['consent', 'missing', 'foreign'] as const) {
      const world = setup();
      if (scenario === 'consent') world.store.consents.set(USER, []);
      const result = await world.gateway.execute(request('pitch.score', input,
        scenario === 'missing' ? { goalId: undefined } : scenario === 'foreign' ? { userId: OTHER_USER } : { goalId: GOAL }));
      expect(result.decision.outcome).toBe('deny');
      expect(world.send).not.toHaveBeenCalled();
      expect(world.store.logs[0].inputSummary).toBeNull();
    }
  });
  it('rejects incomplete scores and never logs private provider errors', async () => {
    const world = setup({ ...score, scores: [] });
    await expect(world.gateway.execute(request('pitch.score', input))).rejects.toThrow();
    expect(world.store.logs[0]).toMatchObject({ inputSummary: null, reason: 'handler_error: request failed' });
    expect(JSON.stringify(world.store.logs)).not.toContain(input.segments[0].text);
  });
  it('does not record pitch text in fixtures', async () => {
    const world = setup(score, 'record');
    await expect(world.gateway.execute(request('pitch.score', input))).rejects.toThrow();
    expect(world.send).not.toHaveBeenCalled();
  });
});
