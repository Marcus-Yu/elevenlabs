import { page, route, type Spec } from "@wasp.sh/spec";
import { WatchersPage } from "./WatchersPage" with { type: "ref" };

// Wasp declarations for the "watchers" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const watchersSpec: Spec = [
  route("WatchersRoute", "/watchers", page(WatchersPage, { authRequired: true })),
];
