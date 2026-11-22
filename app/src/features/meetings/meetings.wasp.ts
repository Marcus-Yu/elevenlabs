import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { MeetingsPage } from "./MeetingsPage" with { type: "ref" };

import { listPendingMeetingProposals, dismissMeetingProposal, approveMeetingProposal } from "./operations" with { type: "ref" };

// Wasp declarations for the "meetings" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const meetingsSpec: Spec = [
  route("MeetingsRoute", "/meetings", page(MeetingsPage, { authRequired: true })),
  query(listPendingMeetingProposals, { entities: ["NeedProposal"], auth: true }),
  action(dismissMeetingProposal, { entities: ["NeedProposal"], auth: true }),
  action(approveMeetingProposal, { entities: ["NeedProposal", "Goal"], auth: true }),
];
