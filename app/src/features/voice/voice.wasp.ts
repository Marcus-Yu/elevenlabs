import { page, route, type Spec } from "@wasp.sh/spec";
import { VoicePage } from "./VoicePage" with { type: "ref" };

// Wasp declarations for the "voice" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const voiceSpec: Spec = [
  route("VoiceRoute", "/voice", page(VoicePage, { authRequired: true })),
];
