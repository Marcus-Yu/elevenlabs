import { useQuery, listPendingMeetingProposals, dismissMeetingProposal, approveMeetingProposal } from "wasp/client/operations";
import { MeetingProposalCard } from "./MeetingProposalCard";

export function MeetingsPage() {
  const { data, isLoading, error } = useQuery(listPendingMeetingProposals);
  return <main>
    <h1>Meetings</h1>
    <p>Meeting listening is not available yet. No meeting is being recorded here.</p>
    <h2>Pending needs</h2>
    {isLoading && <p role="status">Loading proposals…</p>}
    {error && <p role="alert">Could not load proposals.</p>}
    {data?.length === 0 && <p>No pending proposals.</p>}
    {data?.map(({ id, proposal }) => <MeetingProposalCard key={id} proposalId={id} proposal={proposal}
      onApprove={async (proposalId, goal) => { await approveMeetingProposal({ proposalId, statement: goal.statement, autonomy: goal.autonomy }); }}
      onDismiss={async proposalId => { await dismissMeetingProposal({ proposalId }); }} />)}
  </main>;
}
