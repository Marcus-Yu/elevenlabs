// Mock provider: serves the labelled synthetic sample from the contract and walks
// its statuses forward when the overlay acts. No network, no real people.
const { SAMPLE_SNAPSHOT } = require("../../shared/contract");

const clone = (value) => JSON.parse(JSON.stringify(value));

function createProvider(_env = {}) {
  const snap = clone(SAMPLE_SNAPSHOT);
  const pendingRejects = new Set();

  const current = () => ({ ...clone(snap), mode: "mock", synthetic: true, updatedAt: new Date().toISOString() });

  function finishResearch() {
    snap.research.status = "done";
    snap.research.sources.forEach((source, i) => {
      source.status = "done";
      source.count = [12, 9, 21][i] ?? 5;
    });
  }

  const handlers = {
    approve_brief() {
      snap.brief.status = "approved";
      finishResearch();
    },
    run_research: finishResearch,
    reject_candidate({ alias }) {
      if (alias) pendingRejects.add(alias);
    },
    confirm_change() {
      if (pendingRejects.size === 0) return;
      snap.shortlist.candidates = snap.shortlist.candidates.filter((c) => !pendingRejects.has(c.alias));
      pendingRejects.clear();
      snap.shortlist.runLabel = "Run 2 · fit@3 0.67 → 1.00";
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
    async snapshot() {
      return current();
    },
    async act(action = {}) {
      const handler = handlers[action.type];
      if (handler) handler(action);
      // Mirror the live provider: a reject proposes a criteria change to confirm.
      if (action.type === "reject_candidate" && action.alias) {
        return { ...current(), proposedChange: { explanation: "Raise the minimum to 5 years?" } };
      }
      return current();
    },
  };
}

module.exports = { createProvider };
