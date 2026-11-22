// ElevenLabs voice credentials for the overlay. Lives in the main process only:
// the API key never crosses IPC. The renderer gets a short-lived signed URL.
const fs = require("node:fs");
const path = require("node:path");

const API = "https://api.elevenlabs.io";
const ENV_FILE = path.join(__dirname, "..", ".env"); // overlay/.env, gitignored

/** Reads KEY=value lines from overlay/.env without overriding the real environment. */
function loadEnvFile(env = process.env, file = ENV_FILE) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return env;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || env[m[1]]) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

/** Voice is on only when both the key and the agent id are set. */
function voiceConfig(env) {
  const apiKey = env.ELEVENLABS_API_KEY;
  const agentId = env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) return null;
  return { apiKey, agentId };
}

/** Mints a signed WebSocket URL for one conversation. */
async function mintSignedUrl(config, fetchImpl = fetch) {
  const url = `${API}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(config.agentId)}`;
  const res = await fetchImpl(url, { headers: { "xi-api-key": config.apiKey } });
  if (!res.ok) throw new Error(`ElevenLabs signed URL request failed: HTTP ${res.status}`);
  const body = await res.json();
  if (typeof body?.signed_url !== "string" || !body.signed_url.startsWith("wss://")) {
    throw new Error("ElevenLabs signed URL response had no signed_url");
  }
  return body.signed_url;
}

module.exports = { loadEnvFile, voiceConfig, mintSignedUrl };
