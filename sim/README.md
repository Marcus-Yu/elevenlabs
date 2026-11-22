# Atlas simulation service

WP3 implements the scoring HTTP service. WP8 can use the existing
`app/src/shared/contracts/sim.ts` schemas to validate requests and responses.
The service has no database dependency.

## Run

Use Python 3.12 and uv. Run these commands from `sim/`.

```bash
uv sync --locked
uv run pytest
uv run uvicorn atlas_sim.api:app --host 127.0.0.1 --port 8000
```

`GET /health` checks that the process is running. `POST /score` requires
`SIM_EDSL_MODEL` and `SIM_EDSL_SERVICE` in the server process environment,
along with the chosen provider's API credential. Look up the model name and
service in the [EDSL provider catalog](https://docs.expectedparrot.com/en/latest/guides/providers).
A local EDSL run orchestrates the survey here and sends model requests directly
to that provider. Each run uses a fresh local cache with hosted inference and
hosted caching disabled. Keep the service on localhost or a private app network.

Install the provider SDK with `uv sync --locked --extra openai` or
`uv sync --locked --extra anthropic`. Set `SIM_EDSL_SERVICE` to `openai`
or `anthropic` to match. Maritime LLM implements the OpenAI API and
injects `OPENAI_BASE_URL` and `OPENAI_API_KEY` into a configured agent.
Run the simulation in that agent to use its prepaid inference credits.

## Scoring contract

Send the sourced panel, indexed pitch segments, and a tier of `live` or
`measured`. Nonempty panels and pitch segments with unique IDs and indices
are required. The service evaluates the cumulative pitch in ascending index
order. Live runs score interest once per persona and pitch segment. Measured
runs repeat each evaluation three times by default, collect objections at each
segment, and ask the meeting question on the full pitch only.

Each score is the mean interest rounded half up on the 1–7 scale. The measured
summary uses the unrounded mean of all interest responses and the range of
iteration means. Meeting rate is the share of affirmative final-pitch votes.
Objections are selected by frequency after whitespace normalization and ties
are resolved lexicographically. All results describe simulated responses.

Live response shape using an offline test model:

```json
{"engine":"edsl","latencyMs":0,"scores":[{"personaId":"synthetic-1","segmentIndex":0,"interest":4}]}
```

Measured response shape using an offline test model:

```json
{"engine":"edsl","latencyMs":0,"scores":[{"personaId":"synthetic-1","segmentIndex":0,"interest":4,"objection":"The cost is unclear."}],"summary":{"meanInterest":4.0,"spread":0.0,"meetingRate":1.0,"topObjections":[{"segment":"segment-1","text":"The cost is unclear."}]}}
```

The example latency values are placeholders. Invalid requests return 422.
Missing model configuration returns 503. Incomplete or failed provider
responses return 502.

## Latency spike

With a provider model configured and the server running, execute:

```bash
uv run python -m atlas_sim.benchmark
```

This makes 20 live HTTP requests serially, each with eight synthetic
personas and one sentence, and reports nearest-rank p50 and p95. The service
currently uses EDSL for both tiers. Real p50 and p95 are pending a provider
that can serve inference. The Maritime benchmark agent booted and installed
the dependencies, but its model endpoint returned `402 budget_exhausted`
before any inference. If measured p50 exceeds 2.5 seconds, implement the
single-call direct engine for the live tier and keep EDSL for measured scoring.
