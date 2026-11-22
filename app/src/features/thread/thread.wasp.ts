import { page, route, type Spec } from "@wasp.sh/spec";
import { ThreadPage } from "./ThreadPage" with { type: "ref" };

// Wasp declarations for the "thread" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const threadSpec: Spec = [
  route("ThreadRoute", "/thread", page(ThreadPage, { authRequired: true })),
];
