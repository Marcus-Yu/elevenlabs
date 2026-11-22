// node --test overlay/main/providers/atlas.test.js — fake fetch, no server needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvider, AtlasProviderError, DEMO_HIRE_CRITERIA, _map } = require("./atlas");

const NAMES = ["Ada Quill", "Ben Rook", "Cy Vale", "Dee Moss"];
const entry = (name, i, years) => ({
  matchId: `g1:${i}`,
  candidate: { fullName: name, currentCompany: "Orbit Labs", title: "Robotics Engineer", yearsExperience: years, linkedinUrl: `https://linkedin.com/in/${i}`, skills: ["ROS", "C++"], sources: [{ provider: "fiber", url: `https://linkedin.com/in/${i}`, claim: `${name} is Robotics Engineer (current role)` }] },
  reasons: [{ text: 'Current role "Robotics Engineer" matches', points: 15 }, { text: "Has must-have ROS", points: 15 }, { text: "Has must-have C++", points: 15 }, { text: "Also lists Python", points: 5 }],
  citedSources: [{ provider: "fiber", url: `https://linkedin.com/in/${i}`, claim: `${name} is Robotics Engineer at Orbit Labs (current role)` }],
});

function fakeServer() {
  const calls = [];
  const runs = [];
  let ranked = NAMES.map((n, i) => entry(n, i, 3 + i));
  const handlers = {
    "/auth/username/login": (b) => (b.password === "atlas-demo-1" ? { sessionId: "tok" } : null),
    "/operations/create-hire-goal": () => ({ json: { goalId: "g1" } }),
    "/operations/run-hire-shortlist": () => {
      runs.push({ criteria: DEMO_HIRE_CRITERIA, evaluation: { k: 5, fitAtK: 3, meanScore: 70 } });
      return { json: ranked };
    },
    "/operations/reject-match-with-reason": (b) => {
      ranked = ranked.filter((r) => r.matchId !== b.json.matchId);
      return { json: { proposedChange: { changes: [{ field: "minYearsExperience", from: 2, to: 4 }], explanation: "You rejected Ada Quill (about 3 years) as too junior. Raise the minimum to 4 years?", basedOn: {} } } };
    },
    "/operations/confirm-criteria-change": () => {
      runs.push({ criteria: { ...DEMO_HIRE_CRITERIA, minYearsExperience: 4 }, evaluation: { k: 5, fitAtK: 5, meanScore: 80 }, comparedTo: { k: 5, fitAtK: 3, meanScore: 60 } });
      return { json: ranked };
    },
    "/operations/get-hire-runs": () => ({ json: runs }),
    "/operations/get-activity-log": () => ({ json: { rows: [{ actionType: "contact.search", decision: "ALLOW", ruleId: "default", adapterMode: "replay" }], nextCursor: null } }),
    "/operations/get-pending-approvals": () => ({ json: [] }),
    "/operations/get-match-demo": () => ({ json: { cardA: null, cardB: null, match: null, revealA: null, revealB: null } }),
  };
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body);
    calls.push({ path, body, auth: init.headers.authorization });
    const out = handlers[path]?.(body);
    return { ok: !!out, status: out ? 200 : 401, text: async () => JSON.stringify(out ?? { message: "nope" }) };
  };
  return { fetch, calls };
}

test("approve → shortlist → reject → confirm → run 2, with no names in the shortlist", async () => {
  const srv = fakeServer();
  const p = createProvider({ ATLAS_SERVER_URL: "http://atlas.test:3003" }, { fetch: srv.fetch });

  const neutral = await p.snapshot();
  assert.equal(neutral.brief, null, "neutral until a need is set");
  assert.equal(neutral.shortlist, null);
  const s0 = await p.act({ type: "set_need", text: "I need to hire an engineer", kind: "hire" });
  assert.equal(s0.brief.status, "needs_ok");
  assert.equal(s0.brief.goalKind, "Hire");
  assert.equal(s0.mode, "replay");
  assert.equal(s0.synthetic, true);

  const s1 = await p.act({ type: "approve_brief" });
  assert.equal(s1.brief.status, "approved");
  assert.equal(s1.brief.goalId, "g1");
  await p.act({ type: "approve_brief" });
  assert.equal(srv.calls.filter((c) => c.path === "/operations/create-hire-goal").length, 1, "createHireGoal only once");
  assert.deepEqual(srv.calls.find((c) => c.path === "/operations/create-hire-goal").body, { json: { criteria: DEMO_HIRE_CRITERIA } });

  const runCalls = () => srv.calls.filter((c) => c.path === "/operations/run-hire-shortlist").length;
  await p.snapshot({ state: "thinking" });
  assert.equal(runCalls(), 0, "no research outside speaking");
  const s2 = await p.snapshot();
  await p.snapshot();
  assert.equal(runCalls(), 1, "research runs once, on the first snapshot after approval");
  assert.deepEqual(s2.shortlist.candidates.map((c) => c.alias), ["A", "B", "C"]);
  assert.equal(s2.shortlist.candidates[0].fit, "3/4");
  assert.equal(s2.research.status, "done");
  assert.equal(s2.shortlist.runLabel, "Run 1: 3 of the top 5 meet all your criteria");
  const text = JSON.stringify(s2.shortlist);
  for (const n of NAMES) assert.ok(!text.includes(n), `shortlist leaks ${n}`);
  assert.ok(!text.includes("linkedin"), "shortlist leaks a profile URL");
  assert.ok(!text.includes("Orbit Labs"), "shortlist leaks the employer");
  assert.equal(s2.shortlist.candidates[0].sources[0].claim, "Candidate A is Robotics Engineer at a company (current role)");

  const s3 = await p.act({ type: "reject_candidate", alias: "A", reason: "too junior" });
  assert.equal(srv.calls.find((c) => c.path === "/operations/reject-match-with-reason").body.json.matchId, "g1:0");
  assert.ok(s3.proposedChange.explanation.includes("Candidate A") && !s3.proposedChange.explanation.includes("Ada"));

  const s4 = await p.act({ type: "confirm_change" });
  assert.equal(s4.shortlist.runLabel, "Run 2: 5 of 5 now match (was 3 of 5)");
  assert.ok(s4.brief.criteria.includes("4+ yrs"));
  assert.ok(srv.calls.filter((c) => c.path.startsWith("/operations/")).every((c) => c.auth === "Bearer tok"));

  const s5 = await p.act({ type: "open_intro" });
  assert.equal(s5.introUrl, "http://atlas.test:3002/match");
});

