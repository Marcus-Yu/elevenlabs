// Pure overlay state machine (design: docs/design/atlas-overlay/README.md §States).
// main.js applies the side effects; this file only decides the next state.
const VISIBLE = ["listening", "thinking", "speaking"];

/** @param {string} state @param {"toggle"|"summon"|"advance"|"dismiss"|"left"} event */
function next(state, event) {
  switch (event) {
    case "summon":
      return state === "hidden" ? "listening" : state;
    case "dismiss":
      return VISIBLE.includes(state) ? "leaving" : state;
    case "toggle":
      return state === "hidden" ? "listening" : next(state, "dismiss");
    case "advance":
      return { listening: "thinking", thinking: "speaking", speaking: "leaving" }[state] ?? state;
    case "left":
      return state === "leaving" ? "hidden" : state;
    default:
      return state;
  }
}

/** Mouse passes through to the desktop only while nothing is on screen. */
const ignoresMouse = (state) => state === "hidden";

module.exports = { next, ignoresMouse };
