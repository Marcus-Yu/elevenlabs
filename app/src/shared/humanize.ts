// Plain-language copy for gateway events, statuses and fit scores, shared by every web page.
// Rule ids stay available as a small tag; the sentence never shows internal jargon.

export interface LoggedAction {
  actionType: string;
  decision: string; // ALLOW | DENY | NEEDS_APPROVAL (any case)
  ruleId?: string | null;
  reason?: string | null;
  inputSummary?: string | null;
}

const STATUS: Record<string, string> = {
  needs_ok: "Needs your OK", approved: "Approved", scanning: "Searching…", done: "Done",
  pending: "Waiting", executed: "Done", denied: "Declined", expired: "Expired", failed: "Failed",
};

export function humanStatus(status: string): string {
  return STATUS[status.toLowerCase()] ?? status;
}

function isDemoData(a: LoggedAction): boolean {
  return /stub_handler/.test(`${a.ruleId ?? ""} ${a.reason ?? ""}`);
}

function revealedFields(a: LoggedAction): string {
  const m = /fields?[":\s]+\[?([a-z_, "]+)\]?/i.exec(a.inputSummary ?? "");
  return m ? m[1].replace(/"/g, "").split(",").map((s) => s.trim()).filter(Boolean).join(", ") : "the chosen details";
}

function plainReason(reason: string | null | undefined): string {
  if (!reason) return "this action is not allowed";
  return reason
    .replace(/execution_backend=\w+;?\s*/g, "")
    .replace(/stub_handler:[^;]*;?/g, "")
    .replace(/\b[a-z]+(_[a-z]+)+\b:?\s*/g, (w) => w.replace(/_/g, " "))
    .trim()
    .replace(/;$/, "") || "this action is not allowed";
}

function sentence(a: LoggedAction): string {
  const decision = a.decision.toUpperCase();
  const rule = a.ruleId ?? "";
  if (decision === "DENY") {
    if (rule === "opt_in_only") return "Blocked: contact details stay hidden until both sides opt in";
    return `Blocked: ${plainReason(a.reason)}`;
  }
  if (a.actionType === "outreach.send") return "Introduction drafted, not sent";
  if (decision === "NEEDS_APPROVAL") {
    if (a.actionType === "memory.write") return "Waiting for you to confirm a preference";
    if (a.actionType === "card.reveal") return "Waiting for both sides to approve the introduction";
    return "Waiting for your approval";
  }
  switch (a.actionType) {
    case "company.search": return "Searched company records (Fiber, replay)";
    case "contact.search": return "Looked up public profiles";
    case "memory.write": {
      const text = /"text"\s*:\s*"([^"]+)"/.exec(a.inputSummary ?? "")?.[1];
      return text ? `Saved your preference: ${text}` : "Saved your preference";
    }
    case "card.publish":
      return /card_fields/.test(`${rule} ${a.reason ?? ""}`) && /budget/.test(a.reason ?? "")
        ? "Removed your budget ceiling before sharing the card"
        : "Shared the anonymous card";
    case "card.reveal": return `Both sides agreed to share: ${revealedFields(a)}`;
    case "calibration.profiles": return "Showed synthetic calibration profiles";
    case "calibration.criteria": return "Suggested criteria from your reactions";
    default: return `${a.actionType.replace(/[._]/g, " ")} allowed`;
  }
}

/** One plain sentence for a logged gateway decision, plus the rule id for a small grey tag. */
export function describeAction(a: LoggedAction): { text: string; ruleTag: string | null } {
  const text = sentence(a) + (isDemoData(a) ? " (demo data)" : "");
  const ruleTag = a.ruleId && !["stub_handler", "default"].includes(a.ruleId) ? a.ruleId : null;
  return { text, ruleTag };
}

/** "4 of the top 5 meet all your criteria". */
export function fitAtK(fit: number, k: number): string {
  return `${fit} of the top ${k} meet all your criteria`;
}

/** "Run 2: 5 of 5 now match (was 4 of 5)". */
export function runLabel(run: number, fit: number, k: number, previousFit?: number): string {
  return `Run ${run}: ${fit} of ${k} now match${previousFit === undefined ? "" : ` (was ${previousFit} of ${k})`}`;
}

/** "Meets 3 of 3 criteria". */
export function criteriaMet(met: number, total: number): string {
  return `Meets ${met} of ${total} criteria`;
}
