import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Persona, ScoreResponse } from '../../shared/contracts/sim';
import type { PitchGoal, PitchResult } from '../pitch/PitchWorkspace';
import { compareMeasuredRuns, segmentCurves, toughestPersona, type PitchSentence } from '../pitch/pitch-analysis';
import { InterestChart } from './InterestChart';

/** Provider-agnostic interface. Append accepts a single committed sentence. */
export type RoomTransport = {
  start(input: { goalId: string; parentRunId?: string }): Promise<{ runId: string; personas: Persona[] }>;
  append(input: { runId: string; text: string; expectedIndex: number }): Promise<{ sentence: PitchSentence; response: ScoreResponse }>;
  finish(input: { runId: string }): Promise<PitchResult>;
};
type ActiveRoom = { runId: string; personas: Persona[]; sentences: PitchSentence[]; response: ScoreResponse | null };
export type RoomWorkspaceProps = { goals: PitchGoal[]; loadingGoals?: boolean; goalsError?: string; transport: RoomTransport };

export function RoomWorkspace({ goals, loadingGoals = false, goalsError, transport }: RoomWorkspaceProps) {
  const [goalId, setGoalId] = useState('');
  const [room, setRoom] = useState<ActiveRoom | null>(null);
  const [first, setFirst] = useState<PitchResult | null>(null);
  const [second, setSecond] = useState<PitchResult | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const withLock = async (work: (current: number) => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    const current = generation.current;
    setBusy(true); setError('');
    try { await work(current); }
    catch (cause) { if (generation.current === current) setError(cause instanceof Error ? cause.message : 'The Room request failed.'); }
    finally { lock.current = false; if (generation.current === current) setBusy(false); }
  };
  async function start(linked: boolean) {
    if (room || !goals.some((g) => g.id === goalId) || (linked && !first)) return;
    await withLock(async (current) => {
      const started = await transport.start({ goalId, ...(linked && first ? { parentRunId: first.runId } : {}) });
      if (generation.current !== current) return;
      if (!started.runId || !started.personas.length) throw new Error('The Room could not start without a panel.');
      if (!linked) { setFirst(null); setSecond(null); }
      else setSecond(null);
      setRoom({ ...started, sentences: [], response: null });
    });
  }
  async function commit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!room || !text) return;
    await withLock(async (current) => {
      const result = await transport.append({ runId: room.runId, text, expectedIndex: room.sentences.length });
      if (generation.current !== current) return;
      if (result.sentence.index !== room.sentences.length || result.sentence.text !== text) throw new Error('Unexpected committed sentence from server.');
      const sentences = [...room.sentences, result.sentence];
      const response: ScoreResponse = { ...result.response, scores: [...(room.response?.scores ?? []), ...result.response.scores] };
      segmentCurves(room.personas, sentences, response);
      setRoom({ ...room, sentences, response });
      setDraft('');
    });
  }
  async function stop() {
    if (!room || !room.sentences.length || draft.trim()) return;
    await withLock(async (current) => {
      const result = await transport.finish({ runId: room.runId });
      if (generation.current !== current) return;
      if (result.runId !== room.runId || !result.response.summary) throw new Error('The measured result is incomplete or belongs to another run.');
      segmentCurves(result.personas, result.sentences, result.response);
      if (JSON.stringify(result.sentences) !== JSON.stringify(room.sentences)) throw new Error('The measured transcript differs from this run.');
      compareMeasuredRuns({ personas: room.personas, tier: 'measured', response: result.response },
        { personas: result.personas, tier: 'measured', response: result.response });
      if (first) {
        compareMeasuredRuns({ personas: first.personas, tier: 'measured', response: first.response },
          { personas: result.personas, tier: 'measured', response: result.response });
        setSecond(result);
      } else setFirst(result);
      setRoom(null);
    });
  }
  const measured = second ?? first;
  const delta = first && second ? compareMeasuredRuns({ personas: first.personas, tier: 'measured', response: first.response },
    { personas: second.personas, tier: 'measured', response: second.response }) : null;
  const toughest = measured ? toughestPersona(measured.personas, measured.sentences, measured.response) : null;
  return <section className="space-y-4">
    <header><h1 className="text-2xl font-semibold">The Room</h1><p>Feedback comes from a simulated panel.</p><p>Enter pitch sentences below. Microphone transcription is unavailable.</p></header>
    {goalsError && <p role="alert">{goalsError}</p>}
    {!loadingGoals && !goalsError && !goals.length && <p>Create a goal with sourced matches before starting.</p>}
    <div><label htmlFor="room-goal">Goal</label><br /><select id="room-goal" value={goalId} disabled={loadingGoals || !!goalsError || busy || !!room || !goals.length}
      onChange={(e) => { setGoalId(e.target.value); setFirst(null); setSecond(null); setError(''); }}>
      <option value="">{loadingGoals ? 'Loading goals…' : 'Select a goal'}</option>
      {goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.statement}</option>)}
    </select></div>
    {!room && <div className="space-x-2"><button type="button" disabled={busy || loadingGoals || !!goalsError || !goals.some((g) => g.id === goalId)} onClick={() => void start(false)}>Start new run</button>
      <button type="button" disabled={busy || !first} onClick={() => void start(true)}>Start linked second run</button></div>}
    {room && <>
      <p>Run active · {room.personas.length} simulated personas</p>
      <form onSubmit={(e) => void commit(e)} className="space-y-2"><label htmlFor="room-sentence">Committed sentence</label><br />
        <textarea id="room-sentence" value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2_000} className="w-full border p-2" />
        <button type="submit" disabled={busy || !draft.trim()}>Score sentence</button>{' '}
        <button type="button" disabled={busy || !room.sentences.length || !!draft.trim()} onClick={() => void stop()}>Stop and measure</button>
        {draft.trim() && <p>Score or clear the current sentence before stopping.</p>}
      </form>
      <h2 className="font-semibold">Transcript</h2><ol className="list-decimal pl-5">{room.sentences.map((s) => <li key={s.index}>{s.text}</li>)}</ol>
      {room.response && <><p>Live simulation · engine: {room.response.engine}</p><InterestChart sentences={room.sentences} curves={segmentCurves(room.personas, room.sentences, room.response)} /></>}
    </>}
    {busy && <p role="status">Scoring in progress…</p>}{error && <p role="alert">{error}</p>}
    {measured?.response.summary && <section aria-label="Measured result"><h2 className="font-semibold">Measured simulated result</h2>
      <p>{measured.personas.length} personas · engine: {measured.response.engine} · mean interest {measured.response.summary.meanInterest.toFixed(2)} / 7 · spread {measured.response.summary.spread.toFixed(2)} · meeting rate {(measured.response.summary.meetingRate * 100).toFixed(1)}%</p>
      <InterestChart sentences={measured.sentences} curves={segmentCurves(measured.personas, measured.sentences, measured.response)} />
      {toughest && <p>Toughest simulated persona: {toughest.persona.label}, {toughest.interest}/7. {toughest.objection ? `Objection: ${toughest.objection}` : 'No objection returned.'}</p>}
      <ul>{measured.response.summary.topObjections.map((o, i) => <li key={`${o.segment}-${i}`}>{o.segment}: {o.text}</li>)}</ul>
    </section>}
    {delta && first && <section aria-label="Run comparison">
      <h2 className="font-semibold">Change from first run</h2>
      <p>Interest {delta.meanInterestDelta >= 0 ? '+' : ''}{delta.meanInterestDelta.toFixed(2)} · meeting rate {delta.meetingRateDelta >= 0 ? '+' : ''}{(delta.meetingRateDelta * 100).toFixed(1)} percentage points.</p>
      <h3>First run</h3>
      <InterestChart sentences={first.sentences} curves={segmentCurves(first.personas, first.sentences, first.response)} />
    </section>}
  </section>;
}
