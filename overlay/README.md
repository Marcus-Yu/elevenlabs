# Atlas desktop overlay

Atlas's demo UI is a desktop overlay, not a web page. It stays invisible until summoned, shows the ball, and slides the Brief, Research, Shortlist and Gateway cards out beside it. The design reference is [`docs/design/atlas-overlay/`](../docs/design/atlas-overlay/README.md).

- **Electron**, in this folder only. The window is transparent, frameless, full-screen on the primary display and always on top. It ignores mouse events while `hidden`, has no Dock icon and is summoned by a global hotkey.
- **Renderer** (`renderer/`): plain HTML, CSS and ES modules lifted from the design's `<style>` and state machine. It renders only a `Snapshot` from [`shared/contract.js`](shared/contract.js).
- **Data** (`main/providers/`): `mock.js` serves the labelled synthetic sample, and `atlas.js` reads the Wasp server and the sim service from the main process. Running in the main process avoids CORS, and it means the UI still never touches an adapter.

Run commands and env (`ATLAS_DATA`, `ATLAS_SERVER_URL`, `ATLAS_USER`, `ATLAS_PASSWORD`, `SIM_URL`) are filled in by the implementing agents.

## Run as a macOS app (microphone prompt)

`npm start` runs the bare Electron binary from your shell. macOS attributes that to the parent process, so the microphone prompt never appears and voice stays deaf. Build and launch the overlay as its own app instead:

```bash
cd overlay && npm install
scripts/build-dev-app.sh    # builds dist/Atlas.app (gitignored): own bundle id, mic usage text, ad-hoc signed
ATLAS_SERVER_URL=http://localhost:3003 ATLAS_CLIENT_URL=http://localhost:3000 scripts/open-dev-app.sh
```

macOS asks for the microphone once for "Atlas". The bundle only requires this checkout's `main/main.js`, so code changes need a relaunch, not a rebuild. Voice reads `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` from `overlay/.env`. The default hotkey is Option+Space; set `ATLAS_HOTKEY` to change it.

## Live data

`main/providers/atlas.js` is the live provider (`ATLAS_DATA=live`). It runs in the main process and uses only the Wasp server's public wire API: `POST /auth/username/login`, then `POST /operations/<kebab-name>` with a superjson body `{"json": args}` and `Authorization: Bearer <sessionId>`. The session stays in memory. If the server is unreachable or login fails, it throws an `AtlasProviderError`, and the shell falls back to mock (`mode: "mock"`).

| Env | Default | |
|---|---|---|
| `ATLAS_SERVER_URL` | `http://localhost:3001` | person-1's demo build: `http://localhost:3003` |
| `ATLAS_CLIENT_URL` | server port − 1 | Base for `introUrl` (`{client}/match`) |
| `ATLAS_USER` / `ATLAS_PASSWORD` | `demo` / `atlas-demo-1` | The seeded demo user |

What each action calls:

- `approve_brief` → `createHireGoal` with the demo hire criteria (a copy of `DEMO_HIRE_CRITERIA`; replay fixtures only match that query), once per provider.
- `run_research` → `runHireShortlist`. The first `snapshot()` after the brief is approved does this once too, because the shell has no research button.
- `reject_candidate` → `rejectMatchWithReason`. It returns an extra `proposedChange.explanation` for the confirm prompt, anonymised.
- `confirm_change` → `confirmCriteriaChange`, which produces run 2.
- `open_intro` → returns an extra `introUrl` (`{client}/match`). The shell opens it in an in-app Atlas window (`main/introWindow.js`: titled "Atlas", no menu bar, reused if open, navigation locked to the client origin, new windows denied) and hides the overlay. It never opens the system browser.
- `refresh` → re-reads.

Mapping:

- **Brief:** the goal's criteria (updated after confirm).
- **Research:** `getHireRuns`, plus source providers counted from each candidate's `SourceRef`s.
- **Shortlist:** the top three as A/B/C. Never a name, employer or profile URL; source claims are rewritten to "Candidate A … at a company".
- **Gateway:** `getMatchDemo` (the `/match` double opt-in). It shows the stripped field names (never their values), opt-in progress and `introStatus`. Card handlers that are still stubs show "recorded (stub)". The hire goal's `getActivityLog` rows follow.

`mode` comes from the logged `adapterMode` (`replay` unless live/record). `synthetic` is true for the seeded demo user or any non-live data.

```bash
node --test overlay/main/providers/atlas.test.js
ATLAS_SERVER_URL=http://localhost:3003 node -e 'require("./overlay/main/providers/atlas").createProvider(process.env).snapshot().then(s => console.log(JSON.stringify(s, null, 2)))'
```
