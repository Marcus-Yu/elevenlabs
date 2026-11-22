# Person 3 — Simulation, pitch and voice

Read §§3–8 for repository rules, sponsor floors, shared contracts and gateway policy. Follow §10 for dispatch and scope cuts. [Atlas implementation plan](../docs/IMPLEMENTATION_PLAN.md)

Start WP3 after WP0 publishes the contracts. In wave 3, build WP8 with the ranked-match output from WP5. In wave 4, ship the skeptic call and live transcription before optional phone, spoken briefing and meeting work.

Use one Codevisor worktree and branch per package. Open a PR when the acceptance checks pass and record the checks you ran.

Send and receive worker messages on the [pinned GitHub board](https://github.com/Marcus-Yu/elevenlabs/issues/1) using `person-3` as your address. [Agent handoff format](../docs/COORDINATION.md#agent-to-agent-handoffs)

## Current priority (scope change, 2026-11-22 18:10 UTC)

The core demo is now the two-user double-opt-in match. The Room (WP8), the skeptic call and meeting detection (WP11) move to Tier 2. [Scope change](../docs/IMPLEMENTATION_PLAN.md#scope-change-2026-11-22-1810-utc-two-user-double-opt-in-is-the-core-demo)

1. **Now, WP3 calibration:** add two endpoints to the sim service.
   - `POST /calibrate/profiles` uses EDSL to produce 6–8 clearly synthetic candidate profiles that vary in experience, skills and work style. Each is labelled `synthetic: true` and is never a named real person.
   - `POST /calibrate/criteria` takes the user's picks and rejections with reasons and returns draft criteria (minimum experience, must-have skills, trade-offs), each citing the reactions it came from.

   Keep `/score` as is. The live-tier latency spike is no longer required.
2. **Next, WP4 thread (moved from person-4 at 18:15 UTC):** the assistant-ui thread with `POST /api/chat`. Tool cards cover the calibration profiles (from your own `/calibrate/profiles`), the shortlist (person-2's `RankedMatch`), the share-card review and opt-in prompt (person-4's WP13), and the approval card (person-1's `gateway.decideApproval`). Build against the WP1 stubs. Full task list under "WP4" below.
3. **Then, WP9 slimmed:** ElevenLabs voice input for stating the need (Scribe), and a spoken match briefing (TTS) of the shortlist and the match status. The skeptic and phone calls are Tier 2.

## Handoffs

- Publish a sample response for both score tiers and the latency results before wiring the Room. Use the same sourced panel for both measured pitch runs.
- Give Person 4 a reproducible rehearsal run with the weak sentence, skeptic objection and measured comparison for the demo.
- Use Person 1's approval operation and coordinate the briefing UI with Person 4. Share the signed voice approval webhook and a denied cross-user approval case with Person 1 for WP14.

## WP3 — Simulation service

**Depends:** WP0 (contracts only). **Owns:** `sim/`.

- [ ] `uv` project pinned to Python 3.12; FastAPI; `GET /health`, `POST /score`.
- [ ] Build an EDSL `AgentList` from `Persona[]`. Survey per segment: `interest` (linear scale 1–7, "how interested are you in continuing?") with the pitch so far as scenario context. For `tier: "measured"` add `objection` (free text, one sentence) and a final `take_meeting` (yes/no), and run `iterations` (default 3) to report spread.
- [ ] **Latency spike:** time `tier: "live"` for 8 personas and one sentence, 20 trials, with EDSL local inference. Write the p50 and p95 into `sim/README.md`. If p50 > 2.5 s, add a `direct` engine for the live tier (one structured-output Claude call that returns all persona scores) and keep EDSL for `measured`. The response always reports which engine ran.
- [ ] Tests against a stubbed model.

**Acceptance**

- [ ] `uv run pytest` passes; `POST /score` returns valid `ScoreResponse` for both tiers; the README states the measured latency and the engine decision.

## WP4 — Thread and chat endpoint

**Depends:** WP0, WP1 (stubs suffice). **Owns:** `src/features/thread/`.

- [ ] `POST /api/chat` as a Wasp `api` route using AI SDK v7 `streamText`, authenticated, CORS via namespace middleware.
- [ ] Tools: `propose_goal`, `list_matches`, `explain_match`, `draft_outreach`, `request_send`, `test_pitch`, `get_briefing`, `remember`, `forget`. Every `execute` builds an `ActionRequest` and calls the gateway. No tool calls an adapter.
- [ ] assistant-ui thread with tool UIs: match list, draft card, approval card (bound to the `Approval` row, Approve and Deny call `decideApproval`), denied-action notice.
- [ ] System prompt: Atlas proposes; it cannot approve; denied means stop and explain.

**Acceptance**

- [ ] a typed request produces a goal proposal; `request_send` on a PREPARE goal renders a pending card; approving it from the thread or from the inbox updates the same card; a denied action is shown as denied with its rule id.

## WP8 — Pitch test and The Room

**Depends:** WP3, WP5. **Owns:** `src/features/pitch/`, `room/`, `adapters/sim.ts`, `adapters/elevenlabs.ts` (token route only).

- [ ] Panel builder: from a goal's top matches, generate 8–12 personas in 3–4 segments, each tied to a real company's sourced attributes. Store as `Panel`.
- [ ] Text pitch test: split into sentences → `measured` score → show per-segment curve, top objections, meeting rate with panel size and spread → Claude proposes a revision that addresses the top objections → re-score → show the delta. Label everything as simulated.
- [ ] The Room: server route issues a Scribe token; `useScribe` streams the mic; each committed sentence is posted to `POST /api/room/:runId/segments`, which calls `tier: "live"` and returns scores; the graph updates.
- [ ] Graph: hand-written SVG, one line per segment over sentence index, a marker where a segment's interest drops most, the sentence text on hover. No chart dependency.
- [ ] On stop: run `measured` over the full transcript, store it, flag the sentence that lost each segment, and identify the toughest persona and their objection.
- [ ] Second run links `parentRunId`; comparison view shows both curves and the measured delta.

**Acceptance**

- [ ] speaking a 60-second pitch draws the graph with under about three seconds of lag per sentence; the end-of-run summary names a sentence and an objection per segment; a second run shows a numeric comparison; the UI states which engine produced each number.

## WP9 — Voice: skeptic call, phone call, spoken briefing

**Depends:** WP8 for 1–2; WP1 and WP6 for 3–5. **Owns:** `src/features/voice/`, rest of `adapters/elevenlabs.ts`.

- [ ] Create a "Skeptic" agent in ElevenLabs with dynamic variables for persona, company type, objection, weak sentence and pitch summary. Document the configuration in `docs/ELEVENLABS_SETUP.md`.
- [ ] In-browser call after a Room run: server issues a conversation token; client starts the session with the variables; transcript is saved to the run.
- [ ] "Briefing" agent with one server tool, `decide_approval(approvalId, decision)`, which calls our webhook. The webhook checks a shared secret and a one-time call-session token, confirms the approval belongs to the called user, then calls `decideApproval(..., via: "voice")`. The agent must read back the recipient and subject before asking.
- [ ] Proactive call: when a goal has approvals ready and the user has `phone_calls` consent, `call.place` goes through the gateway to `POST /v1/convai/twilio/outbound-call`. Rate-limit to one call per goal per day.
- [ ] Spoken briefing: TTS of the briefing text, played on the home screen.
- [ ] Post-call webhook stores the transcript; verify its signature.

**Acceptance**

- [ ] the skeptic call opens with the real objection from the last run; a phone call to the verified number can approve one pending item and the log shows `decidedVia: voice`; a call to any other number is denied. If no Twilio number is available, steps 3–4 run in-browser and the README says so.

## WP11 — Need detection from meetings

**Depends:** WP5, WP8 (Scribe token route). **Owns:** `src/features/meetings/`.

- [ ] Start requires `meeting_listening` consent, recorded with a scope (this meeting) and a visible on-screen indicator.
- [ ] Scribe transcribes the room; every few committed segments a classifier call returns either nothing or a structured need. Transcript text is `UntrustedText`.
- [ ] A detected need becomes a `NeedProposal` card. Only the user's approval creates a goal, at the level they pick.
- [ ] Keep the excerpt that triggered the proposal; discard the rest of the transcript when the meeting ends.

**Acceptance**

- [ ] saying "we need a contract manufacturer for the gripper housing" yields a manufacturer goal proposal; nothing is created without approval; starting without consent is denied and logged.
