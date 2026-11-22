import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createWatcherServer } from "../server.mjs";
import { loadState, runTick, vetCompany } from "../watcher.mjs";

// Synthetic companies; the real ones come from Atlas's company.search in replay or live mode.
const company = (domain, extra = {}) => ({
  domain,
  name: domain,
  headcount: { min: 200, max: 200 },
  sources: [{ provider: "fiber", url: `https://${domain}`, fetchedAt: "t", claim: `name: ${domain}` }],
  ...extra,
});

function fakeAtlas({ companies, brief = {}, denyTools = [] }) {
  const calls = [];
  return {
    calls,
    async run(report) {
      calls.push(["run", report.phase]);
      return { runId: "run-1" };
    },
    async brief() {
      calls.push(["brief"]);
      return { statement: "3PL customers", searches: [{ keywords: ["3PL"] }], excludeDomains: [], fit: { employeeCount: { min: 101, max: 1000 } }, ...brief };
    },
    async tool(tool, args) {
      calls.push(["tool", tool, args.company?.domain]);
      if (denyTools.includes(tool)) return { decision: { outcome: "deny", ruleId: "watcher_tools", reason: "not allowed" } };
      if (tool === "company.search") return { decision: { outcome: "allow", ruleId: "default" }, data: { companies } };
      return { decision: { outcome: "allow", ruleId: "default" }, data: { matchId: `m-${args.company.domain}` } };
    },
  };
}

let dataDir;
let config;
beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "watcher-"));
  config = { atlasUrl: "https://atlas.test", goalId: "goal-1", token: "t", dataDir, maxNewPerTick: 5, cron: "0 13 * * *", tz: "UTC" };
});
afterEach(() => rm(dataDir, { recursive: true, force: true }));

describe("vetting", () => {
  const brief = { excludeDomains: ["existing.com"], fit: { employeeCount: { min: 101, max: 1000 } } };
  it("skips seen, existing, unsourced and out-of-range companies", () => {
    assert.equal(vetCompany(company("a.com"), brief, new Set(["a.com"])), "already_seen");
    assert.equal(vetCompany(company("existing.com"), brief, new Set()), "already_a_match");
    assert.equal(vetCompany(company("b.com", { sources: [] }), brief, new Set()), "no_sources");
    assert.equal(vetCompany(company("c.com", { headcount: { min: 5, max: 20 } }), brief, new Set()), "too_small");
    assert.equal(vetCompany(company("d.com", { headcount: { min: 5000, max: 9000 } }), brief, new Set()), "too_large");
    assert.equal(vetCompany(company("e.com"), brief, new Set()), null);
  });
});

describe("tick", () => {
  it("submits only unseen companies, and a second tick adds nothing new", async () => {
    const atlas = fakeAtlas({ companies: [company("a.com"), company("b.com")] });
    const first = await runTick({ config, atlas });
    assert.deepEqual(first.submitted, ["a.com", "b.com"]);

    const second = await runTick({ config, atlas: fakeAtlas({ companies: [company("a.com"), company("b.com"), company("c.com")] }) });
    assert.deepEqual(second.submitted, ["c.com"]);
    assert.equal(second.skipped.already_seen, 2);
  });

  it("keeps its seen set across a restart (state lives in the data dir)", async () => {
    await runTick({ config, atlas: fakeAtlas({ companies: [company("a.com")] }) });
    // A fresh process: nothing in memory, same data dir.
    const restarted = { ...config };
    const state = await loadState(restarted);
    assert.deepEqual(state.seenDomains, ["a.com"]);
    const tick = await runTick({ config: restarted, atlas: fakeAtlas({ companies: [company("a.com")] }) });
    assert.deepEqual(tick.submitted, []);
  });

  it("does not reuse another goal's seen set", async () => {
    await runTick({ config, atlas: fakeAtlas({ companies: [company("a.com")] }) });
    const other = await loadState({ ...config, goalId: "goal-2" });
    assert.deepEqual(other.seenDomains, []);
  });

  it("caps submissions per tick", async () => {
    const atlas = fakeAtlas({ companies: ["a", "b", "c", "d"].map((d) => company(`${d}.com`)) });
    const tick = await runTick({ config: { ...config, maxNewPerTick: 2 }, atlas });
    assert.equal(tick.submitted.length, 2);
  });

  it("records a denied tool call as an error instead of crashing, and reports start and finish", async () => {
    const atlas = fakeAtlas({ companies: [company("a.com")], denyTools: ["match.submit"] });
    const tick = await runTick({ config, atlas });
    assert.deepEqual(tick.submitted, []);
    assert.match(tick.errors[0], /match.submit a.com: deny/);
    assert.deepEqual(atlas.calls.filter((c) => c[0] === "run").map((c) => c[1]), ["start", "finish"]);
  });

  it("only ever calls the allowlisted tools", async () => {
    const atlas = fakeAtlas({ companies: [company("a.com")] });
    await runTick({ config, atlas });
    const tools = new Set(atlas.calls.filter((c) => c[0] === "tool").map((c) => c[1]));
    assert.deepEqual([...tools].sort(), ["company.search", "match.submit"]);
  });
});

