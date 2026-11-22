import { useState } from "react";
import { confirmThreadMemory } from "wasp/client/operations";
import type { MemoryConfirmation } from "./memory-proposal";
import { ThreadApprovalCard } from "./ThreadApprovalCard";

export function MemoryProposalCard({ proposal }: { proposal: MemoryConfirmation }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [approvalId, setApprovalId] = useState("");
  async function confirm() {
    if (busy || status) return;
    setBusy(true);
    try {
      const result = await confirmThreadMemory(proposal);
      if (result.kind === "allowed") setStatus(proposal.action === "remember" ? "Memory saved." : result.deleted ? "Memory deleted." : "No memory was deleted.");
      else if (result.kind === "denied") setStatus(`Action denied by policy. Rule ${result.ruleId}.`);
      else if (result.kind === "pending_approval" && result.approvalId) { setApprovalId(result.approvalId); setStatus("Approval required."); }
      else setStatus("Memory is unavailable.");
    } catch { setStatus("Memory changed or is unavailable. Please review it again."); }
    finally { setBusy(false); }
  }
  return <section className="rounded border p-3"><h3 className="font-semibold">{proposal.action === "remember" ? "Proposed memory" : "Forget this memory?"}</h3>
    <p><strong>{proposal.memory.kind}:</strong> {proposal.memory.text}</p>
    {proposal.action === "forget" && <p>Source: {proposal.memory.source}</p>}
    {!status && <button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? "Applying…" : proposal.action === "remember" ? "Save memory" : "Delete memory"}</button>}
    {status && <p role="status">{status}</p>}{approvalId && <ThreadApprovalCard approvalId={approvalId} />}
  </section>;
}
