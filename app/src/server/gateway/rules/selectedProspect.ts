import type { Rule } from "./types";

/**
 * §8 `selected_prospect` (team notes): contact enrichment runs only for a match the user approved,
 * never for an anonymous or unreviewed one. Runs before paid_reveal, so an unreviewed match is
 * denied rather than queued for approval.
 */
export const selectedProspect: Rule = {
  id: "selected_prospect",
  kind: "deny",
  check({ request, revealMatch }) {
    if (request.actionType !== "contact.reveal_email") return null;
    if (!revealMatch) return "no match for this company on the goal; reveal emails only for matches the user approved";
    return revealMatch.status === "APPROVED" ? null : `match is ${revealMatch.status}; the user must approve it before revealing an email`;
  },
};
