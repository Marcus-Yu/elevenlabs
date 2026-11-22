# Alter setup (WP7)

Atlas sends email only through the gateway's `outreach.send` handler. With `EXECUTION_BACKEND=local` (the default), nothing is sent and every `ActionLog` row is stamped `execution_backend=local`. With `EXECUTION_BACKEND=alter`, the handler sends Gmail through Alter's proxy. The Google credential stays in Alter, and Alter can hold the send for approval.

The code was written against docs.alterauth.com and the `@alter-ai/alter-sdk` 0.33 type definitions. **It has not been run against a live Alter app yet**, because no credentials existed when it was written. Follow the steps below, then run the verification at the end.

## 1. Create the app (Alter portal)

1. Sign in to the Alter portal and create an app named **Atlas**.
2. Create an **app key** from the **Backend service** template, and add the scopes `approvals:decide` and `approvals:read`. The key starts with `alter_rk_`. Put it in `ALTER_API_KEY`.

## 2. Add the Google provider

1. Under **Providers**, add **Google**.
2. Set these scopes, and no others:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.send`

## 3. Create the two agents

Create two managed agents. Only these two hold Alter identities. Watchers, Maritime boxes and any delegated research agent get none, so they cannot send even if a local rule fails.

| Agent | Used for | Policy |
|---|---|---|
| `atlas-prepare` | Goals at PREPARE autonomy, and sends with no goal | Every Gmail send requires human approval in Alter |
| `atlas-act` | Goals at ACT autonomy | Sends allowed, subject to Atlas's local rules |

Mint one agent key for each. Agent keys start with `alter_key_`. Put them in `ALTER_AGENT_KEY_PREPARE` and `ALTER_AGENT_KEY_ACT`. Optionally, copy each agent's UUID into `ALTER_AGENT_ID_PREPARE` and `ALTER_AGENT_ID_ACT`. The connect script falls back to the agent names.

## 4. Add the approval rule

On the `atlas-prepare` agent, open **Runtime policies**, click **Add runtime policy**, choose **Require human approval**, then:

- Condition: provider `google`, method `POST`, URL `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
- Approver: the demo user's email. Put the same address in `ALTER_APPROVER_EMAIL`.

CLI equivalent: `alter policy rules create --type require_approval`, with the same condition and approver.

Add no approval rule to `atlas-act`.

## 5. Link Google (connect script, on the Mac)

```bash
cd app
npx -y tsx scripts/alter-connect.ts                # atlas-prepare, then atlas-act
npx -y tsx scripts/alter-connect.ts atlas-prepare  # one agent only
```

The script reads `ALTER_API_KEY` from `app/.env.server` and opens two kinds of page:

1. An Alter sign-in page. A Connect session bound to an agent needs the consenting user's token.
2. One Google consent page per agent, with provider `google` and `scopeConstraint` set to `gmail.send`.

It prints each grant id. Put the grant id in `ALTER_GOOGLE_GRANT_ID`; without it, Alter resolves the grant by provider. The script never prints keys or tokens.

If the sign-in step fails because the app has no identity provider configured, run `npx -y tsx scripts/alter-connect.ts --unbound`. That creates an app-scoped grant with no agent binding. **VERIFY** whether the agents can use that grant.

## 6. Webhooks: skipped for the demo

Atlas does not use Alter webhooks. When the user approves in Atlas, the handler records the decision in Alter (`app.decideApproval` with `ALTER_APPROVER_EMAIL`) and waits with `agent.awaitApproval`. `ALTER_WEBHOOK_SECRET` is optional and unused.

## 7. Env keys (`app/.env.server`)

```bash
EXECUTION_BACKEND=alter              # local (default) sends nothing and stamps every log row
OUTREACH_MODE=sandbox                # keep sandbox: every recipient is rewritten
OUTREACH_REDIRECT_TO=<your inbox>    # the only address that receives sandbox mail
ALTER_API_KEY=alter_rk_...
ALTER_AGENT_KEY_PREPARE=alter_key_...
ALTER_AGENT_KEY_ACT=alter_key_...
ALTER_AGENT_ID_PREPARE=              # optional, agent UUID
ALTER_AGENT_ID_ACT=                  # optional, agent UUID
ALTER_GOOGLE_GRANT_ID=               # from scripts/alter-connect.ts
ALTER_APPROVER_EMAIL=                # the approver on the atlas-prepare rule
ALTER_WEBHOOK_SECRET=                # optional, unused
```

## How a send flows

1. Both sides accept the match and choose what to reveal (`card.reveal`). Atlas drafts the introduction.
2. The caller runs `gateway.execute({ actionType: "outreach.send", payload: { draftId, to, subject, body }, … })`. The rules require approval, so the gateway creates a pending `Approval`. In sandbox mode, the allow step rewrites `to` to `OUTREACH_REDIRECT_TO`.
3. The user approves in Atlas (`gateway.decideApproval`). The gateway runs the handler with `ctx.approvalId` set.
4. The handler refuses any sandbox recipient other than `OUTREACH_REDIRECT_TO`. It then picks the identity from the goal's autonomy: PREPARE → `atlas-prepare`, ACT → `atlas-act`, WATCH → none, so the send fails.
5. `agent.proxyRequest` POSTs the Gmail `raw` message.
   - With `atlas-act`, Alter sends it immediately.
   - With `atlas-prepare`, Alter returns `PendingApproval`. Atlas stores `alterApprovalId` on its `Approval`, calls `app.decideApproval(id, { decision: "approved", actorEmail, summaryVersion })`, and then calls `agent.awaitApproval(id)`.
6. The `ActionLog` row shows `sent through Alter as atlas-prepare` or `held by Alter for approval …`. If Alter fails, the row records `handler_error: …`. Alter's errors are `ApprovalDeniedError`, `ApprovalExpiredError`, `ApprovalTimeoutError` and `ApprovalExecutionFailedError`.

### Example: one send held for approval

| Step | Atlas | Alter |
|---|---|---|
| Request | `ActionLog` NEEDS_APPROVAL, `Approval` PENDING | (none yet) |
| User approves in Atlas | `Approval` APPROVED | `proxyRequest` → `PendingApproval` (`atlas-prepare` rule) |
| Atlas records the decision | `Approval.alterApprovalId` set | `decideApproval` approved by `ALTER_APPROVER_EMAIL` |
| Delivery | `ActionLog` ALLOW, `sent through Alter as atlas-prepare` | executed; Gmail delivers to `OUTREACH_REDIRECT_TO` |

## Verification checklist (when the keys arrive)

- [ ] Run `npx -y tsx scripts/alter-connect.ts`. It prints a Google grant id for each agent.
- [ ] Set `EXECUTION_BACKEND=alter`, then approve an introduction in Atlas. The email arrives at `OUTREACH_REDIRECT_TO` and nowhere else.
- [ ] Alter's audit log shows the held request, the approval by `ALTER_APPROVER_EMAIL` and the execution.
- [ ] A WATCH goal's send fails locally (no identity). A send with an unknown or revoked agent key fails at Alter.
- [ ] **VERIFY** that `proxyRequest`'s `grantId`/`provider` resolution works with an agent-delegated grant.
- [ ] **VERIFY** that `getApprovalStatus(id).summaryVersion` is the value `decideApproval` expects.
