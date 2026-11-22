const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./humanize");

test("activity rows read as plain sentences", () => {
  assert.equal(h.eventText({ actionType: "company.search", decision: "ALLOW" }), "Searched company records (Fiber, replay)");
  assert.equal(h.eventText({ actionType: "contact.search", decision: "ALLOW" }), "Looked up public profiles");
  assert.equal(h.eventText({ actionType: "memory.write", decision: "NEEDS_APPROVAL" }), "Waiting for you to confirm a preference");
  assert.equal(h.eventText({ actionType: "card.publish", decision: "ALLOW", ruleId: "card_fields" }), "Removed your budget ceiling before sharing the card");
  assert.equal(h.eventText({ actionType: "card.reveal", decision: "NEEDS_APPROVAL" }), "Waiting for both sides to approve the introduction");
  assert.equal(h.eventText({ actionType: "x", decision: "DENY", ruleId: "opt_in_only" }), "Blocked: contact details stay hidden until both sides opt in");
  assert.equal(h.eventText({ actionType: "outreach.send", decision: "ALLOW", reason: "stub_handler: nothing sent" }), "Introduction drafted, not sent (demo data)");
  assert.doesNotMatch(h.eventText({ actionType: "card.reveal", decision: "ALLOW", reason: "stub_handler" }), /stub_handler/);
});

test("run labels and stripped fields", () => {
  assert.equal(h.runLabelText(2, { fitAtK: 5, k: 5 }, { fitAtK: 4, k: 5 }), "Run 2: 5 of 5 now match (was 4 of 5)");
  assert.equal(h.runLabelText(1, { fitAtK: 4, k: 5 }), "Run 1: 4 of the top 5 meet all your criteria");
  assert.equal(h.strippedText("budget", "your", "stub_handler"), "Removed your budget ceiling before sharing the card (demo data)");
});
