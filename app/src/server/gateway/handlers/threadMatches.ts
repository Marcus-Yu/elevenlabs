import { z } from "zod";
import { HireCriteria, rankCandidates } from "../../../features/matches/candidates";
import { defineHandler } from "../types";

// Only read an owned hiring goal's previously researched pool. Never expose profile identities,
// URLs, raw claims or free text to the model or thread.
export interface ThreadGoalReader {
  findFirst(args: { where: { id: string; userId: string; kind: "hire"; status: "ACTIVE" }; select: { icp: true } }): Promise<{ icp: unknown } | null>;
  findMany(args: { where: { userId: string; kind: "hire"; status: "ACTIVE" }; select: { id: true; icp: true }; take: number }): Promise<{ id: string; icp: unknown }[]>;
}
const source = z.object({ provider: z.enum(["fiber", "ploid", "web"]), claim: z.string(), fetchedAt: z.string(), url: z.string().optional() });
const candidate = z.object({ fullName: z.string(), title: z.string(), currentCompany: z.string().optional(), linkedinUrl: z.string().optional(), yearsExperience: z.number().optional(), seniority: z.string().optional(), skills: z.array(z.string()), sources: z.array(source) });
const state = z.object({ hireCriteria: HireCriteria, pool: z.array(candidate).optional(), rejected: z.array(z.object({ key: z.string() })).optional(), runs: z.array(z.unknown()).optional() });
function category(text: string): string {
  if (text.startsWith("Current role")) return "Role match";
  if (text.startsWith("Has must-have") || text.startsWith("Profile does not list")) return "Required skills";
  if (text.startsWith("Also lists")) return "Preferred skills";
  return "Experience";
}
export function createThreadMatchHandlers(goals: ThreadGoalReader) {
  async function read(userId: string, goalId?: string) {
    if (!goalId) throw new Error("Goal unavailable");
    const goal = await goals.findFirst({ where: { id: goalId, userId, kind: "hire", status: "ACTIVE" }, select: { icp: true } });
    if (!goal) throw new Error("Goal unavailable");
    const parsed = state.safeParse(goal.icp);
    if (!parsed.success) throw new Error("Shortlist unavailable");
    const s = parsed.data;
    if (!s.runs?.length || !s.pool) return [];
    return rankCandidates({ candidates: s.pool, criteria: s.hireCriteria, rejectedUrls: (s.rejected ?? []).map((r) => r.key) }).map((entry, index) => ({
      matchId: `candidate-${index + 1}`, score: entry.score, meetsMustHaves: entry.meetsMustHaves,
      method: entry.method,
      reasons: entry.reasons.map((reason) => ({ category: category(reason.text), points: reason.points, ...(reason.source ? { source: { provider: reason.source.provider, fetchedAt: reason.source.fetchedAt } } : {}) })),
    }));
  }
  return {
    "thread.list_hiring_goals": defineHandler({ payload: z.object({}).strict(), async run(_payload, ctx) {
      const rows = await goals.findMany({ where: { userId: ctx.userId, kind: "hire", status: "ACTIVE" }, select: { id: true, icp: true }, take: 50 });
      return { data: { goals: rows.flatMap((row) => { const parsed = state.safeParse(row.icp); return parsed.success ? [{ goalId: row.id, role: parsed.data.hireCriteria.role, researched: !!parsed.data.runs?.length }] : []; }) } };
    } }),
    "thread.list_matches": defineHandler({ payload: z.object({}).strict(), async run(_payload, ctx) { return { data: { matches: await read(ctx.userId, ctx.goalId) } }; } }),
    "thread.explain_match": defineHandler({ payload: z.object({ matchId: z.string().min(1).max(250) }).strict(), async run({ matchId }, ctx) {
      const match = (await read(ctx.userId, ctx.goalId)).find((entry) => entry.matchId === matchId);
      return { data: { match: match ?? null } };
    } }),
  };
}
