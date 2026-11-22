import type { HireShortlistEntry } from '../matches/hireFlow';
import type { SourceRef } from '../../shared/contracts';

/** Labels remain attached to match IDs as rankings change within this workflow. */
export function candidateLabel(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) { n--; letters = String.fromCharCode(65 + n % 26) + letters; n = Math.floor(n / 26); }
  return `Candidate ${letters}`;
}

type CandidateIdentity = Pick<HireShortlistEntry['candidate'], 'fullName' | 'currentCompany' | 'linkedinUrl'>;

export function hideCandidateIdentity(text: string, entries: { candidate: CandidateIdentity }[]): string {
  let safe = text.replace(/https?:\/\/\S+/gi, '[profile hidden]');
  const identities = entries.flatMap(({ candidate }) => [candidate.fullName, candidate.currentCompany, candidate.linkedinUrl]).filter((x): x is string => !!x && x.trim().length > 1).sort((a, b) => b.length - a.length);
  for (const identity of identities) safe = safe.replace(new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[hidden]');
  return safe;
}

/** Keep provenance, but never expose the identifying profile URL or raw source claim. */
export function sourceSummary(source: SourceRef): string {
  const field = /^(role|experience|seniority|skills):/i.exec(source.claim)?.[1]?.toLowerCase() ?? 'profile';
  const date = /^\d{4}-\d{2}-\d{2}/.exec(source.fetchedAt)?.[0] ?? 'date unavailable';
  const provider = ['fiber', 'ploid', 'web'].includes(source.provider) ? source.provider : 'source';
  return `${provider} · ${field} evidence · retrieved ${date}`;
}
