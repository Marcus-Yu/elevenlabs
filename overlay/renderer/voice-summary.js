// Short spoken results for the voice agent's client tools. Pure: snapshot in, sentence out.
// People are named only by their fictional display names (candidate-names.js), never real names.
import { displayName } from "./candidate-names.js";

function list(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function shortlist(snap) {
  const aliases = (snap?.shortlist?.candidates ?? []).map((c) => c.displayName ?? displayName(c.alias));
  return aliases.length ? `Shortlist has ${list(aliases)}.` : "Research is still running; no candidates yet.";
}

/** @param {string} type OverlayAction type @param {object} snap @param {object} [args] */
export function toolResult(type, snap, args = {}) {
  if (!snap || snap.error) return `Denied: ${snap?.error ?? "no response from Atlas"}. Stop and explain this to the user.`;
  switch (type) {
    case "set_need": {
      const b = snap.brief;
      if (!b) return "Need noted. Say what you understood and ask the user for an OK.";
      const what = [b.goalKind, b.role].filter(Boolean).join(": ");
      const crit = b.criteria?.length ? ` Criteria: ${list(b.criteria)}.` : "";
      return `Brief proposed${what ? ` (${what})` : ""}.${crit} Waiting for the user's OK; do not approve yet.`;
    }
    case "approve_brief":
      return `Approved. ${shortlist(snap)}`;
    case "run_research":
      return `Research done. ${shortlist(snap)}`;
    case "reject_candidate": {
      const name = args.name ?? displayName(args.alias);
      const question = snap.proposedChange?.explanation?.match(/[^.?!]*\?\s*$/)?.[0].trim();
      const change = question ? ` Proposed change: ${name} looks ${args.reason || "like a poor fit"}. ${question}` : "";
      return `Rejected ${name}.${change} Ask the user to confirm the change.`;
    }
    case "confirm_change":
      return `Criteria updated. ${shortlist(snap)}`;
    case "approve_send":
      return "Done. Your anonymous card is shared, the match is confirmed and the introduction went to the sandbox inbox.";
    case "open_intro":
      return snap.introUrl ? "Opened the introduction review in the browser. Both sides must opt in." : "No introduction is ready yet.";
    default:
      return "Done.";
  }
}
