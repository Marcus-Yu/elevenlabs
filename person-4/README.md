# Person 4 — Thread, briefing and demo integration

Read §§3–8 for repository rules, sponsor floors, shared contracts and gateway policy. Follow §10 for dispatch and scope cuts. [Atlas implementation plan](../docs/IMPLEMENTATION_PLAN.md)

Start WP4 in wave 1 as soon as WP1 stubs are ready. In wave 2, build WP6 against WP1 operations. In wave 4, build the synthetic share-card slice if time permits. Own the final rehearsal in wave 5.

Use one Codevisor worktree and branch per package. Open a PR when the acceptance checks pass and record the checks you ran.

Send and receive worker messages on the [pinned GitHub board](https://github.com/Marcus-Yu/elevenlabs/issues/1) using `person-4` as your address. [Agent handoff format](../docs/COORDINATION.md#agent-to-agent-handoffs)

## Handoffs

- Reuse Person 1's approval and activity operations in all UI surfaces. Coordinate the goal settings components with Person 2 and the spoken briefing and approval handoff with Person 3.
- Own `src/features/connect/cards/`. Use Person 1's gateway without editing provider connection code.
- Record when the demo goals are actually started as soon as the goal pipeline supports them. Collect fixture coverage and fallback steps from each owner while they build. Coordinate edits to provider fixtures and seeds with their owners.
- Keep the demo runbook in `docs/DEMO_RUNBOOK.md`. Use measured outputs and real gateway log rows from the other owners to substantiate the demo claims.

## WP4 — Thread and chat endpoint

**Depends:** WP0, WP1 (stubs suffice). **Owns:** `src/features/thread/`.

- [ ] `POST /api/chat` as a Wasp `api` route using AI SDK v7 `streamText`, authenticated, CORS via namespace middleware.
- [ ] Tools: `propose_goal`, `list_matches`, `explain_match`, `draft_outreach`, `request_send`, `test_pitch`, `get_briefing`, `remember`, `forget`. Every `execute` builds an `ActionRequest` and calls the gateway. No tool calls an adapter.
- [ ] assistant-ui thread with tool UIs: match list, draft card, approval card (bound to the `Approval` row, Approve and Deny call `decideApproval`), denied-action notice.
- [ ] System prompt: Atlas proposes; it cannot approve; denied means stop and explain.

**Acceptance**

- [ ] a typed request produces a goal proposal; `request_send` on a PREPARE goal renders a pending card; approving it from the thread or from the inbox updates the same card; a denied action is shown as denied with its rule id.

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
