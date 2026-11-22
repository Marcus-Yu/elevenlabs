// Renderer state machine. Main owns the state (hotkey, ball, Escape, scrim all
// route through it); this file reflects it in the DOM and mounts the cards.
import * as cards from "./cards.js";
import { h } from "./dom.js";
import { computeLayout } from "./layout.js";
import { initVoice, onOverlayState } from "./voice.js";

const root = document.getElementById("atl");
const colL = document.getElementById("col-l");
const colR = document.getElementById("col-r");

let state = "hidden";
let snap = null;
const mounted = {}; // card name → <article>, created once per summon
// Shortlist UI state that outlives a single snapshot: rows the user rejected
// (keyed by alias + headline, since live aliases shift after a reject) and the
// pending criteria change waiting for "Confirm change".
const ui = { rejected: new Set(), pendingConfirm: false, explanation: null, confirmed: false, busy: null, errors: {}, act, refresh: () => refreshAll() };
// Which card shows the result (and any error) of each action.
const ACT_CARD = { set_need: "brief", approve_brief: "brief", run_research: "research", reject_candidate: "shortlist", confirm_change: "shortlist", open_intro: "gateway" };

/** Short, human error text for a card; never a stack trace. */
function friendly(err) {
  const raw = String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': /, "").replace(/^(AtlasProvider)?Error: /, "");
  if (/unreachable|timed out|fetch failed|ECONN|login failed/i.test(raw)) return "Atlas couldn't reach the server, retry.";
  // Never show raw server text (HTTP codes, operation names) on the overlay.
  return "Something went wrong, retry.";
}

const CARDS = {
  brief: { col: colL, side: "card-l", delayed: false, tight: false },
  research: { col: colR, side: "card-r", delayed: false, tight: false },
  shortlist: { col: colL, side: "card-l", delayed: true, tight: true },
  gateway: { col: colR, side: "card-r", delayed: true, tight: false },
};
const PHASE_CARDS = { listening: [], thinking: [], speaking: [] }; // states that show cards
// Cards appear step by step, only as the story reaches them (never all four unprompted).
const SHOW = {
  brief: (s) => Boolean(s?.brief),
  research: (s) => s?.brief?.status === "approved" && Boolean(s?.research),
  shortlist: (s) => (s?.shortlist?.candidates?.length ?? 0) > 0,
  gateway: (s) => Boolean(s?.gateway) && (ui.confirmed || /^Run [2-9]/.test(s?.shortlist?.runLabel || "")),
};

function fill(name) {
  const el = mounted[name];
  if (!el) return;
  // Skeleton until the first snapshot arrives, so a card is never missing.
  el.replaceChildren(...(snap ? cards[name](snap, ui).filter(Boolean) : [h("div", { class: "skeleton" }, "Loading…")]));
}

// Fit the cluster to the viewport (design scale 1, smaller only when needed) and
// bound each column; a column scrolls only when its cards are taller than the room.
function applyLayout() {
  const L = computeLayout(window.innerWidth, window.innerHeight);
  root.style.setProperty("--cluster-scale", String(L.scale));
  colL.style.maxHeight = `${Math.max(120, L.leftMax)}px`;
  colR.style.maxHeight = `${Math.max(120, L.rightMax)}px`;
  updateScroll();
}

function updateScroll() {
  for (const col of [colL, colR]) col.classList.toggle("scroll", col.scrollHeight > col.clientHeight + 1);
}

function mount(name) {
  if (mounted[name]) return;
  const c = CARDS[name];
  const cls = ["card", c.side, c.delayed && "dl2", c.tight && "tight"].filter(Boolean).join(" ");
  const el = h("article", { class: cls });
  // Safety net: once the entry animation ends, the card is fully visible even if
  // an animation is interrupted (leaving still animates it out).
  el.addEventListener("animationend", (e) => {
    if (e.target === el && /^in[LR]$/.test(e.animationName)) el.classList.add("entered");
  });
  mounted[name] = el;
  c.col.append(el);
  fill(name);
}

function refreshAll() {
  if (typeof needBox !== "undefined") mountForState();
  for (const name of Object.keys(mounted)) fill(name);
  updateScroll();
}

/** Mount whatever the current state shows and the snapshot has data for (voice can jump states). */
function mountForState() {
  const showing = state in PHASE_CARDS;
  for (const name of Object.keys(CARDS)) if (showing && SHOW[name](snap)) mount(name);
  for (const name of Object.keys(mounted)) {
    if (!showing || !SHOW[name](snap)) {
      mounted[name].remove(); // e.g. a new need replaced the old one
      delete mounted[name];
    }
  }
  needBox.hidden = Boolean(snap?.brief) || !(state in PHASE_CARDS);
}

// Neutral start: until the user states a need, one small input under the ball.
const needBox = h("form", { class: "need-box", hidden: true },
  h("input", { type: "text", placeholder: "What do you need help with?", "aria-label": "What do you need help with?" }));
document.querySelector(".cluster").append(needBox);
needBox.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = needBox.querySelector("input");
  const text = input.value.trim();
  if (!text) return;
  const kind = /\b(hire|hiring|recruit|engineer)/i.test(text) ? "hire" : "other";
  act({ type: "set_need", text, kind }).then(() => {
    input.value = "";
    mountForState();
    refreshAll();
  });
});

async function load(forState) {
  try {
    const next = await window.atlas.snapshot();
    // Always keep the newest snapshot and render it into whatever is on screen now.
    snap = next;
    delete ui.errors.brief;
    mountForState();
    refreshAll();
  } catch (err) {
    console.error("[atlas] snapshot failed", err);
    ui.errors.brief = { msg: friendly(err), retry: () => load(state) };
    refreshAll();
  }
}

async function act(action) {
  const card = ACT_CARD[action.type];
  if (card) delete ui.errors[card];
  ui.busy = action.type;
  refreshAll();
  try {
    const next = await window.atlas.act(action);
    if (action.type === "reject_candidate") {
      ui.pendingConfirm = Boolean(next.proposedChange);
      ui.explanation = next.proposedChange?.explanation ?? null;
    }
    if (action.type === "confirm_change") {
      ui.pendingConfirm = false;
      ui.explanation = null;
      ui.rejected.clear();
      ui.confirmed = true;
    }
    snap = next;
    if (next.demoData && card) ui.errors[card] = { msg: "Atlas didn't respond, showing demo data (demo data)", retry: () => act(action) };
    return next;
  } catch (err) {
    console.error("[atlas] act failed", err);
    const msg = friendly(err);
    if (card) ui.errors[card] = { msg, retry: () => act(action) };
    return { error: msg };
  } finally {
    ui.busy = null;
    refreshAll();
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
  if (next === "hidden") {
    // Next summon starts fresh (main resets the provider too).
    clearCards();
    snap = null;
    Object.assign(ui, { pendingConfirm: false, explanation: null, confirmed: false, busy: null, errors: {} });
    ui.rejected.clear();
  }
  if (next in PHASE_CARDS) {
    // Mount from the last snapshot now; refresh when the new one lands.
    mountForState();
    updateScroll();
    load(next);
  } else {
    needBox.hidden = true;
  }
}

applyLayout();
window.addEventListener("resize", applyLayout);
initVoice({ act, root });
window.atlas.onState((next) => {
  setState(next);
  onOverlayState(next);
});
document.getElementById("ball").addEventListener("click", () => window.atlas.nav("advance"));
document.getElementById("scrim").addEventListener("click", () => window.atlas.nav("dismiss"));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.atlas.nav("dismiss");
});
