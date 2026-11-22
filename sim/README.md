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

## Run chat and calibration with a local model

Atlas can use one loopback llama.cpp server for chat and calibration. The app
uses the Anthropic-compatible chat endpoint and EDSL uses the OpenAI-compatible
endpoint. A Qwen3-1.7B Q4_K_M GGUF served by llama.cpp passed a synthetic
goal-proposal and calibration smoke test. Use a model with a tool-capable chat
template. [Model weights](https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF) · [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)

Start the installed server and model on loopback.

```bash
llama-server -m /path/to/model.gguf --alias atlas-local-qwen \
  --host 127.0.0.1 --port 58210 --jinja --no-webui \
  --ctx-size 4096 --parallel 1 --reasoning-budget 0
```

From `sim/`, start the simulation against the local model.

```bash
uv sync --locked --extra openai
SIM_EDSL_SERVICE=openai SIM_EDSL_MODEL=atlas-local-qwen \
  OPENAI_BASE_URL=http://127.0.0.1:58210/v1 OPENAI_API_KEY=local-only \
  uv run uvicorn atlas_sim.api:app --host 127.0.0.1 --port 58211
```

Set these values in the app's ignored `app/.env.server` and restart Atlas.
Enable model-processing consent in the thread before sending a chat message.
With this configuration, Fiber discovery still uses recorded results.

```dotenv
ADAPTER_MODE=replay
SIM_URL=http://127.0.0.1:58211
SIM_CALIBRATION_MODE=live
ATLAS_CHAT_PROVIDER=local
ATLAS_CHAT_LOCAL_BASE_URL=http://127.0.0.1:58210/v1
ATLAS_CHAT_LOCAL_MODEL=atlas-local-qwen
```

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

## Hiring preference calibration

The current demo uses these endpoints to refine a hiring need. The optional
Room still uses `POST /score`. The 20-trial Room latency spike is no longer
a calibration acceptance check.

### Generate a calibration panel

`POST /calibrate/profiles` accepts `{"need":"We need a robotics engineer"}`.
EDSL generates 6–8 varied archetypes. The service assigns each one a unique
ID, a generic label, and `synthetic: true`. Treat these profiles as
examples for preference elicitation. They are not sourced hiring leads.

Illustrative response with synthetic sample data:

```json
{
  "profiles": [
    {"id":"p1","label":"Candidate archetype 1","yearsExperience":2,"skills":["ROS 2","Python"],"workStyle":"Pairs on prototypes","synthetic":true},
    {"id":"p2","label":"Candidate archetype 2","yearsExperience":6,"skills":["ROS 2","Controls"],"workStyle":"Owns field integration","synthetic":true},
    {"id":"p3","label":"Candidate archetype 3","yearsExperience":4,"skills":["ROS 2","C++"],"workStyle":"Focuses on test automation","synthetic":true},
    {"id":"p4","label":"Candidate archetype 4","yearsExperience":9,"skills":["Simulation","Planning"],"workStyle":"Leads design reviews","synthetic":true},
    {"id":"p5","label":"Candidate archetype 5","yearsExperience":7,"skills":["Embedded systems","Controls"],"workStyle":"Troubleshoots on hardware","synthetic":true},
    {"id":"p6","label":"Candidate archetype 6","yearsExperience":3,"skills":["Perception","Python"],"workStyle":"Runs structured experiments","synthetic":true}
  ]
}
```

### Draft criteria

`POST /calibrate/criteria` accepts that same `profiles` array plus
`reactions`. Give each reaction its own ID and include at most one reaction
per profile. An example reaction list:

```json
[
  {"id":"r1","profileId":"p2","decision":"pick","reason":"We need at least 5 years"},
  {"id":"r2","profileId":"p3","decision":"pick","reason":"Must have ROS 2"},
  {"id":"r3","profileId":"p4","decision":"reject","reason":"Strong simulation, but I prefer hands-on work"}
]
```

```json
{
  "minimumExperience":{"years":5,"reactionIds":["r1"]},
  "mustHaveSkills":[{"skill":"ROS 2","reactionIds":["r2"]}],
  "tradeOffs":[{"text":"Strong simulation, but I prefer hands-on work","reactionIds":["r3"]}]
}
```

Criteria use explicit requirements supported by the picked profile and
stated trade-offs. Ambiguous or conflicting reactions can yield
`minimumExperience: null` and empty arrays. A reviewer can edit the
draft before WP5 uses it. The criteria route needs no model credential.
The profiles route needs a working EDSL provider, and was exercised
offline using EDSL's canned model.
