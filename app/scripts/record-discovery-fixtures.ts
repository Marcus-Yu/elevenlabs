// Records Fiber and web fixtures for the demo goal (WP2 step 5).
//
//   cd app
//   ADAPTER_MODE=record FIBER_API_KEY=... npx -y tsx scripts/record-discovery-fixtures.ts
//
// Company, person and job records were free on our Fiber plan (first 5,000 per period), so this
// costs no credits today. It never calls contact.reveal_email, which is billed.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDiscoveryHandlersFromEnv } from "../src/server/gateway/handlers/discovery";
import {
  DEMO_CUSTOMER_SEARCH,
  DEMO_JOB_SEARCH,
  DEMO_MANUFACTURER_SEARCH,
  DEMO_WEB_READ,
  demoContactSearch,
} from "../src/server/gateway/handlers/discovery.demo";

if (process.env.ADAPTER_MODE !== "record") {
  console.error("Set ADAPTER_MODE=record to run this script.");
  process.exit(1);
}

const handlers = createDiscoveryHandlersFromEnv();
const ctx = { userId: "fixture-recorder" };

const customers = await handlers["company.search"].run(DEMO_CUSTOMER_SEARCH, ctx);
console.log(`customers: ${customers.data.companies.map((c) => c.domain).join(", ")}`);

const manufacturers = await handlers["company.search"].run(DEMO_MANUFACTURER_SEARCH, ctx);
console.log(`manufacturers: ${manufacturers.data.companies.map((c) => c.domain).join(", ")}`);

for (const company of customers.data.companies.slice(0, 3)) {
  const contacts = await handlers["contact.search"].run(demoContactSearch(company), ctx);
  console.log(`contacts at ${company.domain}: ${contacts.data.contacts.length} (${contacts.data.provider})`);
}

const jobs = await handlers["jobs.search"].run(DEMO_JOB_SEARCH, ctx);
console.log(`jobs: ${jobs.data.jobs.length}`);

const page = await handlers["web.read"].run(DEMO_WEB_READ, ctx);
console.log(`web.read ${DEMO_WEB_READ.url}: ${page.data.text.length} chars, flagged=${page.data.flagged}`);

// The repo is public. People-search fixtures keep only the fields toContactRecord reads; Fiber's
// full profiles (date of birth, education, skills, photos, location) are dropped.
const fiberDir = path.join(process.env.FIXTURES_DIR ?? path.resolve("..", "fixtures"), "fiber");
let trimmed = 0;
for (const file of await readdir(fiberDir)) {
  const fixturePath = path.join(fiberDir, file);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!String(fixture.request?.url).endsWith("/v1/people-search")) continue;
  const data = fixture.response?.body?.output?.data;
  if (!Array.isArray(data)) continue;
  fixture.response.body.output.data = data.map(trimPerson);
  fixture.trimmed = "people fields reduced to name, LinkedIn URL and current roles (public repo)";
  await writeFile(fixturePath, JSON.stringify(fixture, null, 2) + "\n");
  trimmed++;
}
console.log(`trimmed ${trimmed} people-search fixtures`);

function trimPerson(p: Record<string, unknown>) {
  const experiences = Array.isArray(p.experiences) ? p.experiences : [];
  return {
    name: p.name ?? null,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    url: p.url ?? null,
    primary_slug: p.primary_slug,
    experiences: experiences
      .filter((e: { is_current?: boolean }) => e.is_current)
      .map((e: { title?: string; company_name?: string }) => ({ is_current: true, title: e.title ?? null, company_name: e.company_name ?? null })),
  };
}
