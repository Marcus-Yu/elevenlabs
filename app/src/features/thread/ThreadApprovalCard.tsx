import { useRef, useState } from "react";
import { decideThreadApproval, getThreadApproval, useQuery } from "wasp/client/operations";

export function ThreadApprovalCard({ approvalId }: { approvalId: string }) {
  const { data, isLoading, error, refetch } = useQuery(getThreadApproval, { approvalId });
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function decide(decision: "approve" | "deny") {
    if (!data || data.status !== "PENDING" || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      const outcome = await decideThreadApproval({ approvalId, decision });
      if (outcome.outcome === "deny") setNotice(`The gateway denied this action. Rule ${outcome.ruleId}.`);
      await refetch();
    } catch {
      setNotice("The approval could not be updated. Refresh its status before trying again.");
      await refetch().catch(() => {});
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (isLoading) return <p role="status">Loading approval…</p>;
  if (error) return <p role="alert">Could not load the approval.</p>;
  if (!data) return <p>Approval unavailable.</p>;
  return (
    <section aria-label="Approval" aria-busy={busy}>
      <p>{data.actionType} · {data.status}</p>
      {data.recipient && <p>Recipient {data.recipient}</p>}
      {data.subject && <p>Subject {data.subject}</p>}
      {data.body && <p style={{ whiteSpace: "pre-wrap" }}>{data.body}</p>}
      {data.status === "PENDING" && <>
        <button type="button" disabled={busy} onClick={() => void decide("approve")}>Approve</button>
        <button type="button" disabled={busy} onClick={() => void decide("deny")}>Deny</button>
      </>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
