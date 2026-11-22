// Live data provider for the Atlas overlay (Electron main process, Node 24 global fetch).
// Implements createProvider(env) → { snapshot(), act(action) } from overlay/shared/contract.js.
//
// Talks to the Wasp server only through its public wire API, the same calls the generated client makes:
//   POST {server}/auth/username/login {username,password} → {sessionId}
//   POST {server}/operations/<kebab-name>  body {json: args}  (superjson; plain JSON args need no meta)
//   header Authorization: Bearer <sessionId>; responses are {json, meta?}, and dates stay ISO strings here.
// Every action goes through the server's gateway; this file never touches an adapter (AGENTS.md rule 2).

/**
 * Copy of DEMO_HIRE_CRITERIA (app/src/server/gateway/handlers/discovery.demo.ts). It is the stand-in
 * for WP3's approved /calibrate/criteria output, and replay fixtures only hit for exactly this query,
 * so the overlay sends it as-is instead of calling the sim (which needs a model key).
 */
const DEMO_HIRE_CRITERIA = {
  role: "Robotics engineer",
  titles: ["robotics engineer", "robotics software engineer"],
  mustHaveSkills: ["ROS", "C++"],
  niceToHaveSkills: ["Python", "motion planning", "computer vision", "SLAM"],
  minYearsExperience: 2,
  countryCodes: ["USA"],
};

const { eventText, strippedText, runLabelText } = require("./humanize");
const { briefFromNeed } = require("../../shared/contract");

const ALIASES = ["A", "B", "C"];
const SOURCE_LABELS = { fiber: "People search (Fiber)", ploid: "People search (Ploid)", web: "Public web pages", synthetic: "Synthetic profiles" };

class AtlasProviderError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AtlasProviderError";
    if (cause) this.cause = cause;
  }
}

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// ---------- pure mapping (exported for tests) ----------

function briefChips(c) {
  const chips = [];
  if (c.minYearsExperience !== undefined && c.maxYearsExperience !== undefined) chips.push(`${c.minYearsExperience}–${c.maxYearsExperience} yrs`);
  else if (c.minYearsExperience !== undefined) chips.push(`${c.minYearsExperience}+ yrs`);
  else if (c.maxYearsExperience !== undefined) chips.push(`≤${c.maxYearsExperience} yrs`);
  chips.push(...(c.mustHaveSkills ?? []));
  if (c.countryCodes?.length) chips.push(c.countryCodes.join(", "));
  return chips;
}

function mapBrief(criteria, goalId) {
  return {
    goalKind: "Hire",
    role: criteria.role,
    criteria: briefChips(criteria),
    privateNote: "Contact details stay private until both sides opt in",
    status: goalId ? "approved" : "needs_ok",
    ...(goalId ? { goalId } : {}),
  };
}

function mapResearch(ranked, runs) {
  const counts = new Map();
  for (const entry of ranked ?? []) {
    for (const s of entry.candidate?.sources ?? []) counts.set(s.provider, (counts.get(s.provider) ?? 0) + 1);
  }
  const done = (runs?.length ?? 0) > 0;
  const sources = [...counts].map(([provider, count]) => ({ label: SOURCE_LABELS[provider] ?? provider, status: "done", count }));
  if (!sources.length) sources.push({ label: "People search", status: "scanning" });
  return { status: done ? "done" : "scanning", sources };
}

/** Replaces the candidate's name and employer in text with the alias, so it can't identify them. */
function anonymise(text, candidate, alias) {
  let out = text;
  if (candidate?.fullName) out = out.split(candidate.fullName).join(`Candidate ${alias}`);
  if (candidate?.currentCompany) out = out.split(candidate.currentCompany).join("a company");
  return out;
}

/** Anonymises a source: no URL (a LinkedIn URL identifies the person), no name or employer. */
function anonSource(source, candidate, alias) {
  return { provider: source.provider, claim: anonymise(source.claim, candidate, alias) };
}

function fitOf(entry, criteria) {
  const total = 1 + (criteria.mustHaveSkills?.length ?? 0) + (criteria.minYearsExperience !== undefined || criteria.maxYearsExperience !== undefined ? 1 : 0);
  const met = (entry.reasons ?? []).filter((r) => r.points > 0 && !r.text.startsWith("Also lists")).length;
  return `${Math.min(met, total)}/${total}`;
}

function runLabelOf(runs) {
  if (!runs?.length) return "Not run yet";
  const last = runs[runs.length - 1];
  return runLabelText(runs.length, last.evaluation, last.comparedTo);
}

