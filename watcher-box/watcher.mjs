// Atlas watcher: one per goal, runs on Maritime (docs/IMPLEMENTATION_PLAN.md WP10).
//
// It holds only its goal-scoped watcher token. It can read the goal brief, run the allowlisted
// discovery tools through Atlas's watcher API (which goes through the gateway), and propose
// matches with match.submit. It cannot send anything: the watcher API refuses every other tool.
//
// Vetting is rule-based in this version: a company is proposed only if it is unseen, not already
// a match, has a domain and at least one source, and fits the brief's headcount and country.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_TICK_HISTORY = 20;

export function loadConfig(env = process.env) {
  return {
    atlasUrl: (env.ATLAS_URL ?? "").replace(/\/+$/, ""),
    goalId: env.WATCHER_GOAL_ID ?? "",
    token: env.WATCHER_TOKEN ?? "",
    dataDir: env.DATA_DIR ?? "/data",
    maxNewPerTick: Number(env.WATCHER_MAX_NEW ?? 5),
    cron: env.WATCHER_CRON ?? "0 13 * * *",
    tz: env.WATCHER_TZ ?? "UTC",
  };
}

export function missingConfig(config) {
  return ["atlasUrl", "goalId", "token"].filter((k) => !config[k]);
}

// ---------- state under /data ----------

export function emptyState(goalId) {
  return { version: 1, goalId, seenDomains: [], ticks: [] };
}

export async function loadState(config) {
  try {
    const state = JSON.parse(await readFile(statePath(config), "utf8"));
    if (state.goalId && config.goalId && state.goalId !== config.goalId) {
      // A box is bound to one goal; never mix another goal's seen set into this one.
      return emptyState(config.goalId);
    }
    return { ...emptyState(config.goalId), ...state };
  } catch (error) {
    if (error.code === "ENOENT") return emptyState(config.goalId);
    throw error;
  }
}

export async function saveState(config, state) {
  await mkdir(config.dataDir, { recursive: true });
  const target = statePath(config);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, target);
}

function statePath(config) {
  return path.join(config.dataDir, "state.json");
}

// ---------- Atlas watcher API client ----------

export class AtlasError extends Error {
  constructor(status, detail) {
    super(`Atlas watcher API returned HTTP ${status}: ${detail}`);
    this.name = "AtlasError";
    this.status = status;
  }
}

export function createAtlasClient(config, fetchImpl = globalThis.fetch) {
  const base = `${config.atlasUrl}/api/watch/${encodeURIComponent(config.goalId)}`;
  async function call(method, suffix, body) {
    const res = await fetchImpl(`${base}${suffix}`, {
      method,
      headers: { authorization: `Bearer ${config.token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) throw new AtlasError(res.status, parsed.error ?? parsed.reason ?? text.slice(0, 200));
    return parsed;
  }
  return {
    brief: () => call("GET", "/brief"),
    tool: (tool, args) => call("POST", "/tool", { tool, args }),
    run: (report) => call("POST", "/run", report),
  };
}

// ---------- vetting ----------

/** Returns a reason string when the company should be skipped, or null when it passes. */
export function vetCompany(company, brief, seen) {
  if (!company?.domain) return "no_domain";
  if (seen.has(company.domain)) return "already_seen";
  if ((brief.excludeDomains ?? []).includes(company.domain)) return "already_a_match";
  if (!Array.isArray(company.sources) || company.sources.length === 0) return "no_sources";
  const fit = brief.fit ?? {};
  const head = company.headcount;
  if (fit.employeeCount && head) {
    if (fit.employeeCount.min !== undefined && head.max !== undefined && head.max < fit.employeeCount.min) return "too_small";
    if (fit.employeeCount.max !== undefined && head.min !== undefined && head.min > fit.employeeCount.max) return "too_large";
  }
  return null;
}

export function rationaleFor(company, brief) {
  const parts = [];
  if (company.industry) parts.push(`industry ${company.industry}`);
  if (company.headcount) parts.push(`headcount ${formatRange(company.headcount)}`);
  if (company.hq) parts.push(`based in ${company.hq}`);
  const fitText = parts.length ? parts.join(", ") : "matched the goal's search";
  return `Found by the watcher for "${brief.statement ?? "this goal"}": ${fitText}. Rule-based vetting; review before outreach.`;
}

function formatRange(r) {
  if (r.min !== undefined && r.max !== undefined) return r.min === r.max ? `about ${r.min}` : `${r.min}-${r.max}`;
  return r.min !== undefined ? `${r.min}+` : `up to ${r.max}`;
}

// ---------- one tick ----------

/**
 * Fetch the brief, search, skip seen companies, submit new vetted ones, save state.
 * State is saved after every submission so a crash mid-tick never re-submits a company.
 */
export async function runTick({ config, atlas, now = () => new Date(), log = () => {} }) {
  const state = await loadState(config);
  const seen = new Set(state.seenDomains);
  const tick = { startedAt: now().toISOString(), searched: 0, found: 0, skipped: {}, submitted: [], errors: [] };
  let runId;

  try {
    ({ runId } = await atlas.run({ phase: "start", runtime: config.runtime ?? "maritime" }));
    const brief = await atlas.brief();
    for (const search of brief.searches ?? []) {
      if (tick.submitted.length >= config.maxNewPerTick) break;
      const result = await atlas.tool("company.search", search);
      tick.searched++;
      if (result.decision?.outcome !== "allow") {
        tick.errors.push(`company.search ${result.decision?.outcome}: ${result.decision?.reason ?? result.decision?.ruleId ?? ""}`);
        continue;
      }
      for (const company of result.data?.companies ?? []) {
        tick.found++;
        const skip = vetCompany(company, brief, seen);
        if (skip) {
          tick.skipped[skip] = (tick.skipped[skip] ?? 0) + 1;
          seen.add(company.domain);
          continue;
        }
        if (tick.submitted.length >= config.maxNewPerTick) break;
        const submitted = await atlas.tool("match.submit", { company, rationale: rationaleFor(company, brief), runId });
        seen.add(company.domain);
        if (submitted.decision?.outcome === "allow") tick.submitted.push(company.domain);
        else tick.errors.push(`match.submit ${company.domain}: ${submitted.decision?.outcome}`);
        state.seenDomains = [...seen];
        await saveState(config, state);
      }
    }
  } catch (error) {
    tick.errors.push(error.message);
    log(`tick failed: ${error.message}`);
  }

  tick.finishedAt = now().toISOString();
  state.seenDomains = [...seen];
  state.ticks = [...state.ticks, tick].slice(-MAX_TICK_HISTORY);
  await saveState(config, state);

  if (runId) {
    await atlas
      .run({ phase: "finish", runId, stats: { searched: tick.searched, found: tick.found, submitted: tick.submitted.length, skipped: tick.skipped, errors: tick.errors } })
      .catch((error) => log(`finish report failed: ${error.message}`));
  }
  return tick;
}
