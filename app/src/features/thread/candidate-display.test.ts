import { describe, expect, it } from 'vitest';
import { candidateLabel, hideCandidateIdentity, sourceSummary } from './candidate-display';

describe('anonymous shortlist display', () => {
  const entry = { candidate: { fullName: 'Jane Doe', currentCompany: 'Acme Robotics', linkedinUrl: 'https://linkedin.com/in/jane' } };
  it('gives stable labels for positions beyond Z', () => {
    expect([0, 1, 25, 26].map(candidateLabel)).toEqual(['Candidate A', 'Candidate B', 'Candidate Z', 'Candidate AA']);
  });
  it('hides identities and URLs in displayed free text', () => {
    expect(hideCandidateIdentity('Jane Doe at Acme Robotics https://linkedin.com/in/jane', [entry])).toBe('[hidden] at [hidden] [profile hidden]');
  });
  it('retains provenance without showing the raw claim or URL', () => {
    expect(sourceSummary({ provider: 'fiber', claim: 'role: Engineer at Acme Robotics', url: 'https://linkedin.com/in/jane', fetchedAt: '2026-11-22T00:00:00Z' })).toBe('fiber · role evidence · retrieved 2026-11-22');
  });
});
