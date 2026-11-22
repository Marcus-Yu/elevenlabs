# Atlas — Implementation Plan

Status: in build, 2026-11-22. **See the scope change below; it overrides §1, §10 and §12.**

Atlas is a persistent agent that finds the people you need (customers, investors, manufacturers, employers), tests and rehearses your pitch against a simulated audience built from those real companies, drafts outreach, and keeps watching until the goal is met. Every action passes through a rule-based gateway that the model cannot override.

This document is written to be handed to coding agents. Each work package in §9 is a self-contained brief with owned paths, inputs, and acceptance checks.

---

## Scope change (2026-11-22, 18:10 UTC): two-user double opt-in is the core demo

The human coordinator moved the centrepiece to the agent-to-agent match, following the team notes (`Dante-Bravi/Eleven-labs-Obsidian` commit `2d1b5a1`, *Sponsor Integration Architecture*). This section overrides §1, §10 and §12 where they differ. §13.2 anticipated this change: WP13 moves up, and The Room becomes Tier 2.

### Demo scenario (both users synthetic and labelled as such)
- **User A** is the seeded Orrery Robotics hiring manager. They need a robotics engineer and have private facts, including a salary ceiling.
- **User B** is a seeded engineer looking for a robotics role (`WORK_FOR`), with a complementary card.

| Time | Beat | Sponsors | Built by |
|---|---|---|---|
| 0:00–0:20 | A types or says "I need a robotics engineer" in the thread | assistant-ui, ElevenLabs | WP4, WP9 |
| 0:20–0:50 | **Calibration:** A reacts to 6–8 clearly synthetic candidate profiles, and Atlas proposes criteria from those reactions. A approves the criteria. | Expected Parrot | WP3, WP5 |
| 0:50–1:30 | **Delegated research:** the approved brief (criteria only) runs as research agents on a Maritime box and returns a sourced shortlist. A rejects one candidate as too junior and confirms the proposed criteria change. The rerun ranks better, and TraceRoot shows both runs with the evaluation delta. | Rowboat, Maritime, Ploid, Fiber, TraceRoot | WP10, WP12, WP2, WP5, WP7 |
| 1:30–2:20 | **Double opt-in:** A approves an anonymous share card (the gateway strips the salary ceiling, and the log shows it). The matcher pairs it with B's card. Each side's agent asks its user privately, both accept, and each chooses which details to reveal. Atlas then drafts an introduction. | Wasp, Alter (rules) | WP13, WP1 |
| 2:20–2:50 | A approves the introduction. Alter delivers it to the sandbox redirect inbox. The activity log and TraceRoot show the send and one real denied attempt. | Alter, TraceRoot | WP7, WP6 |

Codevisor is the build tool: each work package is one Codevisor agent.

### Rules for hiring goals
- New `GoalKind` value `hire` (additive schema change).
- `contact.search` and people search may build a **sourced research shortlist** of public profiles.
- New rule **`opt_in_only` (deny):** `contact.reveal_email` and `outreach.send` on a `hire` goal, or to a person found by research. People are contacted only through a double-opt-in `card.reveal` introduction.
- Calibration profiles from Expected Parrot are synthetic and are never shown as real people.

### Tiers after the change
- **Tier 1 (must work live):** WP0, WP1, WP13, WP3 calibration, WP5 for hiring, WP2 people and company search, WP10 delegated research, WP7 (Alter introduction send and TraceRoot rerun comparison), WP4 thread, WP6 approvals and activity log, WP9 voice input and spoken match briefing.
- **Tier 2 (only if time allows):** The Room and the pitch test (WP8), skeptic and phone calls (rest of WP9), meeting need detection (WP11), daily watcher schedule, "while you were away" briefing.
- **Sponsor minimums stay:** Rowboat coordinates the delegated research agents (WP12). Timebox it to 45 minutes. If Rowboat can't orchestrate them in time, keep the Postgres + Rowboat memory mirror from #11 as a clearly labelled fallback.

### Dispatch after the change (one active package per owner)
| Owner | Now | Next |
|---|---|---|
| person-1 | WP1, plus `hire`, `opt_in_only` and share-card field stripping | WP7 for the introduction send and the TraceRoot rerun comparison |
| person-2 | WP5 for hiring: criteria → shortlist → confirmed rerun | WP10 delegated research, then the WP12 Rowboat timebox |
| person-3 | WP3 calibration endpoints | WP9 voice input and spoken match briefing |
| person-4 | WP13 double opt-in, including seeding user B | WP4 thread cards, then WP6 approvals and activity log, then WP15 |

---

## 0. How to use this document

1. One agent runs **WP0** alone. Everything else depends on it.
2. After WP0 merges, dispatch the work packages wave by wave (§10). One agent per package, each in its own git worktree and branch (`wp<N>-<slug>`).
3. Dispatch through **Codevisor** (one Codevisor agent per work package). This is also how the Codevisor sponsor requirement is met, see §5.
4. Brief for each agent: "Implement WP<N> from `docs/IMPLEMENTATION_PLAN.md`. Read §3, §4, §7 and §8 first. Stop when the acceptance checks pass; open a PR, do not merge."
5. Anything marked **VERIFY** was not confirmed from official docs. The implementing agent must read the linked doc before writing code against it, and update §5 if the fact was wrong.

### Sources and how they were reconciled

Two inputs define the product:

- **The Atlas final summary** (product scope, features, demo script).
- **The team notes vault** (`Dante-Bravi/Eleven-labs-Obsidian`): the hard constraint, the integration quality bar, the privacy architecture, and per-sponsor ideas and open questions.

Where they differ, this plan does the following:

| Topic | Atlas summary | Notes vault | Decision in this plan |
|---|---|---|---|
| Sponsors | 10 sponsors | **All 12 must be used meaningfully**; includes Codevisor | Codevisor added (§5). It was missing from the Atlas sponsor map. |
| Agent-to-agent matching | Seeded demo / roadmap | Core concept; MVP is two synthetic users and one double-opt-in match | Built as a small real slice with two synthetic users (WP13). It reuses the gateway, so it is cheap. Cut first if time runs out, and then shown as a labelled mock. |
| Sending without approval | "Act within rules" autonomy level | "Does not send outreach automatically"; user approves every outgoing message | Dial is kept. First contact with any recipient always needs approval, at every level. Introductions between users always need approval. Goals default to Prepare. |
| Model data flow | Need-to-know data | Show what the model provider receives; model processing, matching, identity reveal and sending are four separate approvals | Consent is recorded per kind (§6). Each model call logs which profile facts it was given (§8). |
| Simulation claims | Measured improvement | "Directional hypotheses, not evidence" | Every simulated score is labelled as simulated and shows panel size and spread. |
| Demo claims | — | Do not claim a boundary the prototype does not implement and test | §12 lists the claims the build supports. |

---

## 1. Scope

