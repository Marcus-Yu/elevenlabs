const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadEnvFile, voiceConfig, mintSignedUrl } = require("./voice-config");

test("voiceConfig is null unless both key and agent id are set", () => {
  assert.equal(voiceConfig({}), null);
  assert.equal(voiceConfig({ ELEVENLABS_API_KEY: "k" }), null);
  assert.equal(voiceConfig({ ELEVENLABS_AGENT_ID: "a" }), null);
  assert.deepEqual(voiceConfig({ ELEVENLABS_API_KEY: "k", ELEVENLABS_AGENT_ID: "a" }), { apiKey: "k", agentId: "a" });
});

test("loadEnvFile reads overlay/.env without overriding the environment", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "atlas-env-")), ".env");
  fs.writeFileSync(file, "# comment\nELEVENLABS_API_KEY='from-file'\nELEVENLABS_AGENT_ID=agent_1\n");
  const env = loadEnvFile({ ELEVENLABS_API_KEY: "from-env" }, file);
  assert.equal(env.ELEVENLABS_API_KEY, "from-env");
  assert.equal(env.ELEVENLABS_AGENT_ID, "agent_1");
  assert.deepEqual(loadEnvFile({}, file + ".missing"), {});
});

test("mintSignedUrl sends the key as a header and returns the signed URL", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_1&conversation_signature=x" }) };
  };
  const url = await mintSignedUrl({ apiKey: "secret", agentId: "agent 1" }, fetchImpl);
  assert.match(url, /^wss:\/\//);
  assert.equal(seen.url, "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent%201");
  assert.equal(seen.init.headers["xi-api-key"], "secret");
  assert.ok(!url.includes("secret"));
});

test("mintSignedUrl reports HTTP failures without the key", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(mintSignedUrl({ apiKey: "secret", agentId: "a" }, fetchImpl), (err) => {
    assert.match(err.message, /HTTP 401/);
    assert.ok(!err.message.includes("secret"));
    return true;
  });
});

test("mintSignedUrl rejects a response without signed_url", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(mintSignedUrl({ apiKey: "k", agentId: "a" }, fetchImpl), /no signed_url/);
});
