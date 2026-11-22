import { z } from "zod";
import type { SourceRef } from "../../shared/contracts";

// WP5 for hiring (scope change 2026-11-22): approved criteria → sourced candidate shortlist →
// rejection with a reason → proposed criteria change → user confirms (preference_confirm) → rerun.
//
// Rule-based and deterministic (method "rules-v1"), like ranking.ts: every point cites the source of
// the profile field it judged. Candidates are real public profiles found by research; they are
// never contacted from here (the opt_in_only rule), only through a double-opt-in introduction.

export const CANDIDATE_RANKING_METHOD = "rules-v1";
/** Low enough that a full match (about 90) does not hit the 100 cap, so nice-to-haves still separate candidates. */
const BASE_SCORE = 20;

/** What WP3's /calibrate/criteria returns once the user approves it (shape proposed to person-3). */
export const HireCriteria = z.object({
  role: z.string().min(2).max(120),
  /** Title terms for people search. */
  titles: z.array(z.string().min(2)).min(1).max(10),
  mustHaveSkills: z.array(z.string().min(1)).max(10).default([]),
  niceToHaveSkills: z.array(z.string().min(1)).max(15).default([]),
  minYearsExperience: z.number().min(0).max(40).optional(),
  maxYearsExperience: z.number().min(0).max(50).optional(),
  countryCodes: z.array(z.string().length(3)).max(10).optional(),
  /** Calibration evidence, carried through for the UI: which synthetic-profile reactions led to which criterion. */
  evidence: z.array(z.object({ criterion: z.string(), reactions: z.array(z.string()) })).default([]),
});
export type HireCriteria = z.output<typeof HireCriteria>;

/** Structural match for adapters/fiber.ts CandidateRecord (features must not import adapters). */
export interface Candidate {
  fullName: string;
  title: string;
  currentCompany?: string;
  linkedinUrl?: string;
  yearsExperience?: number;
  seniority?: string;
  skills: string[];
  sources: SourceRef[];
}

export interface CandidateReason {
  text: string;
  points: number;
  source?: SourceRef;
}

export interface RankedCandidate {
  candidate: Candidate;
  score: number;
  rationale: string;
  reasons: CandidateReason[];
  citedSources: SourceRef[];
  meetsMustHaves: boolean;
  method: typeof CANDIDATE_RANKING_METHOD;
}

/** The people-search request for these criteria (contact.search in criteria mode). */
export function candidateQueryFor(criteria: HireCriteria) {
  return {
    titles: criteria.titles,
    ...(criteria.mustHaveSkills.length ? { skills: criteria.mustHaveSkills } : {}),
    ...(criteria.minYearsExperience !== undefined ? { minYearsExperience: criteria.minYearsExperience } : {}),
    ...(criteria.countryCodes?.length ? { countryCodes: criteria.countryCodes } : {}),
    pageSize: 15,
  };
}

// ---------- skills ----------

const ALIASES: Record<string, string[]> = {
  ros: ["robot operating system", "ros2", "ros 2"],
  "c++": ["cpp", "c/c++"],
  "motion planning": ["path planning", "trajectory planning"],
  "computer vision": ["opencv", "machine vision"],
  python: ["python3"],
  slam: ["simultaneous localization and mapping"],
};