> Superseded where it differs by the [scope change](#scope-change-2026-11-22-1810-utc-two-user-double-opt-in-is-the-core-demo).

### Tier 1 — must work live in the demo
- Sixty-second onboarding: paste a website, resume or one-liner; first matches inside a minute.
- Standing goals with the pipeline Research → Find → Target → Test → Draft → Approve.
- Real company and contact data with a source link on every claim.
- Approval gate and autonomy dial (Watch / Prepare / Act within rules), enforced by the gateway.
- Pitch test (text) with a simulated panel, revision, and a measured before/after.
- The Room: pitch aloud, live interest graph per audience group, the sentence where each group was lost, a call from the toughest skeptic, a second run that is compared with the first.
- Activity log including denied actions.

### Tier 2 — build if time allows
- Watchers on Maritime that re-check daily, vet, draft, then notify.
- "While you were away" briefing, optionally spoken.
- Proactive phone call with approval by voice.
- Need detection from a live meeting, with recorded consent.
- Anti-spam rules beyond the Tier 1 set (caps, opt-out handling).

### Tier 3 — small slice or labelled mock
- Agent-to-agent matching between two synthetic users with double opt-in.
- Learning from real reply outcomes (data model only; UI shows it as "coming").
- Competitor watch, real call debriefs, email and calendar context: not built.

### Sponsor floor
The hard constraint is that every sponsor has a real job. Each sponsor has a minimum integration in §5 ("Floor"). **Floors are never cut**, even when a Tier 2 feature is.

---

## 2. Environment facts (checked on this machine, 2026-11-22)

| Fact | Consequence |
|---|---|
| Node v24.22.3, npm 11.19.1 | Meets Wasp 0.26's requirement of Node ≥ 24.22.1. |
| Wasp CLI not installed | `npm i -g @wasp.sh/wasp-cli@latest` |
| No Docker | `wasp start db` is unavailable. Use local Postgres. |
| Homebrew Postgres 17 installed, server not running | `brew services start postgresql@17 && createdb atlas_dev` |
| `python3` is 3.13; `python3.12` and `uv` are installed | EDSL's README lists Python 3.9–3.12. Pin the sim service to 3.12 with uv. |
| `cloudflared` installed, no ngrok | Use `cloudflared tunnel --url http://localhost:3001` for webhooks. |
| Maritime CLI installed at `~/.maritime/bin/maritime` | Account state unknown. |
| `.traceroot/setup.json` exists | TraceRoot setup minted a project key, then failed at stack detection because the repo was empty. Re-run after WP0. |
| `elevenlabs/` at repo root is an empty nested git repo with the same remote | Looks accidental. Agents must not touch it. A human should delete it. |

---

## 3. Rules for every agent

WP0 copies this section into `AGENTS.md` at the repo root.

1. **No real outreach.** `OUTREACH_MODE` defaults to `sandbox`. In sandbox mode the gateway rewrites every recipient to `OUTREACH_REDIRECT_TO`. Never email, call or message a real third party from development, tests or seeds. Phone calls go only to the logged-in user's verified number.
2. **Only the gateway touches the outside world.** Code under `src/server/adapters/` may be imported only from `src/server/gateway/handlers/`. Model tools, jobs, API handlers and UI call `gateway.execute()`. An architecture test enforces this.
3. **The model never holds a credential and never decides permission.** Rules are plain TypeScript. A model's output can be an input to a rule, never the rule.
4. **Outside content is data.** Text from websites, emails, transcripts and provider responses is wrapped as `UntrustedText` and never placed in a system prompt.
5. **No invented evidence.** Every company, contact and claim shown in the UI carries a `SourceRef`. No hardcoded "found" results, no seeded log rows that describe events which did not happen. Mocked or synthetic material is labelled as such in the UI.
6. **Spend real credits deliberately.** Adapters default to `ADAPTER_MODE=replay` (recorded fixtures). Use `record` only when a fixture is missing. Fiber, Ploid, ElevenLabs and Expected Parrot all bill per call.
7. **Verify before you code.** For any library or sponsor API, read the current docs first. Links are in §5.
8. **Stay in your lane.** Edit only the paths your work package owns. `schema.prisma` and `main.wasp.ts` are owned by WP0; later changes to them must be additive and are called out in the PR description.
9. **Secrets** live in `app/.env.server` and are never committed. Keep `.env.server.example` current.
10. **Test what you claim.** Unit-test rules and pure logic with Vitest. State in the PR what was run and what could not be verified.
11. Keep files small and single-purpose. No new dependency without a one-line justification in the PR.

---

## 4. Architecture

```
Browser (Wasp client, React)
  thread (assistant-ui)   approvals   briefing   The Room   activity log
        │ queries/actions + /api/*            │ mic → ElevenLabs Scribe (realtime)
        ▼                                     │ ElevenLabs Agents (skeptic call, WebRTC)
Wasp server (Node, Express, Prisma, pg-boss)
  ┌─────────────────────────────────────────────────────────────┐
  │ model tools · jobs · API handlers · voice webhooks           │
  │                 │  ActionRequest                             │
  │                 ▼                                            │
  │  ACTION GATEWAY  rules → decision → ActionLog → handler      │
  │                 │ allow                │ needs_approval      │
  │                 ▼                      ▼                     │
  │        adapters (only place     Approval row → user decides  │
  │        with network access)     (web, thread card, or voice) │
  └─────────────────────────────────────────────────────────────┘
     │        │        │          │           │          │
   Fiber    Ploid    Alter     ElevenLabs   Rowboat   TraceRoot
  (companies)(contacts)(sends,  (tokens,    (memory   (spans for
                      approvals) calls, TTS) notes)    every action)
     ▲                                   ▲
     │ goal-scoped token, narrow API     │ HTTP JSON
  watcher-box on Maritime             sim service (Python, EDSL)
  (persistent agent per goal)         Expected Parrot panels
```

### Repo layout

```
AGENTS.md
docs/                     this plan, DEMO_RUNBOOK.md
app/                      Wasp 0.26 app
  main.wasp.ts            imports one *.wasp.ts spec per feature
  schema.prisma
  src/shared/contracts/   zod schemas shared by client and server
  src/server/gateway/     engine.ts, rules/, handlers/, approvals.ts, log.ts
  src/server/adapters/    http.ts (record/replay), fiber.ts, ploid.ts, alter.ts,
                          elevenlabs.ts, maritime.ts, rowboat.ts, sim.ts, tracing.ts
  src/server/llm/         client.ts, models.ts, prompts/
  src/features/<name>/    <name>.wasp.ts, operations.ts, pages, components
sim/                      Python 3.12, FastAPI, EDSL (managed with uv)
watcher-box/              Node container that runs on Maritime
fixtures/                 recorded provider responses, keyed by request hash
```

Features: `onboarding goals matches thread approvals briefing pitch room voice meetings memory activity watchers connect`.

### Design decisions

- **Postgres is the system of record.** Sponsor services are adapters behind interfaces. If a vendor is down, the demo still runs on recorded fixtures, and the UI says so.
- **Approvals are database rows, not chat state.** A model tool that needs approval returns `{status: "pending_approval", approvalId}` and the thread renders an approval card bound to that row. The same row is decided from the inbox or by voice. Approval executes the stored payload, never a fresh model output. assistant-ui's stream-level `toolApproval` was considered and rejected because watcher and voice approvals happen outside any chat turn.
- **Autonomy level selects the credential, not a prompt.** The gateway uses one of two Alter agent identities: `atlas-prepare` (sends require human approval in Alter) or `atlas-act` (sends allowed, subject to local rules). Watch-level goals get neither. **VERIFY** that Alter rule conditions can be scoped per agent.
- **Two scoring tiers in The Room.** A live estimate per sentence (must return in about two seconds) and an authoritative Expected Parrot run at the end, which is the number reported as "measured". WP3 decides by measurement whether EDSL is fast enough for the live tier as well.
- **Watchers are quarantined.** A watcher runs on Maritime with a goal-scoped token and no provider keys. It can read and propose; it cannot send.
- **Claude access.** Server-side calls use the official `@anthropic-ai/sdk` (which TraceRoot instruments automatically). The thread alone uses the Vercel AI SDK v7 with `@ai-sdk/anthropic`, because that is the runtime assistant-ui documents. Model ids live in `src/server/llm/models.ts`: `REASONING_MODEL = "claude-opus-5-5"`, `FAST_MODEL` from env, defaulting to the same. Do not send `temperature`, `budget_tokens` or forced `tool_choice`; current Claude models reject them. Use structured outputs for JSON.

---

## 5. Sponsor integrations

Columns follow the quality bar in the notes: product used, user need, what passes through, how it is shown, access and fallback. "Floor" is the minimum that must ship.

| Sponsor | Product / API | User need | What passes through | Demo proof | Floor | Fallback |
|---|---|---|---|---|---|---|
| **Wasp** | Wasp 0.26, TypeScript spec (`main.wasp.ts`), auth, Prisma, pg-boss jobs, custom `api` routes | An app that persists goals and approvals | Everything | Sign in, refresh, goal and approvals persist | Whole app | None needed |
| **assistant-ui** | `@assistant-ui/react`, `@assistant-ui/ai-sdk`, toolkit tool UIs | One conversation from request to approved action | Thread messages, tool calls, approval cards | Thread shows matches, a draft and an approval card | Thread + approval card | None needed |
| **Fiber AI** | REST: `POST /v1/nlp-search/run`, `/v1/company-search`, `/v1/job-search` | Real matching companies and job posts | ICP filters in, company records out | Match cards with source links | Company search for one goal | Recorded fixtures |
| **Ploid** | REST: `POST /v1/search`, `/v1/enrich` | The right contact at each company | Company + role in, person out; work email only after approval | Contact on each match card | Contact lookup for top matches | Fiber `/v1/people-search` |
| **Expected Parrot** | EDSL (Python): `Agent`, `AgentList`, `Survey`, `ScenarioList` | Know the objections before spending a real chance | Pitch text and persona traits in, interest scores and objections out | Before/after score; The Room graph | Text pitch test with a measured delta | None: this is the scoring engine |
| **ElevenLabs** | Scribe realtime (`useScribe`), Agents (`useConversation`, Twilio outbound call), TTS | Pitch aloud; be called; hear a briefing | Mic audio, transcript, call audio | The Room; skeptic call; phone call | Live transcription + in-browser skeptic call | Phone call falls back to in-browser call |
| **Alter** | `@alter-ai/alter-sdk`: `Agent.proxyRequest`, `PendingApproval`, `App.decideApproval`; `@alter-ai/connect` | The agent can draft but cannot send without permission | Outgoing email request, approval decision | Draft sits pending; approve; send executes; denied attempt is recorded | Gmail send through Alter with an approval rule | Local approval only, clearly flagged in logs |
| **TraceRoot** | `@traceroot-ai/traceroot`: `TraceRoot.initialize`, `observe()` | See what the agent did and why | A span per gateway action and per model call | Open a trace from an activity-log row | Spans for gateway actions with a deep link | Local ActionLog only |
| **Maritime** | Agent boxes; custom container (`/health`, `/chat`, `/schedules`); `maritime-sdk` | Work continues while the user is away | Goal brief in, proposed matches out | Goal started hours earlier has new results; survives refresh | One watcher box per demo goal | Same container run locally, triggered by a Wasp cron job |
| **Rowboat** | Harbor Spaces server: HTTP `/v1/*` and per-org MCP endpoint | Not repeating context; reviewable memory | Memory notes as Markdown | Memory page; note appears in Rowboat | Notes mirrored to one Space and read back | Postgres-only memory behind the same interface |
| **Codevisor** | Codevisor agent teams | Build the product with coordinated coding agents | Work packages from this plan | Show the agent board and PRs in Q&A | Work packages dispatched and reviewed in Codevisor | — |
| **Claude** (not a sponsor) | Anthropic API | Reasoning | Need-to-know context only | — | — | — |

### What was verified, and what was not

Facts below come from each vendor's public docs on 2026-11-22.

**Wasp.** Version 0.26. Install with `npm i -g @wasp.sh/wasp-cli@latest`. The spec is TypeScript: `app({ name, wasp: { version: "^0.26" }, title, spec: [...] })` from `@wasp.sh/spec`, with `route`, `page`, `query`, `api("POST", "/path", handler, { entities })`, `apiNamespace("/x", { middlewareConfigFn })`, and `job(fn, { executor: "PgBoss", schedule: { cron, args }, entities })`. Code is referenced with `import { fn } from "./src/x" with { type: "ref" }`. Specs can be split into `src/**/<name>.wasp.ts`. The client calls custom routes through `api` from `wasp/client/api` (a ky instance that adds auth). Jobs run inside the server process. Custom routes need CORS enabled through namespace middleware. **VERIFY:** `action(...)` signature, auth config in the TS spec, and how to get a raw request body for webhook signature checks. Docs: `wasp.sh/llms-0.26.txt`.

**assistant-ui.** Install `@assistant-ui/react @assistant-ui/ai-sdk ai@^7 @ai-sdk/react@^4`. Client: `useChatRuntime({ transport: new AssistantChatTransport({ api }) })` inside `AssistantRuntimeProvider`. Tool UIs are registered with `defineToolkit({ name: { type: "backend", render } })` and `AuiConfig({ tools: Tools({ toolkit }) })`. Server: `streamText` then `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })`; add `stopWhen: stepCountIs(n)` for multi-step tool use. **VERIFY:** piping that web `Response` into an Express `res` inside a Wasp `api` handler; passing Wasp's auth header through the transport; the shadcn/Tailwind setup and `@/` alias inside a Wasp client. Docs: `assistant-ui.com/llms.txt`.

**Fiber AI.** Base `https://api.fiber.ai`. The API key goes in the JSON body as `apiKey`. `POST /v1/nlp-search/run` takes `query`, `pageSize`, `pageToken`; costs 2 credits plus 1 per result; 120 requests/min. `POST /v1/company-search` takes `searchParams` (`industriesV2`, `keywords`, `employeeCountV2`, `headquartersCountryCode`, funding fields); 1 credit per company. Also `/v1/people-search`, `/v1/job-search`, `GET /v1/get-org-credits`. **VERIFY:** result field names (name, description, HQ) in `api.fiber.ai/openapi.json`; the docs page was too long to read fully. Docs: `api.fiber.ai/ai-docs/index.md`.

**Ploid.** Auth by `Authorization: Bearer` or `x-api-key`. `POST /v1/search` (natural-language people search, `num_results`), `POST /v1/resolve`, `POST /v1/person`, `POST /v1/enrich` (work email; billed only when found), `GET /v1/account/credits`. Billing is in ACU credits. **VERIFY everything here:** this came from third-party listings, not Ploid's own docs. Confirm the base URL and request fields from `/v1/openapi.json`.

**Expected Parrot.** `pip install edsl`. `Agent(traits={...}, instruction=..., name=...)`, `AgentList`, `QuestionLinearScale`, `QuestionFreeText`, `QuestionMultipleChoice`, `Survey`, `Scenario`/`ScenarioList` with `{{ scenario.x }}`, `survey.by(scenarios).by(agents).by(model).run(...)`, `results.select("answer.x").to_list()`. Run options seen in the docs: `disable_remote_inference`, `disable_remote_cache`, `progress_bar=False`. **VERIFY:** the API key env var name, the model catalog names, and per-run latency.

**ElevenLabs.** Scribe: server creates a single-use token with `elevenlabs.tokens.singleUse.create("realtime_scribe")` (expires in 15 minutes); browser uses `useScribe` from `@elevenlabs/react` with `onPartialTranscript` and `onCommittedTranscript`, then `scribe.connect({ token, microphone })`. Agents: `ConversationProvider` + `useConversation`, `startSession({ conversationToken | signedUrl | agentId })`; token from `GET /v1/convai/conversation/token?agent_id=` with `xi-api-key`. Phone: `POST /v1/convai/twilio/outbound-call` with `agent_id`, `agent_phone_number_id`, `to_number`, `conversation_initiation_client_data`. Post-call webhooks deliver transcripts. **VERIFY:** the realtime model id (docs show both `scribe_v2_realtime` and `scribe_v3_live`), the VAD commit option on the React hook, how dynamic variables are passed from the React SDK, and that prompt overrides must be enabled in the agent's security settings.

**Alter.** `npm install @alter-ai/alter-sdk` (Node 20+). `new App({ apiKey: ALTER_API_KEY })`, `new Agent({ apiKey: AGENT_API_KEY })`. Provider calls run through Alter's proxy with a grant, so the credential never reaches our process. Policy is default-deny. Approval rules are set in the dashboard or CLI (`alter policy rules create --type require_approval`), not in code. A gated `agent.proxyRequest(...)` returns `PendingApproval` with `approvalId` and `approvalUrl`; resolve with `agent.awaitApproval(id, { timeoutMs })` or `app.decideApproval(id, { actorEmail, summaryVersion })`. Approval window defaults to 10 minutes, up to 24 hours. Webhooks fire when a request is held, decided, expired and executed. Errors: `ApprovalDeniedError`, `ApprovalExpiredError`, `ApprovalTimeoutError`, `ApprovalExecutionFailedError`. **VERIFY:** `proxyRequest` arguments; whether a managed secret can be injected into a JSON body (Fiber needs that; if not, Fiber and Ploid keys stay in `.env.server` and only sends go through Alter); how to read the audit trail by API. Docs: `docs.alterauth.com`.

**TraceRoot.** `npm install @traceroot-ai/traceroot`. `TraceRoot.initialize({ instrumentModules: { anthropic: anthropicSDK } })`, `observe({ name, type }, fn)`, `await TraceRoot.shutdown()`. Env: `TRACEROOT_API_KEY`, `TRACEROOT_HOST_URL`. Setup: `npx -y traceroot-cli@latest setup` from the app root (browser sign-in, so a human runs it). **VERIFY:** how to attach attributes to a span, how to build a deep link to a trace, and whether Vercel AI SDK calls are captured.

**Maritime.** REST base `https://api.maritime.sh`, bearer `mk_` key. Agent boxes keep `/data`, sleep when idle and wake in about a second. A custom container must listen on `0.0.0.0:$PORT`, answer `GET /health` and `POST /chat` (body has `message` and `source`; reply within 30 seconds), and keep state only under `/data`. Timers do not fire in a sleeping box, so schedules run on the platform; a container can expose them at `GET /schedules`. SDK: `maritime-sdk` with `agents.provision({ externalId, name, template })`, idempotent on `externalId`. Seven-day trial with $20 of usage; a card is required. **VERIFY:** deploy command for a custom container, `/schedules` response format, how secrets are set. Docs: `maritime.sh/llms.txt`, `api.maritime.sh/openapi.json`.

**Rowboat.** Today Rowboat is two things: Harbor, an open-source "Spaces" server with an HTTP API under `/v1/*` and a per-org MCP endpoint at `https://<org>/mcp`; and a desktop app that keeps a local Markdown knowledge graph. There is no documented API for the desktop knowledge graph. **VERIFY:** the Harbor routes for posting and reading files or messages (`apps/harbor/CONTRACT.md` in `rowboatlabs/rowboat`), and auth for a server-side client.

### Answers to the open questions in the notes

- *Is Codevisor an end-user product or a build tool?* A build tool. Atlas uses it to run this plan. Confirm with organizers whether that satisfies the category rule.
- *Can Rowboat share memory with a separate app?* Only through Spaces (Harbor). Atlas writes memory notes into a Space, where the Rowboat coworker can index them, and reads them back.
- *Can Alter scope permissions per agent, task, tool or resource?* Per agent, provider, grant and app, with parameter-level conditions where the provider's operations are catalogued.
- *What scheduling and persistence does Maritime offer?* Persistent `/data`, platform-run cron and webhook triggers.
- *Is "living on the computer" a local app?* No. Atlas is a web app with background agents on Maritime.
- *Which first user?* A founder (the robotics startup in the demo). Job seekers and sourcing teams use the same engine through a different goal direction.

---

## 6. Data model

Defined once in WP0. All tables carry `id`, `createdAt`, `updatedAt`.

| Entity | Key fields |
|---|---|
| `User` | Wasp auth; `phone`, `phoneVerifiedAt` |
| `Profile` | `userId`, `sourceUrl`, `sourceKind` (website, resume, oneliner), `summary` |
| `ProfileFact` | `profileId`, `key`, `value`, `sensitivity` (public, shareable, private), `allowedPurposes[]` |
| `Consent` | `userId`, `kind` (model_processing, meeting_listening, phone_calls, matching, identity_reveal), `scope`, `grantedAt`, `revokedAt` |
| `Goal` | `userId`, `direction` (SELL, BUY, WORK_FOR), `kind` (customers, investors, manufacturer, supplier, intern, employer), `statement`, `icp` (json), `autonomy` (WATCH, PREPARE, ACT), `rules` (json: dailyCap, quietHours), `status`, `watcherTokenHash` |
| `Company` | `domain` (unique), `name`, `description`, `data` (json) |
| `Match` | `goalId`, `companyId`, `score`, `rationale`, `status` (NEW, VETTED, APPROVED, REJECTED, CONTACTED), `rejectReason` |
| `SourceRef` | `matchId`, `claim`, `provider`, `url`, `fetchedAt` |
| `Contact` | `matchId`, `fullName`, `title`, `linkedinUrl`, `email` (null until revealed), `provider` |
| `Draft` | `matchId`, `contactId`, `channel`, `subject`, `body`, `version`, `personalizationRefs[]` (SourceRef ids), `usedFactIds[]` |
| `Approval` | `userId`, `goalId`, `actionType`, `payload` (json), `payloadHash`, `status` (PENDING, APPROVED, DENIED, EXPIRED, EXECUTED, FAILED), `decidedVia` (web, thread, voice), `alterApprovalId`, `decidedAt` |
| `OutreachMessage` | `draftId`, `approvalId`, `recipient`, `redirectedTo`, `providerMessageId`, `sentAt` |
| `OptOut` | `emailOrDomain`, `reason` |
| `ActionLog` | `ts`, `userId`, `goalId`, `actor`, `origin`, `actionType`, `decision` (ALLOW, DENY, NEEDS_APPROVAL), `ruleId`, `reason`, `inputSummary`, `factIdsSent[]`, `traceId`, `adapterMode` |
| `Panel` | `goalId`, `personas` (json) |
| `PitchRun` | `goalId`, `panelId`, `mode` (TEXT, ROOM), `parentRunId`, `transcript`, `summary` (json), `engine` |
| `SegmentScore` | `runId`, `index`, `text`, `personaId`, `interest`, `objection`, `tier` (LIVE, MEASURED) |
| `MemoryItem` | `userId`, `goalId`, `kind` (preference, objection, outcome, fact), `text`, `source`, `externalRef` |
| `WatcherRun` | `goalId`, `runtime` (local, maritime), `startedAt`, `finishedAt`, `stats` (json) |
| `NeedProposal` | `userId`, `transcriptExcerpt`, `proposedGoal` (json), `status` |
| `ShareCard` | `userId`, `goalId`, `fields` (json), `purpose`, `expiresAt`, `status` |
| `CardMatch` | `cardAId`, `cardBId`, `rationale`, `aAccepted`, `bAccepted`, `revealedAt` |

---

## 7. Shared contracts

These live in `app/src/shared/contracts/` as zod schemas. WP0 writes them; other packages import them and must not redefine them.

```ts
// gateway.ts
type ActionType =
  | "company.search" | "jobs.search" | "contact.search" | "contact.reveal_email"
  | "web.read" | "match.submit" | "draft.create"
  | "outreach.send" | "call.place"
  | "memory.read" | "memory.write" | "memory.delete"
  | "meeting.listen" | "card.publish" | "card.reveal";

interface ActionRequest {
  actionType: ActionType;
  userId: string;
  goalId?: string;
  actor: { kind: "user" | "agent" | "schedule"; id: string };
  origin: "thread" | "watcher" | "voice" | "meeting" | "ui" | "system";
  tainted: boolean;        // requester's context contained UntrustedText
  payload: unknown;        // validated per actionType
}

type Decision =
  | { outcome: "allow"; ruleId: string }
  | { outcome: "deny"; ruleId: string; reason: string }
  | { outcome: "needs_approval"; ruleId: string; approvalId: string };

interface GatewayResult<T = unknown> { decision: Decision; logId: string; data?: T }

// discovery.ts
interface SourceRef { provider: "fiber" | "ploid" | "web"; url?: string; fetchedAt: string; claim: string }
interface CompanyRecord { domain: string; name: string; description?: string; industry?: string;
  headcount?: { min?: number; max?: number }; hq?: string; linkedinUrl?: string; sources: SourceRef[] }
interface ContactRecord { fullName: string; title: string; companyDomain: string;
  linkedinUrl?: string; email?: string; sources: SourceRef[] }
interface UntrustedText { kind: "untrusted"; text: string; source: SourceRef; flagged: boolean }

// sim.ts  (HTTP JSON between app and sim service)
interface Persona { id: string; segment: string; label: string; companyDomain: string;
  role: string; traits: Record<string, string>; sources: SourceRef[] }
interface ScoreRequest { personas: Persona[]; segments: { index: number; text: string }[];
  tier: "live" | "measured"; iterations?: number }
interface ScoreResponse { engine: "edsl" | "direct"; latencyMs: number;
  scores: { personaId: string; segmentIndex: number; interest: number; objection?: string }[];
  summary?: { meanInterest: number; spread: number; meetingRate: number;
    topObjections: { segment: string; text: string }[] } }
```

Sim service endpoints: `GET /health`, `POST /score` (`ScoreRequest` → `ScoreResponse`). Interest is an integer 1–7. Personas are role archetypes at real companies ("VP Operations at a 300-person 3PL"), never a simulation of a named person.

Watcher API (bearer token scoped to one goal, hash stored on `Goal`):
`GET /api/watch/:goalId/brief`, `POST /api/watch/:goalId/tool` (`{ tool, args }`, limited to `company.search`, `jobs.search`, `contact.search`, `web.read`, `match.submit`), `POST /api/watch/:goalId/run` (start and finish reports).

---

## 8. Gateway rules

`gateway.execute(req)` validates the payload, evaluates rules in order, writes an `ActionLog` row for every outcome, opens a TraceRoot span, then runs the handler when allowed. Unknown action types are denied. Each rule is one pure function in `src/server/gateway/rules/` with its own unit test.

| Id | Rule | Outcome |
|---|---|---|
| `schema` | Payload fails validation | deny |
| `ownership` | Goal missing, inactive or not owned by `userId` | deny |
| `consent` | `meeting.listen`, `call.place`, `card.publish`, `card.reveal`, or any model call using profile facts lacks the matching active `Consent` | deny |
| `call_target` | `call.place` to a number other than the user's verified phone | deny |
| `individuals` | `contact.search` on a goal whose kind seeks private individuals (intern) | deny, with a pointer to opt-in channels (`jobs.search`, share cards) |
| `taint` | `tainted` request for anything except read actions, `match.submit`, `draft.create` | deny |
| `need_to_know` | `draft.create` or a model call is given a `ProfileFact` whose `allowedPurposes` excludes this purpose | deny |
| `private_leak` | Outgoing text contains the value of a `private` fact (normalised match, including number formats) | deny |
| `opt_out` | Recipient or domain is in `OptOut` | deny |
| `personalization` | `outreach.send` whose draft has no `personalizationRefs`, or whose refs do not belong to that match | deny |
| `daily_cap` | Sends for this goal today ≥ `rules.dailyCap` (default 10) | deny |
| `autonomy_watch` | `outreach.send` or `contact.reveal_email` on a WATCH goal | deny |
| `first_contact` | `outreach.send` to a recipient with no prior approved send | needs_approval |
| `tainted_draft` | `outreach.send` whose draft cites web-sourced evidence | needs_approval |
| `autonomy_prepare` | `outreach.send` on a PREPARE goal | needs_approval |
| `introductions` | `card.reveal` | needs_approval from each side separately |
| `sandbox` | `OUTREACH_MODE=sandbox` | allow, with recipient rewritten and logged |
| `default` | Read actions and anything that passed the rules above | allow |

A model-based check may flag possible private details in a draft. Its only effect is to add a warning and force `needs_approval`. It can never turn a deny into an allow.

`ActionLog.factIdsSent` records which profile facts each model call received, so the UI can show exactly what left the workspace.

---

## 9. Work packages

Format: goal, dependencies, owned paths, tasks, acceptance.

### WP0 — Foundation (one agent, blocks everything)
**Owns:** repo root, `app/` scaffold, `schema.prisma`, `main.wasp.ts`, `src/shared/contracts/`, `src/server/adapters/http.ts`, `src/server/llm/`, `AGENTS.md`.
1. Install the Wasp CLI, create the app in `app/`, set `wasp: { version: "^0.26" }`. Use local Postgres via `DATABASE_URL` in `.env.server`.
2. Username-and-password auth; login and signup pages.
3. Full Prisma schema from §6; first migration.
4. One empty `<feature>.wasp.ts` spec and placeholder page per feature in §4, all imported by `main.wasp.ts`; app shell with navigation.
5. Contracts from §7.
6. `adapters/http.ts`: a fetch wrapper with `ADAPTER_MODE=live|record|replay`. Record writes to `fixtures/<provider>/<hash>.json` with secrets stripped; replay reads it and fails loudly on a miss.
7. `llm/client.ts` and `llm/models.ts` per §4; one structured-output helper.
8. Tailwind; Vitest; an architecture test that fails if anything outside `gateway/handlers/` imports `adapters/`.
9. `AGENTS.md` from §3 plus exact dev commands; `.env.server.example` from §11.
10. Seed script: demo user, the robotics startup profile with facts (including a private budget ceiling), no matches.

**Acceptance:** `wasp start` serves the app; signup, login and every nav route work; `wasp db migrate-dev` is clean; tests pass; a replay miss throws a clear error.

### WP1 — Gateway, action log, approvals
**Depends:** WP0. **Owns:** `src/server/gateway/`, `src/features/approvals/operations.ts`, `src/features/activity/operations.ts`.
1. `engine.ts` implementing §8 with a handler registry, so other packages register handlers without editing the engine.
2. All rules in §8, each with unit tests for allow and deny cases.
3. Approval lifecycle: create with `payloadHash`; `decideApproval(id, decision, via)` requires the owning user; execution re-checks the hash and re-runs the deny rules.
4. Queries: pending approvals, approval by id, activity log with filters.
5. Stub handlers that return fixtures so WP4 and WP6 can build against real decisions.

**Acceptance:** tests cover every rule id; a WATCH goal cannot send; a private fact in a draft is denied and logged; a tampered payload after approval is refused; every call writes exactly one `ActionLog` row.

### WP2 — Discovery adapters
**Depends:** WP0. **Owns:** `adapters/fiber.ts`, `adapters/ploid.ts`, `adapters/web.ts`, matching `gateway/handlers/`, `fixtures/fiber|ploid|web/`.
1. Read the OpenAPI specs first (§5) and correct this plan where it is wrong.
2. Fiber: ICP → `nlp-search/run` or `company-search` → `CompanyRecord[]` with a `SourceRef` per populated field. `jobs.search` for WORK_FOR goals. Check credits before chargeable calls.
3. Ploid: `contact.search(company, roles)` returns up to three candidates without email. `contact.reveal_email` is a separate action, called only after approval.
4. `web.read`: server-side fetch with private-IP blocking, size and time limits, text extraction, returned as `UntrustedText`. Set `flagged` when instruction-like patterns appear ("ignore previous", "you must now", addressed-to-AI phrasing).
5. Record fixtures for the demo ICP (robotics customers, contract manufacturers).

**Acceptance:** in replay mode each handler returns typed records with sources; a flagged page logs a `web.read` row with `reason: untrusted_instruction_detected`; email is absent until `contact.reveal_email` succeeds.

### WP3 — Simulation service
**Depends:** WP0 (contracts only). **Owns:** `sim/`.
1. `uv` project pinned to Python 3.12; FastAPI; `GET /health`, `POST /score`.
2. Build an EDSL `AgentList` from `Persona[]`. Survey per segment: `interest` (linear scale 1–7, "how interested are you in continuing?") with the pitch so far as scenario context. For `tier: "measured"` add `objection` (free text, one sentence) and a final `take_meeting` (yes/no), and run `iterations` (default 3) to report spread.
3. **Latency spike:** time `tier: "live"` for 8 personas and one sentence, 20 trials, with EDSL local inference. Write the p50 and p95 into `sim/README.md`. If p50 > 2.5 s, add a `direct` engine for the live tier (one structured-output Claude call that returns all persona scores) and keep EDSL for `measured`. The response always reports which engine ran.
4. Tests against a stubbed model.

**Acceptance:** `uv run pytest` passes; `POST /score` returns valid `ScoreResponse` for both tiers; the README states the measured latency and the engine decision.

### WP4 — Thread and chat endpoint
**Depends:** WP0, WP1 (stubs suffice). **Owns:** `src/features/thread/`.
1. `POST /api/chat` as a Wasp `api` route using AI SDK v7 `streamText`, authenticated, CORS via namespace middleware.
2. Tools: `propose_goal`, `list_matches`, `explain_match`, `draft_outreach`, `request_send`, `test_pitch`, `get_briefing`, `remember`, `forget`. Every `execute` builds an `ActionRequest` and calls the gateway. No tool calls an adapter.
3. assistant-ui thread with tool UIs: match list, draft card, approval card (bound to the `Approval` row, Approve and Deny call `decideApproval`), denied-action notice.
4. System prompt: Atlas proposes; it cannot approve; denied means stop and explain.

**Acceptance:** a typed request produces a goal proposal; `request_send` on a PREPARE goal renders a pending card; approving it from the thread or from the inbox updates the same card; a denied action is shown as denied with its rule id.

### WP5 — Goal engine and onboarding
**Depends:** WP1, WP2. **Owns:** `src/features/onboarding/`, `goals/`, `matches/`.
1. Onboarding: paste URL, resume text or one-liner → `web.read` where relevant → profile summary and `ProfileFact`s with proposed sensitivity → user confirms facts and grants `model_processing` consent.
2. Goal creation from "Who do you need?": infer direction, kind and ICP; user edits; choose autonomy (default PREPARE).
3. Pipeline as pg-boss jobs with visible stage status: Research (ICP) → Find (`company.search`) → vet and rank with a rationale that cites sources → Target (`contact.search`) → Draft (`draft.create`, need-to-know facts only, at least one personalization ref).
4. Match review: approve or reject with a reason; rejections and approvals become `MemoryItem` preferences that the next ranking pass reads.
5. Intern goals skip Target and instead draft a job post and list opt-in channels.

**Acceptance:** from a fresh account, pasting the demo site yields ranked matches with sources within 60 seconds in replay mode; a quote-request draft contains specs and not the budget ceiling; rejecting two matches for the same reason changes the next ranking.

### WP6 — Approvals inbox, briefing, activity log, goal settings
**Depends:** WP1. **Owns:** `src/features/approvals/` (UI), `briefing/`, `activity/` (UI), goal settings components.
1. Inbox: pending approvals with the exact payload, sources, recipient (and redirect notice in sandbox mode), Approve, Deny, Edit-then-approve (edit creates a new draft version and a new hash).
2. Briefing home: "While you were away" — found, did, waiting for you — computed from `ActionLog`, `Match` and `Approval` since last visit.
3. Activity log: every action with decision, rule and reason; filter to denied; link to the TraceRoot trace when `traceId` exists; a badge when data came from replay.
4. Autonomy dial and rules editor per goal; consent page listing each consent with revoke.

**Acceptance:** all four screens work on seeded data produced by real gateway calls; changing the dial to WATCH makes a subsequent send attempt show as denied in the log.

### WP7 — Alter and TraceRoot
**Depends:** WP1. **Owns:** `adapters/alter.ts`, `adapters/tracing.ts`, `src/features/connect/`, `gateway/handlers/outreach.ts`.
1. Read `docs.alterauth.com` (quickstart, approvals guide, TypeScript SDK reference). Settle the **VERIFY** items in §5.
2. Connect flow: user links Google through `@alter-ai/connect`; store the grant id.
3. `outreach.send` handler: build the Gmail send request and call `agent.proxyRequest` with the identity for the goal's autonomy level. On `PendingApproval`, store `alterApprovalId` on our `Approval`. When the user decides in Atlas, call `app.decideApproval` with their email, then `awaitApproval` and record the result. Handle the four approval errors.
4. Webhook route for Alter events to keep `Approval.status` in sync.
5. Document the dashboard setup (providers, two agents, the approval rule) in `docs/ALTER_SETUP.md`.
6. TraceRoot: initialise at server start with Anthropic instrumentation; wrap `gateway.execute` in `observe()` with action type, decision and rule id; store the trace id on `ActionLog`; flush on shutdown.
7. `EXECUTION_BACKEND=alter|local`. `local` is for development only and stamps every log row.

**Acceptance:** in sandbox mode an approved draft is delivered to the redirect inbox through Alter; a send attempted with the Watch identity fails at Alter as well as locally; each activity row opens a trace.

### WP8 — Pitch test and The Room
**Depends:** WP3, WP5. **Owns:** `src/features/pitch/`, `room/`, `adapters/sim.ts`, `adapters/elevenlabs.ts` (token route only).
1. Panel builder: from a goal's top matches, generate 8–12 personas in 3–4 segments, each tied to a real company's sourced attributes. Store as `Panel`.
2. Text pitch test: split into sentences → `measured` score → show per-segment curve, top objections, meeting rate with panel size and spread → Claude proposes a revision that addresses the top objections → re-score → show the delta. Label everything as simulated.
3. The Room: server route issues a Scribe token; `useScribe` streams the mic; each committed sentence is posted to `POST /api/room/:runId/segments`, which calls `tier: "live"` and returns scores; the graph updates.
4. Graph: hand-written SVG, one line per segment over sentence index, a marker where a segment's interest drops most, the sentence text on hover. No chart dependency.
5. On stop: run `measured` over the full transcript, store it, flag the sentence that lost each segment, and identify the toughest persona and their objection.
6. Second run links `parentRunId`; comparison view shows both curves and the measured delta.

**Acceptance:** speaking a 60-second pitch draws the graph with under about three seconds of lag per sentence; the end-of-run summary names a sentence and an objection per segment; a second run shows a numeric comparison; the UI states which engine produced each number.

### WP9 — Voice: skeptic call, phone call, spoken briefing
**Depends:** WP8 for 1–2; WP1 and WP6 for 3–5. **Owns:** `src/features/voice/`, rest of `adapters/elevenlabs.ts`.
1. Create a "Skeptic" agent in ElevenLabs with dynamic variables for persona, company type, objection, weak sentence and pitch summary. Document the configuration in `docs/ELEVENLABS_SETUP.md`.
2. In-browser call after a Room run: server issues a conversation token; client starts the session with the variables; transcript is saved to the run.
3. "Briefing" agent with one server tool, `decide_approval(approvalId, decision)`, which calls our webhook. The webhook checks a shared secret and a one-time call-session token, confirms the approval belongs to the called user, then calls `decideApproval(..., via: "voice")`. The agent must read back the recipient and subject before asking.
4. Proactive call: when a goal has approvals ready and the user has `phone_calls` consent, `call.place` goes through the gateway to `POST /v1/convai/twilio/outbound-call`. Rate-limit to one call per goal per day.
5. Spoken briefing: TTS of the briefing text, played on the home screen.
6. Post-call webhook stores the transcript; verify its signature.

**Acceptance:** the skeptic call opens with the real objection from the last run; a phone call to the verified number can approve one pending item and the log shows `decidedVia: voice`; a call to any other number is denied. If no Twilio number is available, steps 3–4 run in-browser and the README says so.

### WP10 — Watchers on Maritime
**Depends:** WP2, WP5. **Owns:** `watcher-box/`, `src/features/watchers/`, `adapters/maritime.ts`.
1. Watcher API from §7, with goal-scoped tokens.
2. `watcher-box`: a small Node server meeting Maritime's container contract. On `POST /chat` with `message: "tick"` it replies at once and then runs a bounded tool loop (Anthropic SDK): load `/data/state.json` (seen domains, notes), fetch the brief, search, read candidate sites, submit new vetted matches, save state. It holds an Anthropic key and its goal token only.
3. `GET /schedules` for a daily tick. Local runtime: a Wasp cron job posts the same tick to a locally running box. `WATCHER_RUNTIME=local|maritime`.
4. Provision one box per goal with `externalId = goal.id`; delete it when the goal ends; revoke the token.
5. New matches trigger the Draft stage and a notification; `WatcherRun` records each tick.

**Acceptance:** a tick on a goal with an existing match set adds only unseen companies; killing and restarting the box keeps its seen set; the watcher token cannot call `outreach.send`; the briefing shows results from a tick that ran while the browser was closed.

### WP11 — Need detection from meetings
**Depends:** WP5, WP8 (Scribe token route). **Owns:** `src/features/meetings/`.
1. Start requires `meeting_listening` consent, recorded with a scope (this meeting) and a visible on-screen indicator.
2. Scribe transcribes the room; every few committed segments a classifier call returns either nothing or a structured need. Transcript text is `UntrustedText`.
3. A detected need becomes a `NeedProposal` card. Only the user's approval creates a goal, at the level they pick.
4. Keep the excerpt that triggered the proposal; discard the rest of the transcript when the meeting ends.

**Acceptance:** saying "we need a contract manufacturer for the gripper housing" yields a manufacturer goal proposal; nothing is created without approval; starting without consent is denied and logged.

### WP12 — Memory and Rowboat
**Depends:** WP5. **Owns:** `src/features/memory/`, `adapters/rowboat.ts`.
1. `MemoryStore` interface: `write`, `search`, `list`, `delete`. Postgres implementation first.
2. Read Harbor's contract; implement `RowboatMemory`, which mirrors each `MemoryItem` as a Markdown note in one Space and stores the returned reference. Reads for prompt context come back through the same interface.
3. Memory page: everything Atlas remembers, grouped by kind, each with its source, each deletable. Delete removes it from both stores.
4. Store only goal-relevant items: preferences from approvals and rejections, objections heard in runs, outcomes.

**Acceptance:** rejecting a match creates a preference visible on the memory page and in the Rowboat Space; deleting it removes both; the next ranking prompt no longer contains it.

### WP13 — Agent-to-agent share cards (two synthetic users)
**Depends:** WP1, WP6. **Owns:** `src/features/connect/cards/`.
1. From a goal, the model drafts a `ShareCard` (sector, stage, region, need or offer, short description) and lists the fact each field came from. The gateway removes fields not allowed for the matching purpose. The user edits and approves the exact card, with an expiry.
2. A matcher compares active cards and creates a `CardMatch` with a rationale. Each side sees an anonymous summary.
3. Each side accepts separately, then chooses which identity fields to reveal. Only then is an introduction drafted, and it still needs approval to send.
4. Seed a second synthetic user with a complementary card. Label both as synthetic in the UI.
5. Audit view: private input → proposed card → approved card → anonymous match → double opt-in → introduction.

**Acceptance:** neither user can see the other's identity before both accept; revoking a card removes it from matching; the audit view shows all six steps from real log rows.

### WP14 — Guardrail verification
**Depends:** WP5, WP7, WP10. **Owns:** `app/tests/redteam/`.
Write end-to-end tests, in replay mode, for: a web page with an embedded instruction (flagged, content not acted on); a tainted request trying to send (denied); a draft leaking the budget ceiling in three number formats (denied); the 11th send of the day (denied); a recipient on the opt-out list (denied); a draft with no personalization (denied); a watcher token calling a forbidden tool (denied); voice approval for another user's item (denied).

**Acceptance:** all pass in CI; each leaves the expected `ActionLog` row.

### WP15 — Demo hardening
**Depends:** everything in scope. **Owns:** `docs/DEMO_RUNBOOK.md`, `fixtures/`, seed updates.
1. Start the demo goals for real at the beginning of build time so the "four hours ago" line is true. Record fixtures as a network fallback.
2. Choose the weak pitch line empirically: score candidates through `measured` five times each and keep one that drops reliably. Do not special-case it anywhere in code.
3. Runbook: timings, who speaks, which tabs are open, what to do if the network, mic or phone fails, and the Q&A answers.
4. One dry run end to end, timed.

**Acceptance:** two consecutive timed runs under three minutes; every fallback exercised once.

---

## 10. Dispatch order

> Superseded where it differs by the [scope change](#scope-change-2026-11-22-1810-utc-two-user-double-opt-in-is-the-core-demo).

| Wave | Packages (parallel) | Notes |
|---|---|---|
| 0 | WP0 | Single agent. Review before continuing. |
| 1 | WP1, WP2, WP3, WP4 | WP4 builds against WP1's stubs. |
| 2 | WP5, WP6, WP7 | |
| 3 | WP8, WP10, WP12 | |
| 4 | WP9, WP11, WP13 | |
| 5 | WP14, WP15 | |

If time runs short, cut in this order, keeping each sponsor's floor: WP13 → phone call in WP9 (keep the in-browser call) → WP11 → Maritime hosting in WP10 (keep the local runtime, and deploy one box) → spoken briefing.

---

## 11. Accounts and environment

A human must create these before the wave that needs them.

| Needed by | Item |
|---|---|
| WP0 | Anthropic API key; local Postgres running |
| WP2 | Fiber API key with credits; Ploid API key with credits |
| WP3 | Expected Parrot account or key |
| WP7 | Alter account, app, Google provider, two agent keys, approval rule; re-run TraceRoot setup |
| WP8, WP9 | ElevenLabs API key; Skeptic and Briefing agents; a Twilio number imported into ElevenLabs for phone calls |
| WP10 | Maritime account (card required for the trial) |
| WP12 | A Rowboat org or a local Harbor server |
| Webhooks | A public URL: `cloudflared tunnel --url http://localhost:3001` |

`.env.server.example` keys: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `FAST_MODEL`, `ADAPTER_MODE`, `OUTREACH_MODE`, `OUTREACH_REDIRECT_TO`, `EXECUTION_BACKEND`, `PUBLIC_BASE_URL`, `FIBER_API_KEY`, `PLOID_API_KEY`, `SIM_URL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_SKEPTIC_AGENT_ID`, `ELEVENLABS_BRIEFING_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `ELEVENLABS_WEBHOOK_SECRET`, `ALTER_API_KEY`, `ALTER_AGENT_KEY_PREPARE`, `ALTER_AGENT_KEY_ACT`, `ALTER_WEBHOOK_SECRET`, `TRACEROOT_API_KEY`, `TRACEROOT_HOST_URL`, `MARITIME_API_KEY`, `WATCHER_RUNTIME`, `ROWBOAT_BASE_URL`, `ROWBOAT_TOKEN`.

---

## 12. Demo mapping and supported claims

> Superseded where it differs by the [scope change](#scope-change-2026-11-22-1810-utc-two-user-double-opt-in-is-the-core-demo).

| Time | Beat | Built by |
|---|---|---|
| 0:15–0:45 | Briefing: goal started hours ago, vetted matches, drafts waiting | WP5, WP6, WP10 |
| 0:45–1:45 | The Room: weak line drops a segment, skeptic calls, second run is higher | WP3, WP8, WP9 |
| 1:45–2:15 | Meeting: Atlas hears the manufacturer need and proposes a goal | WP11 |
| 2:15–2:45 | Phone call; approve by voice; log shows the action and a denied attempt | WP9, WP7, WP6 |

Claims the build supports:
- Matches are real companies from structured data, each with a source.
- No send happens without passing coded rules; the model cannot change them.
- Every action and every denial is logged and traceable.
- The panel is simulated and its scores are directional. The before/after number is measured on the same panel.

Claims to avoid: that simulated scores predict real replies; that Atlas protects an inbox or history it does not read; that agent-to-agent matching works beyond two synthetic users.

The denied attempt shown on stage must be a real one: the flagged supplier page from the live pipeline, or a WP14 test run before the demo. Never a seeded row.

---

## 13. Open decisions and risks

1. **Codevisor's role.** This plan treats it as the build tool. Ask the organizers whether product use is expected.
2. **Agent-to-agent scope.** Built as a small slice here. If the team wants it as the centrepiece, as the notes first proposed, WP13 moves to wave 2 and The Room becomes Tier 2.
3. **Live scoring speed.** Settled by the WP3 measurement. The fallback keeps Expected Parrot as the measured score.
4. **Alter and body-injected keys.** If Alter cannot inject Fiber's key into a JSON body, Alter governs sends and approvals only.
5. **Rowboat.** The weakest-documented integration. Timebox WP12 step 2; the Postgres store keeps the feature working.
6. **Ploid facts are second-hand.** WP2 must read the OpenAPI spec first.
7. **Phone calls need a Twilio number.** Without one, the call happens in the browser.
8. **Credits.** Fiber, Ploid, ElevenLabs, Expected Parrot and Maritime all bill. Replay mode is the default for that reason.
9. **Wasp jobs share the server process.** Keep heavy work in the sim service and the watcher box.

---

## Sources

- Team notes: `github.com/Dante-Bravi/Eleven-labs-Obsidian` (Sponsor Integration Map, AI Opportunity Connector, Agent-to-Agent Privacy Architecture, per-sponsor notes)
- Wasp: https://wasp.sh/llms-0.26.txt · https://wasp.sh/docs/quick-start.md · https://wasp.sh/docs/features/spec.md · https://wasp.sh/docs/features/apis.md · https://wasp.sh/docs/features/jobs.md
- assistant-ui: https://www.assistant-ui.com/llms.txt · https://www.assistant-ui.com/docs/runtimes/ai-sdk/v7.md · https://www.assistant-ui.com/docs/tools/tool-ui.md
- ElevenLabs: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming.md · https://elevenlabs.io/docs/eleven-agents/libraries/react.md · https://elevenlabs.io/docs/api-reference/twilio/outbound-call.md · https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
- Fiber AI: https://api.fiber.ai/ai-docs/index.md · https://api.fiber.ai/openapi.json
- Ploid: https://docs.composio.dev/toolkits/ploid.md · https://jentic.com/apis/ploid.com/ploid.md (third-party)
- Expected Parrot: https://docs.expectedparrot.com · https://github.com/expectedparrot/edsl
- Alter: https://docs.alterauth.com · https://docs.alterauth.com/guides/add-human-in-the-loop-approvals · https://docs.alterauth.com/reference/typescript-sdk
- TraceRoot: https://github.com/traceroot-ai/traceroot · https://traceroot.ai/docs/integrations/anthropic
- Maritime: https://maritime.sh/llms.txt · https://maritime.sh/docs/persistent-sandboxes · https://api.maritime.sh/openapi.json
- Rowboat: https://github.com/rowboatlabs/rowboat
