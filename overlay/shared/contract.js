// Contract between the overlay window (renderer) and its data provider (Electron main process).
// Design source: docs/design/atlas-overlay/ (README.md + atlas-overlay.dc.html).
// The renderer only ever sees a Snapshot; providers never touch the DOM.

/**
 * @typedef {"hidden"|"listening"|"thinking"|"speaking"|"leaving"} OverlayState
 *
 * @typedef {Object} SourceRef            // AGENTS.md rule 5: every claim carries one
 * @property {string} provider            // "fiber" | "ploid" | "web" | "synthetic"
 * @property {string} [url]
 * @property {string} claim
 *
 * @typedef {Object} BriefCard            // Calibration → approved criteria (WP3, WP5)
 * @property {string} goalKind            // e.g. "Hire"
 * @property {string} role                // e.g. "Robotics engineer"
 * @property {string[]} criteria          // chips
 * @property {string} privateNote         // e.g. "Salary ceiling stays private"
 * @property {"needs_ok"|"approved"} status
 * @property {string} [goalId]
 *
 * @typedef {Object} ResearchSource
 * @property {string} label               // e.g. "Company records (Fiber)"
 * @property {"scanning"|"done"} status
 * @property {number} [count]
 *
 * @typedef {Object} ResearchCard         // Delegated research (WP10)
 * @property {ResearchSource[]} sources
 * @property {"scanning"|"done"} status
 *
 * @typedef {Object} Candidate            // Anonymous until double opt-in (WP13)
 * @property {string} alias               // "A" | "B" | "C"
 * @property {string} headline            // role-level summary, never a name
 * @property {string} fit                 // e.g. "3/3"
 * @property {number} sourceCount
 * @property {string} [matchId]
 * @property {SourceRef[]} [sources]
 *
 * @typedef {Object} ShortlistCard        // Sourced shortlist (WP5)
 * @property {Candidate[]} candidates
 * @property {string} runLabel            // e.g. "Run 2 · fit@3 0.67 → 1.00"
 *
 * @typedef {Object} GatewayEvent
 * @property {string} ruleId              // e.g. "card_fields", "opt_in_only", "introductions"
 * @property {string} text
 * @property {"stripped"|"hidden"|"pending"|"allowed"|"denied"} kind
 *
 * @typedef {Object} GatewayCard          // Gateway rules + activity log (WP1, WP6, WP13)
 * @property {GatewayEvent[]} events
 * @property {"none"|"pending"|"approved"} introStatus
 * @property {string} [approvalId]
 *
 * @typedef {Object} Snapshot
 * @property {BriefCard|null} brief          // null until a need is set (set_need)
 * @property {ResearchCard} research
 * @property {ShortlistCard} shortlist
 * @property {GatewayCard} gateway
 * @property {"live"|"replay"|"mock"} mode   // shown as a small label on the cards
 * @property {boolean} synthetic             // true → cards show a "Synthetic" label (rule 5)
 * @property {string} updatedAt
 *
 * @typedef {{type:"approve_brief"} | {type:"run_research"} | {type:"reject_candidate", alias:string, reason:string}
 *   | {type:"confirm_change"} | {type:"open_intro"} | {type:"refresh"} | {type:"approve_send"}
 *   | {type:"set_need", text:string, kind?:"hire"|"customers"|"investors"|"manufacturer"|"partner"|"other", role?:string, criteria?:string[]}} OverlayAction
 * research, shortlist and gateway are null or empty until the brief is approved.
 *
 * A provider lives in the Electron main process:
 *   createProvider(env) → { snapshot(): Promise<Snapshot>, act(action: OverlayAction): Promise<Snapshot> }
 * overlay/main/providers/mock.js  — uses SAMPLE_SNAPSHOT below (Agent A)
 * overlay/main/providers/atlas.js — talks to the Wasp server and sim service (Agent B)
 * Selected with ATLAS_DATA=mock|live (default live, falls back to mock with mode "mock" if the server is down).
 */

