// Short spoken results for the voice agent's client tools. Pure: snapshot in, sentence out.
// Candidates stay anonymous here too: only aliases, never names.

function list(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function shortlist(snap) {
  const aliases = (snap?.shortlist?.candidates ?? []).map((c) => c.alias);
  return aliases.length ? `Shortlist has ${list(aliases)}.` : "Research is still running; no candidates yet.";
}

/** @param {string} type OverlayAction type @param {object} snap @param {object} [args] */
export function toolResult(type, snap, args = {}) {
  if (!snap || snap.error) return `Denied: ${snap?.error ?? "no response from Atlas"}. Stop and explain this to the user.`;
  switch (type) {
    case "approve_brief":
      return `Approved. ${shortlist(snap)}`;
    case "run_research":
      return `Research done. ${shortlist(snap)}`;
    case "reject_candidate": {
      const why = snap.proposedChange?.explanation;
      return `Rejected ${args.alias}.${why ? ` Proposed criteria change: ${why}` : ""} Ask the user to confirm the change.`;
    }
    case "confirm_change":
      return `Criteria updated. ${shortlist(snap)}`;
    case "open_intro":
      return snap.introUrl ? "Opened the introduction review in the browser. Both sides must opt in." : "No introduction is ready yet.";
    default:
      return "Done.";
  }
}
