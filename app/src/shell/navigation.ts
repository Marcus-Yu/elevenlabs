// Top-level navigation, one entry per feature page (docs/IMPLEMENTATION_PLAN.md §4).
// Paths must match the routes declared in each src/features/<name>/<name>.wasp.ts.

export interface NavItem {
  path: string;
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: "/", label: "Briefing" },
  { path: "/thread", label: "Thread" },
  { path: "/goals", label: "Goals" },
  { path: "/matches", label: "Matches" },
  { path: "/approvals", label: "Approvals" },
  { path: "/activity", label: "Activity" },
  { path: "/pitch", label: "Pitch" },
  { path: "/room", label: "The Room" },
  { path: "/voice", label: "Voice" },
  { path: "/meetings", label: "Meetings" },
  { path: "/memory", label: "Memory" },
  { path: "/watchers", label: "Watchers" },
  { path: "/connect", label: "Connect" },
  { path: "/onboarding", label: "Onboarding" },
];
