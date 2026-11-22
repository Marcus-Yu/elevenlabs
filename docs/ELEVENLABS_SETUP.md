# ElevenLabs setup for Atlas

## Server configuration

Set `ELEVENLABS_API_KEY`, `ELEVENLABS_SKEPTIC_AGENT_ID`, and
`ELEVENLABS_WEBHOOK_SECRET` in the ignored server environment. The gateway
must authorize the user and Room run before requesting a WebRTC token. Store
the returned conversation ID against that run and user before returning the
short-lived token to the browser.

The server adapter can also issue a single-use Scribe realtime token for an
authorized Room or meeting session. Both token operations require live
adapter mode. They bypass fixture recording because the responses contain
bearer credentials.

## Skeptic agent

1. In ElevenAgents, create a Skeptic agent for pitch rehearsal. Give it a
   fixed instruction to ask one concrete question about the supplied
   objection and follow up on the user's answer.
2. Provide the role archetype, company type, objection, weak sentence, and
   pitch summary as contextual data for the session. Keep those values out
   of system prompt templates. Atlas's skeptic context helper preserves the
   untrusted-text provenance for the selected measured run.
3. Connect the browser over WebRTC using the conversation token. Send only
   finalized transcript turns to the transcript component, with stable IDs
   so duplicate deliveries are idempotent.

## Post-call webhook

Use HMAC authentication and enable the transcript event. The server must
verify `ElevenLabs-Signature` against the raw body before any JSON parser.
The application then checks the persisted conversation and agent mapping and
stores the skeptic transcript separately from the pitch. An event for an
unknown conversation cannot establish that mapping. Store retry delivery
idempotently and return HTTP 200 for verified duplicates.

The current branch includes the token adapter, WebRTC UI transport contract,
signature verification, and event processing. The gateway token action,
the raw-body route, and durable conversation mapping are still required
before running a live call.

- [WebRTC conversation token](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-webrtc-token)
- [Scribe single-use token](https://elevenlabs.io/docs/api-reference/tokens/create)
- [Post-call webhook authentication](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks)
