// Maritime adapter (docs/IMPLEMENTATION_PLAN.md WP10). Checked against https://api.maritime.sh/openapi.json
// and maritime.sh/docs/frameworks/custom on 2026-11-22.
//
// Not recorded or replayed: these calls provision real machines, so tests inject `fetch`.
// Auth is a bearer mk_ key. One agent box per goal, keyed by externalId = goal id.

export const MARITIME_BASE_URL = "https://api.maritime.sh";

export interface MaritimeAgent {
  id: string;
  name: string;
  externalId?: string | null;
  status?: string;
}

export interface WatcherEnv {
  ATLAS_URL: string;
  WATCHER_GOAL_ID: string;
  WATCHER_TOKEN: string;
  WATCHER_CRON?: string;
  WATCHER_MAX_NEW?: string;
}

export interface MaritimeAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class MaritimeError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    detail: string,
  ) {
    super(`Maritime ${endpoint} failed with HTTP ${status}: ${detail}`);
    this.name = "MaritimeError";
  }
}

/** Env keys that must never be sent to a watcher box: it holds only its goal token. */
const FORBIDDEN_ENV = /^(ANTHROPIC|FIBER|PLOID|ELEVENLABS|ALTER|TRACEROOT|MARITIME|ROWBOAT|DATABASE)_/;
const SECRET_ENV = new Set(["WATCHER_TOKEN"]);

export function createMaritimeAdapter(options: MaritimeAdapterOptions) {
  const baseUrl = options.baseUrl ?? MARITIME_BASE_URL;
  const doFetch = options.fetch ?? globalThis.fetch;
  const auth = { authorization: `Bearer ${options.apiKey}` };

  async function call<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${baseUrl}${endpoint}`, {
      method,
      headers: { ...auth, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (!res.ok) throw new MaritimeError(endpoint, res.status, text.slice(0, 300));
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    /** Uploads a ZIP of watcher-box/ (Dockerfile at its root). Returns the build key for createWatcher. */
    async uploadZip(zip: Blob, filename = "watcher-box.zip"): Promise<{ uploadS3Key: string; raw: unknown }> {
      const form = new FormData();
      form.append("file", zip, filename);
      const res = await doFetch(`${baseUrl}/api/upload/zip`, { method: "POST", headers: auth, body: form, signal: AbortSignal.timeout(120_000) });
      const text = await res.text();
      if (!res.ok) throw new MaritimeError("/api/upload/zip", res.status, text.slice(0, 300));
      const raw = JSON.parse(text) as Record<string, unknown>;
      const key = (raw.s3Key ?? raw.s3_key ?? raw.uploadS3Key ?? raw.key) as string | undefined;
      if (!key) throw new MaritimeError("/api/upload/zip", res.status, `no S3 key in response: ${text.slice(0, 200)}`);
      return { uploadS3Key: key, raw };
    },

    /** Creates the goal's watcher box. Idempotent per goal: returns the existing box if one exists. */
    async createWatcher(input: { goalId: string; uploadS3Key: string; env: WatcherEnv }): Promise<MaritimeAgent> {
      const existing = await this.findWatcher(input.goalId);
      if (existing) return existing;
      return call<MaritimeAgent>("POST", "/api/agents", {
        name: `atlas-watcher-${input.goalId}`.slice(0, 60),
        externalId: watcherExternalId(input.goalId),
        framework: "custom",
        uploadS3Key: input.uploadS3Key,
        memMb: 1024,
        initialEnvVars: watcherEnvVars(input.env),
      });
    },

    /** Rebuilds an existing box from a new ZIP upload; /data is kept. */
    async redeploy(agentId: string, uploadS3Key: string): Promise<{ id?: string; status?: string }> {
      return call("POST", "/api/deploy", { agentId, source: "zip", uploadS3Key });
    },

    async findWatcher(goalId: string): Promise<MaritimeAgent | undefined> {
      const agents = await call<MaritimeAgent[]>("GET", "/api/agents");
      return agents.find((a) => a.externalId === watcherExternalId(goalId));
    },

    async setEnv(agentId: string, env: Partial<WatcherEnv>): Promise<void> {
      for (const { key, value, isSecret } of watcherEnvVars(env)) {
        await call("PUT", `/api/agents/${encodeURIComponent(agentId)}/env/${encodeURIComponent(key)}`, { key, value, isSecret });
      }
    },

    /** Sends a message to the box's POST /chat, e.g. "tick" or "status". */
    async chat(agentId: string, message: string): Promise<unknown> {
      return call("POST", `/api/agents/${encodeURIComponent(agentId)}/chat`, { message });
    },

    async getAgent(agentId: string): Promise<MaritimeAgent> {
      return call<MaritimeAgent>("GET", `/api/agents/${encodeURIComponent(agentId)}`);
    },

    async deleteWatcher(agentId: string): Promise<void> {
      await call("DELETE", `/api/agents/${encodeURIComponent(agentId)}`);
    },
  };
}

export type MaritimeAdapter = ReturnType<typeof createMaritimeAdapter>;

export function watcherExternalId(goalId: string): string {
  return `atlas-goal-${goalId}`;
}

export function watcherEnvVars(env: Partial<WatcherEnv>): { key: string; value: string; isSecret: boolean }[] {
  return Object.entries(env)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")
    .map(([key, value]) => {
      if (FORBIDDEN_ENV.test(key)) throw new Error(`Refusing to send ${key} to a watcher box: it holds only its goal token.`);
      return { key, value, isSecret: SECRET_ENV.has(key) };
    });
}