export function hasSkill(skills: string[], wanted: string): boolean {
  const w = wanted.toLowerCase().trim();
  const names = [w, ...(ALIASES[w] ?? [])];
  return skills.some((s) => {
    const have = s.toLowerCase();
    return names.some((n) => have === n || new RegExp(`(^|[^a-z0-9+])${escapeRe(n)}([^a-z0-9+]|$)`).test(have));
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- ranking ----------

export function rankCandidates(input: { candidates: Candidate[]; criteria: HireCriteria; rejectedUrls?: string[] }): RankedCandidate[] {
  const rejected = new Set(input.rejectedUrls ?? []);
  const seen = new Set<string>();
  return input.candidates
    .filter((c) => c.sources.length > 0)
    .filter((c) => {
      const key = c.linkedinUrl ?? c.fullName;
      if (rejected.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => scoreCandidate(c, input.criteria))
    .sort((a, b) => b.score - a.score || a.candidate.fullName.localeCompare(b.candidate.fullName));
}

function scoreCandidate(c: Candidate, criteria: HireCriteria): RankedCandidate {
  const src = (field: string) => c.sources.find((s) => s.claim.toLowerCase().startsWith(`${field}:`));
  const reasons: CandidateReason[] = [];

  const titleHit = criteria.titles.some((t) => c.title.toLowerCase().includes(t.toLowerCase()));
  reasons.push(titleHit ? { text: `Current role "${c.title}" matches`, points: 15, source: src("role") } : { text: `Current role "${c.title || "unknown"}" is not a target title`, points: -5, source: src("role") });

  const missing: string[] = [];
  for (const skill of criteria.mustHaveSkills) {
    if (hasSkill(c.skills, skill)) reasons.push({ text: `Has must-have ${skill}`, points: 15, source: src("skills") });
    else missing.push(skill);
  }
  if (missing.length) reasons.push({ text: `Profile does not list ${missing.join(", ")}`, points: -15 * missing.length, source: src("skills") ?? src("role") });

  const nice = criteria.niceToHaveSkills.filter((s) => hasSkill(c.skills, s));
  if (nice.length) reasons.push({ text: `Also lists ${nice.join(", ")}`, points: Math.min(15, 5 * nice.length), source: src("skills") });

  const years = c.yearsExperience;
  if (years !== undefined && criteria.minYearsExperience !== undefined && years < criteria.minYearsExperience) {
    reasons.push({ text: `About ${years} years of experience, below the ${criteria.minYearsExperience}-year minimum`, points: -30, source: src("experience") });
  } else if (years !== undefined && criteria.maxYearsExperience !== undefined && years > criteria.maxYearsExperience) {
    reasons.push({ text: `About ${years} years of experience, above the ${criteria.maxYearsExperience}-year maximum`, points: -20, source: src("experience") });
  } else if (years !== undefined && (criteria.minYearsExperience !== undefined || criteria.maxYearsExperience !== undefined)) {
    reasons.push({ text: `About ${years} years of experience, within range`, points: 10, source: src("experience") });
  } else if (years === undefined && criteria.minYearsExperience !== undefined) {
    reasons.push({ text: "Experience could not be determined from the profile", points: -10, source: src("role") });
  }

  const score = Math.max(0, Math.min(100, Math.round(BASE_SCORE + reasons.reduce((n, r) => n + r.points, 0))));
  const pos = reasons.filter((r) => r.points > 0).map((r) => r.text);
  const neg = reasons.filter((r) => r.points < 0).map((r) => r.text);
  const rationale = [pos.length ? `Fits: ${pos.join("; ")}.` : "", neg.length ? `Against: ${neg.join("; ")}.` : ""].filter(Boolean).join(" ") + " (Rule-based; each point cites the public profile.)";
  const cited = [...new Map(reasons.filter((r) => r.source).map((r) => [r.source!.claim, r.source!])).values()];
  const meetsMin = criteria.minYearsExperience === undefined || (years !== undefined && years >= criteria.minYearsExperience);
  return { candidate: c, score, rationale, reasons, citedSources: cited, meetsMustHaves: missing.length === 0 && meetsMin, method: CANDIDATE_RANKING_METHOD };
}

// ---------- rejection → proposed criteria change → confirm → rerun ----------

export interface CriteriaChange {
  /** The fields that would change, with old and new values, for the confirm card. */
  changes: { field: keyof HireCriteria; from: unknown; to: unknown }[];
  explanation: string;
  /** The rejection that led to it, for the memory item and the audit log. */
  basedOn: { candidate: string; reason: string; source?: SourceRef };
}

const JUNIOR = /\b(too junior|junior|not senior enough|too green|needs more experience|inexperienced)\b/i;
const SENIOR = /\b(too senior|overqualified|too experienced|too expensive)\b/i;

/** Proposes, never applies: the user confirms with preference_confirm before the rerun. */
export function proposeCriteriaChange(criteria: HireCriteria, rejected: Candidate, reason: string): CriteriaChange | null {
  const basedOn = { candidate: rejected.fullName, reason, source: rejected.sources.find((s) => s.claim.startsWith("experience:")) ?? rejected.sources[0] };

  if (JUNIOR.test(reason) && rejected.yearsExperience !== undefined) {
    const to = Math.max(criteria.minYearsExperience ?? 0, Math.floor(rejected.yearsExperience) + 1);
    if (to === criteria.minYearsExperience) return null;
    return { changes: [{ field: "minYearsExperience", from: criteria.minYearsExperience ?? null, to }], explanation: `You rejected ${rejected.fullName} (about ${rejected.yearsExperience} years) as too junior. Raise the minimum to ${to} years?`, basedOn };
  }
  if (SENIOR.test(reason) && rejected.yearsExperience !== undefined) {
    const to = Math.max(criteria.minYearsExperience ?? 0, Math.ceil(rejected.yearsExperience) - 1);
    return { changes: [{ field: "maxYearsExperience", from: criteria.maxYearsExperience ?? null, to }], explanation: `You rejected ${rejected.fullName} (about ${rejected.yearsExperience} years) as too senior. Cap experience at ${to} years?`, basedOn };
  }
  const missingSkill = /\b(?:no|missing|lacks|without)\s+([a-z0-9+#][a-z0-9+# .-]{0,30})/i.exec(reason)?.[1]?.trim();
  if (missingSkill && !criteria.mustHaveSkills.some((s) => s.toLowerCase() === missingSkill.toLowerCase())) {
    return { changes: [{ field: "mustHaveSkills", from: criteria.mustHaveSkills, to: [...criteria.mustHaveSkills, missingSkill] }], explanation: `You rejected ${rejected.fullName} for missing ${missingSkill}. Make ${missingSkill} a must-have?`, basedOn };
  }
  return null;
}

export function applyCriteriaChange(criteria: HireCriteria, change: CriteriaChange): HireCriteria {
  const next = { ...criteria } as Record<string, unknown>;
  for (const c of change.changes) next[c.field] = c.to;
  return HireCriteria.parse(next);
}

/**
 * The evaluation delta TraceRoot shows for two runs: of each run's top k, how many meet the
 * confirmed criteria. Both runs are judged by the same (new) criteria so the numbers are comparable.
 */
export function evaluateShortlist(ranked: RankedCandidate[], judgeBy: HireCriteria, k = 5): { k: number; fitAtK: number; meanScore: number } {
  const top = ranked.slice(0, k).map((r) => scoreCandidate(r.candidate, judgeBy));
  return {
    k,
    fitAtK: top.filter((r) => r.meetsMustHaves).length,
    meanScore: top.length ? Math.round(top.reduce((n, r) => n + r.score, 0) / top.length) : 0,
  };
}
