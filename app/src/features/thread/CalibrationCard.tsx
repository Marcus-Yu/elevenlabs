import { useId, useState, type FormEvent } from 'react';

export type CalibrationProfile = {
  id: string;
  label: string;
  yearsExperience: number;
  skills: string[];
  workStyle: string;
  synthetic: true;
};
export type CalibrationReaction = {
  id: string;
  profileId: string;
  decision: 'pick' | 'reject';
  reason: string;
};
type Selection = { decision?: 'pick' | 'reject'; reason: string };
export type CalibrationCardProps = {
  profiles: CalibrationProfile[];
  onSubmit: (reactions: CalibrationReaction[]) => void | Promise<void>;
  disabled?: boolean;
};

/** Return null for an empty or incomplete selection; IDs are supplied per submission. */
export function buildCalibrationReactions(
  profiles: CalibrationProfile[],
  selections: Record<string, Selection>,
  makeId: () => string,
): CalibrationReaction[] | null {
  if (!profiles.length || profiles.length > 8 || new Set(profiles.map((p) => p.id)).size !== profiles.length ||
      profiles.some((p) => !p.id || p.synthetic !== true)) return null;
  const selected = profiles.flatMap((profile) => {
    const selection = selections[profile.id];
    return selection?.decision ? [{ profileId: profile.id, decision: selection.decision, reason: selection.reason.trim() }] : [];
  });
  if (!selected.length || selected.some((entry) => !entry.reason)) return null;
  return selected.map((entry) => ({ id: makeId(), ...entry }));
}

/** Profiles are synthetic examples supplied by the server; no decisions are preselected. */
export function CalibrationCard({ profiles, onSubmit, disabled = false }: CalibrationCardProps) {
  const groupId = useId();
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const setSelection = (id: string, update: Partial<Selection>) => {
    setSelections((previous) => ({ ...previous, [id]: { ...(previous[id] ?? { reason: '' }), ...update } }));
    setError('');
  };
  const ready = buildCalibrationReactions(profiles, selections, () => 'pending') !== null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || busy || submitted) return;
    const reactions = buildCalibrationReactions(profiles, selections, () => globalThis.crypto.randomUUID());
    if (!reactions) { setError('Choose at least one profile and give a reason for each choice.'); return; }
    setBusy(true); setError('');
    try { await onSubmit(reactions); setSubmitted(true); }
    catch { setError('Could not submit your reactions. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={(event) => void submit(event)} className="space-y-4" aria-label="Calibrate candidate preferences">
    <div><h3 className="text-lg font-semibold">Calibrate your preferences</h3>
      <p>These profiles are synthetic examples. Choose any that help explain what you want, and give a reason for each choice.</p></div>
    {!profiles.length && <p>No synthetic profiles are available.</p>}
    {profiles.map((profile, index) => <fieldset key={profile.id} disabled={disabled || busy || submitted} className="rounded border p-3 space-y-2">
      <legend className="font-semibold">{profile.label} <span className="text-sm font-normal">(synthetic)</span></legend>
      <p>{profile.yearsExperience} years of experience · {profile.workStyle}</p>
      <p>Skills: {profile.skills.length ? profile.skills.join(', ') : 'None listed'}</p>
      <div className="space-x-4">
        {(['pick', 'reject'] as const).map((decision) => <label key={decision}>
          <input type="radio" name={`${groupId}-${index}`} value={decision}
            checked={selections[profile.id]?.decision === decision}
            onChange={() => setSelection(profile.id, { decision })} /> {decision === 'pick' ? 'Pick' : 'Reject'}
        </label>)}
      </div>
      <label htmlFor={`${groupId}-reason-${index}`}>Reason{selections[profile.id]?.decision ? ' (required)' : ' (optional until selected)'}</label>
      <textarea id={`${groupId}-reason-${index}`} className="block w-full border p-2" rows={2}
        value={selections[profile.id]?.reason ?? ''} onChange={(e) => setSelection(profile.id, { reason: e.target.value })} />
    </fieldset>)}
    {error && <p role="alert">{error}</p>}
    {submitted ? <p role="status">Reactions submitted.</p> : <button type="submit" disabled={disabled || busy || !ready} className="rounded bg-black px-4 py-2 text-white disabled:opacity-40">{busy ? 'Submitting…' : 'Submit reactions'}</button>}
  </form>;
}
