# Person 4 — Thread, briefing and demo integration

Read §§3–8 for repository rules, sponsor floors, shared contracts and gateway policy. Follow §10 for dispatch and scope cuts. [Atlas implementation plan](../docs/IMPLEMENTATION_PLAN.md)

WP4 (thread) moved to person-3 at 18:15 UTC. Build WP6 against WP1 operations. In wave 4, build the synthetic share-card slice if time permits. Own the final rehearsal in wave 5.

Use one Codevisor worktree and branch per package. Open a PR when the acceptance checks pass and record the checks you ran.

Send and receive worker messages on the [pinned GitHub board](https://github.com/Marcus-Yu/elevenlabs/issues/1) using `person-4` as your address. [Agent handoff format](../docs/COORDINATION.md#agent-to-agent-handoffs)

## Current priority (scope change, 2026-11-22 18:10 UTC)

**WP4 moved to person-3 (18:15 UTC).** Give person-3 the card and opt-in data shapes the thread must render.

The core demo is now the two-user double-opt-in match, so WP13 is the centrepiece. [Scope change](../docs/IMPLEMENTATION_PLAN.md#scope-change-2026-11-22-1810-utc-two-user-double-opt-in-is-the-core-demo)

1. **Now, WP13:**
   - Seed user B, a synthetic engineer seeking a robotics role, with a complementary card. Coordinate the seed with person-1.
   - The card flow: draft → user edits and approves the exact card (the gateway strips disallowed fields) → matcher → anonymous match → each side accepts separately → each picks which identity fields to reveal → introduction drafted → approval.
   - The audit view with all six steps from real log rows.
   - Label both users as synthetic.
2. **Next:** WP6 (the approvals inbox and the activity log with the denied filter; the briefing is Tier 2), then the WP15 runbook for the new demo.

## Handoffs

- Reuse Person 1's approval and activity operations in all UI surfaces. Coordinate the goal settings components with Person 2 and the spoken briefing and approval handoff with Person 3.
- Own `src/features/connect/cards/`. Use Person 1's gateway without editing provider connection code.
- Record when the demo goals are actually started as soon as the goal pipeline supports them. Collect fixture coverage and fallback steps from each owner while they build. Coordinate edits to provider fixtures and seeds with their owners.
- Keep the demo runbook in `docs/DEMO_RUNBOOK.md`. Use measured outputs and real gateway log rows from the other owners to substantiate the demo claims.

## WP6 — Approvals inbox, briefing, activity log, goal settings

**Depends:** WP1. **Owns:** `src/features/approvals/` (UI), `briefing/`, `activity/` (UI), goal settings components.

- [ ] Inbox: pending approvals with the exact payload, sources, recipient (and redirect notice in sandbox mode), Approve, Deny, Edit-then-approve (edit creates a new draft version and a new hash).
- [ ] Briefing home: "While you were away" — found, did, waiting for you — computed from `ActionLog`, `Match` and `Approval` since last visit.
- [ ] Activity log: every action with decision, rule and reason; filter to denied; link to the TraceRoot trace when `traceId` exists; a badge when data came from replay.
- [ ] Autonomy dial and rules editor per goal; consent page listing each consent with revoke.

**Acceptance**

- [ ] all four screens work on seeded data produced by real gateway calls; changing the dial to WATCH makes a subsequent send attempt show as denied in the log.

## WP13 — Agent-to-agent share cards (two synthetic users)

**Depends:** WP1, WP6. **Owns:** `src/features/connect/cards/`.

- [ ] From a goal, the model drafts a `ShareCard` (sector, stage, region, need or offer, short description) and lists the fact each field came from. The gateway removes fields not allowed for the matching purpose. The user edits and approves the exact card, with an expiry.
- [ ] A matcher compares active cards and creates a `CardMatch` with a rationale. Each side sees an anonymous summary.
- [ ] Each side accepts separately, then chooses which identity fields to reveal. Only then is an introduction drafted, and it still needs approval to send.
- [ ] Seed a second synthetic user with a complementary card. Label both as synthetic in the UI.
- [ ] Audit view: private input → proposed card → approved card → anonymous match → double opt-in → introduction.

**Acceptance**

- [ ] neither user can see the other's identity before both accept; revoking a card removes it from matching; the audit view shows all six steps from real log rows.

## WP15 — Demo hardening

**Depends:** everything in scope. **Owns:** `docs/DEMO_RUNBOOK.md`, `fixtures/`, seed updates.

- [ ] Start the demo goals for real at the beginning of build time so the "four hours ago" line is true. Record fixtures as a network fallback.
- [ ] Choose the weak pitch line empirically: score candidates through `measured` five times each and keep one that drops reliably. Do not special-case it anywhere in code.
- [ ] Runbook: timings, who speaks, which tabs are open, what to do if the network, mic or phone fails, and the Q&A answers.
- [ ] One dry run end to end, timed.

**Acceptance**

- [ ] two consecutive timed runs under three minutes; every fallback exercised once.
