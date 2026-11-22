// Card bodies, rendered only from a Snapshot (overlay/shared/contract.js).
// Each function returns the children of one card; the card element itself is
// created once by app.js so its entry animation never replays on updates.
import { h, icon } from "./dom.js";
import { TITLES, statusWord, fitText, confirmLabel } from "./copy.js";

// AGENTS.md rule 5: synthetic material and the data mode are always labelled.
function tag(snap) {
  const text = snap.synthetic ? `Synthetic · ${snap.mode}` : snap.mode;
  return h("span", { class: "tag" }, text);
}

function head(label, snap, meta) {
  return h("div", { class: "head" },
    h("span", { class: "label" }, label, tag(snap)),
    meta);
}

// One action button: disabled while any action is in flight; the busy one says so.
function actionBtn(ui, action, label, { mini = false, enabled = true } = {}) {
  const busy = ui.busy === action.type;
  return h("button", { type: "button", class: `btn${mini ? " mini" : ""} primary`, disabled: !enabled || Boolean(ui.busy),
    onclick: () => ui.act(action) }, busy ? "Working…" : label);
}

// Inline error for a card, with a retry of the action that failed.
function errorLine(ui, card) {
  const e = ui.errors[card];
  if (!e) return null;
  return h("div", { class: "err", role: "alert" },
    h("span", {}, e.msg),
    h("button", { type: "button", class: "btn mini", disabled: Boolean(ui.busy), onclick: e.retry }, "Retry"));
}

export function brief(snap, ui) {
  const b = snap.brief;
  const approved = b.status === "approved";
  return [
    head("Brief", snap, h("span", { class: "meta" }, `Goal · ${b.goalKind}`)),
    h("h3", { class: "title" }, TITLES.brief),
    h("span", { class: "role clamp", title: b.role }, b.role),
    h("ul", { class: "chips" }, b.criteria.map((c) => h("li", {}, c))),
    h("div", { class: "foot" },
      h("span", { class: "note" }, icon("lock"), b.privateNote),
      approved ? h("span", { class: "ok" }, icon("check", 15, 2.4), statusWord("approved")) : h("span", { class: "pending" }, h("span", { class: "pend-dot pend" }), statusWord("needs_ok"))),
    approved ? null : actionBtn(ui, { type: "approve_brief" }, "Approve brief"),
    errorLine(ui, "brief"),
  ];
}

export function research(snap, ui) {
  const r = snap.research;
  const sources = r.sources.map((s, i) =>
    h("div", { class: "src" },
      h("span", { class: "src-row" }, s.label,
        s.status === "done" && s.count != null ? h("span", { class: "src-count" }, `${s.count} found`) : null),
      h("div", { class: "track" },
        h("div", { class: "fill", style: s.status === "done" ? { animation: "none" } : { animationDuration: `${2.4 + i}s` } }))));
  // Next step after approval (hire only): find candidates, until a shortlist exists.
  const needsSearch = snap.brief?.status === "approved" && snap.brief?.goalKind === "Hire" && (snap.shortlist?.candidates.length ?? 0) === 0;
  if (r.note) {
    // Honest placeholder for needs whose research isn't wired yet (rule 5: no fake results).
    return [
      h("div", { class: "head" }, h("span", { class: "label" }, "Research", tag(snap))),
      h("h3", { class: "title" }, TITLES.research),
      h("span", { class: "small clamp", title: r.note }, r.note),
      errorLine(ui, "research"),
    ];
  }
  return [
    h("div", { class: "head" },
      h("span", { class: "label" }, "Research", tag(snap)),
      h("span", { class: "pill" }, statusWord(r.status === "done" ? "done" : "scanning"))),
    h("h3", { class: "title" }, TITLES.research),
    ...sources,
    h("span", { class: "small" }, icon("link"), "Every claim links to its source"),
    needsSearch ? actionBtn(ui, { type: "run_research" }, "Find candidates") : null,
    errorLine(ui, "research"),
  ];
}

// "4/4" → true, "2/3" → false.
function fullFit(fit) {
  const [got, of] = String(fit).split("/");
  return got !== undefined && got === of;
}

/** Run 2+ means the criteria change was confirmed and the shortlist re-ran. */
export function rerun(snap) {
  return /^Run [2-9]/.test(snap.shortlist?.runLabel || "");
}

