import test from "node:test";
import assert from "node:assert/strict";
import { toolResult } from "./voice-summary.js";

const snap = { shortlist: { candidates: [{ alias: "A" }, { alias: "B" }, { alias: "C" }] } };

test("approve reads back the anonymous shortlist", () => {
  assert.equal(toolResult("approve_brief", snap), "Approved. Shortlist has Maya Chen, Jordan Ellis and Priya Raman.");
});

test("errors become a denial the agent must explain", () => {
  assert.match(toolResult("approve_brief", { error: "gateway denied" }), /^Denied: gateway denied\. Stop/);
  assert.match(toolResult("confirm_change", null), /^Denied/);
  // main falls back to the mock snapshot on a live failure but keeps the error
  assert.match(toolResult("confirm_change", { ...snap, mode: "mock", error: "No criteria change is waiting" }), /^Denied: No criteria change/);
});

test("reject includes the proposed change and asks for confirmation", () => {
  const explanation = "You rejected a Robotics Software Engineer II (about 3.6 years) as too junior. Raise the minimum to 4 years?";
  const out = toolResult("reject_candidate", { ...snap, proposedChange: { explanation } }, { alias: "B", reason: "too junior" });
  assert.equal(out, "Rejected Jordan Ellis. Proposed change: Jordan Ellis looks too junior. Raise the minimum to 4 years? Ask the user to confirm the change.");
  assert.equal(toolResult("reject_candidate", snap, { alias: "A" }), "Rejected Maya Chen. Ask the user to confirm the change.");
});

test("empty shortlist and intro states", () => {
  assert.match(toolResult("run_research", { shortlist: { candidates: [] } }), /still running/);
  assert.match(toolResult("open_intro", { introUrl: "http://localhost:3000/match" }), /Opened/);
  assert.match(toolResult("open_intro", {}), /No introduction/);
});

test("approve_send reports done, or Denied on failure", () => {
  assert.match(toolResult("approve_send", snap), /^Done\. .*sandbox inbox/);
  assert.match(toolResult("approve_send", { ...snap, error: "Unknown overlay action" }), /^Denied/);
});
