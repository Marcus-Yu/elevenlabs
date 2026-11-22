import { page, route, type Spec } from "@wasp.sh/spec";
import { ApprovalsPage } from "./ApprovalsPage" with { type: "ref" };

// Wasp declarations for the "approvals" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const approvalsSpec: Spec = [
  route("ApprovalsRoute", "/approvals", page(ApprovalsPage, { authRequired: true })),
];
