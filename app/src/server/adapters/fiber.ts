import type { CompanyRecord, ContactRecord, SourceRef } from "../../shared/contracts";
import type { HttpClient } from "./http";

// Fiber AI adapter (docs/IMPLEMENTATION_PLAN.md WP2). Checked against api.fiber.ai/openapi.json on 2026-11-22.
//
// Costs seen on GET /v1/get-org-credits for our org: company and person records are free for the
// first 5,000 each per period, then 1 credit; basic work-email reveal is 1 credit. The plan's
// "1 credit per company" was out of date. Only revealWorkEmail checks credits before calling.
//
// The API key travels in the JSON body (`apiKey`) or query string; http.ts redacts both from fixtures.

export const FIBER_BASE_URL = "https://api.fiber.ai";
const PROVIDER = "fiber";

/** Ideal customer profile, already translated into Fiber's vocabulary by the caller. */
export interface FiberCompanyQuery {
  /** Matches any of these words in company text. */
  keywords?: string[];
  /** Fiber `industriesV2` values, e.g. "Logistics", "Manufacturing". */
  industries?: string[];
  /** ISO 3166-1 alpha-3 codes, e.g. "USA". */
  countryCodes?: string[];
  employeeCount?: { min?: number; max?: number };
  pageSize?: number;
  cursor?: string;
}

export interface FiberPeopleQuery {
  companyDomain: string;
  /** Title words; any may match ("operations", "supply chain"). */
  roles: string[];
  limit?: number;
}

/** Hiring research (scope change 2026-11-22): people matching criteria, not tied to one company. */
export interface FiberCandidateQuery {
  /** Title terms, any may match ("robotics engineer"). */
  titles: string[];
  /** Words that must appear somewhere in the profile, any of them (skills). */
  skills?: string[];
  minYearsExperience?: number;
  countryCodes?: string[];
  pageSize?: number;
}

/**
 * A public profile found by research for a hire goal. Not a §7 ContactRecord: no work domain and
 * never an email. People found this way are contacted only through a double-opt-in introduction
 * (the opt_in_only rule).
 */
export interface CandidateRecord {
  fullName: string;
  title: string;
  currentCompany?: string;
  linkedinUrl?: string;
  /** Years since the first non-internship role, as of fetchedAt. */
  yearsExperience?: number;
  seniority?: string;
  skills: string[];
  sources: SourceRef[];
}

export interface FiberJobQuery {
  titles: string[];
  countryCodes?: string[];
  modality?: ("On-site" | "Remote" | "Hybrid")[];
  pageSize?: number;
  cursor?: string;
}

/** A job post for WORK_FOR goals. Not a §7 contract type; it stays local to discovery. */
export interface JobPostingRecord {
  id: string;
  title: string;
  companyName?: string;
  url?: string;
  postedAt?: string;
  location?: string;
  modality?: string;
  sources: SourceRef[];
}

export interface FiberCredits {
  available: number;
  used: number;
  max: number;
}

export class FiberError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    detail: string,
  ) {
    super(`Fiber ${endpoint} failed with HTTP ${status}: ${detail}`);
    this.name = "FiberError";
  }
}

export class InsufficientCreditsError extends Error {
  constructor(
    readonly provider: string,
    readonly needed: number,
    readonly available: number,
  ) {
    super(`${provider} has ${available} credits; this call needs ${needed}. Top up or use replay mode.`);
    this.name = "InsufficientCreditsError";
  }
}

export interface FiberAdapterOptions {
  http: HttpClient;
  apiKey: string;
  baseUrl?: string;
  /** Clock for SourceRef.fetchedAt; injectable for tests. */
  now?: () => Date;
}

export interface FiberAdapter {
  searchCompanies(query: FiberCompanyQuery): Promise<{ companies: CompanyRecord[]; nextCursor?: string }>;
  /** Contacts without email. Email needs revealWorkEmail, which the gateway gates behind approval. */
  searchPeople(query: FiberPeopleQuery): Promise<ContactRecord[]>;
  searchCandidates(query: FiberCandidateQuery): Promise<CandidateRecord[]>;
  searchJobs(query: FiberJobQuery): Promise<{ jobs: JobPostingRecord[]; nextCursor?: string }>;
  revealWorkEmail(contact: { fullName: string; companyDomain: string }): Promise<string | undefined>;
  getCredits(): Promise<FiberCredits>;
}

const REVEAL_EMAIL_CREDITS = 1;

