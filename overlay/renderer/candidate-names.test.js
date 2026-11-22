import test from "node:test";
import assert from "node:assert/strict";
import { DISPLAY_NAMES, displayName, aliasFor } from "./candidate-names.js";

test("display names are the agreed pseudonyms, never Sam Rivera", () => {
  assert.deepEqual(DISPLAY_NAMES, { A: "Maya Chen", B: "Jordan Ellis", C: "Priya Raman" });
  assert.ok(!Object.values(DISPLAY_NAMES).includes("Sam Rivera"));
  assert.equal(displayName("B"), "Jordan Ellis");
  assert.equal(displayName("D"), "Candidate D");
});

test("aliasFor maps a spoken name or alias to the alias", () => {
  for (const ref of ["Jordan", "jordan ellis", "Ellis", " B ", "b", "Candidate B"]) assert.equal(aliasFor(ref), "B", ref);
  assert.equal(aliasFor("Maya Chen"), "A");
  assert.equal(aliasFor("priya"), "C");
  assert.equal(aliasFor("Sam Rivera"), "");
  assert.equal(aliasFor(undefined), "");
});
