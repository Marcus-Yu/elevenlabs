// In-app intro review window. Atlas stays a desktop app: the /match page opens
// in a normal Atlas window (not the click-through overlay, never the browser),
// and navigation is locked to the Atlas client origin.
const { app, BrowserWindow } = require("electron");

let introWin = null;

/** Returns the URL's origin when it is http(s), else null. */
function httpOrigin(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** True when `url` stays on the allowed Atlas client origin. */
function isAllowedNavigation(url, allowedOrigin) {
  return allowedOrigin != null && httpOrigin(url) === allowedOrigin;
}

function lockNavigation(win, allowedOrigin) {
  const contents = win.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    console.warn(`[atlas] blocked new window to ${httpOrigin(url) ?? "non-http URL"}`);
    return { action: "deny" };
  });
  const guard = (event, url) => {
    if (isAllowedNavigation(url, allowedOrigin)) return;
    event.preventDefault();
    console.warn(`[atlas] blocked navigation to ${httpOrigin(url) ?? "non-http URL"}`);
  };
  contents.on("will-navigate", guard);
  contents.on("will-redirect", guard);
}

function createIntroWindow(allowedOrigin) {
  const win = new BrowserWindow({
    title: "Atlas",
    width: 1180,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    center: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#E3EEFD",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "persist:atlas", // keeps the web login between launches
    },
  });
  win.setMenu(null);
  win.on("page-title-updated", (event) => event.preventDefault()); // title stays "Atlas"
  win.on("closed", () => {
    if (introWin === win) introWin = null;
  });
  lockNavigation(win, allowedOrigin);
  win.once("ready-to-show", () => win.show());
  win.allowedOrigin = allowedOrigin;
  return win;
}

/** Opens (or reuses) the Atlas intro window on `url`. Returns false for a non-http URL. */
function openIntroWindow(url) {
  const origin = httpOrigin(url);
  if (!origin) {
    console.warn("[atlas] ignoring non-http introUrl");
    return false;
  }
  if (introWin && !introWin.isDestroyed() && introWin.allowedOrigin !== origin) {
    introWin.destroy(); // a different client origin gets a fresh lock
    introWin = null;
  }
  if (!introWin || introWin.isDestroyed()) {
    introWin = createIntroWindow(origin);
    introWin.loadURL(url);
  } else {
    if (introWin.webContents.getURL() !== url) introWin.loadURL(url);
    if (introWin.isMinimized()) introWin.restore();
    introWin.show();
  }
  if (process.platform === "darwin") app.focus({ steal: true });
  introWin.focus();
  console.log(`[atlas] intro window → ${origin}${new URL(url).pathname}`);
  return true;
}

module.exports = { openIntroWindow, isAllowedNavigation, httpOrigin };
