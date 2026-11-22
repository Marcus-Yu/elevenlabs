import type { SourceRef } from '../../shared/contracts/discovery';
import type { Persona } from '../../shared/contracts/sim';

/** WP5 adapter supplies candidates in descending rank. Each attribute has its own evidence. */
export type SourcedAttribute = { value: string; sources: SourceRef[] };
export type RankedPanelCandidate = {
  companyDomain: string;
  eligibleSegments: string[];
  attributes: Record<string, SourcedAttribute>;
};
/** Caller configures role titles/archetypes, never real people's names or contact data. */
export type AudienceArchetype = { segment: string; role: string };
export type PanelResult = {
  personas: Persona[];
  complete: boolean;
  issues: string[];
};

function hasEvidenceLink(source: SourceRef): boolean {
  if (!source.url) return false;
  try {
    const url = new URL(source.url);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Build at most twelve role archetypes from ranked, explicitly eligible companies.
 * Round-robin segments before taking another candidate in a segment. A company
 * can appear once per segment, always as an archetype, not a named person.
 * The returned facts and sources come only from accepted candidate attributes.
 */
export function buildPanel(candidates: RankedPanelCandidate[], archetypes: AudienceArchetype[]): PanelResult {
  if (archetypes.length > 4) throw new Error('Configure at most four audience segments');
  if (archetypes.some((a) => !a.segment.trim() || !a.role.trim()) ||
      new Set(archetypes.map((a) => a.segment)).size !== archetypes.length) {
    throw new Error('Segments and role titles must be nonempty, with unique segments');
  }
  const issues: string[] = [];
  const seenDomains = new Set<string>();
  const eligible: RankedPanelCandidate[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    const domain = candidate.companyDomain.trim().toLowerCase();
    const attributes = Object.entries(candidate.attributes);
    const validSource = (s: SourceRef) => Boolean(s.claim.trim() && s.fetchedAt.trim());
    if (!domain || seenDomains.has(domain) || !attributes.length ||
        attributes.some(([key, fact]) =>
          !key.trim() || !fact.value.trim() || !fact.sources.some(hasEvidenceLink) || !fact.sources.every(validSource),
        )) {
      skipped++;
      continue;
    }
    seenDomains.add(domain);
    eligible.push({ ...candidate, companyDomain: domain });
  }
  if (skipped) issues.push(`${skipped} candidate(s) lacked unique domains or sourced attributes; provide distinct, sourced companies.`);

  const personas: Persona[] = [];
  const positions = new Map(archetypes.map((a) => [a.segment, 0]));
  const bySegment = new Map(archetypes.map((a) => [a.segment, eligible.filter((c) => c.eligibleSegments.includes(a.segment))]));
  while (personas.length < 12) {
    let added = false;
    for (const archetype of archetypes) {
      const position = positions.get(archetype.segment)!;
      const candidate = bySegment.get(archetype.segment)![position];
      if (!candidate) continue;
      positions.set(archetype.segment, position + 1);
      const traits = Object.fromEntries(Object.entries(candidate.attributes).map(([key, fact]) => [key, fact.value]));
      const sources = Object.values(candidate.attributes).flatMap((fact) =>
        fact.sources.filter(hasEvidenceLink).map((source) => ({ ...source })),
      );
      personas.push({
        id: JSON.stringify([candidate.companyDomain, archetype.segment]),
        segment: archetype.segment,
        label: `${archetype.role} at ${candidate.companyDomain}`,
        companyDomain: candidate.companyDomain,
        role: archetype.role,
        traits,
        sources,
      });
      added = true;
      if (personas.length === 12) break;
    }
    if (!added) break;
  }
  const represented = new Set(personas.map((p) => p.segment));
  const missingSegments = archetypes.filter((a) => !represented.has(a.segment)).map((a) => a.segment);
  if (archetypes.length < 3) issues.push('Configure at least three audience segments with role archetypes.');
  if (missingSegments.length) issues.push(`Add eligible sourced companies for: ${missingSegments.join(', ')}.`);
  if (personas.length < 8) issues.push(`Add eligible sourced company/segment combinations: ${8 - personas.length} more needed for an eight-person panel.`);
  return { personas, complete: personas.length >= 8 && represented.size >= 3 && represented.size <= 4, issues };
}