export function createFiberAdapter(options: FiberAdapterOptions): FiberAdapter {
  const baseUrl = options.baseUrl ?? FIBER_BASE_URL;
  const now = options.now ?? (() => new Date());

  async function post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const res = await options.http.request<T>({
      provider: PROVIDER,
      method: "POST",
      url: `${baseUrl}${endpoint}`,
      body: { apiKey: options.apiKey, ...body },
    });
    if (!res.ok) throw new FiberError(endpoint, res.status, errorDetail(res.body));
    return res.body;
  }

  async function getCredits(): Promise<FiberCredits> {
    const endpoint = "/v1/get-org-credits";
    const url = new URL(`${baseUrl}${endpoint}`);
    url.searchParams.set("apiKey", options.apiKey);
    const res = await options.http.request<FiberCreditsResponse>({ provider: PROVIDER, method: "GET", url: url.toString() });
    if (!res.ok) throw new FiberError(endpoint, res.status, errorDetail(res.body));
    const org = res.body.output?.[0];
    return { available: org?.available ?? 0, used: org?.used ?? 0, max: org?.max ?? 0 };
  }

  return {
    async searchCompanies(query) {
      const body = await post<FiberListResponse<FiberCompany>>("/v1/company-search", {
        pageSize: query.pageSize ?? 10,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        searchParams: companySearchParams(query),
      });
      const fetchedAt = now().toISOString();
      const companies = (body.output?.data ?? [])
        .map((c) => toCompanyRecord(c, fetchedAt))
        .filter((c): c is CompanyRecord => c !== null);
      return { companies, nextCursor: body.output?.nextCursor ?? undefined };
    },

    async searchPeople(query) {
      const domain = normalizeDomain(query.companyDomain);
      const body = await post<FiberListResponse<FiberPerson>>("/v1/people-search", {
        pageSize: Math.min(query.limit ?? 3, 3),
        currentCompanies: [{ domain }],
        searchParams: {
          jobTitleV2: { anyOf: query.roles.map((term) => ({ type: "term", term })) },
        },
      });
      const fetchedAt = now().toISOString();
      return (body.output?.data ?? [])
        .map((p) => toContactRecord(p, domain, fetchedAt))
        .filter((c): c is ContactRecord => c !== null);
    },

    async searchJobs(query) {
      const searchParams: Record<string, unknown> = { title: query.titles, isActive: "true" };
      if (query.countryCodes?.length) searchParams.countryOrRegionCode = query.countryCodes;
      if (query.modality?.length) searchParams.jobModality = query.modality;
      const body = await post<FiberListResponse<FiberJob>>("/v1/job-search", {
        pageSize: query.pageSize ?? 10,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        searchParams,
      });
      const fetchedAt = now().toISOString();
      const jobs = (body.output?.data ?? [])
        .filter((j) => j.status !== "closed" && j.title)
        .map((j) => toJobRecord(j, fetchedAt));
      return { jobs, nextCursor: body.output?.nextCursor ?? undefined };
    },

    async revealWorkEmail(contact) {
      const credits = await getCredits();
      if (credits.available < REVEAL_EMAIL_CREDITS) {
        throw new InsufficientCreditsError(PROVIDER, REVEAL_EMAIL_CREDITS, credits.available);
      }
      const body = await post<FiberEmailResponse>("/v1/contact-details/basic-work-email", {
        name: contact.fullName,
        company: normalizeDomain(contact.companyDomain),
      });
      const emails = body.output?.emails ?? [];
      const best = emails.find((e) => e.validationStatus === "valid") ?? emails[0];
      return best?.emailAddress ?? undefined;
    },

    async searchCandidates(query) {
      const searchParams: Record<string, unknown> = {
        jobTitleV2: { anyOf: query.titles.map((term) => ({ type: "term", term })) },
      };
      if (query.skills?.length) searchParams.keywords = { containsAny: query.skills };
      if (query.minYearsExperience !== undefined) searchParams.yearsOfExperience = { lowerBound: query.minYearsExperience };
      if (query.countryCodes?.length) searchParams.country3LetterCode = { anyOf: query.countryCodes };
      const body = await post<FiberListResponse<FiberPerson>>("/v1/people-search", { pageSize: query.pageSize ?? 15, searchParams });
      const asOf = now();
      return (body.output?.data ?? []).map((p) => toCandidateRecord(p, asOf)).filter((c): c is CandidateRecord => c !== null);
    },

    getCredits,
  };
}

// ---------- request mapping ----------

