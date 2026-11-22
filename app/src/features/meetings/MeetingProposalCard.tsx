import { useId, useRef, useState } from "react";
import type { GoalProposal } from "./need-detection";

type GoalSelection = GoalProposal["proposedGoal"] & { autonomy: "WATCH" | "PREPARE" | "ACT" };

export type MeetingProposalCardProps = {
  approvalAvailable?: boolean;
  proposalId: string;
  proposal: GoalProposal;
  onApprove: (proposalId: string, goal: GoalSelection) => Promise<void>;
  onDismiss: (proposalId: string) => Promise<void>;
};

/** Displays a pending proposal; only an explicit user action invokes a callback. */
export function MeetingProposalCard(props: MeetingProposalCardProps) {
  return <PendingMeetingProposal key={props.proposalId} {...props} />;
}

function PendingMeetingProposal({ approvalAvailable = true, proposalId, proposal, onApprove, onDismiss }: MeetingProposalCardProps) {
  const id = useId();
  const [statement, setStatement] = useState(proposal.proposedGoal.statement);
  const [autonomy, setAutonomy] = useState<"WATCH" | "PREPARE" | "ACT">("PREPARE");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref synchronously guards against multiple actions before React renders pending state.
  const busy = useRef(false);

  async function act(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("The action could not be completed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} aria-busy={pending}>
      <h2 id={`${id}-title`}>Suggested goal</h2>
      <p>From your meeting:</p>
      <blockquote>{proposal.transcriptExcerpt}</blockquote>
      <p>Direction: {proposal.proposedGoal.direction} · Kind: {proposal.proposedGoal.kind}</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        const trimmed = statement.trim();
        if (!approvalAvailable || !trimmed) return;
        void act(() => onApprove(proposalId, { ...proposal.proposedGoal, statement: trimmed, autonomy }));
      }}>
        <label htmlFor={`${id}-statement`}>Goal statement</label>
        <textarea id={`${id}-statement`} value={statement} maxLength={500} required disabled={pending}
          onChange={(event) => setStatement(event.target.value)} />
        <fieldset disabled={pending}>
          <legend>Autonomy</legend>
          {([['WATCH', 'Watch'], ['PREPARE', 'Prepare'], ['ACT', 'Act']] as const).map(([value, label]) => (
            <label key={value}>
              <input type="radio" name={`${id}-autonomy`} value={value} checked={autonomy === value}
                onChange={() => setAutonomy(value)} />{label}
            </label>
          ))}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {pending && <p role="status">Working…</p>}
        {!approvalAvailable && <p>Goal approval is not available yet.</p>}
        <button type="submit" disabled={!approvalAvailable || pending || !statement.trim()}>Approve goal</button>
        <button type="button" disabled={pending} onClick={() => void act(() => onDismiss(proposalId))}>Dismiss</button>
      </form>
    </section>
  );
}
