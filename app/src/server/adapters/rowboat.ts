// Rowboat adapter (docs/IMPLEMENTATION_PLAN.md WP12). Rowboat's shareable store is Harbor, its open-source
// Spaces server. Checked against rowboatlabs/rowboat apps/harbor/packages/protocol/src/{api,changeset}.ts
// on 2026-11-22 (protocol v0, which Harbor marks "deliberately unstable").
//
// Each memory item is one Markdown asset in one Space:
//   createAsset  POST /v1/spaces/:spaceId/assets         {path, newContent, actingMode, agentName}
//   readAsset    GET  /v1/spaces/:spaceId/assets/:assetId
//   deleteAsset  POST /v1/spaces/:spaceId/assets/delete  {assetId, baseVersion, actingMode, agentName}
// Auth is a bearer token for a Harbor member or agent.
//
// Not exercised against a live Harbor: the team has no Rowboat org or server yet. Not recorded or
// replayed, because these calls write; tests inject `fetch`.

export interface RowboatOptions {
  baseUrl: string;
  token: string;
  spaceId: string;
  agentName?: string;
  fetch?: typeof fetch;
}

export interface RowboatNoteRef {
  assetId: string;
  path: string;
  version: number;
}

export class RowboatError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    detail: string,
  ) {
    super(`Rowboat ${endpoint} failed with HTTP ${status}: ${detail}`);
    this.name = "RowboatError";
  }
}

export function createRowboatAdapter(options: RowboatOptions) {
  const base = `${options.baseUrl.replace(/\/+$/, "")}/v1/spaces/${encodeURIComponent(options.spaceId)}`;
  const doFetch = options.fetch ?? globalThis.fetch;
  const attribution = { actingMode: "agent" as const, agentName: options.agentName ?? "Atlas" };

  async function call<T>(method: "GET" | "POST", suffix: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${base}${suffix}`, {
      method,
      headers: { authorization: `Bearer ${options.token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new RowboatError(suffix || "/", res.status, text.slice(0, 300));
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    async createNote(path: string, markdown: string, reason?: string): Promise<RowboatNoteRef> {
      const result = await call<{ asset: { id: string; path: string; version: number } }>("POST", "/assets", {
        path,
        newContent: markdown,
        ...(reason ? { reason } : {}),
        ...attribution,
      });
      return { assetId: result.asset.id, path: result.asset.path, version: result.asset.version };
    },

    async readNote(assetId: string): Promise<{ content: string; version: number; path: string }> {
      const result = await call<{ content: string; version: number; path: string }>("GET", `/assets/${encodeURIComponent(assetId)}`);
      return { content: result.content, version: result.version, path: result.path };
    },

    /** Deletes at the current version; retries once if someone edited it in between (StaleAsset). */
    async deleteNote(assetId: string, reason = "Deleted from Atlas memory"): Promise<void> {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { version } = await this.readNote(assetId);
        const result = await call<{ outcome: string }>("POST", "/assets/delete", { assetId, baseVersion: version, reason, ...attribution });
        if (result.outcome === "deleted") return;
      }
      throw new RowboatError("/assets/delete", 409, "note kept changing while deleting");
    },
  };
}

export type RowboatAdapter = ReturnType<typeof createRowboatAdapter>;

export function rowboatFromEnv(env: NodeJS.ProcessEnv = process.env): RowboatAdapter | undefined {
  const baseUrl = env.ROWBOAT_BASE_URL?.trim();
  const token = env.ROWBOAT_TOKEN?.trim();
  const spaceId = env.ROWBOAT_SPACE_ID?.trim();
  if (!baseUrl || !token || !spaceId) return undefined;
  return createRowboatAdapter({ baseUrl, token, spaceId });
}
