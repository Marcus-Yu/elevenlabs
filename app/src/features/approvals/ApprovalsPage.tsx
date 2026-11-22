import { useState } from "react";
import { decideApproval, getPendingApprovals, useQuery } from "wasp/client/operations";
import { describeAction } from "../../shared/humanize";

// Approvals: actions waiting for the user's OK, with the exact payload that will run.
export function ApprovalsPage() {
  const { data, error, isLoading, refetch } = useQuery(getPendingApprovals);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function decide(approvalId: string, decision: "approve" | "deny") {
    setBusy(true); setMessage("");
    try {
      const result = await decideApproval({ approvalId, decision, via: "web" });
      setMessage(decision === "deny" ? "Declined." : result.decision.outcome === "allow" ? "Approved and done." : `Not run: ${result.decision.outcome === "deny" ? result.decision.reason : "still waiting"}`);
      await refetch();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not record your decision."); }
    finally { setBusy(false); }
  }
  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p>Actions waiting for your OK. Nothing here runs until you approve it.</p>
      </header>
      {isLoading && <p>Loading…</p>}
      {error && <p role="alert">Could not load approvals.</p>}
      {message && <p role="status">{message}</p>}
      {data && data.length === 0 && <p>Nothing is waiting for you. The demo steps approve their own actions as you click them.</p>}
      <ul className="space-y-3">
        {data?.map((a) => {
          const { text, ruleTag } = describeAction({ actionType: a.actionType, decision: "NEEDS_APPROVAL" });
          return (
            <li key={a.id} className="rounded border p-3 space-y-2">
              <p>{text} {ruleTag && <small style={{ color: "#888" }}>({ruleTag})</small>}</p>
              <details><summary>Exact payload</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(a.payload, null, 2)}</pre></details>
              <button type="button" disabled={busy} onClick={() => void decide(a.id, "approve")}>Approve</button>{" "}
              <button type="button" disabled={busy} onClick={() => void decide(a.id, "deny")}>Decline</button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
