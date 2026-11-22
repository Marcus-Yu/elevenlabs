#!/bin/bash
# Launches overlay/dist/Atlas.app through LaunchServices (so it is its own app to macOS).
# Env: ATLAS_SERVER_URL (default http://localhost:3001), ATLAS_CLIENT_URL, ATLAS_HOTKEY (default Alt+Space),
# ATLAS_DATA (live|mock, default live).
set -euo pipefail

OVERLAY="$(cd "$(dirname "$0")/.." && pwd)"
APP="$OVERLAY/dist/Atlas.app"
[ -d "$APP" ] || { echo "Run scripts/build-dev-app.sh first." >&2; exit 1; }

ARGS=(--env "ATLAS_DATA=${ATLAS_DATA:-live}")
for v in ATLAS_SERVER_URL ATLAS_CLIENT_URL ATLAS_HOTKEY ATLAS_USER ATLAS_PASSWORD SIM_URL; do
  [ -n "${!v:-}" ] && ARGS+=(--env "$v=${!v}")
done

open -n "$APP" "${ARGS[@]}" --stdout /tmp/atlas-overlay.out --stderr /tmp/atlas-overlay.err
echo "Launched. Logs: /tmp/atlas-overlay.out /tmp/atlas-overlay.err"
