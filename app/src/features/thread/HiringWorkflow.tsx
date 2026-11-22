import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { CriteriaChange, HireCriteriaInput } from '../matches/candidates';
import type { HireRun, HireShortlistEntry } from '../matches/hireFlow';
import type { SourceRef } from '../../shared/contracts';
import { candidateLabel, hideCandidateIdentity, sourceSummary } from './candidate-display';
import { CalibrationCard, type CalibrationProfile, type CalibrationReaction } from './CalibrationCard';
import { CalibrationCriteriaReview } from './CalibrationCriteriaReview';
import { ThreadApprovalCard } from './ThreadApprovalCard';
import type { CalibrationCriteria } from './calibration-contracts';
import { parseHiringCriteria, roboticsDemoCriteria } from './hiring-criteria';
import type { GatewayDisplay } from './gateway-result';

export type HiringTransport = {
  startCalibration(input: { goalSummary: string }): Promise<GatewayDisplay<{ profiles: CalibrationProfile[]; source: 'live' | 'replay' }>>;
  submitCalibration(input: { profiles: CalibrationProfile[]; reactions: CalibrationReaction[] }): Promise<GatewayDisplay<CalibrationCriteria>>;
  create(input: { criteria: HireCriteriaInput }): Promise<{ goalId: string }>;
  shortlist(input: { goalId: string }): Promise<HireShortlistEntry[]>;
  reject(input: { matchId: string; reason: string }): Promise<{ proposedChange: CriteriaChange | null }>;
  confirm(input: { goalId: string; proposedChange: CriteriaChange }): Promise<HireShortlistEntry[]>;
  runs(input: { goalId: string }): Promise<HireRun[]>;
};
function Evidence({ source }: { source: SourceRef }) {
  return <span>{sourceSummary(source)}</span>;
}

