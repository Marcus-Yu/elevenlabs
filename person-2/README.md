# Person 2 — Discovery, standing goals and memory

Read §§3–8 for repository rules, sponsor floors, shared contracts and gateway policy. Follow §10 for dispatch and scope cuts. [Atlas implementation plan](../docs/IMPLEMENTATION_PLAN.md)

Start WP2 after WP0. Move to WP5 once WP1 and WP2 are ready. In wave 3, prioritize WP10 for the Maritime floor, then complete WP12.

Use one Codevisor worktree and branch per package. Open a PR when the acceptance checks pass and record the checks you ran.

Send and receive worker messages on the [pinned GitHub board](https://github.com/Marcus-Yu/elevenlabs/issues/1) using `person-2` as your address. [Agent handoff format](../docs/COORDINATION.md#agent-to-agent-handoffs)

## Current priority (scope change, 2026-11-22 18:10 UTC)

The core demo is now the two-user double-opt-in match. [Scope change](../docs/IMPLEMENTATION_PLAN.md#scope-change-2026-11-22-1810-utc-two-user-double-opt-in-is-the-core-demo)

1. **Now, WP5 for hiring:** a `hire` goal built from the criteria user A approves after calibration (WP3). Rank a sourced shortlist from people and company search. A rejection with a reason produces a proposed criteria change, the user confirms it (`preference_confirm`), and the rerun ranks better. Hiring goals skip Target and Draft, because contact happens only through the WP13 introduction.
2. **Next, WP10:** the Maritime box runs the approved brief (criteria only, `provider_minimum`) as a one-shot delegated research job and returns the sourced shortlist. The result must still appear after the app is refreshed.
3. **Then, WP12, timeboxed to 45 minutes:** Rowboat coordinates the research agents on that box. If it can't in time, keep #11's memory mirror as a labelled fallback, and report which one you chose.
4. **WP2:** make sure people search covers the hiring criteria. Ploid stays the primary people search once a key arrives; until then, Fiber is the labelled fallback.

## Demo notes (2026-11-22, `main` @ `b44074e`)

For whoever presents the 0:50–1:30 beat (delegated research → reject → confirm → better rerun), and for the WP15 runbook. All Person 2 code is on `main`: #6, #10, #11, #12, #17, #20, #21, #23 and #25.

### What is real and what is replayed

| Sponsor | State in the demo | Say |
|---|---|---|
| Fiber | Real data. The shortlist is 15 real public profiles from Fiber people search (and companies from Fiber company search), recorded on 2026-11-22 and **replayed** (`ADAPTER_MODE=replay`). | "Recorded from Fiber today; every claim links to its source." |
| Ploid | Code written against Ploid's published API, but **never called live**: no key. People search falls back to Fiber and logs `ploid_not_configured_used_fiber`. | "Ploid is the primary people search once keyed; this run used the Fiber fallback." Don't claim a Ploid result. |
| Maritime | A watcher box is **live** on the replacement key's project (`atlas-watcher-demo-hire`, agent `de1ba55b-1fd0-4eff-ad29-ab5979bb3190`), with a daily trigger Maritime registered. It is **not yet bound** to the demo goal (see "Binding the box"). Until it is, the shortlist on stage comes from replay. | If bound: "This ran on a Maritime box while we were talking." If not: "The box is deployed; this shortlist is the same search, replayed." |
| Rowboat | **Fallback.** No Rowboat org or Harbor server, so Rowboat isn't coordinating the agents. Memory runs on Postgres; #11's Harbor mirror switches on with `ROWBOAT_BASE_URL`, `ROWBOAT_TOKEN` and `ROWBOAT_SPACE_ID`. | "Memory is mirrored to a Rowboat Space when one is configured; today it runs on the Postgres fallback." |

### The beat, step by step (what the thread shows)

1. `createHireGoal({ criteria })` with the approved criteria: robotics engineer, must have ROS and C++, 2+ years, USA.
2. `runHireShortlist({ goalId })`: about 15 candidates ranked 0–100. Each reason ("has must-have ROS", "about 10.4 years") cites the profile field it came from.
3. Reject the most junior of the top five with the reason "too junior". `rejectMatchWithReason` returns the confirm card: *"You rejected a Robotics Software Engineer (about 3.5 years) as too junior. Raise the minimum to 4 years?"* The card never names the person (#25).
4. Confirm. `confirmCriteriaChange` returns the rerun, and `getHireRuns` gives the before/after: **4 of the top 5 meet the confirmed criteria before, 5 of 5 after** (replay data as of 2026-11-22).

### Claims the build supports
- Every point in a ranking cites a public source; companies or people without a source are dropped, not guessed.
- Ranking is rule-based (`rules-v1`) and deterministic. No model and no Anthropic key are on this path.
- A rejection only *proposes* a criteria change. Nothing changes until the user confirms, and the server applies only its own stored proposal (a forged or repeated confirm gets 409).
- Research candidates never carry an email and are never contacted. On a hire goal, `opt_in_only` blocks email reveal and outreach; contact happens only through the double-opt-in introduction.
- The watcher box holds only a goal-scoped token: no provider keys (the adapter refuses to send them), and any tool outside the allowlist gets 403 before the gateway. Its brief carries the criteria only, never profile facts such as the salary ceiling.
- The shortlist survives a refresh: it's saved on the goal (and, for a box run, in the box's `/data` and on `WatcherRun`).

### Claims to avoid
- That Ploid or Rowboat ran live today.
- That the scores predict who would accept an offer. They measure fit to the stated criteria only.
- That the candidates know about or agreed to this. They are public profiles found by research, labelled as such; only user B is an opt-in match.

### Likely questions
- **"Are these real people?"** Yes: public profiles from Fiber. That's why the card names a role, not a person, and why nobody is contacted outside the double opt-in. The repo keeps only the fields the ranking reads.
- **"Why did #3 drop?"** About 3.5 years of experience; after the user confirmed "minimum 4 years", that reason scores −30 and the rerun's top five all clear it.
- **"What runs on Maritime?"** One box per goal. It runs one search agent per job title in parallel, merges the results by profile URL, keeps them in `/data`, and reports back through the gateway.

### Binding the box (needs the Mac running Atlas)
1. On that Mac: `cloudflared tunnel --url http://localhost:3003` (the server port) gives a public URL.
2. Create the hire goal and store the SHA-256 of a new watcher token (`generateWatcherToken()` in `features/watchers/watchApi.ts`) on `Goal.watcherTokenHash`.
3. With the replacement Maritime key:
   `npx tsx app/scripts/deploy-watcher.ts env de1ba55b-1fd0-4eff-ad29-ab5979bb3190 --goal <hireGoalId> --atlas-url <tunnel URL> --token <wt_…>`
4. `npx tsx app/scripts/deploy-watcher.ts chat de1ba55b-1fd0-4eff-ad29-ab5979bb3190 research`, then `… chat … shortlist`. The run also lands on `WatcherRun.stats.shortlist` through the #19 routes.

### Housekeeping
- The old box `atlas-watcher-demo-robotics` (`32f1af7e…`, original key) is redundant. Delete it from the Maritime dashboard; that key lacks the `manage` scope.
- Re-record fixtures with `ADAPTER_MODE=record FIBER_API_KEY=… npx tsx app/scripts/record-discovery-fixtures.ts`. Company and person records were free on our Fiber plan, and the script trims people fixtures automatically.

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
