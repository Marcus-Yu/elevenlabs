import { z } from "zod";
import type { CompanyRecord, ContactRecord, UntrustedText } from "../../../shared/contracts";
import { createFiberAdapter, type FiberAdapter, type JobPostingRecord } from "../../adapters/fiber";
import { createHttpClient, resolveAdapterMode, type AdapterMode, type HttpClient } from "../../adapters/http";
import { createPloidAdapter, PloidError, type PloidAdapter } from "../../adapters/ploid";
import { createWebAdapter, UNTRUSTED_INSTRUCTION_REASON, type WebAdapter } from "../../adapters/web";

// Discovery handlers for the gateway (WP2). The gateway engine (WP1) validates `payload` with the
// schema here, runs its rules, and only then calls `run`. Handlers never decide permission.
//
// Shape agreed for WP1 to register: { payload: zod schema, run(payload, ctx) => { data, logReason? } }.
// `logReason` is a note for the ActionLog row the engine writes, e.g. a flagged web page.

export interface HandlerContext {
  userId: string;
  goalId?: string;
}

export interface HandlerResult<T> {
  data: T;
  logReason?: string;
}

export interface Handler<P extends z.ZodType, T> {
  payload: P;
  run(payload: z.infer<P>, ctx: HandlerContext): Promise<HandlerResult<T>>;
}

// ---------- payload schemas ----------

const domain = z.string().trim().min(3).max(253);

export const CompanySearchPayload = z.object({
  keywords: z.array(z.string().min(1)).max(20).optional(),
  industries: z.array(z.string().min(1)).max(10).optional(),
  countryCodes: z.array(z.string().length(3)).max(10).optional(),
  employeeCount: z.object({ min: z.number().int().min(1).optional(), max: z.number().int().min(1).optional() }).optional(),
  pageSize: z.number().int().min(1).max(25).optional(),
  cursor: z.string().optional(),
});

export const JobsSearchPayload = z.object({
  titles: z.array(z.string().min(1)).min(1).max(10),
  countryCodes: z.array(z.string().length(3)).max(10).optional(),
  modality: z.array(z.enum(["On-site", "Remote", "Hybrid"])).optional(),
  pageSize: z.number().int().min(1).max(25).optional(),
  cursor: z.string().optional(),
});

export const ContactSearchPayload = z.object({
  companyDomain: domain,
  companyName: z.string().min(1).optional(),
  roles: z.array(z.string().min(1).max(200)).min(1).max(10),
  limit: z.number().int().min(1).max(3).optional(),
});

export const RevealEmailPayload = z.object({
  fullName: z.string().min(1),
  companyDomain: domain,
  linkedinUrl: z.string().url().optional(),
});

export const WebReadPayload = z.object({ url: z.string().url().max(2048) });

// ---------- handlers ----------

export interface DiscoveryDeps {
  fiber: FiberAdapter;
  /** Absent until the team has a Ploid key; contact actions then use Fiber. */
  ploid?: PloidAdapter;
  web: WebAdapter;
}

export function createDiscoveryHandlers(deps: DiscoveryDeps) {
  return {
    "company.search": defineHandler<typeof CompanySearchPayload, { companies: CompanyRecord[]; nextCursor?: string }>({
      payload: CompanySearchPayload,
      async run(payload) {
        return { data: await deps.fiber.searchCompanies(payload) };
      },
    }),

    "jobs.search": defineHandler<typeof JobsSearchPayload, { jobs: JobPostingRecord[]; nextCursor?: string }>({
      payload: JobsSearchPayload,
      async run(payload) {
        return { data: await deps.fiber.searchJobs(payload) };
      },
    }),

    "contact.search": defineHandler<typeof ContactSearchPayload, { contacts: ContactRecord[]; provider: "ploid" | "fiber" }>({
      payload: ContactSearchPayload,
      async run(payload) {
        let contacts: ContactRecord[];
        let provider: "ploid" | "fiber" = "fiber";
        let logReason: string | undefined;
        if (deps.ploid) {
          try {
            contacts = await deps.ploid.searchContacts(payload);
            provider = "ploid";
          } catch (error) {
            if (!(error instanceof PloidError)) throw error;
            logReason = `ploid_failed_used_fiber: HTTP ${error.status}`;
            contacts = await deps.fiber.searchPeople(payload);
          }
        } else {
          contacts = await deps.fiber.searchPeople(payload);
        }
        // Email stays absent until contact.reveal_email succeeds, whatever a provider returns.
        const withoutEmail = contacts.map(({ email: _email, ...rest }) => rest);
        return { data: { contacts: withoutEmail, provider }, ...(logReason ? { logReason } : {}) };
      },
    }),

    "contact.reveal_email": defineHandler<typeof RevealEmailPayload, { email?: string; provider: "ploid" | "fiber" }>({
      payload: RevealEmailPayload,
      async run(payload) {
        const provider = deps.ploid ? "ploid" : "fiber";
        const email = deps.ploid ? await deps.ploid.revealWorkEmail(payload) : await deps.fiber.revealWorkEmail(payload);
        return { data: { email, provider }, ...(email ? {} : { logReason: "email_not_found" }) };
      },
    }),

    "web.read": defineHandler<typeof WebReadPayload, UntrustedText & { title?: string }>({
      payload: WebReadPayload,
      async run(payload) {
        const page = await deps.web.read(payload.url);
        return {
          data: { ...page.content, ...(page.title ? { title: page.title } : {}) },
          ...(page.content.flagged ? { logReason: `${UNTRUSTED_INSTRUCTION_REASON}: ${page.flagReasons.join(", ")}` } : {}),
        };
      },
    }),
  };
}

/** Identity helper so each handler is checked against Handler<P, T>, with typed (payload, ctx). */
function defineHandler<P extends z.ZodType, T>(handler: Handler<P, T>): Handler<P, T> {
  return handler;
}

export type DiscoveryHandlers = ReturnType<typeof createDiscoveryHandlers>;

/**
 * Builds the handlers from env. Replay mode needs no keys: keys are redacted before fixture
 * hashing, so a placeholder replays the same fixtures that were recorded with the real key.
 */
export function createDiscoveryHandlersFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: { http?: HttpClient; mode?: AdapterMode } = {},
): DiscoveryHandlers {
  const mode = overrides.mode ?? resolveAdapterMode(env.ADAPTER_MODE);
  const http = overrides.http ?? createHttpClient({ mode });
  const key = (name: string): string | undefined => {
    const value = env[name]?.trim();
    if (value) return value;
    return mode === "replay" ? `replay-placeholder-${name}` : undefined;
  };

  const fiberKey = key("FIBER_API_KEY");
  if (!fiberKey) throw new Error(`FIBER_API_KEY is required when ADAPTER_MODE=${mode}.`);
  const ploidKey = env.PLOID_API_KEY?.trim();

  return createDiscoveryHandlers({
    fiber: createFiberAdapter({ http, apiKey: fiberKey }),
    ...(ploidKey ? { ploid: createPloidAdapter({ http, apiKey: ploidKey }) } : {}),
    web: createWebAdapter(overrides.http ? { http: overrides.http } : { mode }),
  });
}
