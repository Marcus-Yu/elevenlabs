import {
  ScoreRequestSchema,
  ScoreResponseSchema,
  type ScoreRequest,
  type ScoreResponse,
} from "../../shared/contracts/sim";
import type { AdapterMode, HttpClient } from "./http";

interface SimulationResult {
  score: ScoreResponse;
  adapterMode: AdapterMode;
}

function scoreUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash
  ) {
    throw new Error("SIM_URL must be an HTTP(S) service URL without credentials or URL parameters.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/score`;
  return url.toString();
}

function validatePanel(request: ScoreRequest, score: ScoreResponse): void {
  const personas = new Set(request.personas.map(({ id }) => id));
  const segments = new Set(request.segments.map(({ index }) => index));
  const seen = new Set<string>();
  for (const row of score.scores) {
    const key = JSON.stringify([row.personaId, row.segmentIndex]);
    if (!personas.has(row.personaId) || !segments.has(row.segmentIndex) || seen.has(key)) {
      throw new Error("Simulation service returned an invalid score matrix.");
    }
    seen.add(key);
  }
  if (seen.size !== personas.size * segments.size) {
    throw new Error("Simulation service returned an incomplete score matrix.");
  }
  if (request.tier === "measured" && (score.engine !== "edsl" || !score.summary)) {
    throw new Error("Measured simulation requires an EDSL summary.");
  }
}

/** Construct in a gateway handler with the server's private SIM_URL. */
export function createSimAdapter(client: HttpClient, baseUrl: string) {
  const url = scoreUrl(baseUrl);
  return {
    async score(input: ScoreRequest): Promise<SimulationResult> {
      const body = ScoreRequestSchema.parse(input);
      if (!body.personas.length || !body.segments.length) {
        throw new Error("A simulation requires a panel and at least one pitch segment.");
      }
      if (
        new Set(body.personas.map(({ id }) => id)).size !== body.personas.length ||
        new Set(body.segments.map(({ index }) => index)).size !== body.segments.length
      ) {
        throw new Error("Simulation persona IDs and segment indices must be unique.");
      }
      // The generic recorder stores JSON bodies. Room transcripts and draft pitches
      // can contain private text and must stay out of checked-in fixture files.
      if (client.mode === "record") {
        throw new Error("Simulation scoring supports live and replay modes.");
      }
      const response = await client.request({ provider: "sim", method: "POST", url, body });
      if (!response.ok) {
        throw new Error(`Simulation service returned HTTP ${response.status}.`);
      }
      const parsed = ScoreResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new Error("Simulation service returned a response outside the scoring contract.");
      }
      validatePanel(body, parsed.data);
      return { score: parsed.data, adapterMode: response.mode };
    },
  };
}
