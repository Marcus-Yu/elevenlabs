// Deploys watcher-box/ to Maritime as one agent box per goal (WP10 step 4).
//
//   cd app
//   MARITIME_API_KEY=mk_... npx -y tsx scripts/deploy-watcher.ts deploy --goal <goalId> [--atlas-url https://...] [--token <watcherToken>]
//   MARITIME_API_KEY=mk_... npx -y tsx scripts/deploy-watcher.ts redeploy <agentId>   (new code, keeps /data)
//   MARITIME_API_KEY=mk_... npx -y tsx scripts/deploy-watcher.ts chat <agentId> status
//   MARITIME_API_KEY=mk_... npx -y tsx scripts/deploy-watcher.ts env <agentId> --atlas-url https://... --token <watcherToken>
//   MARITIME_API_KEY=mk_... npx -y tsx scripts/deploy-watcher.ts delete <agentId>
//
// Without --atlas-url and --token the box runs and answers /health, but replies "Not configured" to a tick.
// The token is the goal-scoped watcher token; Atlas stores only its hash on Goal.watcherTokenHash.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";
import { createMaritimeAdapter, type WatcherEnv } from "../src/server/adapters/maritime";

const BOX_FILES = ["Dockerfile", "package.json", "server.mjs", "watcher.mjs", ".dockerignore"];
const BOX_DIR = path.resolve(import.meta.dirname, "..", "..", "watcher-box");

const apiKey = process.env.MARITIME_API_KEY;
if (!apiKey) {
  console.error("MARITIME_API_KEY is required.");
  process.exit(1);
}
const maritime = createMaritimeAdapter({ apiKey });
const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

if (command === "deploy") {
  const goalId = flag("goal");
  if (!goalId) throw new Error("--goal <goalId> is required");
  const zip = await zipFiles(BOX_DIR, BOX_FILES);
  const { uploadS3Key } = await maritime.uploadZip(new Blob([new Uint8Array(zip)], { type: "application/zip" }));
  console.log(`uploaded watcher-box (${zip.length} bytes) as ${uploadS3Key}`);
  const env: WatcherEnv = { ATLAS_URL: flag("atlas-url") ?? "", WATCHER_GOAL_ID: goalId, WATCHER_TOKEN: flag("token") ?? "" };
  const agent = await maritime.createWatcher({ goalId, uploadS3Key, env });
  console.log(JSON.stringify({ id: agent.id, name: agent.name, externalId: agent.externalId, status: agent.status }));
} else if (command === "redeploy") {
  const zip = await zipFiles(BOX_DIR, BOX_FILES);
  const { uploadS3Key } = await maritime.uploadZip(new Blob([new Uint8Array(zip)], { type: "application/zip" }));
  console.log(`uploaded watcher-box (${zip.length} bytes) as ${uploadS3Key}`);
  console.log(JSON.stringify(await maritime.redeploy(rest[0]!, uploadS3Key)));
} else if (command === "chat") {
  console.log(JSON.stringify(await maritime.chat(rest[0]!, rest[1] ?? "status")));
} else if (command === "status") {
  const agent = await maritime.getAgent(rest[0]!);
  console.log(JSON.stringify({ id: agent.id, name: agent.name, status: agent.status }));
} else if (command === "env") {
  await maritime.setEnv(rest[0]!, { ATLAS_URL: flag("atlas-url"), WATCHER_TOKEN: flag("token"), WATCHER_GOAL_ID: flag("goal") });
  console.log("env updated; restart or wait for the next wake for it to apply");
} else if (command === "delete") {
  await maritime.deleteWatcher(rest[0]!);
  console.log(`deleted ${rest[0]}`);
} else {
  console.error("usage: redeploy <agentId> | deploy --goal <id> [--atlas-url URL] [--token T] | status <agentId> | chat <agentId> <message> | env <agentId> ... | delete <agentId>");
  process.exit(1);
}

/** Minimal ZIP writer (stored, no compression) so this works the same on Windows and macOS. */
async function zipFiles(dir: string, names: string[]): Promise<Buffer> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const data = await readFile(path.join(dir, name));
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