export function shortlist(snap, ui) {
  const s = snap.shortlist;
  const canReject = !ui.pendingConfirm && !ui.confirmed && !rerun(snap);
  const rows = s.candidates.map((c) => {
    const key = `${c.alias}|${c.headline}`;
    const rejected = ui.rejected.has(key);
    const reject = () =>
      ui.act({ type: "reject_candidate", alias: c.alias, reason: "too junior" }).then((r) => {
        if (r && !r.error) ui.rejected.add(key);
        ui.refresh();
      });
    return h("li", {},
      h("div", { class: `row${rejected ? " rejected" : ""}` },
        h("span", { class: "avatar" }, c.alias),
        h("span", { class: "who" },
          h("b", {}, c.displayName || `Candidate ${c.alias}`, c.displayName ? h("span", { class: "rule" }, " alias") : null),
          h("span", {}, rejected ? "Rejected · too junior" : c.headline)),
        h("span", { class: "fit" },
          h("span", { class: `badge${fullFit(c.fit) ? "" : " partial"}` }, fitText(c.fit)),
          `${c.sourceCount} sources`),
        canReject && !rejected
          ? h("button", { type: "button", class: "btn mini", disabled: Boolean(ui.busy), onclick: reject },
              ui.busy === "reject_candidate" ? "…" : "Too junior")
          : null));
  });
  const confirm = ui.pendingConfirm
    ? h("div", { class: "confirm" },
        ui.explanation ? h("span", { class: "explain clamp", title: ui.explanation }, ui.explanation) : null,
        actionBtn(ui, { type: "confirm_change" }, confirmLabel(ui.explanation)))
    : null;
  return [
    head("Shortlist", snap, h("span", { class: "meta" }, "Names are aliases until both sides opt in")),
    h("h3", { class: "title" }, TITLES.shortlist),
    h("span", { class: "run" }, s.runLabel),
    s.candidates.length ? h("ul", { class: "rows" }, rows) : h("span", { class: "small" }, "No candidates yet"),
    confirm,
    errorLine(ui, "shortlist"),
  ];
}

// Finale checklist: each real step goes from "…" to "✓" as it completes.
function sendChecklist(send) {
  const mark = { pending: "…", running: "…", done: "✓", failed: "!" };
  return h("ul", { class: "checklist" },
    send.steps.map((st) => h("li", { class: `step ${st.status}` },
      h("span", { class: "mark" }, mark[st.status] ?? "…"),
      h("span", { class: "clamp", title: st.label }, st.label))));
}

/** One primary action for the finale, a plain retry on failure, then "All done ✓". */
function finale(ui, send, ready) {
  if (!send) return actionBtn(ui, { type: "open_intro" }, "Review intro", { enabled: ready });
  if (send.status === "done") return h("div", { class: "done-line" }, "All done ✓");
  if (send.status === "failed") return actionBtn(ui, { type: "approve_send" }, `Couldn't finish: ${send.failedStep}. Retry`);
  if (send.status === "running") return h("div", { class: "small" }, "Sending through the gateway…");
  return actionBtn(ui, { type: "approve_send" }, "Approve and send", { enabled: ready });
}

const EVENT_ICON = {
  stripped: ["solid", "check", 3],
  allowed: ["solid", "check", 3],
  hidden: ["soft", "lock", 2.4],
  pending: ["line", "clock", 2.4],
  denied: ["line", "x", 2.4],
};

export function gateway(snap, ui) {
  const g = snap.gateway;
  const events = g.events.map((e) => {
    const [look, name, stroke] = EVENT_ICON[e.kind] || EVENT_ICON.pending;
    return h("li", {}, h("span", { class: `ico ${look}` }, icon(name, 12, stroke)),
      h("span", { class: "clamp", title: e.text }, e.text, e.ruleId && e.ruleId !== "default" ? h("span", { class: "rule" }, ` (${e.ruleId})`) : null));
  });
  // Last step: review the intro once the shortlist has been refined (Run 2).
  const ready = ui.confirmed || rerun(snap);
  const send = g.send;
  return [
    head([icon("shield"), "Gateway"], snap, h("span", { class: "meta" }, "Rules, not the model")),
    h("h3", { class: "title" }, TITLES.gateway),
    send && send.status !== "idle" ? sendChecklist(send) : h("ul", { class: "events" }, events),
    finale(ui, send, ready),
    errorLine(ui, "gateway"),
  ];
}
