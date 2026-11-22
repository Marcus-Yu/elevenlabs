import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ApprovalsPage } from "./ApprovalsPage" with { type: "ref" };
import { decideApproval, getApproval, getPendingApprovals } from "./operations" with { type: "ref" };

// Wasp declarations for the "approvals" feature: routes, pages, queries, actions, apis and jobs.
// WP1 declares the queries and actions; WP6 adds routes and pages.
export const approvalsSpec: Spec = [
  route("ApprovalsRoute", "/approvals", page(ApprovalsPage, { authRequired: true })),
  query(getPendingApprovals, { entities: ["Approval"] }),
  query(getApproval, { entities: ["Approval"] }),
  // Declares ActionLog too, so the activity log refreshes after a decision.
  action(decideApproval, { entities: ["Approval", "ActionLog"] }),
];
