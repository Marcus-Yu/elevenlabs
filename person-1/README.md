# Person 1 — Platform, approvals and verification

Read §§3–8 for repository rules, sponsor floors, shared contracts and gateway policy. Follow §10 for dispatch and scope cuts. [Atlas implementation plan](../docs/IMPLEMENTATION_PLAN.md)

Run WP0 alone in wave 0. In wave 1, publish the gateway stubs early so Person 4 can start the chat thread. Complete Alter and TraceRoot in wave 2 and the end-to-end guardrail checks in wave 5.

Use one Codevisor worktree and branch per package. Open a PR when the acceptance checks pass and record the checks you ran.

## Handoffs

- After WP0, share the feature spec registration pattern, shared schemas, seed command and replay fixture format with everyone.
- After WP1, give Person 2 the handler registration interface and give Person 4 the approval, log and stub contracts. Give Person 3 the shared approval operation and verified-phone rule before voice work.
- Own the gateway engine and approval/activity operations. Other owners register their handlers through the agreed interface. In `src/features/connect/`, own provider connection and leave `cards/` to Person 4.
- Give Person 4 a trace link and a sandbox approval result for the demo. Coordinate real denial cases with Persons 2 and 3 before it is recorded.

## WP0 — Foundation (one agent, blocks everything)

**Owns:** repo root, `app/` scaffold, `schema.prisma`, `main.wasp.ts`, `src/shared/contracts/`, `src/server/adapters/http.ts`, `src/server/llm/`, `AGENTS.md`.

- [ ] Install the Wasp CLI, create the app in `app/`, set `wasp: { version: "^0.26" }`. Use local Postgres via `DATABASE_URL` in `.env.server`.
- [ ] Username-and-password auth; login and signup pages.
- [ ] Full Prisma schema from §6; first migration.
- [ ] One empty `<feature>.wasp.ts` spec and placeholder page per feature in §4, all imported by `main.wasp.ts`; app shell with navigation.
- [ ] Contracts from §7.
- [ ] `adapters/http.ts`: a fetch wrapper with `ADAPTER_MODE=live|record|replay`. Record writes to `fixtures/<provider>/<hash>.json` with secrets stripped; replay reads it and fails loudly on a miss.
- [ ] `llm/client.ts` and `llm/models.ts` per §4; one structured-output helper.
- [ ] Tailwind; Vitest; an architecture test that fails if anything outside `gateway/handlers/` imports `adapters/`.
- [ ] `AGENTS.md` from §3 plus exact dev commands; `.env.server.example` from §11.
- [ ] Seed script: demo user, the robotics startup profile with facts (including a private budget ceiling), no matches.

**Acceptance**

- [ ] `wasp start` serves the app; signup, login and every nav route work; `wasp db migrate-dev` is clean; tests pass; a replay miss throws a clear error.

## WP1 — Gateway, action log, approvals

**Depends:** WP0. **Owns:** `src/server/gateway/`, `src/features/approvals/operations.ts`, `src/features/activity/operations.ts`.

- [ ] `engine.ts` implementing §8 with a handler registry, so other packages register handlers without editing the engine.
- [ ] All rules in §8, each with unit tests for allow and deny cases.
- [ ] Approval lifecycle: create with `payloadHash`; `decideApproval(id, decision, via)` requires the owning user; execution re-checks the hash and re-runs the deny rules.
- [ ] Queries: pending approvals, approval by id, activity log with filters.
- [ ] Stub handlers that return fixtures so WP4 and WP6 can build against real decisions.

**Acceptance**

- [ ] tests cover every rule id; a WATCH goal cannot send; a private fact in a draft is denied and logged; a tampered payload after approval is refused; every call writes exactly one `ActionLog` row.

## WP7 — Alter and TraceRoot

**Depends:** WP1. **Owns:** `adapters/alter.ts`, `adapters/tracing.ts`, `src/features/connect/`, `gateway/handlers/outreach.ts`.

- [ ] Read `docs.alterauth.com` (quickstart, approvals guide, TypeScript SDK reference). Settle the **VERIFY** items in §5.
- [ ] Connect flow: user links Google through `@alter-ai/connect`; store the grant id.
- [ ] `outreach.send` handler: build the Gmail send request and call `agent.proxyRequest` with the identity for the goal's autonomy level. On `PendingApproval`, store `alterApprovalId` on our `Approval`. When the user decides in Atlas, call `app.decideApproval` with their email, then `awaitApproval` and record the result. Handle the four approval errors.
- [ ] Webhook route for Alter events to keep `Approval.status` in sync.
- [ ] Document the dashboard setup (providers, two agents, the approval rule) in `docs/ALTER_SETUP.md`.
- [ ] TraceRoot: initialise at server start with Anthropic instrumentation; wrap `gateway.execute` in `observe()` with action type, decision and rule id; store the trace id on `ActionLog`; flush on shutdown.
- [ ] `EXECUTION_BACKEND=alter|local`. `local` is for development only and stamps every log row.

**Acceptance**

- [ ] in sandbox mode an approved draft is delivered to the redirect inbox through Alter; a send attempted with the Watch identity fails at Alter as well as locally; each activity row opens a trace.

## WP14 — Guardrail verification

**Depends:** WP5, WP7, WP10. The voice approval check also needs the WP9 webhook. **Owns:** `app/tests/redteam/`.
- [ ] Write end-to-end tests in replay mode for: a web page with an embedded instruction (flagged, content not acted on); a tainted request trying to send (denied); a draft leaking the budget ceiling in three number formats (denied); the 11th send of the day (denied); a recipient on the opt-out list (denied); a draft with no personalization (denied); a watcher token calling a forbidden tool (denied); voice approval for another user's item (denied).

**Acceptance**

- [ ] all pass in CI; each leaves the expected `ActionLog` row.
