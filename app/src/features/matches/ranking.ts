import type { CompanyRecord, ContactRecord, SourceRef } from "../../shared/contracts";

// Vet and rank (docs/IMPLEMENTATION_PLAN.md WP5 step 3, "rank with a rationale that cites sources").
//
// Rule-based and deterministic (method "rules-v1"): every point a company earns or loses is tied to
// the SourceRef of the field it was judged on, so the rationale only states what a source supports.
// Match review feeds back in (step 4): a rejected company is dropped, and two or more rejections
// for the same reason push similar companies down.

export const RANKING_METHOD = "rules-v1";

export interface RankingCriteria {
  industries?: string[];
  keywords?: string[];
  employeeCount?: { min?: number; max?: number };
}

/** A past REJECTED match, from Match rows (status, rejectReason) joined to Company. */
export interface Rejection {
  company: CompanyRecord;
  reason: string;
}

export interface RankingReason {
  text: string;
  points: number;
  source?: SourceRef;
}

/** The ranked-match output other packages consume (WP8 panel builder, WP6 briefing, WP4 thread). */
export interface RankedMatch {
  company: CompanyRecord;
  /** 0–100. Relative within one ranking, not a probability. */
  score: number;
  rationale: string;
  reasons: RankingReason[];
  /** The sources the rationale relies on, deduplicated; store these as the Match's SourceRefs. */
  citedSources: SourceRef[];
  method: typeof RANKING_METHOD;
  contacts?: ContactRecord[];
}

export interface RankingInput {
  companies: CompanyRecord[];
  criteria: RankingCriteria;
  rejections?: Rejection[];
  /** Domains already matched to this goal; skipped so a re-rank never duplicates a Match. */
  existingDomains?: string[];
}

const BASE = 40;

export function rankCompanies(input: RankingInput): RankedMatch[] {
  const rejected = new Set((input.rejections ?? []).map((r) => r.company.domain));
  const existing = new Set(input.existingDomains ?? []);
  const learned = learnFromRejections(input.rejections ?? []);

  return input.companies
    .filter((c) => c.sources.length > 0 && !rejected.has(c.domain) && !existing.has(c.domain))
    .map((company) => score(company, input.criteria, learned))
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name));
}

function score(company: CompanyRecord, criteria: RankingCriteria, learned: LearnedPreference[]): RankedMatch {
  const reasons: RankingReason[] = [];
  const src = (field: string) => company.sources.find((s) => s.claim.toLowerCase().startsWith(`${field}:`));

  const industry = company.industry?.toLowerCase();
  if (industry && criteria.industries?.length) {
    const hit = criteria.industries.some((i) => i.toLowerCase() === industry);
    reasons.push(hit ? { text: `Industry is ${company.industry}`, points: 20, source: src("industry") } : { text: `Industry ${company.industry} is outside the target`, points: -10, source: src("industry") });
  }

  const head = company.headcount;
  const want = criteria.employeeCount;
  if (head && want && (want.min !== undefined || want.max !== undefined)) {
    const lo = head.min ?? head.max!;
    const hi = head.max ?? head.min!;
    const inside = (want.min === undefined || lo >= want.min) && (want.max === undefined || hi <= want.max);
    const overlaps = (want.min === undefined || hi >= want.min) && (want.max === undefined || lo <= want.max);
    const label = lo === hi ? `about ${lo}` : `${lo}–${hi}`;
    reasons.push(
      inside
        ? { text: `Headcount ${label} is in the target range`, points: 20, source: src("headcount") }
        : overlaps
          ? { text: `Headcount ${label} partly overlaps the target range`, points: 8, source: src("headcount") }
          : { text: `Headcount ${label} is outside the target range`, points: -20, source: src("headcount") },
    );
  }

  const description = company.description?.toLowerCase() ?? "";
  const keywordHits = (criteria.keywords ?? []).filter((k) => description.includes(k.toLowerCase()));
  if (keywordHits.length) {
    reasons.push({ text: `Description mentions ${keywordHits.map((k) => `"${k}"`).join(", ")}`, points: Math.min(15, 5 * keywordHits.length), source: src("description") });
  }

  for (const pref of learned) {
    const reason = pref.applies(company);
    if (reason) reasons.push({ ...reason, source: reason.source ?? src(pref.field) });
  }

  const total = Math.max(0, Math.min(100, BASE + reasons.reduce((n, r) => n + r.points, 0)));
  const cited = dedupe(reasons.map((r) => r.source).filter((s): s is SourceRef => Boolean(s)));
  const positives = reasons.filter((r) => r.points > 0).map((r) => r.text);
  const negatives = reasons.filter((r) => r.points < 0).map((r) => r.text);
  const rationale =
    [positives.length ? `Fits: ${positives.join("; ")}.` : "No target criteria confirmed by a source.", negatives.length ? `Against: ${negatives.join("; ")}.` : ""]
      .filter(Boolean)
      .join(" ") + " (Rule-based ranking; each point cites its source.)";

  return { company, score: Math.round(total), rationale, reasons, citedSources: cited.length ? cited : company.sources.slice(0, 1), method: RANKING_METHOD };
}