/** Sample data from the design mock. Synthetic Orrery Robotics hire, labelled as such. */
const SAMPLE_SNAPSHOT = {
  mode: "mock",
  synthetic: true,
  updatedAt: new Date(0).toISOString(),
  brief: {
    goalKind: "Hire",
    role: "Robotics engineer",
    criteria: ["5+ yrs robotics", "ROS 2", "Manipulation", "Bay Area or remote"],
    privateNote: "Salary ceiling stays private",
    status: "needs_ok",
  },
  research: {
    status: "scanning",
    sources: [
      { label: "Company records (Fiber)", status: "scanning" },
      { label: "People search (Ploid)", status: "scanning" },
      { label: "Public web pages", status: "scanning" },
    ],
  },
  shortlist: {
    runLabel: "Run 1",
    candidates: [
      { alias: "A", headline: "Senior robotics engineer · manipulation", fit: "3/3", sourceCount: 4 },
      { alias: "B", headline: "Controls engineer · ROS 2", fit: "3/3", sourceCount: 3 },
      { alias: "C", headline: "Perception engineer · grasping", fit: "2/3", sourceCount: 2 },
    ],
  },
  gateway: {
    introStatus: "pending",
    events: [
      { ruleId: "card_fields", kind: "stripped", text: "Salary ceiling removed from the share card" },
      { ruleId: "opt_in_only", kind: "hidden", text: "Contact details hidden until both sides opt in" },
      { ruleId: "introductions", kind: "pending", text: "Introduction waiting for both sides" },
    ],
  },
};

const NEED_LABELS = { hire: "Hire", customers: "Find customers", investors: "Find investors", manufacturer: "Find a manufacturer", partner: "Find a partner", other: "Meet someone" };

/** "I need to hire an engineer" → "hire"; anything else → "other". */
function inferKind(text) {
  return /\b(hire|hiring|recruit|engineer)/i.test(text || "") ? "hire" : "other";
}

/** Builds the "Your need" brief from the user's words (status needs_ok). */
function briefFromNeed(need, hireCriteriaChips = []) {
  const kind = need.kind || inferKind(need.text);
  const criteria = need.criteria?.length ? need.criteria : kind === "hire" ? hireCriteriaChips : [];
  return {
    goalKind: NEED_LABELS[kind] || NEED_LABELS.other,
    role: need.role || need.text || "Your need",
    criteria,
    privateNote: "Contact details stay private until both sides opt in",
    status: "needs_ok",
    kind,
  };
}

/**
 * Finale (approve_send): gateway.send = { status: "idle"|"running"|"done"|"failed", failedStep?, steps: SendStep[] }
 * @typedef {{id:string, label:string, status:"pending"|"running"|"done"|"failed"}} SendStep
 */
const SEND_STEPS = [
  { id: "publish", label: "Removed your budget ceiling before sharing" },
  { id: "match", label: "Matched with an anonymous robotics engineer (synthetic)" },
  { id: "acceptA", label: "You accepted the match" },
  { id: "acceptB", label: "The engineer accepted (synthetic user)" },
  { id: "reveal", label: "Both sides agreed to meet" },
  { id: "send", label: "Introduction drafted for both of you (sandbox: nothing sent to a real person)" },
];
const newSend = () => ({ status: "idle", steps: SEND_STEPS.map((x) => ({ ...x, status: "pending" })) });

/** Runs the finale steps in order, skipping ones already done (safe to retry). runStep(id) does the work. */
async function runSend(send, runStep, onProgress = () => {}) {
  send.status = "running";
  delete send.failedStep;
  for (const step of send.steps) {
    if (step.status === "done") continue;
    step.status = "running";
    onProgress();
    try {
      await runStep(step.id);
      step.status = "done";
    } catch (err) {
      step.status = "failed";
      send.status = "failed";
      send.failedStep = step.label;
      onProgress();
      return send;
    }
    onProgress();
  }
  send.status = "done";
  return send;
}

module.exports = { SAMPLE_SNAPSHOT, NEED_LABELS, inferKind, briefFromNeed, SEND_STEPS, newSend, runSend };
