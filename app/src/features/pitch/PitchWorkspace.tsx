import { useState, type FormEvent } from 'react';
import type { Persona, ScoreResponse } from '../../shared/contracts/sim';
import { InterestChart } from '../room/InterestChart';
import { compareMeasuredRuns, largestDrop, segmentCurves, toughestPersona, type PitchSentence } from './pitch-analysis';

export type PitchGoal = { id: string; statement: string };
export type PitchResult = { runId: string; personas: Persona[]; sentences: PitchSentence[]; response: ScoreResponse };
export type PitchScorer = (input: { goalId: string; text: string; parentRunId?: string }) => Promise<PitchResult>;
export type PitchWorkspaceProps = { goals: PitchGoal[]; loadingGoals?: boolean; goalsError?: string; score: PitchScorer };

function RunSummary({ run, heading }: { run: PitchResult; heading: string }) {
  const { response, personas, sentences } = run;
  const curves = segmentCurves(personas, sentences, response);
  const toughest = toughestPersona(personas, sentences, response);
  const summary = response.summary;
  return <section className="space-y-3" aria-label={heading}>
    <h3 className="text-lg font-semibold">{heading}</h3>
    <p>Simulated · {personas.length} personas · Engine: {response.engine} · {response.latencyMs} ms</p>
    {summary ? <>
      <p>Mean interest: {summary.meanInterest.toFixed(2)} / 7 · Spread: {summary.spread.toFixed(2)} · Meeting rate: {(summary.meetingRate * 100).toFixed(1)}%</p>
      <h4 className="font-semibold">Top objections</h4>
      {summary.topObjections.length ? <ul className="list-disc pl-5">{summary.topObjections.map((o, i) => <li key={`${o.segment}-${i}`}>{o.segment}: {o.text}</li>)}</ul> : <p>No objections returned.</p>}
    </> : <p>Measured summary unavailable.</p>}
    <InterestChart sentences={sentences} curves={curves} />
    <ul className="list-disc pl-5">{curves.map((curve) => {
      const drop = largestDrop(curve);
      return <li key={curve.segment}>{curve.segment}: {drop ? <>largest decline {drop.amount.toFixed(2)} at “{drop.text}”</> : 'no complete adjacent decline identified'}</li>;
    })}</ul>
    {toughest && <p>Toughest simulated persona: {toughest.persona.label}, interest {toughest.interest}/7. {toughest.objection ? `Objection: ${toughest.objection}` : 'No objection returned.'}</p>}
  </section>;
}

/** Inject score and goals to test the workflow without a provider or Wasp runtime. */
export function PitchWorkspace({ goals, loadingGoals = false, goalsError, score }: PitchWorkspaceProps) {
  const [goalId, setGoalId] = useState('');
  const [text, setText] = useState('');
  const [baseline, setBaseline] = useState<PitchResult | null>(null);
  const [revision, setRevision] = useState<PitchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canScore = !loadingGoals && !goalsError && !busy && goals.some((goal) => goal.id === goalId) && Boolean(text.trim());

  async function submit(event: FormEvent, compare: boolean) {
    event.preventDefault();
    if (!canScore || (compare && !baseline)) return;
    setBusy(true);
    setError('');
    try {
      const run = await score({ goalId, text: text.trim(), ...(compare && baseline ? { parentRunId: baseline.runId } : {}) });
      if (!run.response.summary) throw new Error('The measured run did not include a summary.');
      // Validate scores before updating the screen, and reject inconsistent panels.
      segmentCurves(run.personas, run.sentences, run.response);
      if (compare && baseline) {
        compareMeasuredRuns({ personas: baseline.personas, tier: 'measured', response: baseline.response },
          { personas: run.personas, tier: 'measured', response: run.response });
        setRevision(run);
      } else {
        setBaseline(run);
        setRevision(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pitch scoring failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const delta = baseline && revision ? compareMeasuredRuns(
    { personas: baseline.personas, tier: 'measured', response: baseline.response },
    { personas: revision.personas, tier: 'measured', response: revision.response },
  ) : null;
  return <section className="space-y-6">
    <header><h1 className="text-2xl font-semibold">Pitch test</h1><p>Test a pitch with a simulated panel. Results are simulations, not real feedback.</p></header>
    {goalsError && <p role="alert">{goalsError}</p>}
    {!loadingGoals && !goalsError && !goals.length && <p>Create a goal with sourced matches before running a pitch test.</p>}
    <form onSubmit={(event) => void submit(event, false)} className="space-y-3">
      <div><label htmlFor="pitch-goal">Goal</label><br />
        <select id="pitch-goal" value={goalId} disabled={loadingGoals || !!goalsError || busy || !goals.length}
          onChange={(event) => { setGoalId(event.target.value); setBaseline(null); setRevision(null); setError(''); }}>
          <option value="">{loadingGoals ? 'Loading goals…' : 'Select a goal'}</option>
          {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.statement}</option>)}
        </select>
      </div>
      <div><label htmlFor="pitch-text">Pitch</label><br />
        <textarea id="pitch-text" rows={7} className="w-full border p-2" value={text} disabled={busy || !goalId}
          onChange={(event) => setText(event.target.value)} placeholder="Write or paste your pitch" />
      </div>
      <button type="submit" disabled={!canScore} className="rounded bg-black px-4 py-2 text-white disabled:opacity-40">{busy ? 'Scoring…' : 'Run measured test'}</button>{' '}
      <button type="button" disabled={!canScore || !baseline} className="rounded border px-4 py-2 disabled:opacity-40"
        onClick={(event) => void submit(event, true)}>Compare revision on same panel</button>
      {baseline && <p>Edit the pitch, then compare it with the first run on the same panel. Running a new test starts a new comparison.</p>}
    </form>
    {error && <p role="alert">{error}</p>}
    {baseline && <RunSummary run={baseline} heading="First run" />}
    {revision && <RunSummary run={revision} heading="Revision" />}
    {delta && <section aria-label="Comparison"><h3 className="text-lg font-semibold">Change from first run</h3>
      <p>Mean interest: {delta.meanInterestDelta >= 0 ? '+' : ''}{delta.meanInterestDelta.toFixed(2)} · Meeting rate: {delta.meetingRateDelta >= 0 ? '+' : ''}{(delta.meetingRateDelta * 100).toFixed(1)} percentage points · Spread: {delta.spreadDelta >= 0 ? '+' : ''}{delta.spreadDelta.toFixed(2)}</p></section>}
  </section>;
}
