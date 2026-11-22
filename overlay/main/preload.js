// Bridge between the isolated renderer and the main process. The renderer gets
// exactly these calls and nothing else from Node or Electron.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atlas", {
  snapshot: () => ipcRenderer.invoke("atlas:snapshot"),
  act: (action) => ipcRenderer.invoke("atlas:act", action),
  // nav: "advance" (ball click) | "dismiss" (Escape, scrim click)
  nav: (move) => ipcRenderer.send("atlas:nav", move),
  onState: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on("atlas:state", listener);
    return () => ipcRenderer.removeListener("atlas:state", listener);
  },
});
