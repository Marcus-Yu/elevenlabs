// Atlas overlay main process: one transparent, always-on-top window over the
// primary display, a global hotkey, the 5-state machine and the data provider.
const path = require("node:path");
const { app, BrowserWindow, globalShortcut, ipcMain, screen, session, systemPreferences } = require("electron");
const mock = require("./providers/mock");
const { next: nextState, voice: voiceState, ignoresMouse } = require("./state");
const { openIntroWindow } = require("./introWindow");
const { loadEnvFile, voiceConfig, mintSignedUrl } = require("./voice-config");

loadEnvFile(process.env); // overlay/.env (gitignored) fills ELEVENLABS_* if unset
const voice = voiceConfig(process.env);
if (!voice) console.warn("[atlas] voice disabled: set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID (env or overlay/.env)");

const HOTKEY = process.env.ATLAS_HOTKEY || "Alt+Space";
const LEAVE_MS = 1000; // design: leaving holds 1000 ms, then hidden
const PROVIDER_TIMEOUT_MS = Number(process.env.ATLAS_TIMEOUT_MS) || 20000; // live research can take a while

// ---------- data provider ----------
const mockProvider = mock.createProvider(process.env);

function loadProvider() {
  if (process.env.ATLAS_DATA === "mock") return mockProvider;
  try {
    const atlas = require("./providers/atlas");
    return atlas.createProvider(process.env);
  } catch (err) {
    console.warn(`[atlas] live provider unavailable, using mock: ${err.message}`);
    return mockProvider;
  }
}
const provider = loadProvider();

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("provider timed out")), PROVIDER_TIMEOUT_MS)),
  ]);
}

// Live provider errors fall back to the labelled mock so the demo never shows a blank card.
async function call(method, arg) {
  if (provider !== mockProvider) {
    try {
      return await withTimeout(Promise.resolve().then(() => provider[method](arg)));
    } catch (err) {
      console.warn(`[atlas] live ${method} failed, using mock: ${err.message}`);
    }
  }
  return mockProvider[method](arg);
}

// ---------- window + state ----------
let win = null;
let state = "hidden";
let leaveTimer = null;

function go(next) {
  clearTimeout(leaveTimer);
  state = next;
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(ignoresMouse(next), { forward: true });
  if (next === "listening") {
    if (process.platform === "darwin") app.focus({ steal: true });
    win.focus(); // so Escape reaches the renderer
  }
  console.log(`[atlas] state → ${next}`);
  win.webContents.send("atlas:state", next);
  if (next === "leaving") leaveTimer = setTimeout(() => send("left"), LEAVE_MS);
}

function send(event) {
  const target = nextState(state, event);
  if (target !== state) go(target);
}

function createWindow() {
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
  win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    show: false,
    backgroundColor: "#00000000",
    roundedCorners: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.once("ready-to-show", () => {
    win.setBounds({ x, y, width, height });
    win.showInactive(); // transparent and click-through until summoned
  });
}

// Opens the intro review in an in-app Atlas window and hides the overlay.
function openIntro(url) {
  if (openIntroWindow(url)) send("dismiss");
}

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => send("summon"));

  ipcMain.handle("atlas:snapshot", () => call("snapshot"));
  ipcMain.handle("atlas:act", async (_e, action) => {
    const snap = await call("act", action);
    if (action?.type === "open_intro" && snap?.introUrl) openIntro(snap.introUrl);
    return snap;
  });
  ipcMain.on("atlas:nav", (_e, move) => send(move === "advance" ? "advance" : "dismiss"));
  // Voice: the renderer gets a one-conversation signed URL, never the API key.
  ipcMain.handle("atlas:voice-url", () => (voice ? mintSignedUrl(voice) : null));
  ipcMain.on("atlas:voice-state", (_e, mode) => {
    const target = voiceState(state, mode);
    if (target !== state) go(target);
  });

  app.whenReady().then(async () => {
    if (voice) {
      session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(permission === "media"));
      if (process.platform === "darwin") {
        const granted = await systemPreferences.askForMediaAccess("microphone").catch(() => false);
        if (!granted) console.warn("[atlas] microphone access denied; voice will not hear you (System Settings → Privacy → Microphone)");
      }
    }
    createWindow();
    if (process.platform === "darwin" && app.dock) app.dock.hide();
    if (!globalShortcut.register(HOTKEY, () => send("toggle"))) {
      console.warn(`[atlas] could not register hotkey ${HOTKEY}; set ATLAS_HOTKEY to another accelerator`);
    } else {
      console.log(`[atlas] ready · press ${HOTKEY} to summon · data: ${provider === mockProvider ? "mock" : "live"} · voice: ${voice ? "on" : "off"}`);
    }
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => app.quit());
}