describe("server contract", () => {
  async function withServer(fn, overrides = {}) {
    const atlas = fakeAtlas({ companies: [company("a.com")] });
    const box = createWatcherServer({ config: { ...config, ...overrides }, atlas, log: () => {} });
    await new Promise((resolve) => box.server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${box.server.address().port}`;
    try {
      await fn(base, box, atlas);
    } finally {
      await box.idle();
      await new Promise((resolve) => box.server.close(resolve));
    }
  }

  it("answers /health and /schedules", async () => {
    await withServer(async (base) => {
      assert.equal((await fetch(`${base}/health`)).status, 200);
      const schedules = await (await fetch(`${base}/schedules`)).json();
      assert.deepEqual(schedules, [{ id: "daily-tick", cron: "0 13 * * *", tz: "UTC", prompt: "tick", enabled: true }]);
    });
  });

  it("replies to a tick at once and runs it in the background", async () => {
    await withServer(async (base, box) => {
      const res = await fetch(`${base}/chat`, { method: "POST", body: JSON.stringify({ message: "tick", source: "scheduled" }) });
      assert.deepEqual(await res.json(), { response: "Tick started." });
      await box.idle();
      const status = JSON.parse((await (await fetch(`${base}/chat`, { method: "POST", body: JSON.stringify({ message: "status" }) })).json()).response);
      assert.deepEqual(status.lastTick.submitted, ["a.com"]);
    });
  });

  it("refuses to tick when not configured", async () => {
    await withServer(
      async (base) => {
        const body = await (await fetch(`${base}/chat`, { method: "POST", body: JSON.stringify({ message: "tick" }) })).json();
        assert.match(body.response, /missing token/);
      },
      { token: "" },
    );
  });
});

// ---------- one-shot delegated research ----------
import { loadLatestResearch, runResearch } from "../watcher.mjs";

const person = (name, extra = {}) => ({
  fullName: name,
  title: "Robotics Engineer",
  linkedinUrl: `https://www.linkedin.com/in/${name.toLowerCase()}`,
  skills: ["ROS", "C++"],
  sources: [{ provider: "fiber", url: `https://www.linkedin.com/in/${name.toLowerCase()}`, fetchedAt: "t", claim: "role: Robotics Engineer" }],
  ...extra,
});

function researchAtlas({ byTitle, failTitle } = {}) {
  const calls = [];
  const reports = [];
  return {
    calls,
    reports,
    async run(report) {
      reports.push(report);
      return report.phase === "start" ? { runId: "run-r1" } : { ok: true };
    },
    async brief() {
      return {
        statement: "Hire a robotics engineer",
        research: { kind: "hire", searches: [{ mode: "criteria", titles: ["robotics engineer"] }, { mode: "criteria", titles: ["robotics software engineer"] }] },
      };
    },
    async tool(tool, args) {
      calls.push([tool, args.titles?.[0]]);
      if (args.titles?.[0] === failTitle) throw new Error("HTTP 502");
      return { decision: { outcome: "allow", ruleId: "default" }, data: { candidates: byTitle[args.titles[0]] ?? [], provider: "fiber" } };
    },
  };
}

describe("delegated research", () => {
  it("runs one agent per search, merges by LinkedIn URL, drops emails and unsourced profiles", async () => {
    const atlas = researchAtlas({
      byTitle: {
        "robotics engineer": [person("Ada"), person("Bo", { email: "bo@x.com" }), person("NoSrc", { sources: [] })],
        "robotics software engineer": [person("Ada"), person("Cy")],
      },
    });
    const run = await runResearch({ config, atlas });
    assert.deepEqual(atlas.calls.map((c) => c[0]), ["contact.search", "contact.search"]);
    assert.deepEqual(run.shortlist.map((c) => c.fullName), ["Ada", "Bo", "Cy"]);
    assert.equal(run.shortlist.find((c) => c.fullName === "Bo").email, undefined);
    assert.deepEqual(run.agents.map((a) => a.found), [3, 2]);

    const finish = atlas.reports.find((r) => r.phase === "finish");
    assert.equal(finish.runId, "run-r1");
    assert.equal(finish.stats.mode, "research");
    assert.equal(finish.stats.shortlist.length, 3);
  });

  it("keeps the shortlist on disk across a restart", async () => {
    await runResearch({ config, atlas: researchAtlas({ byTitle: { "robotics engineer": [person("Ada")] } }) });
    const latest = await loadLatestResearch({ ...config });
    assert.equal(latest.runId, "run-r1");
    assert.deepEqual(latest.shortlist.map((c) => c.fullName), ["Ada"]);
    assert.equal((await loadState(config)).lastResearch.shortlistCount, 1);
  });

  it("one failing agent does not sink the run", async () => {
    const run = await runResearch({ config, atlas: researchAtlas({ byTitle: { "robotics engineer": [person("Ada")] }, failTitle: "robotics software engineer" }) });
    assert.deepEqual(run.shortlist.map((c) => c.fullName), ["Ada"]);
    assert.match(run.errors[0], /agent-2: HTTP 502/);
  });

  it("answers research and shortlist over /chat", async () => {
    const atlas = researchAtlas({ byTitle: { "robotics engineer": [person("Ada")] } });
    const box = createWatcherServer({ config, atlas, log: () => {} });
    await new Promise((resolve) => box.server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${box.server.address().port}`;
    try {
      const started = await (await fetch(`${base}/chat`, { method: "POST", body: JSON.stringify({ message: "research" }) })).json();
      assert.deepEqual(started, { response: "Research started." });
      await box.idle();
      const body = await (await fetch(`${base}/chat`, { method: "POST", body: JSON.stringify({ message: "shortlist" }) })).json();
      assert.deepEqual(JSON.parse(body.response).shortlist.map((c) => c.fullName), ["Ada"]);
    } finally {
      await new Promise((resolve) => box.server.close(resolve));
    }
  });
});
