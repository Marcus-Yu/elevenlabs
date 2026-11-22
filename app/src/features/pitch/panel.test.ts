import { describe, expect, it } from 'vitest';
import { buildPanel, type RankedPanelCandidate } from './panel';

const source = { provider: 'web' as const, fetchedAt: '2026-01-01', claim: 'Makes widgets', url: 'https://example.org' };
const archetypes = [{ segment: 'ops', role: 'Operations lead' }, { segment: 'finance', role: 'Finance lead' }, { segment: 'sales', role: 'Sales lead' }];
const candidate = (i: number, eligibleSegments = archetypes.map((a) => a.segment)): RankedPanelCandidate => ({
  companyDomain: `company${i}.example`, eligibleSegments,
  attributes: { description: { value: `Description ${i}`, sources: [source] } },
});

describe('buildPanel', () => {
  it('interleaves segments, respects ranking and preserves evidence', () => {
    const result = buildPanel([candidate(1), candidate(2), candidate(3), candidate(4), candidate(5)], archetypes);
    expect(result.complete).toBe(true);
    expect(result.personas).toHaveLength(12);
    expect(result.personas.slice(0, 4).map((p) => [p.segment, p.companyDomain])).toEqual([
      ['ops', 'company1.example'], ['finance', 'company1.example'], ['sales', 'company1.example'], ['ops', 'company2.example'],
    ]);
    expect(result.personas[0].traits).toEqual({ description: 'Description 1' });
    expect(result.personas[0].sources).toEqual([source]);
    expect(buildPanel([candidate(1), candidate(2), candidate(3), candidate(4), candidate(5)], archetypes)).toEqual(result);
    expect(new Set(result.personas.map((p) => p.id)).size).toBe(12);
  });
  it('reports insufficient data and segments instead of inventing personas', () => {
    const result = buildPanel([candidate(1, ['ops']), candidate(2, ['finance'])], archetypes);
    expect(result.complete).toBe(false);
    expect(result.personas).toHaveLength(2);
    expect(result.issues.join(' ')).toContain('sales');
    expect(result.issues.join(' ')).toContain('6 more');
  });
  it('excludes unsourced attributes and duplicate domains', () => {
    const unsourced = candidate(2);
    unsourced.attributes.description.sources = [];
    const result = buildPanel([candidate(1), candidate(1), unsourced], archetypes);
    expect(result.personas).toHaveLength(3);
    expect(result.issues[0]).toContain('2 candidate(s)');
  });
  it('requires a link for each trait and excludes unusable links from returned sources', () => {
    const missingLink = candidate(1);
    missingLink.attributes.description.sources = [{ ...source, url: undefined }];
    const linked = candidate(2);
    linked.attributes.description.sources.push({ ...source, url: 'mailto:ops@example.org' });
    const result = buildPanel([missingLink, linked], archetypes);
    expect(result.personas).toHaveLength(3);
    expect(result.personas[0].companyDomain).toBe('company2.example');
    expect(result.personas[0].sources).toEqual([source]);
  });
  it('requires sufficient configured segments and distinct nonempty archetypes', () => {
    expect(buildPanel([candidate(1), candidate(2), candidate(3), candidate(4)], archetypes.slice(0, 2)).complete).toBe(false);
    expect(() => buildPanel([], [archetypes[0], archetypes[0]])).toThrow();
    expect(() => buildPanel([], [...archetypes, { segment: 'd', role: 'Lead' }, { segment: 'e', role: 'Lead' }])).toThrow();
  });
});
