import type { DbSeedFn } from "wasp/server";
import { createProviderId, sanitizeAndSerializeProviderData } from "wasp/server/auth";

// Local demo data: `wasp db seed seedDemoUser`.
// Creates the demo user and a synthetic robotics startup profile. Creates no matches, goals,
// consents or log rows: those must come from real pipeline runs (AGENTS.md rule 5).

const DEMO_USERNAME = "demo";
const DEFAULT_DEMO_PASSWORD = "atlas-demo-1";

type Purpose = string;
const PUBLIC_USE: Purpose[] = ["company.search", "draft.create", "card.publish"];

interface SeedFact {
  key: string;
  value: string;
  sensitivity: "public" | "shareable" | "private";
  allowedPurposes: Purpose[];
}

export const DEMO_PROFILE_FACTS: SeedFact[] = [
  { key: "company_name", value: "Orrery Robotics", sensitivity: "public", allowedPurposes: PUBLIC_USE },
  {
    key: "product",
    value: "Autonomous picking arm for mixed-SKU warehouse bins",
    sensitivity: "public",
    allowedPurposes: PUBLIC_USE,
  },
  {
    key: "target_customers",
    value: "Third-party logistics providers and mid-size e-commerce fulfilment centres",
    sensitivity: "public",
    allowedPurposes: PUBLIC_USE,
  },
  { key: "hq", value: "Pittsburgh, PA", sensitivity: "public", allowedPurposes: PUBLIC_USE },
  { key: "stage", value: "Seed stage, 14 employees", sensitivity: "shareable", allowedPurposes: ["draft.create"] },
  {
    key: "gripper_housing_spec",
    value: "Glass-filled nylon gripper housing, injection moulded, about 5,000 units per year",
    sensitivity: "shareable",
    allowedPurposes: ["draft.create"],
  },
  // Must never leave the workspace: no allowed purposes. The private_leak rule and WP14 test this.
  {
    key: "manufacturing_budget_ceiling",
    value: "$180,000",
    sensitivity: "private",
    allowedPurposes: [],
  },
];

export const seedDemoUser: DbSeedFn = async (prisma) => {
  const providerId = createProviderId("username", DEMO_USERNAME);
  const existing = await prisma.authIdentity.findUnique({
    where: { providerName_providerUserId: providerId },
  });
  if (existing) {
    console.log(`Demo user "${DEMO_USERNAME}" already exists; nothing to do.`);
    return;
  }

  const password = process.env.DEMO_USER_PASSWORD || DEFAULT_DEMO_PASSWORD;
  const user = await prisma.user.create({
    data: {
      auth: {
        create: {
          identities: {
            create: {
              providerName: providerId.providerName,
              providerUserId: providerId.providerUserId,
              providerData: await sanitizeAndSerializeProviderData<"username">({ hashedPassword: password }),
            },
          },
        },
      },
      profiles: {
        create: {
          sourceKind: "oneliner",
          summary:
            "Synthetic demo profile: Orrery Robotics builds autonomous picking arms for warehouse bins " +
            "and needs logistics customers and a contract manufacturer for its gripper housing.",
          facts: { create: DEMO_PROFILE_FACTS },
        },
      },
    },
  });

  console.log(`Created demo user "${DEMO_USERNAME}" (${user.id}) with ${DEMO_PROFILE_FACTS.length} profile facts.`);
};
