// Pure, deterministic helpers for the /match double-opt-in demo. No LLM: fixed text only.

export const SYNTHETIC_B_SUMMARY = "Synthetic second user: robotics engineer seeking a manipulation/controls role (demo data, not a real person).";

export interface SyntheticFact {
  key: string;
  value: string;
  sensitivity: "public" | "shareable" | "private";
  allowedPurposes: string[];
}

export const SYNTHETIC_B_FACTS: SyntheticFact[] = [
  { key: "name", value: "Sam Rivera (synthetic)", sensitivity: "shareable", allowedPurposes: [] },
  { key: "email", value: "sam.rivera@example.invalid", sensitivity: "shareable", allowedPurposes: [] },
  { key: "seeking", value: "Robotics software role: grasp planning and controls", sensitivity: "public", allowedPurposes: ["card.publish"] },
  { key: "experience", value: "6 years ROS 2, motion planning, warehouse picking", sensitivity: "public", allowedPurposes: ["card.publish"] },
  { key: "salary_floor", value: "$165,000", sensitivity: "private", allowedPurposes: [] },
];

/** Identity fields each side may choose to reveal. */
export const IDENTITY_FIELDS = ["name", "company", "email"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export function matchRationale(cardA: Record<string, string>, cardB: Record<string, string>): string {
  const a = Object.values(cardA).join(" ").toLowerCase();
  const b = Object.values(cardB).join(" ").toLowerCase();
  const shared = ["robotics", "picking", "warehouse", "grasp", "controls"].filter((w) => a.includes(w) && b.includes(w));
  return shared.length > 0
    ? `Rule-based match: both cards mention ${shared.join(", ")}.`
    : "Rule-based match: no shared keywords.";
}

export function introDraft(a: Record<string, string>, b: Record<string, string>): string {
  const aName = a.name ?? "the hiring manager";
  const bName = b.name ?? "the engineer";
  const lines = [
    `Subject: Introduction: ${aName} <> ${bName}`,
    "",
    `Hi ${aName} and ${bName},`,
    "",
    `You both opted in to this introduction${a.company ? ` (${aName} at ${a.company})` : ""}.`,
    ...Object.entries(a).filter(([k]) => k !== "name").map(([k, v]) => `- ${aName} ${k}: ${v}`),
    ...Object.entries(b).filter(([k]) => k !== "name").map(([k, v]) => `- ${bName} ${k}: ${v}`),
    "",
    "I'll let you take it from here.",
  ];
  return lines.join("\n");
}
