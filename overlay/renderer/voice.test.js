import test from "node:test";
import assert from "node:assert/strict";
import { needAction } from "./voice.js";
import { toolResult } from "./voice-summary.js";

test("set_need args map to the OverlayAction, criteria split from a string", () => {
  assert.deepEqual(needAction({ text: " find investors ", kind: "investors", role: "", criteria: "seed, robotics ," }), {
    type: "set_need", text: "find investors", kind: "investors", criteria: ["seed", "robotics"],
  });
  assert.deepEqual(needAction({ text: "x", kind: "bogus", role: "Robotics engineer", criteria: ["ROS 2"] }), {
    type: "set_need", text: "x", role: "Robotics engineer", criteria: ["ROS 2"],
  });
});

test("set_need result proposes the brief and holds for an OK", () => {
  const out = toolResult("set_need", { brief: { goalKind: "Investors", role: "Seed investor", criteria: ["Robotics"] } });
  assert.equal(out, "Brief proposed (Investors: Seed investor). Criteria: Robotics. Waiting for the user's OK; do not approve yet.");
  assert.match(toolResult("set_need", { brief: null }), /^Need noted/);
  assert.match(toolResult("set_need", { brief: null, error: "Unknown overlay action" }), /^Denied/);
});

test("reject resolves a spoken name to the person's current letter after reruns", async () => {
  const { rejectAction } = await import("./voice.js");
  // Run 2: Jordan Ellis was rejected; Priya Raman moved up to B and a new person is C.
  const candidates = [
    { alias: "A", displayName: "Maya Chen" },
    { alias: "B", displayName: "Priya Raman" },
    { alias: "C", displayName: "Theo Marsh" },
  ];
  assert.deepEqual(rejectAction({ alias: "Priya", reason: "too junior" }, candidates), { type: "reject_candidate", alias: "B", reason: "too junior" });
  assert.equal(rejectAction({ alias: "Theo Marsh" }, candidates).alias, "C");
  assert.equal(rejectAction({ alias: "c" }, candidates).alias, "C");
  // A name no longer on the list doesn't fall back to its old letter.
  assert.equal(rejectAction({ alias: "Jordan" }, candidates).alias, "JORDAN");
  // Without a snapshot the default A/B/C names apply.
  assert.equal(rejectAction({ alias: "Jordan Ellis" }).alias, "B");
});

test("read-backs use each person's own display name", () => {
  const snap = { shortlist: { candidates: [{ alias: "A", displayName: "Maya Chen" }, { alias: "B", displayName: "Priya Raman" }] } };
  assert.equal(toolResult("confirm_change", snap), "Criteria updated. Shortlist has Maya Chen and Priya Raman.");
  assert.equal(toolResult("reject_candidate", snap, { alias: "B", name: "Priya Raman" }), "Rejected Priya Raman. Ask the user to confirm the change.");
});
