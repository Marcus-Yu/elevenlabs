// HTTP server for Maritime's custom container contract (maritime.sh/docs/frameworks/custom):
//   GET  /health     2xx, no side effects
//   POST /chat       {"message": "tick" | "status", "source": ...}; replies within 30 s
//   GET  /schedules  the daily tick, so Maritime wakes the box (timers in a sleeping box do not fire)
// Binds 0.0.0.0:$PORT. Never hardcode 8080: Maritime's forwarder uses it.

import { createServer } from "node:http";
import { createAtlasClient, loadConfig, loadState, missingConfig, runTick } from "./watcher.mjs";

const MAX_BODY = 64 * 1024;

export function createWatcherServer({ config = loadConfig(), atlas, log = console.log } = {}) {
  const client = atlas ?? createAtlasClient(config);
  let running = null;

  function startTick() {
    if (running) return false;
    running = runTick({ config, atlas: client, log })
      .then((tick) => log(`tick done: submitted ${tick.submitted.length}, found ${tick.found}, errors ${tick.errors.length}`))
      .catch((error) => log(`tick crashed: ${error.message}`))
      .finally(() => {
        running = null;
      });
    return true;
  }

  async function status() {
    const state = await loadState(config);
    const last = state.ticks.at(-1);
    return {
      goalId: config.goalId || null,
      configured: missingConfig(config).length === 0,
      missing: missingConfig(config),
      running: Boolean(running),
      seenCount: state.seenDomains.length,
      lastTick: last ?? null,
    };
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://box");
    try {
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

      if (req.method === "GET" && url.pathname === "/schedules") {
        return json(res, 200, [{ id: "daily-tick", cron: config.cron, tz: config.tz, prompt: "tick", enabled: true }]);
      }

      if (req.method === "POST" && url.pathname === "/chat") {
        const body = await readJson(req);
        const message = String(body.message ?? "").trim().toLowerCase();
        if (message === "tick") {
          const missing = missingConfig(config);
          if (missing.length) return json(res, 200, { response: `Not configured: missing ${missing.join(", ")}.` });
          const started = startTick();
          return json(res, 200, { response: started ? "Tick started." : "A tick is already running." });
        }
        if (message === "status") return json(res, 200, { response: JSON.stringify(await status()) });
        return json(res, 200, { response: 'Atlas watcher. Send "tick" to search for new matches or "status" for the last run.' });
      }

      return json(res, 404, { error: "not_found" });
    } catch (error) {
      log(`request failed: ${error.message}`);
      return json(res, 400, { error: "bad_request" });
    }
  });

  return { server, startTick, status, idle: () => running ?? Promise.resolve() };
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

// Started directly (Docker CMD or `node server.mjs`), not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.mjs")) {
  const port = Number(process.env.PORT ?? 18789);
  const { server } = createWatcherServer();
  server.listen(port, "0.0.0.0", () => console.log(`atlas watcher listening on 0.0.0.0:${port}`));
}
