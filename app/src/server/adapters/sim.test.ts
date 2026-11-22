import { describe, expect, it, vi } from "vitest";
import type { ScoreRequest, ScoreResponse } from "../../shared/contracts/sim";
import type { HttpClient, HttpResponse } from "./http";
import { createSimAdapter } from "./sim";

const request: ScoreRequest = {
  tier: "live",
  personas: [{
    id: "p1", label: "Buyer", role: "Operations lead", segment: "operations",
    companyDomain: "example.com", traits: {}, sources: [],
  }],
  segments: [{ index: 2, text: "Synthetic pitch." }],
};
const score: ScoreResponse = {
  engine: "edsl", latencyMs: 20, scores: [{ personaId: "p1", segmentIndex: 2, interest: 5 }],
};

function stub(body: unknown = score, status = 200, mode: HttpClient["mode"] = "replay") {
  const reply = vi.fn(async (input) => {
    void input;
    return { body, status, ok: status >= 200 && status < 300, mode };
  });
  const client: HttpClient = {
    mode,
    request: async <T>(input: Parameters<HttpClient["request"]>[0]) =>
      await reply(input) as HttpResponse<T>,
  };
  return { client, reply };
}

describe("simulation adapter", () => {
  it("posts to the configured private score endpoint and preserves replay metadata", async () => {
    const { client, reply } = stub();
    const result = await createSimAdapter(client, "http://sim:8000/api/").score(request);
    expect(reply).toHaveBeenCalledWith({
      provider: "sim", method: "POST", url: "http://sim:8000/api/score", body: request,
    });
    expect(result).toEqual({ score, adapterMode: "replay" });
  });

  it("rejects an invalid or incomplete score matrix", async () => {
    const duplicate = { ...score, scores: [...score.scores, ...score.scores] };
    const missing = { ...score, scores: [] };
    const invalid = { ...score, scores: [{ ...score.scores[0], interest: 10 }] };
    for (const result of [duplicate, missing, invalid]) {
      const { client } = stub(result);
      await expect(createSimAdapter(client, "http://sim").score(request)).rejects.toThrow();
    }
  });

  it("does not return a measured score without an EDSL summary", async () => {
    const { client } = stub();
    await expect(createSimAdapter(client, "http://sim").score({ ...request, tier: "measured" }))
      .rejects.toThrow("EDSL summary");
  });

  it("keeps failure details out of the adapter error and prevents recording pitch text", async () => {
    const failed = stub("internal details", 502);
    await expect(createSimAdapter(failed.client, "http://sim").score(request))
      .rejects.toThrow("Simulation service returned HTTP 502.");
    const recorder = stub(score, 200, "record");
    await expect(createSimAdapter(recorder.client, "http://sim").score(request)).rejects.toThrow();
    expect(recorder.reply).not.toHaveBeenCalled();
  });
});
