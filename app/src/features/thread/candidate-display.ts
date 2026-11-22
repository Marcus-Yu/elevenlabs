import type { HireShortlistEntry } from '../matches/hireFlow';
import type { SourceRef } from '../../shared/contracts';

/** Labels remain attached to match IDs as rankings change within this workflow. */
export function candidateLabel(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) { n--; letters = String.fromCharCode(65 + n % 26) + letters; n = Math.floor(n / 26); }
  return `Candidate ${letters}`;
}

// Fictional display names for real public profiles (AGENTS.md rule 5: shown with an "alias" tag).
// A, B, C are fixed by the demo script; "Sam Rivera" is reserved for the synthetic /match user.
const ALIAS_NAMES = ['Maya Chen', 'Jordan Ellis', 'Priya Raman', 'Theo Marsh', 'Lena Okafor', 'Ravi Kapoor',
  'Nora Lindqvist', 'Diego Salas', 'Hana Mori', 'Owen Brooks', 'Iris Novak', 'Kofi Mensah'];

/** Fictional display name for the internal alias at this position; falls back to the letter alias. */
export function candidateDisplayName(index: number): string {
  return ALIAS_NAMES[index] ?? candidateLabel(index);
}

/** "Jordan Ellis looks too junior. Raise the minimum to 4 years?" for a proposed criteria change. */
export function proposalSentence(name: string, change: { field: string; to: unknown } | undefined): string {
  if (change?.field === 'minYearsExperience') return `${name} looks too junior. Raise the minimum to ${String(change.to)} years?`;
  if (change?.field === 'maxYearsExperience') return `${name} looks too senior. Cap experience at ${String(change.to)} years?`;
  if (change?.field === 'mustHaveSkills' && Array.isArray(change.to)) return `${name} is missing ${String(change.to.at(-1))}. Make it a must-have?`;
  return `You rejected ${name}. Apply this change?`;
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
