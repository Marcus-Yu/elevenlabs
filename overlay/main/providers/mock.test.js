const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvider } = require("./mock");

test("mock walks statuses forward and stays labelled synthetic", async () => {
  const p = createProvider({});
  assert.equal((await p.snapshot()).brief, null, "neutral until a need is set");
  const first = await p.act({ type: "set_need", text: "I need to hire an engineer" });
  assert.equal(first.mode, "mock");
  assert.equal(first.synthetic, true);
  assert.equal(first.brief.status, "needs_ok");

  let s = await p.act({ type: "approve_brief" });
  assert.equal(s.brief.status, "approved");
  assert.equal(s.research.status, "done");

  s = await p.act({ type: "reject_candidate", alias: "C", reason: "too junior" });
  assert.equal(s.shortlist.candidates.length, 3, "reject waits for confirm");
  s = await p.act({ type: "confirm_change" });
  assert.deepEqual(s.shortlist.candidates.map((c) => c.alias), ["A", "B"]);
  assert.match(s.shortlist.runLabel, /^Run 2/);

  s = await p.act({ type: "open_intro" });
  assert.equal(s.gateway.introStatus, "approved");
});
