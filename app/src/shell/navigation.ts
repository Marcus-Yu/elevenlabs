// Top-level navigation: only the pages on the recorded demo path, in story order
// (docs/IMPLEMENTATION_PLAN.md "Scope change"). Placeholder pages keep their routes
// in src/features/<name>/<name>.wasp.ts but are hidden here.

export interface NavItem {
  path: string;
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: "/", label: "Demo" },
  { path: "/thread", label: "1. Hiring" },
  { path: "/match", label: "2. Match (opt-in)" },
  { path: "/approvals", label: "Approvals" },
  { path: "/activity", label: "Activity" },
];
