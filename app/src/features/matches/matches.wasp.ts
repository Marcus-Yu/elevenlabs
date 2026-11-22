import { page, route, type Spec } from "@wasp.sh/spec";
import { MatchesPage } from "./MatchesPage" with { type: "ref" };

// Wasp declarations for the "matches" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const matchesSpec: Spec = [
  route("MatchesRoute", "/matches", page(MatchesPage, { authRequired: true })),
];