/** Top three as anonymous A/B/C. Never a name, company or profile URL (names stay hidden until double opt-in). */
function mapShortlist(ranked, runs, criteria) {
  const candidates = (ranked ?? []).slice(0, ALIASES.length).map((entry, i) => {
    const alias = ALIASES[i];
    const c = entry.candidate ?? {};
    const years = c.yearsExperience !== undefined ? `${Math.round(c.yearsExperience)} yrs` : null;
    return {
      alias,
      headline: [c.title || "Candidate", years].filter(Boolean).join(" · "),
      fit: fitOf(entry, criteria),
      sourceCount: (entry.citedSources ?? c.sources ?? []).length,
      matchId: entry.matchId,
      sources: (entry.citedSources ?? []).map((s) => anonSource(s, c, alias)),
    };
  });
  return { candidates, runLabel: runLabelOf(runs) };
}

const RULE_EVENTS = {
  card_fields: { kind: "stripped", text: (r) => `Share card field stripped${r.reason ? `: ${r.reason}` : ""}` },
  opt_in_only: { kind: "hidden", text: () => "Contact details hidden until both sides opt in" },
  introductions: { kind: "pending", text: () => "Introduction waiting for both sides" },
};

const STUB = " (demo data)";
const isStub = (reason) => typeof reason === "string" && reason.includes("stub_handler");
const DONE = new Set(["APPROVED", "EXECUTED"]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The /match double opt-in (getMatchDemo, PR #26): the user is side A, synthetic user B is side B.
 * Only field names leave this function: never a draft value, a revealed identity or the intro draft.
 * `revealRows` are the user's card.reveal log rows, so a stub handler is labelled rather than hidden.
 */
function mapMatch(md, revealRows) {
  if (!md) return { events: [], introStatus: "none" };
  const events = [];
  for (const [card, whose] of [[md.cardA, "your"], [md.cardB, "B's"]]) {
    for (const field of card?.stripped ?? []) {
      events.push({ ruleId: "card_fields", kind: "stripped", text: strippedText(field, whose, card.logReason) });
    }
  }
  const m = md.match;
  if (m) {
    const both = m.aAccepted && m.bAccepted;
    const progress = both ? "both sides accepted" : m.aAccepted ? "A accepted, waiting for B" : m.bAccepted ? "B accepted, waiting for A" : "anonymous match, no one accepted yet";
    events.push(both ? { ruleId: "opt_in_only", kind: "allowed", text: "Both sides opted in" } : { ruleId: "opt_in_only", kind: "hidden", text: `Contact details stay hidden until both sides opt in (${progress})` });
  }
  const approved = !!m?.revealedAt || (DONE.has(md.revealA?.status) && DONE.has(md.revealB?.status));
  const started = !!(md.revealA || md.revealB) || !!(m?.aAccepted && m?.bAccepted);
  const introStatus = approved ? "approved" : started ? "pending" : "none";
  if (introStatus !== "none") {
    const stub = (revealRows ?? []).some((r) => isStub(r.reason)) ? STUB : "";
    const sides = ["A", "B"].filter((x) => DONE.has(md[`reveal${x}`]?.status));
    events.push(
      approved
        ? { ruleId: "introductions", kind: "allowed", text: `Introduction drafted, not sent${stub}` }
        : { ruleId: "introductions", kind: "pending", text: `Waiting for both sides to approve the introduction${sides.length ? ` (${sides.join(", ")} approved)` : ""}${stub}` },
    );
  }
  return { events, introStatus };
}

/** Gateway rows that really happened (rule 5): /match events, then rule hits, then the latest other decisions. */
function mapGateway(rows, approvals, match = mapMatch(null)) {
  const events = [...match.events];
  for (const r of rows ?? []) {
    const rule = RULE_EVENTS[r.ruleId];
    if (rule) events.push({ ruleId: r.ruleId, kind: rule.kind, text: eventText(r, modeOf(rows)) });
  }
  for (const r of rows ?? []) {
    if (RULE_EVENTS[r.ruleId]) continue;
    const kind = r.decision === "DENY" ? "denied" : r.decision === "NEEDS_APPROVAL" ? "pending" : "allowed";
    events.push({ ruleId: r.ruleId, kind, text: eventText(r, modeOf(rows)) });
  }
  const intro = (approvals ?? []).find((a) => a.actionType === "card.reveal");
  const revealed = (rows ?? []).some((r) => r.actionType === "card.reveal" && r.decision === "ALLOW");
  return {
    events: dedupe(events).slice(0, 4),
    introStatus: match.introStatus !== "none" ? match.introStatus : intro ? "pending" : revealed ? "approved" : "none",
    ...(intro ? { approvalId: intro.id } : {}),
  };
}

function dedupe(events) {
  const seen = new Set();
  return events.filter((e) => (seen.has(e.text) ? false : seen.add(e.text)));
}

/** live/record → "live", otherwise "replay". Taken from the latest logged adapter call. */
function modeOf(rows) {
  const m = (rows ?? []).find((r) => r.adapterMode)?.adapterMode;
  return m === "live" || m === "record" ? "live" : "replay";
}

// ---------- provider ----------

function createProvider(env = process.env, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const server = (env.ATLAS_SERVER_URL || "http://localhost:3001").replace(/\/$/, "");
  const clientUrl = (env.ATLAS_CLIENT_URL || defaultClientUrl(server)).replace(/\/$/, "");
  const username = env.ATLAS_USER || "demo";
  const password = env.ATLAS_PASSWORD || "atlas-demo-1";

  let token = null;
  const s = { goalId: null, criteria: DEMO_HIRE_CRITERIA, ranked: [], runs: [], proposedChange: null, need: null, otherApproved: false };
  const isHire = () => s.need && briefFromNeed(s.need).kind === "hire";
  /** Fresh session: no need, no goal (called on every new summon and on a stale goal). */
  function reset() {
    Object.assign(s, { goalId: null, criteria: DEMO_HIRE_CRITERIA, ranked: [], runs: [], proposedChange: null, need: null, otherApproved: false });
  }
  /** A stale-goal reset returns the neutral snapshot instead of an error. */
  async function guarded(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err?.reset) return read();
      throw err;
    }
  }

  async function post(path, body, auth) {
    let res;
    try {
      res = await fetchImpl(`${server}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new AtlasProviderError(`Atlas server unreachable at ${server} (${error.cause?.code ?? error.message})`, error);
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON error page */
    }
    return { status: res.status, ok: res.ok, data };
  }

  async function login() {
    const res = await post("/auth/username/login", { username, password }, false);
    if (!res.ok || !res.data?.sessionId) throw new AtlasProviderError(`Atlas login failed for "${username}" at ${server} (HTTP ${res.status})`);
    token = res.data.sessionId;
  }

  async function op(name, args = {}, retried = false) {
    if (!token) await login();
    const res = await post(`/operations/${kebab(name)}`, { json: args }, true);
    if (res.status === 401 && !retried) {
      token = null;
      return op(name, args, true);
    }
    if (!res.ok && res.status === 404 && /goal not found/i.test(res.data?.message ?? "")) {
      // Stale goal (e.g. the database was reset): forget it and go back to neutral, silently.
      reset();
      const err = new AtlasProviderError("stale goal; reset");
      err.reset = true;
      throw err;
    }
    if (!res.ok) throw new AtlasProviderError(`${name} failed (HTTP ${res.status}): ${res.data?.message ?? "no message"}`);
    return res.data?.json;
  }

  async function approveBrief() {
    if (s.need && !isHire()) {
      s.otherApproved = true; // no research is wired for this kind yet (rule 5: no fake results)
      return;
    }
    if (s.goalId) return;
    const { goalId } = await op("createHireGoal", { criteria: s.criteria });
    s.goalId = goalId;
  }

  async function runResearch() {
    await approveBrief();
    s.ranked = await op("runHireShortlist", { goalId: s.goalId });
  }

  /** null when the server predates /match (PR #26), so the hire flow still works on older builds. */
  async function readMatch() {
    try {
      const [md, reveals] = await Promise.all([op("getMatchDemo", {}), op("getActivityLog", { actionType: "card.reveal", limit: 5 })]);
      return mapMatch(md, reveals?.rows);
    } catch (error) {
      if (error instanceof AtlasProviderError && /HTTP 404/.test(error.message)) return mapMatch(null);
      throw error;
    }
  }

  async function read() {
    // Before approval there is no goal yet, so no activity of this flow to show (other goals' rows stay out).
    const [activity, approvals, match] = await Promise.all([s.goalId ? op("getActivityLog", { goalId: s.goalId, limit: 30 }) : { rows: [] }, op("getPendingApprovals", {}), readMatch()]);
    if (s.goalId) {
      s.runs = (await op("getHireRuns", { goalId: s.goalId })) ?? [];
      const last = s.runs[s.runs.length - 1];
      if (last?.criteria) s.criteria = last.criteria;
    }
    const rows = activity?.rows ?? [];
    const meta = { mode: modeOf(rows), synthetic: username === "demo" || modeOf(rows) !== "live", updatedAt: new Date().toISOString() };
    // Neutral until a need is set; only the hire need runs the hiring path.
    if (!s.need) return { ...meta, brief: null, research: null, shortlist: null, gateway: null };
    if (!isHire()) {
      const brief = { ...briefFromNeed(s.need), status: s.otherApproved ? "approved" : "needs_ok" };
      const research = s.otherApproved ? { status: "done", sources: [], note: `Research for "${brief.goalKind.toLowerCase()}" isn't wired in this demo yet` } : null;
      return { ...meta, brief, research, shortlist: null, gateway: null };
    }
    if (!s.goalId) {
      const need = briefFromNeed(s.need);
      return { ...meta, brief: { ...mapBrief(s.criteria, null), role: need.role, goalKind: need.goalKind }, research: null, shortlist: null, gateway: null };
    }
    return {
      brief: mapBrief(s.criteria, s.goalId),
      research: mapResearch(s.ranked, s.runs),
      shortlist: mapShortlist(s.ranked, s.runs, s.criteria),
      gateway: mapGateway(rows, approvals, match),
      mode: modeOf(rows),
      // The seeded demo user's profile and the demo criteria are synthetic; replay data is recorded, not live.
      synthetic: username === "demo" || modeOf(rows) !== "live",
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * The first snapshot after the brief is approved runs research once. The brief is approved in the
   * speaking state, so this is the "first speaking snapshot"; the shell calls snapshot() without args.
   * Pass { state } to restrict it to state === "speaking".
   */
  async function snapshot(opts = {}) {
    const speaking = opts.state === undefined || opts.state === "speaking";
    if (speaking && s.goalId && !s.ranked.length && !s.runs.length) await runResearch();
    return read();
  }

  async function act(action) {
    switch (action?.type) {
      case "set_need":
        s.need = { text: action.text, kind: action.kind, role: action.role, criteria: action.criteria };
        s.otherApproved = false;
        return read();
      case "approve_brief":
        await approveBrief();
        return read();
      case "run_research":
        await runResearch();
        return read();
      case "reject_candidate": {
        const i = ALIASES.indexOf(action.alias);
        const entry = i >= 0 ? s.ranked[i] : undefined;
        if (!entry) throw new AtlasProviderError(`No candidate ${action.alias} on the shortlist; run research first`);
        const { proposedChange } = await op("rejectMatchWithReason", { matchId: entry.matchId, reason: action.reason || "too junior" });
        s.proposedChange = proposedChange;
        // The server drops the rejected candidate from later rankings; mirror that until the rerun.
        s.ranked = s.ranked.filter((r) => r.matchId !== entry.matchId);
        const snap = await read();
        return proposedChange ? { ...snap, proposedChange: { explanation: anonymise(proposedChange.explanation, entry.candidate, action.alias), changes: proposedChange.changes } } : snap;
      }
      case "confirm_change":
        if (!s.proposedChange) throw new AtlasProviderError("No criteria change is waiting for confirmation; reject a candidate with a reason first");
        s.ranked = await op("confirmCriteriaChange", { goalId: s.goalId, proposedChange: s.proposedChange });
        s.proposedChange = null;
        return read();
      case "open_intro": {
        const snap = await read();
        return { ...snap, introUrl: `${clientUrl}/match` };
      }
      case "refresh":
        return read();
      default:
        throw new AtlasProviderError(`Unknown overlay action: ${JSON.stringify(action?.type)}`);
    }
  }

  return { snapshot: (opts) => guarded(() => snapshot(opts)), act: (action) => guarded(() => act(action)), reset };
}

/** Wasp's dev client runs one port below the server by default (3000/3001). Override with ATLAS_CLIENT_URL. */
function defaultClientUrl(server) {
  const u = new URL(server);
  if (u.port) u.port = String(Number(u.port) - 1);
  return u.origin;
}

module.exports = { createProvider, AtlasProviderError, DEMO_HIRE_CRITERIA, _map: { mapBrief, mapResearch, mapShortlist, mapGateway, mapMatch, modeOf, runLabelOf, kebab } };
