import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { VoicePage } from "./VoicePage" with { type: "ref" };

import { createScribeToken, speakBriefing } from "./operations" with { type: "ref" };

import { getModelProcessingConsent, setModelProcessingConsent, listVoiceHireGoals } from "./consent-operations" with { type: "ref" };

// Wasp declarations for the "voice" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const voiceSpec: Spec = [
  route("VoiceRoute", "/voice", page(VoicePage, { authRequired: true })),
  query(getModelProcessingConsent, { auth: true, entities: ["Consent"] }),
  action(setModelProcessingConsent, { auth: true, entities: ["Consent"] }),
  query(listVoiceHireGoals, { auth: true, entities: ["Goal"] }),
  action(createScribeToken, { auth: true, entities: ["ActionLog"] }),
  action(speakBriefing, { auth: true, entities: ["Goal", "ActionLog"] }),
];