function companySearchParams(q: FiberCompanyQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (q.keywords?.length) params.keywords = { containsAny: q.keywords };
  if (q.industries?.length) params.industriesV2 = { anyOf: q.industries };
  if (q.countryCodes?.length) params.headquartersCountryCode = { anyOf: q.countryCodes };
  if (q.employeeCount && (q.employeeCount.min !== undefined || q.employeeCount.max !== undefined)) {
    params.employeeCountV2 = {
      ...(q.employeeCount.min !== undefined ? { lowerBoundExclusive: Math.max(0, q.employeeCount.min - 1) } : {}),
      ...(q.employeeCount.max !== undefined ? { upperBoundInclusive: q.employeeCount.max } : {}),
    };
  }
  return params;
}

// ---------- response mapping ----------

export function toCompanyRecord(c: FiberCompany, fetchedAt: string): CompanyRecord | null {
  const domain = normalizeDomain(c.domains?.[0] ?? c.websites?.[0] ?? "");
  const name = c.preferred_name ?? c.names?.[0];
  if (!domain || !name) return null;

  const linkedinUrl = c.linkedin_primary_slug ? `https://www.linkedin.com/company/${c.linkedin_primary_slug}` : undefined;
  const url = linkedinUrl ?? `https://${domain}`;
  const description = c.short_description ?? c.li_description ?? c.long_description ?? undefined;
  const industry = c.standard_industries?.[0] ?? c.li_industries?.find((i) => i.primary)?.name ?? undefined;
  const headcount = toRange(c.employee_count_consensus);
  const hq = formatLocation(c.location_consensus);

  const sources: SourceRef[] = [];
  const cite = (claim: string) => sources.push({ provider: PROVIDER, url, fetchedAt, claim });
  cite(`name: ${name}; domain: ${domain}`);
  if (description) cite(`description: ${truncate(description, 160)}`);
  if (industry) cite(`industry: ${industry}`);
  if (headcount) cite(`headcount: ${formatRange(headcount)}`);
  if (hq) cite(`headquarters: ${hq}`);

  return {
    domain,
    name,
    ...(description ? { description } : {}),
    ...(industry ? { industry } : {}),
    ...(headcount ? { headcount } : {}),
    ...(hq ? { hq } : {}),
    ...(linkedinUrl ? { linkedinUrl } : {}),
    sources,
  };
}

export function toContactRecord(p: FiberPerson, companyDomain: string, fetchedAt: string): ContactRecord | null {
  const fullName = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
  if (!fullName) return null;
  const current = (p.experiences ?? []).filter((e) => e.is_current);
  const title = current[0]?.title ?? p.headline ?? "";
  const linkedinUrl = p.url ?? (p.primary_slug ? `https://www.linkedin.com/in/${p.primary_slug}` : undefined);
  const company = current[0]?.company_name;

  // Never copy an email here, even if a future Fiber response includes one: reveal is a separate gated action.
  return {
    fullName,
    title,
    companyDomain,
    ...(linkedinUrl ? { linkedinUrl } : {}),
    sources: [
      {
        provider: PROVIDER,
        ...(linkedinUrl ? { url: linkedinUrl } : {}),
        fetchedAt,
        claim: `${fullName} is ${title || "employed"}${company ? ` at ${company}` : ""} (current role)`,
      },
    ],
  };
}

function toJobRecord(j: FiberJob, fetchedAt: string): JobPostingRecord {
  const location = formatLocation(j.standardized_location);
  return {
    id: j.job_id,
    title: j.title ?? "",
    ...(j.company_name ? { companyName: j.company_name } : {}),
    ...(j.job_url ? { url: j.job_url } : {}),
    ...(j.posted_at ? { postedAt: j.posted_at } : {}),
    ...(location ? { location } : {}),
    ...(j.modality ? { modality: j.modality } : {}),
    sources: [
      {
        provider: PROVIDER,
        ...(j.job_url ? { url: j.job_url } : {}),
        fetchedAt,
        claim: `Open job post: ${j.title}${j.company_name ? ` at ${j.company_name}` : ""}${j.posted_at ? `, posted ${j.posted_at.slice(0, 10)}` : ""}`,
      },
    ],
  };
}