// ---------- learning from rejections ----------

interface LearnedPreference {
  field: "headcount" | "industry";
  applies(company: CompanyRecord): Omit<RankingReason, "source"> & { source?: SourceRef } | null;
}

/** A learned size limit overrides the goal's range: cancel the +20 in-range credit and count it as out of range (-20). */
const SIZE_OVERRIDE = -40;

const SMALL = /\b(too small|small|tiny|not big enough|undersized)\b/i;
const LARGE = /\b(too (big|large)|enterprise|huge|oversized)\b/i;

/** Only patterns that two or more rejections agree on are learned; one rejection only drops that company. */
export function learnFromRejections(rejections: Rejection[]): LearnedPreference[] {
  const learned: LearnedPreference[] = [];

  const small = rejections.filter((r) => SMALL.test(r.reason) && r.company.headcount);
  if (small.length >= 2) {
    const ceiling = Math.max(...small.map((r) => r.company.headcount!.max ?? r.company.headcount!.min!));
    learned.push({
      field: "headcount",
      applies: (c) => {
        const hi = c.headcount?.max ?? c.headcount?.min;
        return hi !== undefined && hi <= ceiling ? { text: `You rejected ${small.length} companies of this size as too small`, points: SIZE_OVERRIDE } : null;
      },
    });
  }

  const large = rejections.filter((r) => LARGE.test(r.reason) && r.company.headcount);
  if (large.length >= 2) {
    const floor = Math.min(...large.map((r) => r.company.headcount!.min ?? r.company.headcount!.max!));
    learned.push({
      field: "headcount",
      applies: (c) => {
        const lo = c.headcount?.min ?? c.headcount?.max;
        return lo !== undefined && lo >= floor ? { text: `You rejected ${large.length} companies of this size as too large`, points: SIZE_OVERRIDE } : null;
      },
    });
  }

  // Same non-size reason twice for the same industry: push that industry down.
  const byIndustryReason = new Map<string, Rejection[]>();
  for (const r of rejections) {
    if (SMALL.test(r.reason) || LARGE.test(r.reason) || !r.company.industry) continue;
    const key = `${r.company.industry.toLowerCase()}|${normalizeReason(r.reason)}`;
    byIndustryReason.set(key, [...(byIndustryReason.get(key) ?? []), r]);
  }
  for (const [key, group] of byIndustryReason) {
    if (group.length < 2) continue;
    const industry = key.split("|")[0]!;
    learned.push({
      field: "industry",
      applies: (c) =>
        c.industry?.toLowerCase() === industry ? { text: `You rejected ${group.length} ${group[0]!.company.industry} companies: "${group[0]!.reason}"`, points: -15 } : null,
    });
  }
  return learned;
}

function normalizeReason(reason: string): string {
  return reason.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function dedupe(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.provider}|${s.url ?? ""}|${s.claim}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
