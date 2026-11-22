# Atlas desktop overlay

Atlas's demo UI is a desktop overlay, not a web page. It stays invisible until summoned, shows the ball, and slides the Brief, Research, Shortlist and Gateway cards out beside it. The design reference is [`docs/design/atlas-overlay/`](../docs/design/atlas-overlay/README.md).

- **Electron**, in this folder only. The window is transparent, frameless, full-screen on the primary display and always on top. It ignores mouse events while `hidden`, has no Dock icon and is summoned by a global hotkey.
- **Renderer** (`renderer/`): plain HTML, CSS and ES modules lifted from the design's `<style>` and state machine. It renders only a `Snapshot` from [`shared/contract.js`](shared/contract.js).
- **Data** (`main/providers/`): `mock.js` serves the labelled synthetic sample, and `atlas.js` reads the Wasp server and the sim service from the main process. Running in the main process avoids CORS, and it means the UI still never touches an adapter.

Run commands and env (`ATLAS_DATA`, `ATLAS_SERVER_URL`, `ATLAS_USER`, `ATLAS_PASSWORD`, `SIM_URL`) are filled in by the implementing agents.
