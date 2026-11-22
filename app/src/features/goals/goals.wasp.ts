import { action, page, route, type Spec } from "@wasp.sh/spec";
import { GoalsPage } from "./GoalsPage" with { type: "ref" };
import { createHireGoal } from "../matches/operations" with { type: "ref" };

// Wasp declarations for the "goals" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const goalsSpec: Spec = [
  route("GoalsRoute", "/goals", page(GoalsPage, { authRequired: true })),
  action(createHireGoal, { entities: ["Goal"] }),
];
