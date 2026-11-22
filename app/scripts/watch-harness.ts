// Local stand-in for Atlas's watcher API, so the watcher box can run end to end without Wasp.
// DEV ONLY, REPLAY ONLY: tool calls go to the recorded discovery handlers instead of WP1's gateway
// (which adds the §8 rules and the ActionLog). It refuses to start outside ADAPTER_MODE=replay, so no
// provider is called and nothing leaves the machine except through the box you point at it.
//
//   cd app
//   npx -y tsx scripts/watch-harness.ts            # prints the goal id, token and URL
//   (in watcher-box) ATLAS_URL=... WATCHER_GOAL_ID=... WATCHER_TOKEN=... DATA_DIR=./.data node server.mjs
//
// Finished runs (the box's shortlist) are written to .harness/runs.json, standing in for WatcherRun rows.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { rankCandidates } from "../src/features/matches/candidates";
import { generateWatcherToken, handleBrief, handleRun, handleTool, type WatchDeps, type WatchedGoal } from "../src/features/watchers/watchApi";
import { createDiscoveryHandlersFromEnv } from "../src/server/gateway/handlers/discovery";
import { DEMO_HIRE_CRITERIA } from "../src/server/gateway/handlers/discovery.demo";

if ((process.env.ADAPTER_MODE ?? "replay") !== "replay") {
  console.error("watch-harness runs in ADAPTER_MODE=replay only.");
  process.exit(1);
}

const port = Number(process.env.HARNESS_PORT ?? 3101);
const outDir = path.resolve(".harness");
const { token, hash } = process.env.WATCHER_TOKEN ? { token: process.env.WATCHER_TOKEN, hash: "" } : generateWatcherToken();
const goal: WatchedGoal = {
  id: process.env.WATCHER_GOAL_ID ?? "demo-hire",
  userId: "orrery-hiring-manager (synthetic)",
  kind: "hire",
  status: "ACTIVE",
  statement: "Hire a robotics engineer for Orrery Robotics",
  watcherTokenHash: hash || (await import("../src/features/watchers/watchApi")).hashWatcherToken(token),
  icp: { hireCriteria: DEMO_HIRE_CRITERIA },
};

const handlers = createDiscoveryHandlersFromEnv({ ADAPTER_MODE: "replay" });
const runs = new Map<string, { goalId: string; runtime: string; startedAt: string; finishedAt?: string; stats?: Record<string, unknown> }>();

const deps: WatchDeps = {
  loadGoal: async (id) => (id === goal.id ? goal : null),
  matchedDomains: async () => [],
  async execute(req) {
    const handler = (handlers as Record<string, { payload: { safeParse(x: unknown): { success: boolean; data?: unknown } }; run(p: unknown, c: unknown): Promise<{ data: unknown; logReason?: string }> }>)[req.actionType];
    if (!handler) return { decision: { outcome: "deny", ruleId: "harness_unknown_action", reason: "not served by the harness" }, logId: "harness" };
    const parsed = handler.payload.safeParse(req.payload);
    if (!parsed.success) return { decision: { outcome: "deny", ruleId: "schema", reason: "payload failed validation" }, logId: "harness" };
    const result = await handler.run(parsed.data, { userId: req.userId, goalId: req.goalId });
    console.log(`  tool ${req.actionType} from ${req.actor.id} → allow${result.logReason ? ` (${result.logReason})` : ""}`);
    return { decision: { outcome: "allow", ruleId: "harness_replay" }, logId: "harness", data: result.data };
  },
  async startRun(goalId, runtime) {
    const id = `run-${runs.size + 1}`;
    runs.set(id, { goalId, runtime, startedAt: new Date().toISOString() });
    console.log(`  run ${id} started (${runtime})`);
    return { id };
  },
  async finishRun(goalId, runId, stats) {
    const run = runs.get(runId);
    if (!run || run.goalId !== goalId) return false;
    Object.assign(run, { finishedAt: new Date().toISOString(), stats });
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "runs.json"), JSON.stringify(Object.fromEntries(runs), null, 2));
    const shortlist = (stats.shortlist as Parameters<typeof rankCandidates>[0]["candidates"]) ?? [];
    const ranked = rankCandidates({ candidates: shortlist, criteria: DEMO_HIRE_CRITERIA });
    console.log(`  run ${runId} finished: ${shortlist.length} candidates from ${(stats.agents as unknown[] | undefined)?.length ?? 0} agents; top 3 by rankCandidates:`);
    for (const r of ranked.slice(0, 3)) console.log(`    ${r.score}  ${r.candidate.title} (${r.candidate.yearsExperience ?? "?"} yrs)`);
    return true;
  },
};

async function body(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

const server = createServer(async (req, res) => {
  const m = /^\/api\/watch\/([^/]+)\/(brief|tool|run)$/.exec(new URL(req.url ?? "/", "http://h").pathname);
  const send = (status: number, payload: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  if (!m) return send(404, { error: "not_found" });
  const [, goalId, route] = m;
  const auth = req.headers.authorization;
  try {
    const out =
      route === "brief" && req.method === "GET"
        ? await handleBrief(goalId!, auth, deps)
        : route === "tool" && req.method === "POST"
          ? await handleTool(goalId!, auth, await body(req), deps)
          : route === "run" && req.method === "POST"
            ? await handleRun(goalId!, auth, await body(req), deps)
            : { status: 405, body: { error: "method_not_allowed" } };
    console.log(`${req.method} /api/watch/${goalId}/${route} → ${out.status}`);
    send(out.status, out.body);
  } catch (error) {
    console.error(error);
    send(500, { error: "harness_error" });
  }
});

server.listen(port, "127.0.0.1", async () => {
  console.log(`watch harness on http://127.0.0.1:${port} (replay only, gateway stand-in)`);
  console.log(`WATCHER_GOAL_ID=${goal.id}`);
  console.log(`WATCHER_TOKEN=${token}`);
  const existing = await readFile(path.join(outDir, "runs.json"), "utf8").catch(() => "");
  if (existing) console.log(`(previous runs in ${path.join(outDir, "runs.json")})`);
});
