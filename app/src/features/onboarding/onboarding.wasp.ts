import { page, route, type Spec } from "@wasp.sh/spec";
import { OnboardingPage } from "./OnboardingPage" with { type: "ref" };

// Wasp declarations for the "onboarding" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const onboardingSpec: Spec = [
  route("OnboardingRoute", "/onboarding", page(OnboardingPage, { authRequired: true })),
];
