#!/bin/bash
# Builds overlay/dist/Atlas.app: a copy of Electron with its own bundle id, so macOS
# shows the microphone prompt for "Atlas" (a bare `electron .` started from a shell is
# attributed to the parent process and the prompt never appears).
#
# The bundle only points at this checkout's main.js, so code changes need no rebuild.
# Run:  overlay/scripts/build-dev-app.sh && overlay/scripts/open-dev-app.sh
set -euo pipefail

OVERLAY="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$OVERLAY/node_modules/electron/dist/Electron.app"
APP="$OVERLAY/dist/Atlas.app"
PLIST="$APP/Contents/Info.plist"
BUNDLE_ID="${ATLAS_BUNDLE_ID:-com.atlas.overlay.dev}"

[ -d "$SRC" ] || { echo "Run npm install in overlay/ first." >&2; exit 1; }

rm -rf "$APP"
mkdir -p "$OVERLAY/dist"
cp -R "$SRC" "$APP"

set_plist() { /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PLIST"; }
set_plist CFBundleIdentifier "$BUNDLE_ID"
set_plist CFBundleName "Atlas"
set_plist CFBundleDisplayName "Atlas"
set_plist NSMicrophoneUsageDescription "Atlas listens when you talk to it."
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST" 2>/dev/null || true

# Electron resolves "main" relative to Resources/app, so an absolute path there is joined
# onto the bundle and fails with "Cannot find module". Use a shim that requires the real
# main. The distinct name gives a distinct userData dir and single-instance lock.
mkdir -p "$APP/Contents/Resources/app"
cat > "$APP/Contents/Resources/app/package.json" <<EOF
{ "name": "atlas-overlay-dev", "main": "main.js" }
EOF
cat > "$APP/Contents/Resources/app/main.js" <<EOF
require("$OVERLAY/main/main.js");
EOF

# TCC keeps a grant only for a signed bundle; ad-hoc signing is enough for local use.
codesign --force --deep --sign - "$APP" >/dev/null
echo "Built $APP ($BUNDLE_ID)"
