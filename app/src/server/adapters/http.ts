import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Fetch wrapper with record/replay for provider adapters (docs/IMPLEMENTATION_PLAN.md WP0 step 6).
//
//   live    calls the provider, writes nothing.
//   record  calls the provider and writes fixtures/<provider>/<hash>.json for 2xx responses.
//   replay  (default) reads the fixture and never touches the network; a miss throws FixtureMissError.
//
// The hash covers the method, URL and JSON body after secrets are redacted, so API keys never
// change the fixture name. Request headers are never written. Make requests deterministic
// (no timestamps or random ids in bodies) or replay will miss.

export const ADAPTER_MODES = ["live", "record", "replay"] as const;
export type AdapterMode = (typeof ADAPTER_MODES)[number];

export const FIXTURE_VERSION = 1;
const REDACTED = "[REDACTED]";
const SECRET_FIELD = /api[-_]?key|secret|token|password|authorization|credential/i;
const SECRET_ENV_NAME = /(_KEY|_TOKEN|_SECRET|PASSWORD)$/;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequest {
  /** Fixture folder name, e.g. "fiber". */
  provider: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  /** Sent as JSON when present. */
  body?: unknown;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
  mode: AdapterMode;
  fixturePath?: string;
}

/** On-disk format of fixtures/<provider>/<hash>.json. */
export interface Fixture {
  version: typeof FIXTURE_VERSION;
  provider: string;
  hash: string;
  recordedAt: string;
  request: { method: HttpMethod; url: string; body?: unknown };
  response: { status: number; contentType: string | null; body: unknown };
}

export class FixtureMissError extends Error {
  constructor(
    readonly provider: string,
    readonly hash: string,
    readonly fixturePath: string,
    requestLine: string,
  ) {
    super(
      `Replay miss for ${provider} ${requestLine}: no fixture at ${fixturePath} (ADAPTER_MODE=replay). ` +
        `Record it once with ADAPTER_MODE=record (this spends real provider credits), ` +
        `or check that the request matches a recorded one.`,
    );
    this.name = "FixtureMissError";
  }
}

export interface HttpClientOptions {
  /** Defaults to ADAPTER_MODE, then "replay". */
  mode?: AdapterMode;
  /** Defaults to FIXTURES_DIR, then <repo root>/fixtures. */
  fixturesDir?: string;
  fetch?: typeof fetch;
  /** Extra secret values to scrub from recorded fixtures. Env values named *_KEY, *_TOKEN, *_SECRET are always scrubbed. */
  secrets?: string[];
}

export interface HttpClient {
  readonly mode: AdapterMode;
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>;
}

export function resolveAdapterMode(value: string | undefined = process.env.ADAPTER_MODE): AdapterMode {
  if (value === undefined || value === "") return "replay";
  if ((ADAPTER_MODES as readonly string[]).includes(value)) return value as AdapterMode;
  throw new Error(`ADAPTER_MODE must be one of ${ADAPTER_MODES.join(", ")} (got "${value}").`);
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const mode = options.mode ?? resolveAdapterMode();
  const fixturesDir = options.fixturesDir ?? defaultFixturesDir();
  const doFetch = options.fetch ?? globalThis.fetch;
  const secrets = [...secretValuesFromEnv(), ...(options.secrets ?? [])];

  async function request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    const recordable = { method: req.method, url: redactUrl(req.url), body: redactFields(req.body) };
    const hash = fixtureHash(recordable);
    const fixturePath = path.join(fixturesDir, req.provider, `${hash}.json`);

    if (mode === "replay") {
      const fixture = await readFixture(fixturePath);
      if (!fixture) {
        throw new FixtureMissError(req.provider, hash, fixturePath, `${req.method} ${recordable.url}`);
      }
      const { status, body } = fixture.response;
      return { status, ok: isOk(status), body: body as T, mode, fixturePath };
    }

    const response = await doFetch(req.url, {
      method: req.method,
      headers: {
        ...(req.body !== undefined ? { "content-type": "application/json" } : {}),
        ...req.headers,
      },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    });
    const contentType = response.headers.get("content-type");
    const body = parseBody(await response.text(), contentType);

    if (mode === "record" && response.ok) {
      const fixture: Fixture = {
        version: FIXTURE_VERSION,
        provider: req.provider,
        hash,
        recordedAt: new Date().toISOString(),
        request: recordable,
        response: { status: response.status, contentType, body },
      };
      await mkdir(path.dirname(fixturePath), { recursive: true });
      await writeFile(fixturePath, scrubSecrets(JSON.stringify(fixture, null, 2), secrets) + "\n");
      return { status: response.status, ok: true, body: body as T, mode, fixturePath };
    }

    return { status: response.status, ok: response.ok, body: body as T, mode };
  }

  return { mode, request };
}

export function fixtureHash(recordable: { method: string; url: string; body?: unknown }): string {
  return createHash("sha256").update(canonicalJson(recordable)).digest("hex").slice(0, 16);
}

async function readFixture(fixturePath: string): Promise<Fixture | null> {
  try {
    return JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function parseBody(text: string, contentType: string | null): unknown {
  if (contentType?.includes("json") && text !== "") {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function redactUrl(url: string): string {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    if (SECRET_FIELD.test(key)) parsed.searchParams.set(key, REDACTED);
  }
  return parsed.toString();
}

function redactFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactFields);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, SECRET_FIELD.test(key) ? REDACTED : redactFields(inner)]),
    );
  }
  return value;
}

function scrubSecrets(text: string, secrets: string[]): string {
  return secrets.reduce((out, secret) => out.split(secret).join(REDACTED), text);
}

function secretValuesFromEnv(): string[] {
  return Object.entries(process.env)
    .filter(([name, value]) => SECRET_ENV_NAME.test(name) && value !== undefined && value.length >= 8)
    .map(([, value]) => value as string);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** FIXTURES_DIR, else the fixtures/ folder next to the Wasp project root (the folder holding .wasproot). */
function defaultFixturesDir(): string {
  if (process.env.FIXTURES_DIR) return path.resolve(process.env.FIXTURES_DIR);
  let dir = process.cwd();
  while (true) {
    if (existsSync(path.join(dir, ".wasproot"))) return path.join(path.dirname(dir), "fixtures");
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve("fixtures");
    dir = parent;
  }
}
