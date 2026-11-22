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
