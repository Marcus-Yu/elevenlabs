// Links a Google account to Atlas's Alter agents (WP7). Runs on the Mac, from app/:
//
//   npx -y tsx scripts/alter-connect.ts                 # both agents: atlas-prepare, then atlas-act
//   npx -y tsx scripts/alter-connect.ts atlas-prepare   # one agent
//   npx -y tsx scripts/alter-connect.ts --unbound       # app-scoped grant, no agent binding
//
// Reads ALTER_API_KEY (alter_rk_...) and, optionally, ALTER_AGENT_ID_PREPARE / ALTER_AGENT_ID_ACT
// (UUIDs; defaults to the managed-agent names) from app/.env.server. Opens the Alter sign-in page
// (a session bound to an agent needs the consenting user's token), then one Google consent page per
// agent with scopeConstraint gmail.send, and prints each resulting grant id. Never prints keys or
// tokens. Put the printed grant id in ALTER_GOOGLE_GRANT_ID.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { App } from "@alter-ai/alter-sdk";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const AGENTS = [
  { name: "atlas-prepare", idEnv: "ALTER_AGENT_ID_PREPARE" },
  { name: "atlas-act", idEnv: "ALTER_AGENT_ID_ACT" },
] as const;
const TIMEOUT_MS = 5 * 60_000;

function openInBrowser(url: string, label: string): void {
  console.log(`\n${label}:\n  ${url}`);
  execFile("open", [url], (error) => {
    if (error) console.log("  (could not open a browser; open the URL above by hand)");
  });
}

async function main(): Promise<void> {
  const envFile = path.resolve(".env.server");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const apiKey = process.env.ALTER_API_KEY?.trim();
  if (!apiKey) throw new Error("ALTER_API_KEY is not set in app/.env.server (see docs/ALTER_SETUP.md)");
  if (!apiKey.startsWith("alter_rk_")) console.log("warning: ALTER_API_KEY does not start with alter_rk_ (expected the app key)");

  const args = process.argv.slice(2);
  const unbound = args.includes("--unbound");
  const wanted = args.filter((arg) => !arg.startsWith("--"));
  const agents = wanted.length > 0 ? AGENTS.filter((agent) => wanted.includes(agent.name)) : AGENTS;

  const app = new App({ apiKey });
  try {
    let userToken: string | undefined;
    if (!unbound) {
      const auth = await app.createAuthSession();
      openInBrowser(auth.authUrl, "Sign in to Alter as the consenting user");
      userToken = (await app.pollAuthSession(auth.sessionToken, { timeoutMs: TIMEOUT_MS })).userToken;
      console.log("  signed in.");
    }

    for (const agent of unbound ? [null] : agents) {
      const agentRef = agent ? process.env[agent.idEnv]?.trim() || agent.name : undefined;
      const session = await app.createConnectSession({
        allowedProviders: ["google"],
        scopeConstraint: [GMAIL_SEND_SCOPE],
        ...(agentRef && userToken ? { agent: agentRef, userToken } : {}),
      });
      for (const warning of session.scopeConstraintWarnings) console.log(`  alter warning: ${warning}`);
      openInBrowser(session.connectUrl, `Connect Google for ${agent ? agent.name : "the app (unbound)"}`);
      const results = await app.pollConnectSession(session.sessionToken, { timeoutMs: TIMEOUT_MS });
      for (const result of results) {
        console.log(`  ${agent ? agent.name : "app"}: grant id ${result.grantId} (provider ${result.providerId}, scopes ${result.scopes.join(" ")})`);
      }
    }
    console.log("\nSet ALTER_GOOGLE_GRANT_ID in app/.env.server to the grant id above (see docs/ALTER_SETUP.md).");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  // SDK errors carry messages and codes, not keys; print the class and message only.
  const name = error instanceof Error ? error.constructor.name : "Error";
  console.error(`alter-connect failed: ${name}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