/** Uses only authorized operation results. All shortlist data is presented with its returned sources. */
export function HiringWorkflow({ transport, initialDraft = '', reviewedDraft, shortlistReplay = false }: { transport: HiringTransport; initialDraft?: string; reviewedDraft?: { need: string }; shortlistReplay?: boolean }) {
  const [need, setNeed] = useState(initialDraft);
  const [role, setRole] = useState('');
  const [titleTerms, setTitleTerms] = useState('');
  const [skills, setSkills] = useState('');
  const [preferredSkills, setPreferredSkills] = useState('');
  const [countries, setCountries] = useState('');
  const [minimum, setMinimum] = useState('');
  const [profiles, setProfiles] = useState<CalibrationProfile[]>([]);
  const [profileSource, setProfileSource] = useState<'live' | 'replay' | null>(null);
  const [criteriaDraft, setCriteriaDraft] = useState<{ criteria: CalibrationCriteria; reactions: CalibrationReaction[] } | null>(null);
  const [evidence, setEvidence] = useState<{criterion: string; reactions: string[]}[]>([]);
  const [approvalId, setApprovalId] = useState('');
  const [calibrationKey, setCalibrationKey] = useState(0);
  const [goalId, setGoalId] = useState('');
  const [entries, setEntries] = useState<HireShortlistEntry[] | null>(null);
  const [comparison, setComparison] = useState<HireRun | null>(null);
  const [comparisonError, setComparisonError] = useState(false);
  const [proposal, setProposal] = useState<CriteriaChange | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const knownEntries = useRef(new Map<string, HireShortlistEntry>());
  function showShortlist(next: HireShortlistEntry[]) {
    for (const entry of next) {
      if (!knownEntries.current.has(entry.matchId)) knownEntries.current.set(entry.matchId, entry);
    }
    setEntries(next);
  }
  const known = [...knownEntries.current.values()];
  const safe = (text: string) => hideCandidateIdentity(text, known);
  const labelFor = (id: string) => candidateLabel([...knownEntries.current.keys()].indexOf(id));
  const appliedDraft = useRef<typeof reviewedDraft>(undefined);
  useEffect(() => {
    if (!reviewedDraft || appliedDraft.current === reviewedDraft || goalId || busy) return;
    appliedDraft.current = reviewedDraft;
    setNeed(reviewedDraft.need);
    setProfiles([]);
    setProfileSource(null);
    setCriteriaDraft(null);
    setEvidence([]);
    document.getElementById('hiring-need')?.focus();
  }, [reviewedDraft, goalId, busy]);
  async function execute(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'The request failed. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function unwrap<T>(result: GatewayDisplay<T>): T {
    if (result.kind === 'denied') throw new Error(`${result.message} Rule ${result.ruleId}.`);
    if (result.kind === 'pending_approval') { setApprovalId(result.approvalId); throw new Error(result.message); }
    if (!result.data || result.stub) throw new Error('Calibration is unavailable.');
    return result.data;
  }
  async function startCalibration() {
    if (!need.trim() && role.trim().length < 2) return;
    await execute(async () => {
      const result = unwrap(await transport.startCalibration({ goalSummary: need.trim() || role.trim() }));
      setProfiles(result.profiles); setProfileSource(result.source); setCriteriaDraft(null); setCalibrationKey((n) => n + 1);
    });
  }
  async function submitCalibration(reactions: CalibrationReaction[]) {
    // Let the card surface failure and remain editable rather than marking it submitted.
    if (lock.current) throw new Error('Another action is in progress.');
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = unwrap(await transport.submitCalibration({ profiles, reactions }));
      setCriteriaDraft({ criteria: result, reactions });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Calibration is unavailable.');
      throw error;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function applyCalibration() {
    if (!criteriaDraft) return;
    const { criteria } = criteriaDraft;
    if (criteria.minimumExperience) setMinimum(String(criteria.minimumExperience.years));
    if (criteria.mustHaveSkills.length) setSkills((old) => [...new Set([...old.split(',').map((x) => x.trim()).filter(Boolean), ...criteria.mustHaveSkills.map((x) => x.skill)])].join(', '));
    setEvidence([
      ...(criteria.minimumExperience ? [{ criterion: `minimumExperience: ${criteria.minimumExperience.years}`, reactions: criteria.minimumExperience.reactionIds }] : []),
      ...criteria.mustHaveSkills.map((x) => ({ criterion: `mustHaveSkills: ${x.skill}`, reactions: x.reactionIds })),
    ]);
    setCriteriaDraft(null);
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    const parsed = parseHiringCriteria({ role, titles: titleTerms, skills, preferredSkills, minimum, countries }, evidence);
    if (!parsed.success) {
      setError('Review the role and search criteria. Use three-letter country codes, and enter up to 10 titles, 10 must-have skills, and 15 preferred skills.');
      return;
    }
    await execute(async () => { const goal = await transport.create({ criteria: parsed.data }); setGoalId(goal.goalId); });
  }
  function loadDemoCriteria() {
    setRole(roboticsDemoCriteria.role);
    setTitleTerms(roboticsDemoCriteria.titles);
    setSkills(roboticsDemoCriteria.skills);
    setPreferredSkills(roboticsDemoCriteria.preferredSkills);
    setMinimum(roboticsDemoCriteria.minimum);
    setCountries(roboticsDemoCriteria.countries);
    setEvidence((old) => old.filter(({ criterion }) => [
      'minimumExperience: 2', 'mustHaveSkills: ROS', 'mustHaveSkills: C++',
    ].includes(criterion)));
    setGoalId('');
    setEntries(null);
    knownEntries.current.clear();
    setProposal(null);
    setReasons({});
    setComparison(null);
    setComparisonError(false);
    setError('');
  }
  async function research() {
    if (!goalId) return;
    await execute(async () => {
      try {
        showShortlist(await transport.shortlist({ goalId }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Shortlist research failed.';
        if (!shortlistReplay || message.startsWith('contact.search denied')) throw error;
        throw new Error('Replay search failed. Load the recorded robotics criteria to start a new draft you can review and research.');
      }
      setComparison(null);
      setComparisonError(false);
    });
  }
  async function reject(entry: HireShortlistEntry) {
    const reason = reasons[entry.matchId]?.trim();
    if (!reason || reason.length < 2) return;
    await execute(async () => { const result = await transport.reject({ matchId: entry.matchId, reason }); setProposal(result.proposedChange); setEntries((old) => old?.filter((item) => item.matchId !== entry.matchId) ?? null); });
  }
  async function confirm() {
    if (!goalId || !proposal) return;
    await execute(async () => {
      const next = await transport.confirm({ goalId, proposedChange: proposal });
      showShortlist(next); setProposal(null); setComparison(null); setComparisonError(false);
      try { const runs = await transport.runs({ goalId }); setComparison(runs.at(-1) ?? null); }
      catch { setComparisonError(true); }
    });
  }
  return <section aria-label="Hiring research" className="space-y-4">
    <h2 className="text-xl font-semibold">Hiring research</h2>
    <p>Enter criteria you approve. Research results carry the sources returned by the search.</p>
    {shortlistReplay && (!goalId || (error && !entries)) && <button type="button" disabled={busy} onClick={loadDemoCriteria}>Load robotics demo criteria</button>}
    {!goalId ? <form onSubmit={(e) => void create(e)} className="space-y-2">
      <label htmlFor="hiring-need">Hiring need (optional)</label><br /><textarea id="hiring-need" className="w-full border p-1" value={need} onChange={(e) => { setNeed(e.target.value); setProfiles([]); setProfileSource(null); setCriteriaDraft(null); setEvidence([]); }} disabled={busy} maxLength={2000} /><br />
      <label>Role <input className="border p-1" value={role} onChange={(e) => { setRole(e.target.value); setProfiles([]); setProfileSource(null); setCriteriaDraft(null); setEvidence([]); }} disabled={busy} required minLength={2} maxLength={120} /></label><br />
      <label>Search job titles, comma separated <input className="border p-1" value={titleTerms} onChange={(e) => setTitleTerms(e.target.value)} disabled={busy} placeholder="Uses the role when blank" /></label><br />
      <label>Must-have skills, comma separated <input className="border p-1" value={skills} onChange={(e) => { setSkills(e.target.value); setEvidence([]); }} disabled={busy} /></label><br />
      <label>Preferred skills, comma separated <input className="border p-1" value={preferredSkills} onChange={(e) => setPreferredSkills(e.target.value)} disabled={busy} /></label><br />
      <label>Country codes, comma separated <input className="border p-1" value={countries} onChange={(e) => setCountries(e.target.value)} disabled={busy} placeholder="USA, CAN" /></label><br />
      <label>Minimum years of experience (optional) <input className="border p-1" type="number" min="0" max="40" value={minimum} onChange={(e) => { setMinimum(e.target.value); setEvidence([]); }} disabled={busy} /></label><br />
      <button type="button" disabled={busy || (!need.trim() && role.trim().length < 2)} onClick={() => void startCalibration()}>Show calibration profiles</button>{' '}
      <button type="submit" disabled={busy || role.trim().length < 2}>Create goal</button>
    </form> : <><p>Goal created: {role}</p><button type="button" disabled={busy || !!proposal} onClick={() => void research()}>{entries ? 'Research again' : 'Research shortlist'}</button>{' '}<Link to={`/voice?goalId=${encodeURIComponent(goalId)}`} className="underline">Open spoken briefing</Link></>}
    {!goalId && profiles.length > 0 && <section><p>{profileSource === 'replay' ? 'Curated synthetic replay profiles.' : 'Live-generated synthetic profiles.'}</p>
      <CalibrationCard key={calibrationKey} profiles={profiles} onSubmit={submitCalibration} disabled={busy} /></section>}
    {!goalId && criteriaDraft && <CalibrationCriteriaReview criteria={criteriaDraft.criteria} profiles={profiles} reactions={criteriaDraft.reactions}>
      <button type="button" disabled={busy} onClick={applyCalibration}>Apply suggested criteria</button>{' '}
      <button type="button" disabled={busy} onClick={() => setCriteriaDraft(null)}>Dismiss</button>
    </CalibrationCriteriaReview>}
    {approvalId && <ThreadApprovalCard approvalId={approvalId} />}
    {busy && <p role="status">Working…</p>}{error && <p role="alert">{error}</p>}
    {proposal && <section aria-label="Confirm proposed preference" className="rounded border p-3 space-y-2"><h3 className="font-semibold">Confirm proposed preference</h3>
      <p>Review the proposed criteria change based on your rejection.</p><p>Based on rejection: “{safe(proposal.basedOn.reason)}”</p>
      {proposal.basedOn.source && <p><Evidence source={proposal.basedOn.source} /></p>}
      <ul>{proposal.changes.map((change, i) => <li key={i}>{change.field}: {safe(JSON.stringify(change.from))} → {safe(JSON.stringify(change.to))}</li>)}</ul>
      <button type="button" disabled={busy} onClick={() => void confirm()}>Confirm and rerank</button>{' '}
      <button type="button" disabled={busy} onClick={() => setProposal(null)}>Not now</button>
    </section>}
    {comparison?.comparedTo && <p>Fit in the top {comparison.evaluation.k}, evaluated using the updated criteria: before {comparison.comparedTo.fitAtK} candidates, after {comparison.evaluation.fitAtK} candidates.</p>}
    {comparisonError && <p>Reranking completed, but its comparison could not be loaded.</p>}
    {entries && <section><h3 className="font-semibold">Shortlist</h3>
      {shortlistReplay && <p>Replay of recorded Fiber results from public sources.</p>}
      {entries.length === 0 && <p>No candidates returned.</p>}
      <ol className="space-y-4">{entries.map((entry) => <li key={entry.matchId} className="rounded border p-3 space-y-2">
        <h4 className="font-semibold">{labelFor(entry.matchId)} · {safe(entry.candidate.title || 'Title unavailable')} · {entry.candidate.yearsExperience === undefined ? 'Experience unavailable' : `${entry.candidate.yearsExperience} years of experience`}</h4>
        <p>Rule-based score: {entry.score}/100 · {safe(entry.rationale)}</p>
        <ul className="list-disc pl-5">{entry.reasons.map((reason, i) => <li key={i}>{safe(reason.text)} ({reason.points >= 0 ? '+' : ''}{reason.points}) {reason.source && <Evidence source={reason.source} />}</li>)}</ul>
        <details><summary>Profile sources</summary><ul>{entry.candidate.sources.map((source, i) => <li key={i}><Evidence source={source} /></li>)}</ul></details>
        <label>Reason for rejection <input className="border p-1" value={reasons[entry.matchId] ?? ''} disabled={busy || !!proposal} maxLength={300}
          onChange={(e) => setReasons((old) => ({ ...old, [entry.matchId]: e.target.value }))} /></label>{' '}
        <button type="button" disabled={busy || !!proposal || (reasons[entry.matchId]?.trim().length ?? 0) < 2} onClick={() => void reject(entry)}>Reject</button>
      </li>)}</ol></section>}
  </section>;
}
