# Person 2 — Discovery, standing goals and memory

Read §§3–8 for repository rules, sponsor floors, shared contracts and gateway policy. Follow §10 for dispatch and scope cuts. [Atlas implementation plan](../docs/IMPLEMENTATION_PLAN.md)

Start WP2 after WP0. Move to WP5 once WP1 and WP2 are ready. In wave 3, prioritize WP10 for the Maritime floor, then complete WP12.

Use one Codevisor worktree and branch per package. Open a PR when the acceptance checks pass and record the checks you ran.

Send and receive worker messages on the [pinned GitHub board](https://github.com/Marcus-Yu/elevenlabs/issues/1) using `person-2` as your address. [Agent handoff format](../docs/COORDINATION.md#agent-to-agent-handoffs)

## Handoffs

- Give Person 1 the Fiber, Ploid and web handler registrations and replay fixtures. Check the source references and email reveal boundary in replay.
- Give Person 3 a ranked-match fixture with populated sources for persona building. Provide Person 4 with goal stage, match and draft state for briefing and thread cards.
- Agree on the goal settings interface with Person 4. Own onboarding, goal operations and the matching pipeline. Person 4 owns the goal settings components and should coordinate changes to shared registration with you.
- Share the watcher restart and forbidden-tool results with Person 1. Agree on the memory interface before WP5 and WP12 integrate so ranking can use Postgres while the Rowboat adapter is in progress.

## WP2 — Discovery adapters

**Depends:** WP0. **Owns:** `adapters/fiber.ts`, `adapters/ploid.ts`, `adapters/web.ts`, matching `gateway/handlers/`, `fixtures/fiber|ploid|web/`.

- [ ] Read the OpenAPI specs first (§5) and correct this plan where it is wrong.
- [ ] Fiber: ICP → `nlp-search/run` or `company-search` → `CompanyRecord[]` with a `SourceRef` per populated field. `jobs.search` for WORK_FOR goals. Check credits before chargeable calls.
- [ ] Ploid: `contact.search(company, roles)` returns up to three candidates without email. `contact.reveal_email` is a separate action, called only after approval.
- [ ] `web.read`: server-side fetch with private-IP blocking, size and time limits, text extraction, returned as `UntrustedText`. Set `flagged` when instruction-like patterns appear ("ignore previous", "you must now", addressed-to-AI phrasing).
- [ ] Record fixtures for the demo ICP (robotics customers, contract manufacturers).

**Acceptance**

- [ ] in replay mode each handler returns typed records with sources; a flagged page logs a `web.read` row with `reason: untrusted_instruction_detected`; email is absent until `contact.reveal_email` succeeds.

## WP5 — Goal engine and onboarding

**Depends:** WP1, WP2. **Owns:** `src/features/onboarding/`, `goals/`, `matches/`.

- [ ] Onboarding: paste URL, resume text or one-liner → `web.read` where relevant → profile summary and `ProfileFact`s with proposed sensitivity → user confirms facts and grants `model_processing` consent.
- [ ] Goal creation from "Who do you need?": infer direction, kind and ICP; user edits; choose autonomy (default PREPARE).
- [ ] Pipeline as pg-boss jobs with visible stage status: Research (ICP) → Find (`company.search`) → vet and rank with a rationale that cites sources → Target (`contact.search`) → Draft (`draft.create`, need-to-know facts only, at least one personalization ref).
- [ ] Match review: approve or reject with a reason; rejections and approvals become `MemoryItem` preferences that the next ranking pass reads.
- [ ] Intern goals skip Target and instead draft a job post and list opt-in channels.

**Acceptance**

- [ ] from a fresh account, pasting the demo site yields ranked matches with sources within 60 seconds in replay mode; a quote-request draft contains specs and not the budget ceiling; rejecting two matches for the same reason changes the next ranking.

## WP10 — Watchers on Maritime

**Depends:** WP2, WP5. **Owns:** `watcher-box/`, `src/features/watchers/`, `adapters/maritime.ts`.

- [ ] Watcher API from §7, with goal-scoped tokens.
- [ ] `watcher-box`: a small Node server meeting Maritime's container contract. On `POST /chat` with `message: "tick"` it replies at once and then runs a bounded tool loop (Anthropic SDK): load `/data/state.json` (seen domains, notes), fetch the brief, search, read candidate sites, submit new vetted matches, save state. It holds an Anthropic key and its goal token only.
- [ ] `GET /schedules` for a daily tick. Local runtime: a Wasp cron job posts the same tick to a locally running box. `WATCHER_RUNTIME=local|maritime`.
- [ ] Provision one box per goal with `externalId = goal.id`; delete it when the goal ends; revoke the token.
- [ ] New matches trigger the Draft stage and a notification; `WatcherRun` records each tick.

**Acceptance**

- [ ] a tick on a goal with an existing match set adds only unseen companies; killing and restarting the box keeps its seen set; the watcher token cannot call `outreach.send`; the briefing shows results from a tick that ran while the browser was closed.

## WP12 — Memory and Rowboat

**Depends:** WP5. **Owns:** `src/features/memory/`, `adapters/rowboat.ts`.

- [ ] `MemoryStore` interface: `write`, `search`, `list`, `delete`. Postgres implementation first.
- [ ] Read Harbor's contract; implement `RowboatMemory`, which mirrors each `MemoryItem` as a Markdown note in one Space and stores the returned reference. Reads for prompt context come back through the same interface.
- [ ] Memory page: everything Atlas remembers, grouped by kind, each with its source, each deletable. Delete removes it from both stores.
- [ ] Store only goal-relevant items: preferences from approvals and rejections, objections heard in runs, outcomes.

**Acceptance**

- [ ] rejecting a match creates a preference visible on the memory page and in the Rowboat Space; deleting it removes both; the next ranking prompt no longer contains it.
