import { page, route, type Spec } from "@wasp.sh/spec";
import { RoomPage } from "./RoomPage" with { type: "ref" };

// Wasp declarations for the "room" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const roomSpec: Spec = [
  route("RoomRoute", "/room", page(RoomPage, { authRequired: true })),
];
