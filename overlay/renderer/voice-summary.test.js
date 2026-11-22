import test from "node:test";
import assert from "node:assert/strict";
import { toolResult } from "./voice-summary.js";

const snap = { shortlist: { candidates: [{ alias: "A" }, { alias: "B" }, { alias: "C" }] } };

test("approve reads back the anonymous shortlist", () => {
  assert.equal(toolResult("approve_brief", snap), "Approved. Shortlist has A, B and C.");
});

test("errors become a denial the agent must explain", () => {
  assert.match(toolResult("approve_brief", { error: "gateway denied" }), /^Denied: gateway denied\. Stop/);
  assert.match(toolResult("confirm_change", null), /^Denied/);
  // main falls back to the mock snapshot on a live failure but keeps the error
  assert.match(toolResult("confirm_change", { ...snap, mode: "mock", error: "No criteria change is waiting" }), /^Denied: No criteria change/);
});

test("reject includes the proposed change and asks for confirmation", () => {
  const out = toolResult("reject_candidate", { ...snap, proposedChange: { explanation: "Raise seniority." } }, { alias: "C" });
  assert.equal(out, "Rejected C. Proposed criteria change: Raise seniority. Ask the user to confirm the change.");
});

test("empty shortlist and intro states", () => {
  assert.match(toolResult("run_research", { shortlist: { candidates: [] } }), /still running/);
  assert.match(toolResult("open_intro", { introUrl: "http://localhost:3000/match" }), /Opened/);
  assert.match(toolResult("open_intro", {}), /No introduction/);
});
