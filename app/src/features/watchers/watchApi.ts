import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ActionRequest, ActionType, GatewayResult } from "../../shared/contracts";
import { candidateQueryFor, HireCriteria } from "../matches/candidates";

// Watcher API core (docs/IMPLEMENTATION_PLAN.md §7 and WP10 step 1), framework-free so it can be
// unit-tested. The Wasp `api` routes for GET /api/watch/:goalId/brief, POST .../tool and
// POST .../run call these with Prisma-backed deps and gateway.execute (WP1).
//
// A watcher token is scoped to one goal; only its SHA-256 is stored on Goal.watcherTokenHash.

/** §7: the only tools a watcher may call. outreach.send, contact.reveal_email, call.place etc. are refused here, before the gateway. */
export const WATCHER_TOOLS = ["company.search", "jobs.search", "contact.search", "web.read", "match.submit"] as const satisfies readonly ActionType[];
export type WatcherTool = (typeof WATCHER_TOOLS)[number];

export function generateWatcherToken(): { token: string; hash: string } {
  const token = `wt_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashWatcherToken(token) };
}

export function hashWatcherToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Accepts "Bearer <token>". Constant-time compare against the stored hash. */
export function verifyWatcherToken(authorization: string | undefined, storedHash: string | null | undefined): boolean {
  if (!authorization || !storedHash) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match) return false;
  const given = Buffer.from(hashWatcherToken(match[1]!), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

// ---------- requests ----------

export const WatcherToolRequest = z.object({ tool: z.string(), args: z.unknown() });

export const WatcherRunReport = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("start"), runtime: z.enum(["local", "maritime"]).default("maritime") }),
  z.object({ phase: z.literal("finish"), runId: z.string().min(1), stats: z.record(z.string(), z.unknown()).default({}) }),
]);

export interface WatchedGoal {
  id: string;
  userId: string;
  status: string;
  statement: string;
  watcherTokenHash: string | null;
  /** Goal.kind; `hire` goals get a research brief instead of company searches. */
  kind?: string;
  /** Goal.icp. WP5 owns its shape; the watcher reads `companySearch`, `searches` or (hire) `hireCriteria`. */
  icp: unknown;
}

export interface WatchDeps {
  loadGoal(goalId: string): Promise<WatchedGoal | null>;
  matchedDomains(goalId: string): Promise<string[]>;
  execute(req: ActionRequest): Promise<GatewayResult>;
  startRun(goalId: string, runtime: "local" | "maritime"): Promise<{ id: string }>;
  finishRun(goalId: string, runId: string, stats: Record<string, unknown>): Promise<boolean>;
}

export interface WatchResponse {
  status: number;
  body: unknown;
}

const ACTIVE = new Set(["ACTIVE", "active", "RUNNING", "running"]);

type Authorized = { ok: true; goal: WatchedGoal } | { ok: false; response: WatchResponse };

async function authorize(goalId: string, authorization: string | undefined, deps: WatchDeps): Promise<Authorized> {
  const goal = await deps.loadGoal(goalId);
  // Same answer for a missing goal and a bad token, so a caller cannot probe goal ids.
  if (!goal || !verifyWatcherToken(authorization, goal.watcherTokenHash)) {
    return { ok: false, response: { status: 401, body: { error: "invalid_watcher_token" } } };
  }
  if (!ACTIVE.has(goal.status)) return { ok: false, response: { status: 403, body: { error: "goal_not_active" } } };
  return { ok: true, goal };
}

export async function handleBrief(goalId: string, authorization: string | undefined, deps: WatchDeps): Promise<WatchResponse> {
  const auth = await authorize(goalId, authorization, deps);
  if (!auth.ok) return auth.response;
  const { goal } = auth;
  return { status: 200, body: buildBrief(goal, await deps.matchedDomains(goal.id)) };
}

export async function handleTool(goalId: string, authorization: string | undefined, body: unknown, deps: WatchDeps): Promise<WatchResponse> {
  const auth = await authorize(goalId, authorization, deps);
  if (!auth.ok) return auth.response;
  const { goal } = auth;
  const parsed = WatcherToolRequest.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "bad_request" } };
  if (!(WATCHER_TOOLS as readonly string[]).includes(parsed.data.tool)) {
    return { status: 403, body: { error: "tool_not_allowed_for_watcher", tool: parsed.data.tool, allowed: WATCHER_TOOLS } };
  }
  const result = await deps.execute({
    actionType: parsed.data.tool as WatcherTool,
    userId: goal.userId,
    goalId: goal.id,
    actor: { kind: "agent", id: `watcher:${goal.id}` },
    origin: "watcher",
    // The watcher reads outside web pages, so its context is always treated as tainted.
    tainted: true,
    payload: parsed.data.args,
  });
  return { status: 200, body: result };
}

export async function handleRun(goalId: string, authorization: string | undefined, body: unknown, deps: WatchDeps): Promise<WatchResponse> {
  const auth = await authorize(goalId, authorization, deps);
  if (!auth.ok) return auth.response;
  const { goal } = auth;
  const parsed = WatcherRunReport.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "bad_request" } };
  if (parsed.data.phase === "start") return { status: 200, body: { runId: (await deps.startRun(goal.id, parsed.data.runtime)).id } };
  const ok = await deps.finishRun(goal.id, parsed.data.runId, parsed.data.stats);
  return ok ? { status: 200, body: { ok: true } } : { status: 404, body: { error: "run_not_found" } };
}

// ---------- brief ----------

const SearchShape = z
  .object({
    keywords: z.array(z.string()).optional(),
    industries: z.array(z.string()).optional(),
    countryCodes: z.array(z.string()).optional(),
    employeeCount: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
    pageSize: z.number().optional(),
  });

/** What the box needs and nothing more: no profile facts, no contacts, no credentials. */
/**
 * Hire goals (scope change 2026-11-22): the approved criteria only, as one people search per title,
 * so each search is one research agent on the box. Nothing from the user's profile (no salary
 * ceiling, no private facts) is in it: provider_minimum.
 */
export function buildResearchBrief(goal: WatchedGoal) {
  const icp = (goal.icp ?? {}) as { hireCriteria?: unknown };
  const parsed = HireCriteria.safeParse(icp.hireCriteria);
  if (!parsed.success) return null;
  const criteria = parsed.data;
  return {
    goalId: goal.id,
    statement: goal.statement,
    research: {
      kind: "hire" as const,
      role: criteria.role,
      searches: criteria.titles.map((title) => ({ mode: "criteria" as const, ...candidateQueryFor({ ...criteria, titles: [title] }) })),
    },
  };
}

export function buildBrief(goal: WatchedGoal, matchedDomains: string[]) {
  if (goal.kind === "hire") {
    const research = buildResearchBrief(goal);
    if (research) return research;
  }
  const icp = (goal.icp ?? {}) as { companySearch?: unknown; searches?: unknown[] };
  const candidates = Array.isArray(icp.searches) ? icp.searches : icp.companySearch ? [icp.companySearch] : [];
  const searches = candidates.map((s) => SearchShape.safeParse(s)).filter((r) => r.success).map((r) => r.data);
  const employeeCount = searches.find((s) => s.employeeCount)?.employeeCount;
  return {
    goalId: goal.id,
    statement: goal.statement,
    searches,
    excludeDomains: matchedDomains,
    fit: employeeCount ? { employeeCount } : {},
  };
}
