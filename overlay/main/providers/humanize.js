// Plain-language copy for gateway events and run labels: what happened, in words a
// judge understands instantly. Rule ids stay on the event as data (shown as a tiny tag).

const isStub = (reason) => typeof reason === "string" && reason.includes("stub_handler");
const demo = (reason) => (isStub(reason) ? " (demo data)" : "");
const FIELD_WORDS = { budget: "budget ceiling", salary: "salary", email: "email", name: "name", company: "company" };
const fieldWords = (f) => FIELD_WORDS[f] ?? String(f).replace(/_/g, " ");

/** "card_fields: stripped ... ; stub_handler: ..." → a short plain reason. */
function plainReason(reason) {
  if (!reason) return "not allowed by your rules";
  const first = String(reason).split(";")[0].replace(/^[a-z_]+:\s*/, "").replace(/_/g, " ").replace(/"/g, "");
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}

/** One activity-log row (actionType + decision) → a sentence. */
function eventText(row, mode = "replay") {
  const d = row.decision;
  const tail = demo(row.reason);
  if (d === "DENY") {
    return row.ruleId === "opt_in_only"
      ? `Blocked: contact details stay hidden until both sides opt in${tail}`
      : `Blocked: ${plainReason(row.reason)}${tail}`;
  }
  const waiting = d === "NEEDS_APPROVAL";
  switch (row.actionType) {
    case "company.search":
      return `Searched company records (Fiber, ${mode})${tail}`;
    case "contact.search":
      return `Looked up public profiles${tail}`;
    case "memory.write":
      return (waiting ? "Waiting for you to confirm a preference" : `Saved your preference${row.summary ? `: ${row.summary}` : ""}`) + tail;
    case "card.publish":
      return (row.ruleId === "card_fields" ? "Removed your budget ceiling before sharing the card" : "Shared your anonymous card") + tail;
    case "card.reveal":
      return (waiting ? "Waiting for both sides to approve the introduction" : `Both sides agreed to share${row.fields ? `: ${row.fields}` : " their details"}`) + tail;
    case "outreach.send":
      return `Introduction drafted, not sent${tail}`;
    default:
      return `${String(row.actionType || "Action").replace(/[._]/g, " ")}: ${waiting ? "waiting for your OK" : "done"}${tail}`;
  }
}

/** A field stripped from a share card. */
const strippedText = (field, whose, reason) =>
  `Removed ${whose === "your" ? "your" : "the other side's"} ${fieldWords(field)} before sharing the card${demo(reason)}`;

/** fit@k evaluations → "Run 2: 5 of 5 now match (was 4 of 5)". */
function runLabelText(runCount, evaluation, comparedTo) {
  if (!runCount || !evaluation) return "Not run yet";
  const now = `${evaluation.fitAtK} of ${evaluation.k}`;
  if (comparedTo) return `Run ${runCount}: ${now} now match (was ${comparedTo.fitAtK} of ${comparedTo.k})`;
  return `Run ${runCount}: ${evaluation.fitAtK} of the top ${evaluation.k} meet all your criteria`;
}

module.exports = { eventText, strippedText, runLabelText, plainReason, isStub };
