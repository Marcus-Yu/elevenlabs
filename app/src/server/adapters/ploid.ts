import type { ContactRecord, SourceRef } from "../../shared/contracts";
import { normalizeDomain } from "./fiber";
import type { HttpClient } from "./http";

// Ploid adapter (docs/IMPLEMENTATION_PLAN.md WP2). Written against Ploid's own spec at
// https://api.ploid.com/v1/openapi.json ("Ploid Public API 2.0.0", read 2026-11-22), which replaces
// the third-party listings the plan relied on.
//
// Not yet exercised against the live API: the team has no Ploid key. Until PLOID_API_KEY is set,
// contact.search falls back to Fiber people search (see gateway/handlers/discovery.ts).
//
// Auth: `Authorization: Bearer <key>` (the spec also accepts `x-api-key`). Headers are never written
// to fixtures. Billing is in ACU (1 ACU = $0.10); enrich bills only when a field is found.

export const PLOID_BASE_URL = "https://api.ploid.com";
const PROVIDER = "ploid";

export interface PloidContactQuery {
  companyDomain: string;
  /** Display name helps Ploid match the employer; the domain alone also works. */
  companyName?: string;
  roles: string[];
  limit?: number;
}

export interface PloidAdapterOptions {
  http: HttpClient;
  apiKey: string;
  baseUrl?: string;
  now?: () => Date;
}

export interface PloidAdapter {
  /** Up to three candidates, never with email. */
  searchContacts(query: PloidContactQuery): Promise<ContactRecord[]>;
  revealWorkEmail(contact: { fullName: string; companyDomain: string; linkedinUrl?: string }): Promise<string | undefined>;
  getCredits(): Promise<{ plan: string; acu: unknown }>;
}

export class PloidError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    detail: string,
  ) {
    super(`Ploid ${endpoint} failed with HTTP ${status}: ${detail}`);
    this.name = "PloidError";
  }
}

export function createPloidAdapter(options: PloidAdapterOptions): PloidAdapter {
  const baseUrl = options.baseUrl ?? PLOID_BASE_URL;
  const now = options.now ?? (() => new Date());
  const headers = { authorization: `Bearer ${options.apiKey}` };

  async function call<T>(method: "GET" | "POST", endpoint: string, body?: unknown): Promise<T> {
    const res = await options.http.request<T>({ provider: PROVIDER, method, url: `${baseUrl}${endpoint}`, headers, body });
    if (!res.ok) throw new PloidError(endpoint, res.status, errorDetail(res.body));
    return res.body;
  }

  return {
    async searchContacts(query) {
      const domain = normalizeDomain(query.companyDomain);
      const limit = Math.min(query.limit ?? 3, 3);
      const body = await call<PloidSearchResponse>("POST", "/v1/search", {
        // "fast" ranks indexed candidates without web verification: quicker and cheaper than "auto".
        type: "fast",
        category: "people",
        num_results: limit,
        query: `${query.roles.join(" or ")} at ${query.companyName ?? domain}`,
        filters: {
          company: query.companyName ?? domain,
          title: { any_of: query.roles.slice(0, 10) },
        },
      });
      const fetchedAt = now().toISOString();
      return (body.data?.results ?? [])
        .map((r) => toContactRecord(r, domain, fetchedAt))
        .filter((c): c is ContactRecord => c !== null)
        .slice(0, limit);
    },

    async revealWorkEmail(contact) {
      const request: Record<string, unknown> = { fields: ["work_email"], response_format: "standard" };
      if (contact.linkedinUrl && /linkedin\.com\/in\//.test(contact.linkedinUrl)) {
        request.linkedin_url = contact.linkedinUrl;
      } else {
        request.name = contact.fullName;
        request.company_domain = normalizeDomain(contact.companyDomain);
      }
      const body = await call<PloidEnrichResponse>("POST", "/v1/enrich", request);
      const field = body.data?.work_email;
      return field?.status === "found" && field.value ? field.value : undefined;
    },

    async getCredits() {
      const body = await call<{ data?: { plan?: string; acu?: unknown } }>("GET", "/v1/account/credits");
      return { plan: body.data?.plan ?? "unknown", acu: body.data?.acu };
    },
  };
}

export function toContactRecord(r: PloidSearchResult, companyDomain: string, fetchedAt: string): ContactRecord | null {
  const p = r.person;
  const fullName = p?.name?.trim();
  if (!fullName) return null;
  const title = p.title ?? r.title ?? "";
  const linkedinUrl = p.linkedin_url ?? undefined;
  const url = linkedinUrl ?? p.profile_url ?? r.url ?? undefined;
  const source: SourceRef = {
    provider: PROVIDER,
    ...(url ? { url } : {}),
    fetchedAt,
    claim: `${fullName} is ${title || "employed"}${p.company ? ` at ${p.company}` : ""} (Ploid people index, confidence ${p.confidence ?? "n/a"})`,
  };
  return {
    fullName,
    title,
    companyDomain,
    ...(linkedinUrl ? { linkedinUrl } : {}),
    sources: [source],
  };
}

function errorDetail(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as { error?: { message?: string } | string; message?: string };
    if (typeof b.error === "object" && b.error?.message) return b.error.message;
    if (typeof b.error === "string") return b.error;
    if (b.message) return b.message;
  }
  return typeof body === "string" ? body.slice(0, 300) : "no detail";
}

// ---------- Ploid response shapes (only the fields we read) ----------

export interface PloidSearchResult {
  url?: string | null;
  title?: string | null;
  score?: number | null;
  person: {
    person_id: string;
    name?: string | null;
    title?: string | null;
    company?: string | null;
    linkedin_url?: string | null;
    profile_url?: string;
    confidence?: number | null;
  };
}

interface PloidSearchResponse {
  data?: { results?: PloidSearchResult[] };
}

interface PloidEnrichResponse {
  data?: { work_email?: { value: string | null; status: "found" | "not_found" | "unavailable" } };
}
