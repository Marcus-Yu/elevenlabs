// Card bodies, rendered only from a Snapshot (overlay/shared/contract.js).
// Each function returns the children of one card; the card element itself is
// created once by app.js so its entry animation never replays on updates.
import { h, icon } from "./dom.js";

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

export function brief(snap, ui) {
  const b = snap.brief;
  const status = b.status === "approved"
    ? h("span", { class: "ok" }, icon("check", 15, 2.4), "Approved")
    : h("span", { class: "pending" },
        h("span", { class: "pend-dot pend" }), "Needs your OK",
        h("button", { type: "button", class: "btn mini", onclick: () => ui.act({ type: "approve_brief" }) }, "Approve"));
  return [
    head("Brief", snap, h("span", { class: "meta" }, `Goal · ${b.goalKind}`)),
    h("h3", { class: "title" }, b.role),
    h("ul", { class: "chips" }, b.criteria.map((c) => h("li", {}, c))),
    h("div", { class: "foot" },
      h("span", { class: "note" }, icon("lock"), b.privateNote),
      status),
  ];
}

export function research(snap) {
  const r = snap.research;
  const sources = r.sources.map((s, i) =>
    h("div", { class: "src" },
      h("span", { class: "src-row" }, s.label,
        s.status === "done" && s.count != null ? h("span", { class: "src-count" }, `${s.count} found`) : null),
      h("div", { class: "track" },
        h("div", { class: "fill", style: s.status === "done" ? { animation: "none" } : { animationDuration: `${2.4 + i}s` } }))));
  return [
    h("div", { class: "head" },
      h("span", { class: "label" }, "Research", tag(snap)),
      h("span", { class: "pill" }, r.status === "done" ? "Done" : "Scanning")),
    ...sources,
    h("span", { class: "small" }, icon("link"), "Every claim links to its source"),
  ];
}

// "4/4" → true, "2/3" → false.
function fullFit(fit) {
  const [got, of] = String(fit).split("/");
  return got !== undefined && got === of;
}

export function shortlist(snap, ui) {
  const s = snap.shortlist;
  const rows = s.candidates.map((c) => {
    const key = `${c.alias}|${c.headline}`;
    const rejected = ui.rejected.has(key);
    const reject = () => {
      if (rejected) return;
      ui.rejected.add(key);
      ui.act({ type: "reject_candidate", alias: c.alias, reason: "too junior" });
    };
    return h("li", {},
      h("button", { type: "button", class: `row${rejected ? " rejected" : ""}`, title: "Reject: too junior", onclick: reject },
        h("span", { class: "avatar" }, c.alias),
        h("span", { class: "who" },
          h("b", {}, `Candidate ${c.alias}`),
          h("span", {}, rejected ? "Rejected · too junior" : c.headline)),
        h("span", { class: "fit" },
          h("span", { class: `badge${fullFit(c.fit) ? "" : " partial"}` }, c.fit),
          `${c.sourceCount} sources`)));
  });
  const confirm = ui.pendingConfirm
    ? h("div", { class: "confirm" },
        ui.explanation ? h("span", { class: "explain" }, ui.explanation) : null,
        h("button", { type: "button", class: "btn", onclick: () => ui.act({ type: "confirm_change" }) }, "Confirm change"))
    : null;
  return [
    head("Shortlist", snap, h("span", { class: "meta" }, `${s.runLabel} · names hidden`)),
    h("ul", { class: "rows" }, rows),
    confirm,
  ];
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
    return h("li", {}, h("span", { class: `ico ${look}` }, icon(name, 12, stroke)), e.text);
  });
  return [
    head([icon("shield"), "Gateway"], snap, h("span", { class: "meta" }, "Rules, not the model")),
    h("ul", { class: "events" }, events),
    h("button", { type: "button", class: "btn", disabled: g.introStatus === "none",
      onclick: () => ui.act({ type: "open_intro" }) }, "Review the intro"),
  ];
}
