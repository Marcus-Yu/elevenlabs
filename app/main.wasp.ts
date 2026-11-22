import { app, page, route } from "@wasp.sh/spec";
import { LoginPage, SignupPage } from "./src/auth/AuthPages" with { type: "ref" };
import { seedDemoUser } from "./src/server/seed/demoSeed" with { type: "ref" };
import { AppShell } from "./src/shell/AppShell" with { type: "ref" };

// One spec per feature (docs/IMPLEMENTATION_PLAN.md §4). Owners add their
// routes, operations, apis and jobs to their own <feature>.wasp.ts file.
import { activitySpec } from "./src/features/activity/activity.wasp";
import { approvalsSpec } from "./src/features/approvals/approvals.wasp";
import { briefingSpec } from "./src/features/briefing/briefing.wasp";
import { connectSpec } from "./src/features/connect/connect.wasp";
import { goalsSpec } from "./src/features/goals/goals.wasp";
import { matchesSpec } from "./src/features/matches/matches.wasp";
import { meetingsSpec } from "./src/features/meetings/meetings.wasp";
import { memorySpec } from "./src/features/memory/memory.wasp";
import { onboardingSpec } from "./src/features/onboarding/onboarding.wasp";
import { pitchSpec } from "./src/features/pitch/pitch.wasp";
import { roomSpec } from "./src/features/room/room.wasp";
import { threadSpec } from "./src/features/thread/thread.wasp";
import { voiceSpec } from "./src/features/voice/voice.wasp";
import { watchersSpec } from "./src/features/watchers/watchers.wasp";

export default app({
  name: "atlas",
  wasp: { version: "^0.26" },
  title: "Atlas",
  head: ["<link rel='icon' href='/favicon.ico' />"],
  auth: {
    userEntity: "User",
    methods: {
      usernameAndPassword: {},
    },
    onAuthFailedRedirectTo: "/login",
    onAuthSucceededRedirectTo: "/",
  },
  client: {
    rootComponent: AppShell,
  },
  db: {
    seeds: [seedDemoUser],
  },
  spec: [
    route("LoginRoute", "/login", page(LoginPage)),
    route("SignupRoute", "/signup", page(SignupPage)),
    onboardingSpec,
    goalsSpec,
    matchesSpec,
    threadSpec,
    approvalsSpec,
    briefingSpec,
    pitchSpec,
    roomSpec,
    voiceSpec,
    meetingsSpec,
    memorySpec,
    activitySpec,
    watchersSpec,
    connectSpec,
  ],
});