export function toCandidateRecord(p: FiberPerson, asOf: Date): CandidateRecord | null {
  const fullName = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
  if (!fullName) return null;
  const fetchedAt = asOf.toISOString();
  const experiences = p.experiences ?? [];
  const current = experiences.find((e) => e.is_current);
  const title = current?.title ?? p.headline ?? "";
  const linkedinUrl = p.url ?? (p.primary_slug ? `https://www.linkedin.com/in/${p.primary_slug}` : undefined);
  const years = yearsSinceFirstRole(experiences, asOf);
  const skills = (p.skills ?? []).filter((x): x is string => typeof x === "string" && x.length > 0);
  const cite = (claim: string): SourceRef => ({ provider: PROVIDER, ...(linkedinUrl ? { url: linkedinUrl } : {}), fetchedAt, claim });

  const sources = [cite(`role: ${title || "unknown"}${current?.company_name ? ` at ${current.company_name}` : ""}`)];
  if (years !== undefined) sources.push(cite(`experience: about ${years} years since first non-internship role`));
  if (current?.seniority) sources.push(cite(`seniority: ${current.seniority}`));
  if (skills.length) sources.push(cite(`skills: ${skills.slice(0, 15).join(", ")}`));

  return {
    fullName,
    title,
    ...(current?.company_name ? { currentCompany: current.company_name } : {}),
    ...(linkedinUrl ? { linkedinUrl } : {}),
    ...(years !== undefined ? { yearsExperience: years } : {}),
    ...(current?.seniority ? { seniority: current.seniority } : {}),
    skills,
    sources,
  };
}

const NON_CAREER = /intern|teaching assistant|student|research assistant|volunteer/i;

export function yearsSinceFirstRole(experiences: NonNullable<FiberPerson["experiences"]>, asOf: Date): number | undefined {
  const starts = experiences
    .filter((e) => e.start_date && !NON_CAREER.test(`${e.title ?? ""} ${e.seniority ?? ""}`))
    .map((e) => Date.parse(e.start_date!))
    .filter((t) => Number.isFinite(t));
  if (!starts.length) return undefined;
  const years = (asOf.getTime() - Math.min(...starts)) / (365.25 * 24 * 3600 * 1000);
  return Math.max(0, Math.round(years * 10) / 10);
}

export function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function toRange(r: { gte?: number | null; lte?: number | null } | null | undefined) {
  if (!r || (r.gte == null && r.lte == null)) return undefined;
  return {
    ...(r.gte != null ? { min: Math.round(r.gte) } : {}),
    ...(r.lte != null ? { max: Math.round(r.lte) } : {}),
  };
}

function formatRange(r: { min?: number; max?: number }): string {
  if (r.min !== undefined && r.max !== undefined) return r.min === r.max ? `about ${r.min}` : `${r.min}–${r.max}`;
  return r.min !== undefined ? `${r.min}+` : `up to ${r.max}`;
}

function formatLocation(loc: FiberLocation | null | undefined): string | undefined {
  if (!loc) return undefined;
  const parts = [loc.city, loc.state_name ?? loc.state_code, loc.country_name].filter(Boolean);
  return parts.length ? parts.join(", ") : (loc.formatted_address ?? loc.full_address ?? undefined);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function errorDetail(body: unknown): string {
  if (body && typeof body === "object" && "message" in body) return String((body as { message: unknown }).message);
  return typeof body === "string" ? body.slice(0, 300) : "no detail";
}

// ---------- Fiber response shapes (only the fields we read) ----------

interface FiberListResponse<T> {
  output?: { data?: T[]; nextCursor?: string | null };
}

interface FiberLocation {
  city?: string | null;
  state_name?: string | null;
  state_code?: string | null;
  country_name?: string | null;
  formatted_address?: string | null;
  full_address?: string | null;
}

export interface FiberCompany {
  preferred_name?: string | null;
  names?: string[] | null;
  domains?: string[] | null;
  websites?: string[] | null;
  short_description?: string | null;
  li_description?: string | null;
  long_description?: string | null;
  standard_industries?: string[] | null;
  li_industries?: { id: string; name: string; primary?: boolean | null }[] | null;
  employee_count_consensus?: { gte?: number | null; lte?: number | null } | null;
  location_consensus?: FiberLocation | null;
  linkedin_primary_slug?: string | null;
}

export interface FiberPerson {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  headline?: string | null;
  url?: string | null;
  primary_slug?: string;
  experiences?: {
    is_current?: boolean | null;
    title?: string | null;
    company_name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    seniority?: string | null;
  }[] | null;
  skills?: string[] | null;
}

interface FiberJob {
  job_id: string;
  title?: string | null;
  company_name?: string | null;
  job_url?: string | null;
  posted_at?: string | null;
  modality?: string | null;
  status?: "active" | "closed";
  standardized_location?: FiberLocation | null;
}

interface FiberEmailResponse {
  output?: { emails?: { emailAddress?: string; validationStatus?: string }[] };
}

interface FiberCreditsResponse {
  output?: { available?: number; used?: number; max?: number }[];
}
