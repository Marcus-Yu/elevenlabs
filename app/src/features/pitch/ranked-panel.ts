import type { SourceRef } from "../../shared/contracts/discovery";
import { buildPanel, type RankedPanelCandidate, type SourcedAttribute } from "./panel";

type RankedMatch = {
  company: { domain: string; name: string };
  sources: ReadonlyArray<Omit<SourceRef, "fetchedAt" | "url"> & { fetchedAt: Date; url: string | null }>;
};

const roles = [
  { segment: "Operations", role: "Operations lead" },
  { segment: "Finance", role: "Finance lead" },
  { segment: "Technical evaluation", role: "Technical evaluator" },
];

export function panelForRankedMatches(matches: readonly RankedMatch[]) {
  const candidates: RankedPanelCandidate[] = [];
  for (const { company, sources } of matches) {
    const identityClaim = `name: ${company.name}; domain: ${company.domain}`;
    const attributes: Record<string, SourcedAttribute> = {};
    for (const raw of sources) {
      const source = { ...raw, url: raw.url ?? undefined, fetchedAt: raw.fetchedAt.toISOString() };
      // WP5 stores the evidence its ranking used. Some matches cite an industry
      // or headcount without repeating the name/domain claim.
      const field = /^(description|industry|headcount|headquarters): (.+)$/s.exec(source.claim);
      if (source.claim !== identityClaim && !field) continue;
      const [key, value] = field ? [field[1], field[2]] : ["company", company.name];
      const evidence = attributes[key] ??= { value, sources: [] };
      if (evidence.value === value) evidence.sources.push(source);
    }
    if (!Object.keys(attributes).length) continue;
    candidates.push({
      companyDomain: company.domain,
      eligibleSegments: roles.map(({ segment }) => segment),
      attributes,
    });
  }
  return buildPanel(candidates, roles);
}
