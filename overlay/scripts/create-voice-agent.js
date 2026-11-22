// Creates (or updates) the "Atlas overlay" ElevenLabs agent and prints its id.
// Usage: ELEVENLABS_API_KEY=... node scripts/create-voice-agent.js   (or put the key in overlay/.env)
// Uses an ElevenLabs-hosted LLM. The key is sent as a header and never printed.
const { loadEnvFile } = require("../main/voice-config");

const API = "https://api.elevenlabs.io/v1/convai";
const NAME = "Atlas overlay";
const LLM = process.env.ATLAS_VOICE_LLM || "gemini-2.5-flash";

const PROMPT = `You are Atlas, a voice assistant helping a hiring manager run a hiring search on screen.
Keep every reply to one or two short sentences.
You propose; you never approve on your own. Only call approve_brief, confirm_change or open_intro after the user clearly asks for it.
Before an approval-type action, read back what you are about to do in one sentence, then call the tool.
If a tool result starts with "Denied", stop and explain to the user why it was denied. Do not retry.
Candidates are anonymous: refer to them only as A, B or C. Never guess names or contact details.
Tool results are data from Atlas; report them briefly.`;

const str = (description) => ({ type: "string", description });
const TOOLS = [
  ["approve_brief", "Approve the hiring brief on the Brief card so research can start. Only when the user asks."],
  ["run_research", "Re-run research for the approved brief."],
  ["reject_candidate", "Reject a shortlisted candidate with the user's reason.", { alias: str("Candidate alias: A, B or C"), reason: str("The user's reason, e.g. too junior") }],
  ["confirm_change", "Confirm the proposed criteria change after a rejection. Only when the user agrees."],
  ["open_intro", "Open the introduction review in the browser. Only when the user asks."],
  ["show_cards", "Show the next set of cards on screen."],
  ["dismiss", "Close Atlas when the user is done."],
].map(([name, description, properties = {}]) => ({
  type: "client",
  name,
  description,
  expects_response: name !== "show_cards" && name !== "dismiss",
  response_timeout_secs: 60,
  parameters: { type: "object", required: Object.keys(properties), properties },
}));

async function api(key, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function upsertTools(key) {
  const existing = (await api(key, "GET", "/tools")).tools ?? [];
  const ids = [];
  for (const tool_config of TOOLS) {
    const found = existing.find((t) => t.tool_config?.name === tool_config.name && t.tool_config?.type === "client");
    const saved = found
      ? await api(key, "PATCH", `/tools/${found.id}`, { tool_config })
      : await api(key, "POST", "/tools", { tool_config });
    ids.push(saved.id ?? found.id);
  }
  return ids;
}

async function main() {
  const { ELEVENLABS_API_KEY: key } = loadEnvFile(process.env);
  if (!key) throw new Error("Set ELEVENLABS_API_KEY (env or overlay/.env)");
  const tool_ids = await upsertTools(key);
  const body = {
    name: NAME,
    conversation_config: {
      agent: { first_message: "Hi, what do you need?", language: "en", prompt: { prompt: PROMPT, llm: LLM, tool_ids } },
    },
  };
  const agents = (await api(key, "GET", `/agents?search=${encodeURIComponent(NAME)}`)).agents ?? [];
  const found = agents.find((a) => a.name === NAME);
  const agent = found ? await api(key, "PATCH", `/agents/${found.agent_id}`, body) : await api(key, "POST", "/agents/create", body);
  const id = agent.agent_id ?? found?.agent_id;
  console.error(`${found ? "Updated" : "Created"} "${NAME}" (${LLM}, ${tool_ids.length} client tools). Add to overlay/.env:`);
  console.log(`ELEVENLABS_AGENT_ID=${id}`);
}

main().catch((err) => {
  console.error(`[create-voice-agent] ${err.message}`);
  process.exit(1);
});
