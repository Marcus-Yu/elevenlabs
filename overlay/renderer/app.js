// Renderer state machine. Main owns the state (hotkey, ball, Escape, scrim all
// route through it); this file reflects it in the DOM and mounts the cards.
import * as cards from "./cards.js";
import { h } from "./dom.js";

const root = document.getElementById("atl");
const colL = document.getElementById("col-l");
const colR = document.getElementById("col-r");

let state = "hidden";
let snap = null;
const mounted = {}; // card name → <article>, created once per summon
// Shortlist UI state that outlives a single snapshot: rows the user rejected
// (keyed by alias + headline, since live aliases shift after a reject) and the
// pending criteria change waiting for "Confirm change".
const ui = { rejected: new Set(), pendingConfirm: false, explanation: null, act };

const CARDS = {
  brief: { col: colL, side: "card-l", delayed: false, tight: false },
  research: { col: colR, side: "card-r", delayed: false, tight: false },
  shortlist: { col: colL, side: "card-l", delayed: true, tight: true },
  gateway: { col: colR, side: "card-r", delayed: true, tight: false },
};
const PHASE_CARDS = { thinking: ["brief", "research"], speaking: ["brief", "research", "shortlist", "gateway"] };

function fill(name) {
  if (mounted[name] && snap) mounted[name].replaceChildren(...cards[name](snap, ui).filter(Boolean));
}

function mount(name) {
  if (mounted[name]) return;
  const c = CARDS[name];
  const cls = ["card", c.side, c.delayed && "dl2", c.tight && "tight"].filter(Boolean).join(" ");
  mounted[name] = h("article", { class: cls });
  c.col.append(mounted[name]);
  fill(name);
}

function refreshAll() {
  for (const name of Object.keys(mounted)) fill(name);
}

async function load(forState) {
  try {
    const next = await window.atlas.snapshot();
    if (state !== forState) return;
    snap = next;
    for (const name of PHASE_CARDS[forState]) mount(name);
    refreshAll();
  } catch (err) {
    console.error("[atlas] snapshot failed", err);
  }
}

async function act(action) {
  try {
    const next = await window.atlas.act(action);
    if (action.type === "reject_candidate") {
      ui.pendingConfirm = true;
      ui.explanation = next.proposedChange?.explanation ?? ui.explanation;
    }
    if (action.type === "confirm_change") {
      ui.pendingConfirm = false;
      ui.explanation = null;
      ui.rejected.clear();
    }
    snap = next;
    refreshAll();
    // The live provider runs research on the next snapshot after approval.
    if (action.type === "approve_brief" && state === "speaking") load("speaking");
  } catch (err) {
    console.error("[atlas] act failed", err);
  }
}

function clearCards() {
  for (const name of Object.keys(mounted)) {
    mounted[name].remove();
    delete mounted[name];
  }
}

function setState(next) {
  state = next;
  root.className = `atl is-${next}`;
  if (next === "hidden") clearCards();
  if (next === "thinking" || next === "speaking") {
    // Show cards immediately from the last snapshot; refresh when the new one lands.
    if (snap) for (const name of PHASE_CARDS[next]) mount(name);
    load(next);
  }
}

window.atlas.onState(setState);
document.getElementById("ball").addEventListener("click", () => window.atlas.nav("advance"));
document.getElementById("scrim").addEventListener("click", () => window.atlas.nav("dismiss"));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.atlas.nav("dismiss");
});
