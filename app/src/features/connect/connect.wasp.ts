import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { MatchPage } from "./cards/MatchPage" with { type: "ref" };
import { getMatchDemo, runMatchStep } from "./cards/operations" with { type: "ref" };
import { ConnectPage } from "./ConnectPage" with { type: "ref" };

// Wasp declarations for the "connect" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const connectSpec: Spec = [
  route("ConnectRoute", "/connect", page(ConnectPage, { authRequired: true })),
  route("MatchRoute", "/match", page(MatchPage, { authRequired: true })),
  query(getMatchDemo, { entities: ["ShareCard", "CardMatch", "Approval"] }),
  action(runMatchStep, { entities: ["ShareCard", "CardMatch", "Approval", "ActionLog"] }),
];
