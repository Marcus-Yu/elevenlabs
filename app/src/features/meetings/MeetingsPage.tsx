import { useQuery, listPendingMeetingProposals, dismissMeetingProposal } from "wasp/client/operations";
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
      approvalAvailable={false} onApprove={async () => { throw new Error("Goal approval unavailable"); }}
      onDismiss={async proposalId => { await dismissMeetingProposal({ proposalId }); }} />)}
  </main>;
}
