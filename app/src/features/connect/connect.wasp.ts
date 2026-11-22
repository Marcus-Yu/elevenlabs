import { page, route, type Spec } from "@wasp.sh/spec";
import { ConnectPage } from "./ConnectPage" with { type: "ref" };

// Wasp declarations for the "connect" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const connectSpec: Spec = [
  route("ConnectRoute", "/connect", page(ConnectPage, { authRequired: true })),
];