test("login failure and an unreachable server throw a clear error", async () => {
  const bad = createProvider({ ATLAS_PASSWORD: "wrong" }, { fetch: fakeServer().fetch });
  await assert.rejects(bad.snapshot(), (e) => e instanceof AtlasProviderError && /login failed/.test(e.message));
  const down = createProvider({ ATLAS_SERVER_URL: "http://127.0.0.1:9" }, { fetch: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(down.snapshot(), (e) => e instanceof AtlasProviderError && /unreachable at http:\/\/127\.0\.0\.1:9/.test(e.message));
});

test("gateway shows rule hits first and only rows that happened", () => {
  const g = _map.mapGateway(
    [
      { actionType: "memory.write", decision: "ALLOW", ruleId: "default" },
      { actionType: "outreach.send", decision: "DENY", ruleId: "opt_in_only" },
      { actionType: "card.publish", decision: "ALLOW", ruleId: "card_fields", reason: "stripped salary" },
    ],
    [{ id: "ap1", actionType: "card.reveal" }],
  );
  assert.deepEqual(g.events.map((e) => e.kind), ["hidden", "stripped", "allowed"]);
  assert.equal(g.introStatus, "pending");
  assert.equal(g.approvalId, "ap1");
  assert.equal(_map.modeOf([{ adapterMode: "record" }]), "live");
  assert.equal(_map.kebab("getPendingApprovals"), "get-pending-approvals");
});

test("/match: stripped field names, opt-in progress and intro status, stub handlers labelled", () => {
  const stubRows = [{ actionType: "card.reveal", reason: "stub_handler: card.reveal" }];
  const published = { cardA: { stripped: ["budget"], logReason: 'stripped ["budget"] stub_handler', draft: { budget: "Budget ceiling $180k" } }, cardB: { stripped: ["salary"], logReason: "ok" } };
  const m1 = _map.mapMatch({ ...published, match: { aAccepted: true, bAccepted: false } }, []);
  assert.deepEqual(m1.events.map((e) => e.text), ["Removed your budget ceiling before sharing the card (demo data)", "Removed B's salary before sharing the card", "Contact details stay hidden until both sides opt in (A accepted, waiting for B)"]);
  assert.equal(m1.introStatus, "none");
  assert.ok(!JSON.stringify(m1).includes("180k"), "never shows a stripped value");

  const m2 = _map.mapMatch({ ...published, match: { aAccepted: true, bAccepted: true }, revealA: { status: "EXECUTED" }, revealB: { status: "PENDING" } }, stubRows);
  assert.equal(m2.introStatus, "pending");
  assert.equal(m2.events.at(-1).text, "Waiting for both sides to approve the introduction (A approved) (demo data)");

  const m3 = _map.mapMatch({ ...published, match: { aAccepted: true, bAccepted: true, revealedAt: "2026-11-22T19:00:00Z" }, revealA: { status: "EXECUTED" }, revealB: { status: "EXECUTED" } }, stubRows);
  assert.equal(m3.introStatus, "approved");
  const g = _map.mapGateway([{ actionType: "contact.search", decision: "ALLOW", ruleId: "default" }], [], m3);
  assert.equal(g.introStatus, "approved");
  assert.equal(g.events[0].ruleId, "card_fields");
});

test("a non-hire need is approved honestly, with no research results", async () => {
  const srv = fakeServer();
  const p = createProvider({ ATLAS_SERVER_URL: "http://atlas.test:3003" }, { fetch: srv.fetch });
  const s0 = await p.act({ type: "set_need", text: "Find a contract manufacturer", kind: "manufacturer" });
  assert.equal(s0.brief.goalKind, "Find a manufacturer");
  const s1 = await p.act({ type: "approve_brief" });
  assert.equal(s1.brief.status, "approved");
  assert.match(s1.research.note, /isn't wired in this demo yet/);
  assert.deepEqual(s1.research.sources, []);
  assert.equal(s1.shortlist, null);
  assert.equal(srv.calls.filter((c) => c.path === "/operations/create-hire-goal").length, 0);
});
