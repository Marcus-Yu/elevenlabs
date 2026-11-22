// Mock provider: serves the labelled synthetic sample from the contract and walks
// its statuses forward when the overlay acts. No network, no real people.
const { SAMPLE_SNAPSHOT, briefFromNeed, newSend, runSend, displayName, namedProposal } = require("../../shared/contract");

const clone = (value) => JSON.parse(JSON.stringify(value));

function createProvider(_env = {}) {
  const snap = clone(SAMPLE_SNAPSHOT);
  snap.shortlist.candidates.forEach((c) => (c.displayName = displayName(c.alias)));
  // Layout checks: ATLAS_MOCK_LONG=1 stretches every text to stress wrapping and scrolling.
  if (_env.ATLAS_MOCK_LONG === "1") {
    const long = " and a much longer description that keeps going so the card has to wrap, clamp and scroll without overflowing";
    snap.brief.role += " for autonomous mixed-SKU warehouse picking";
    snap.brief.criteria.push("Shipped grasp planning on production arms", "Comfortable with on-call rotations");
    snap.research.sources.forEach((src) => (src.label += long));
    snap.shortlist.candidates.forEach((c) => (c.headline += long));
    snap.gateway.events.forEach((e) => (e.text += long));
  }
  const pendingRejects = new Set();

  let need = null; // null until set_need: Atlas stays neutral
  let send = newSend();
  let approved = false;
  const current = () => {
    const full = { ...clone(snap), mode: "mock", synthetic: true, updatedAt: new Date().toISOString() };
    if (!need) return { ...full, brief: null, research: null, shortlist: null, gateway: null };
    const brief = { ...briefFromNeed(need, SAMPLE_SNAPSHOT.brief.criteria), status: approved ? "approved" : "needs_ok" };
    if (brief.kind === "hire") {
      const hireBrief = { ...full.brief, ...brief, criteria: brief.criteria };
      return approved ? { ...full, brief: hireBrief, gateway: { ...full.gateway, send: clone(send) } } : { ...full, brief: hireBrief, research: null, shortlist: null, gateway: null };
    }
    const research = approved ? { status: "done", sources: [], note: `Research for "${brief.goalKind.toLowerCase()}" isn't wired in this demo yet` } : null;
    return { ...full, brief, research, shortlist: null, gateway: null };
  };

  function finishResearch() {
    snap.research.status = "done";
    snap.research.sources.forEach((source, i) => {
      source.status = "done";
      source.count = [12, 9, 21][i] ?? 5;
    });
  }

  const handlers = {
    set_need(action) {
      need = { text: action.text, kind: action.kind, role: action.role, criteria: action.criteria };
      approved = false;
    },
    approve_brief() {
      if (!need) return;
      approved = true;
      snap.brief.status = "approved";
      if (briefFromNeed(need).kind === "hire") finishResearch();
    },
    run_research: finishResearch,
    reject_candidate({ alias }) {
      if (alias) pendingRejects.add(alias);
    },
    confirm_change() {
      if (pendingRejects.size === 0) return;
      snap.shortlist.candidates = snap.shortlist.candidates.filter((c) => !pendingRejects.has(c.alias));
      pendingRejects.clear();
      snap.shortlist.runLabel = "Run 2: 2 of 2 now match (was 2 of 3)";
    },
    open_intro() {
      snap.gateway.introStatus = "approved";
      const intro = snap.gateway.events.find((e) => e.ruleId === "introductions");
      if (intro) {
        intro.kind = "allowed";
        intro.text = "Intro approved on your side · sandbox only";
      }
    },
    refresh() {},
  };

  return {
    reset() {
      need = null;
      approved = false;
      send = newSend();
    },
    async snapshot() {
      return current();
    },
    async act(action = {}) {
      if (action.type === "approve_send") {
        // Demo data: same steps, short delays so the checklist visibly ticks (labelled synthetic).
        if (send.status !== "running") {
          if (send.status === "done") send = newSend();
          await runSend(send, () => new Promise((r) => setTimeout(r, Number(_env.ATLAS_MOCK_STEP_MS ?? 450))));
        }
        return current();
      }
      const handler = handlers[action.type];
      if (handler) handler(action);
      // Mirror the live provider: a reject proposes a criteria change to confirm.
      if (action.type === "reject_candidate" && action.alias) {
        return { ...current(), proposedChange: { explanation: namedProposal("Raise the minimum to 5 years?", action.alias) } };
      }
      return current();
    },
  };
}

module.exports = { createProvider };
