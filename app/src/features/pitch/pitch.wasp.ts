import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { PitchPage } from "./PitchPage" with { type: "ref" };
import { listPitchGoals, scorePitchRun } from "./operations" with { type: "ref" };

// Wasp declarations for the "pitch" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const pitchSpec: Spec = [
  route("PitchRoute", "/pitch", page(PitchPage, { authRequired: true })),
  query(listPitchGoals, { entities: ["Goal", "Match", "Panel"] }),
  action(scorePitchRun, { entities: ["Goal", "Match", "Panel", "PitchRun", "SegmentScore"] }),
];
