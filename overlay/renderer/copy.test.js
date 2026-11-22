import test from "node:test";
import assert from "node:assert/strict";
import { TITLES, statusWord, fitText, confirmLabel } from "./copy.js";

test("overlay copy is plain language", () => {
  assert.equal(TITLES.gateway, "Privacy and approvals");
  assert.equal(statusWord("needs_ok"), "Needs your OK");
  assert.equal(statusWord("scanning"), "Searching…");
  assert.equal(statusWord("EXECUTED"), "Done");
  assert.equal(fitText("3/3"), "Meets 3 of 3 criteria");
  assert.equal(confirmLabel("You rejected a Robotics Software Engineer II (about 3.6 years) as too junior. Raise the minimum to 4 years?"), "Confirm: raise minimum to 4 years");
  assert.equal(confirmLabel(null), "Confirm change");
});
