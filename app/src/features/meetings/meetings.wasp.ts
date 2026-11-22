import { page, route, type Spec } from "@wasp.sh/spec";
import { MeetingsPage } from "./MeetingsPage" with { type: "ref" };

// Wasp declarations for the "meetings" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const meetingsSpec: Spec = [
  route("MeetingsRoute", "/meetings", page(MeetingsPage, { authRequired: true })),
];
