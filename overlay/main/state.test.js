const test = require("node:test");
const assert = require("node:assert/strict");
const { next, ignoresMouse } = require("./state");

test("hotkey summons from hidden and dismisses while visible", () => {
  assert.equal(next("hidden", "toggle"), "listening");
  for (const s of ["listening", "thinking", "speaking"]) assert.equal(next(s, "toggle"), "leaving");
  assert.equal(next("leaving", "toggle"), "leaving");
});

test("ball advances listening → thinking → speaking → leaving", () => {
  assert.equal(next("listening", "advance"), "thinking");
  assert.equal(next("thinking", "advance"), "speaking");
  assert.equal(next("speaking", "advance"), "leaving");
  assert.equal(next("hidden", "advance"), "hidden");
  assert.equal(next("leaving", "advance"), "leaving");
});

test("Escape and scrim dismiss only while visible", () => {
  assert.equal(next("speaking", "dismiss"), "leaving");
  assert.equal(next("hidden", "dismiss"), "hidden");
});

test("leaving ends in hidden; second launch summons only from hidden", () => {
  assert.equal(next("leaving", "left"), "hidden");
  assert.equal(next("speaking", "left"), "speaking");
  assert.equal(next("hidden", "summon"), "listening");
  assert.equal(next("thinking", "summon"), "thinking");
});

test("clicks pass through only while hidden", () => {
  assert.equal(ignoresMouse("hidden"), true);
  for (const s of ["listening", "thinking", "speaking", "leaving"]) assert.equal(ignoresMouse(s), false);
});

test("voice moves between visible states only", () => {
  const { voice } = require("./state");
  assert.equal(voice("listening", "speaking"), "speaking");
  assert.equal(voice("speaking", "listening"), "listening");
  assert.equal(voice("thinking", "thinking"), "thinking");
  assert.equal(voice("hidden", "speaking"), "hidden");
  assert.equal(voice("leaving", "listening"), "leaving");
  assert.equal(voice("listening", "hidden"), "listening");
  assert.equal(voice("listening", "bogus"), "listening");
});
