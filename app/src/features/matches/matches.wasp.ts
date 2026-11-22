import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { MatchesPage } from "./MatchesPage" with { type: "ref" };
import { confirmCriteriaChange, getHireRuns, rejectMatchWithReason, runHireShortlist } from "./operations" with { type: "ref" };

// Wasp declarations for the "matches" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
// The hiring flow (WP5): research → rank → reject with a reason → confirm the change → rerun.
// ActionLog and MemoryItem are listed because these go through gateway.execute.
export const matchesSpec: Spec = [
  route("MatchesRoute", "/matches", page(MatchesPage, { authRequired: true })),
  action(runHireShortlist, { entities: ["Goal", "ActionLog"] }),
  action(rejectMatchWithReason, { entities: ["Goal", "ActionLog", "MemoryItem"] }),
  action(confirmCriteriaChange, { entities: ["Goal", "ActionLog"] }),
  query(getHireRuns, { entities: ["Goal"] }),
];
