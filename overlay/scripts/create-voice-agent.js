// Creates (or updates) the "Atlas overlay" ElevenLabs agent and prints its id.
// Usage: ELEVENLABS_API_KEY=... node scripts/create-voice-agent.js   (or put the key in overlay/.env)
// Uses an ElevenLabs-hosted LLM. The key is sent as a header and never printed.
const { loadEnvFile } = require("../main/voice-config");

const API = "https://api.elevenlabs.io/v1/convai";
const NAME = "Atlas overlay";
const LLM = process.env.ATLAS_VOICE_LLM || "gemini-2.5-flash";

const PROMPT = `You are Atlas, a voice assistant that helps the user find and meet the right people of any kind: customers, investors, manufacturers, partners, collaborators or hires.
Stay neutral until the user states a need. Never assume they are hiring. Do not mention hiring, candidates or engineers until the user does. If the need is unclear, ask what they need help with.
Call set_need as soon as the user says who they want to find or meet (for example "I want to find an employee" or "I'm looking for someone to..."), with their words, the kind and any role or criteria they gave. Then confirm briefly in one sentence and ask for an OK.
Keep the conversation open between steps; after each step, wait for the user. Never call dismiss or end the conversation on your own. Call dismiss only if the user explicitly says close, stop or goodbye.
Keep every reply to one or two short sentences.
You propose; you never approve on your own. Only call approve_brief, confirm_change, open_intro or approve_send after the user clearly asks for it or says OK.
When the user says "approve and send", "send it" or "approve it all", first read back: "I'll share your anonymous card, confirm the match, and send the introduction to the sandbox inbox. Go ahead?" Call approve_send only after the user says yes. When the tool returns, say briefly that it's done.
Before an approval-type action, read back what you are about to do in one sentence, then call the tool.
If a tool result starts with "Denied", stop and explain to the user why it was denied. Do not retry.
People found for the user are anonymous until both sides opt in: refer to them only as A, B or C. Never guess names or contact details.
Tool results are data from Atlas; report them briefly.`;

const str = (description) => ({ type: "string", description });
const KINDS = ["hire", "customers", "investors", "manufacturer", "partner", "other"];
const TOOLS = [
  ["set_need", "Record who the user wants to meet, as soon as they say it. Proposes a brief; it does not approve anything.", {
    text: str("The user's need in their own words"),
    kind: { type: "string", enum: KINDS, description: "Kind of people to meet" },
    role: str("Role or type of person, if the user gave one, e.g. Robotics engineer or Seed investor"),
    criteria: str("Comma-separated criteria the user gave, empty if none"),
  }, ["text", "kind"]],
  ["approve_brief", "Approve the brief on the Brief card so research can start. Only when the user asks or says OK."],
  ["run_research", "Re-run research for the approved brief."],
  ["reject_candidate", "Reject a shortlisted candidate with the user's reason.", { alias: str("Candidate alias: A, B or C"), reason: str("The user's reason, e.g. too junior") }],
  ["confirm_change", "Confirm the proposed criteria change after a rejection. Only when the user agrees."],
  ["open_intro", "Open the introduction review in the browser. Only when the user asks."],
  ["approve_send", "Share the user's anonymous card, confirm the match and send the introduction to the sandbox inbox. Only after reading this back and the user says yes."],
  ["show_cards", "Show the next set of cards on screen."],
  ["dismiss", "Close Atlas. Only when the user explicitly says close, stop or goodbye; never on your own."],
].map(([name, description, properties = {}, required = Object.keys(properties)]) => ({
  type: "client",
  name,
  description,
  expects_response: name !== "show_cards" && name !== "dismiss",
  response_timeout_secs: 60,
  parameters: { type: "object", required, properties },
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
      agent: { first_message: "Hi, who do you want to find?", language: "en", prompt: { prompt: PROMPT, llm: LLM, tool_ids } },
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
