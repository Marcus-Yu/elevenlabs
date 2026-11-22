import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient, FixtureMissError, resolveAdapterMode, type HttpRequest } from "./http";

const SECRET = "sk-test-0123456789abcdef";

const companySearch: HttpRequest = {
  provider: "fiber",
  method: "POST",
  url: `https://api.example.test/v1/company-search?token=${SECRET}`,
  headers: { authorization: `Bearer ${SECRET}` },
  body: { apiKey: SECRET, searchParams: { keywords: ["robotics"] } },
};

let fixturesDir: string;

beforeEach(async () => {
  fixturesDir = await mkdtemp(path.join(tmpdir(), "atlas-fixtures-"));
});

afterEach(async () => {
  await rm(fixturesDir, { recursive: true, force: true });
});

describe("http adapter", () => {
  it("defaults to replay mode", () => {
    expect(resolveAdapterMode(undefined)).toBe("replay");
    expect(() => resolveAdapterMode("yolo")).toThrow(/ADAPTER_MODE must be one of/);
  });

  it("throws a clear FixtureMissError on a replay miss without touching the network", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createHttpClient({ mode: "replay", fixturesDir, fetch });

    const attempt = client.request(companySearch);

    await expect(attempt).rejects.toBeInstanceOf(FixtureMissError);
    await expect(attempt).rejects.toThrow(
      /Replay miss for fiber POST https:\/\/api\.example\.test\/v1\/company-search.*no fixture at .*fiber\/[0-9a-f]{16}\.json.*ADAPTER_MODE=record/,
    );
    await expect(attempt).rejects.not.toThrow(SECRET);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records a fixture with secrets stripped and replays it offline", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ companies: [{ domain: "example.com" }] }),
    );
    const recorder = createHttpClient({ mode: "record", fixturesDir, fetch, secrets: [SECRET] });

    const recorded = await recorder.request(companySearch);
    expect(fetch).toHaveBeenCalledOnce();
    expect(recorded.fixturePath).toBeDefined();

    const onDisk = await readFile(recorded.fixturePath!, "utf8");
    expect(onDisk).not.toContain(SECRET);
    expect(JSON.parse(onDisk)).toMatchObject({
      version: 1,
      provider: "fiber",
      request: { method: "POST", body: { apiKey: "[REDACTED]" } },
      response: { status: 200, body: { companies: [{ domain: "example.com" }] } },
    });

    const offlineFetch = vi.fn<typeof globalThis.fetch>();
    const replayer = createHttpClient({ mode: "replay", fixturesDir, fetch: offlineFetch });
    const replayed = await replayer.request({ ...companySearch, body: { ...(companySearch.body as object), apiKey: "a-different-key" } });

    expect(replayed).toMatchObject({ status: 200, ok: true, mode: "replay", body: recorded.body });
    expect(offlineFetch).not.toHaveBeenCalled();
  });
});
