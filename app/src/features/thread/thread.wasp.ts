import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ThreadPage } from "./ThreadPage" with { type: "ref" };
import { decideThreadApproval, getThreadApproval } from "./approval-operations" with { type: "ref" };

// Wasp declarations for the "thread" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const threadSpec: Spec = [
  route("ThreadRoute", "/thread", page(ThreadPage, { authRequired: true })),
  query(getThreadApproval, { entities: ["Approval"] }),
  action(decideThreadApproval, { entities: ["Approval", "ActionLog"] }),
];
