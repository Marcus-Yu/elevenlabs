// Voice control for the overlay: one ElevenLabs conversation per summon.
// The SDK is the vendored IIFE build (window.ElevenLabsClient, see index.html).
// Main owns the state; voice only reports what the conversation is doing and
// routes client tool calls through the same act() the cards use.
import { toolResult } from "./voice-summary.js";
import { aliasFor } from "./candidate-names.js";

const BAR_GAIN = [0.7, 1, 0.85, 0.95, 0.75]; // per-bar spread so the bars don't move in lockstep

let conv = null;
let starting = false;
let disabled = false;
let ended = false; // session ended while visible: stay idle until the next summon
let state = "hidden";
let raf = 0;
let deps = null;

/** @param {{act: (a: object) => Promise<object>, root: HTMLElement}} d */
export function initVoice(d) {
  deps = d;
}

/** Called by app.js on every main-process state change. */
export function onOverlayState(next) {
  state = next;
  if (next === "listening" && !conv && !starting && !ended) start();
  if (next === "leaving" || next === "hidden") {
    ended = false; // the next summon reconnects
    end();
  }
}

async function start() {
  const SDK = window.ElevenLabsClient;
  if (disabled || !SDK?.Conversation) return;
  starting = true;
  try {
    const signedUrl = await window.atlas.voiceUrl();
    if (!signedUrl) {
      disabled = true; // main already logged the one warning
      return;
    }
    if (state === "leaving" || state === "hidden") return;
    conv = await SDK.Conversation.startSession({
      signedUrl,
      connectionType: "websocket",
      clientTools: tools(),
      onModeChange: ({ mode }) => window.atlas.voiceState(mode === "speaking" ? "speaking" : "listening"),
      onMessage: ({ source }) => {
        if (source === "user") window.atlas.voiceState("thinking");
      },
      // Don't dismiss when the session ends: return the ball to idle; the next summon reconnects.
      onDisconnect: (details) => {
        if (!conv) return; // we ended it (leaving/hidden)
        console.warn(`[atlas] voice disconnected: ${details?.reason ?? "unknown"}${details?.message ? ` (${details.message})` : ""}`);
        conv = null;
        ended = true;
        stopBars();
        window.atlas.voiceState("listening");
      },
      onError: (message, context) => console.error(`[atlas] voice error: ${message}${context ? ` ${JSON.stringify(context).slice(0, 300)}` : ""}`),
    });
    if (state === "leaving" || state === "hidden") return end();
    startBars();
  } catch (err) {
    // e.g. close 3000 "The AI agent you are trying to reach is not available." = ElevenLabs quota/plan exhausted
    const reason = err?.closeReason || err?.message || String(err);
    console.error(`[atlas] voice session failed (click flow still works): ${reason}${err?.closeCode ? ` [close ${err.closeCode}]` : ""}`);
  } finally {
    starting = false;
  }
}

function end() {
  stopBars();
  const c = conv;
  conv = null;
  if (c) c.endSession().catch((err) => console.error("[atlas] voice end failed", err));
}

// ---------- client tools (names match the agent created by scripts/create-voice-agent.js) ----------
function tools() {
  const run = async (action) => {
    window.atlas.voiceState("thinking");
    let snap = await deps.act(action);
    // Approval alone doesn't research ("refresh" only re-reads); run it so the agent can read back the shortlist.
    if (action.type === "approve_brief" && snap && !snap.error) snap = await deps.act({ type: "run_research" });
    return toolResult(action.type, snap, action);
  };
  return {
    set_need: (args = {}) => run(needAction(args)),
    approve_brief: () => run({ type: "approve_brief" }),
    run_research: () => run({ type: "run_research" }),
    // The agent may say a display name ("Jordan Ellis") or an alias; operations take the alias.
    reject_candidate: ({ alias, reason } = {}) =>
      run({ type: "reject_candidate", alias: aliasFor(alias) || String(alias ?? "").trim().toUpperCase(), reason: String(reason ?? "") }),
    confirm_change: () => run({ type: "confirm_change" }),
    open_intro: () => run({ type: "open_intro" }),
    approve_send: () => run({ type: "approve_send" }),
    show_cards: () => {
      window.atlas.nav("advance");
      return "Cards shown.";
    },
    dismiss: () => {
      setTimeout(() => window.atlas.nav("dismiss"), 1200); // let the goodbye finish
      return "Closing.";
    },
  };
}

const KINDS = ["hire", "customers", "investors", "manufacturer", "partner", "other"];

/** Agent tool args → OverlayAction set_need (criteria arrive as a comma-separated string). */
export function needAction({ text, kind, role, criteria } = {}) {
  const list = Array.isArray(criteria) ? criteria : String(criteria ?? "").split(",");
  const action = { type: "set_need", text: String(text ?? "").trim() };
  if (KINDS.includes(kind)) action.kind = kind;
  if (role) action.role = String(role).trim();
  const clean = list.map((c) => String(c).trim()).filter(Boolean);
  if (clean.length) action.criteria = clean;
  return action;
}

// ---------- voice bars follow the live volume ----------
function startBars() {
  const bars = [...deps.root.querySelectorAll(".bar")];
  deps.root.classList.add("voice-live");
  const tick = () => {
    const level = !conv ? 0 : state === "speaking" ? conv.getOutputVolume() : state === "listening" ? conv.getInputVolume() : 0;
    bars.forEach((bar, i) => {
      bar.style.transform = `scaleY(${Math.min(1, 0.2 + level * 2.4 * BAR_GAIN[i])})`;
    });
    raf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(raf);
  tick();
}

function stopBars() {
  cancelAnimationFrame(raf);
  if (!deps) return;
  deps.root.classList.remove("voice-live");
  for (const bar of deps.root.querySelectorAll(".bar")) bar.style.transform = "";
}
