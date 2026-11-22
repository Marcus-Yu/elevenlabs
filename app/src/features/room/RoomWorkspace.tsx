import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Persona, ScoreResponse } from '../../shared/contracts/sim';
import type { PitchGoal, PitchResult } from '../pitch/PitchWorkspace';
import { compareMeasuredRuns, segmentCurves, toughestPersona, type PitchSentence } from '../pitch/pitch-analysis';
import { InterestChart } from './InterestChart';
import { RoomMicrophone } from './RoomMicrophone';

/** Provider-agnostic interface. Append accepts a single committed sentence. */
export type RoomTransport = {
  start(input: { goalId: string; parentRunId?: string }): Promise<{ runId: string; personas: Persona[] }>;
  append(input: { runId: string; text: string; expectedIndex: number }): Promise<{ sentence: PitchSentence; response: ScoreResponse }>;
  finish(input: { runId: string }): Promise<PitchResult>;
};
type ActiveRoom = { runId: string; personas: Persona[]; sentences: PitchSentence[]; response: ScoreResponse | null };
export type RoomWorkspaceProps = { goals: PitchGoal[]; loadingGoals?: boolean; goalsError?: string; consentGranted?: boolean; transport: RoomTransport };

export function RoomWorkspace({ goals, loadingGoals = false, goalsError, consentGranted = false, transport }: RoomWorkspaceProps) {
  const [goalId, setGoalId] = useState('');
  const [room, setRoom] = useState<ActiveRoom | null>(null);
  const roomRef = useRef<ActiveRoom | null>(null);
  const pending = useRef<string[]>([]);
  const processing = useRef(false);
  const consentRef = useRef(consentGranted);
  consentRef.current = consentGranted;
  const [queued, setQueued] = useState(0);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [queueFailed, setQueueFailed] = useState(false);
  const [first, setFirst] = useState<PitchResult | null>(null);
  const [second, setSecond] = useState<PitchResult | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const onMicrophoneActive = useCallback((active: boolean) => setMicrophoneActive(active), []);
  function updateRoom(next: ActiveRoom | null) { roomRef.current = next; setRoom(next); }
  async function drain() {
    if (processing.current) return;
    processing.current = true;
    const current = generation.current;
    setQueueFailed(false);
    try {
      while (pending.current.length && generation.current === current) {
        if (!consentRef.current) throw new Error('Model processing consent is required to score spoken sentences.');
        const active = roomRef.current;
        if (!active) throw new Error('The Room run is no longer active.');
        const text = pending.current[0];
        const result = await transport.append({ runId: active.runId, text, expectedIndex: active.sentences.length });
        if (generation.current !== current) return;
        if (result.sentence.index !== active.sentences.length || result.sentence.text !== text) throw new Error('Unexpected committed sentence from server.');
        const sentences = [...active.sentences, result.sentence];
        const response: ScoreResponse = { ...result.response, scores: [...(active.response?.scores ?? []), ...result.response.scores] };
        segmentCurves(active.personas, sentences, response);
        updateRoom({ ...active, sentences, response });
        pending.current.shift(); setQueued(pending.current.length);
      }
    } catch (cause) {
      if (generation.current === current) { setQueueFailed(true); setError(cause instanceof Error ? cause.message : 'Could not score the spoken sentence.'); }
    } finally { processing.current = false; }
  }
  function queueSentence(text: string) {
    pending.current.push(text); setQueued(pending.current.length); void drain();
  }
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
      updateRoom({ ...started, sentences: [], response: null });
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
      updateRoom({ ...room, sentences, response });
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
      updateRoom(null);
    });
  }
  const measured = second ?? first;
  const delta = first && second ? compareMeasuredRuns({ personas: first.personas, tier: 'measured', response: first.response },
    { personas: second.personas, tier: 'measured', response: second.response }) : null;
  const toughest = measured ? toughestPersona(measured.personas, measured.sentences, measured.response) : null;
  return <section className="space-y-4">
    <header><h1 className="text-2xl font-semibold">The Room</h1><p>Feedback comes from a simulated panel.</p><p>Speak or enter pitch sentences below.</p></header>
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
      <RoomMicrophone consentGranted={consentGranted} disabled={busy || !!draft.trim() || queued > 0} onSentence={queueSentence} onActiveChange={onMicrophoneActive} />
      {queued > 0 && <><p role="status">{queued} spoken sentence(s) waiting to be scored.</p><ol aria-label="Unscored spoken sentences">{pending.current.map((text, index) => <li key={index}>{text}</li>)}</ol></>}
      {queueFailed && <button type="button" disabled={!consentGranted} onClick={() => void drain()}>Retry spoken sentences</button>}
      <form onSubmit={(e) => void commit(e)} className="space-y-2"><label htmlFor="room-sentence">Committed sentence</label><br />
        <textarea id="room-sentence" value={draft} disabled={busy || microphoneActive || queued > 0} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2_000} className="w-full border p-2" />
        <button type="submit" disabled={busy || microphoneActive || queued > 0 || !draft.trim()}>Score sentence</button>{' '}
        <button type="button" disabled={busy || microphoneActive || queued > 0 || !room.sentences.length || !!draft.trim()} onClick={() => void stop()}>Stop and measure</button>
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
