import { describe, expect, it, vi } from "vitest";
import type { Persona, ScoreResponse } from "../../shared/contracts/sim";
import { runPitchWorkflow, type PitchWorkflowPorts } from "./pitch-workflow";

const persona: Persona = {
  id: "p1", segment: "ops", label: "Operations lead", role: "Operations lead",
  companyDomain: "company.example", traits: {}, sources: [],
};
const result: ScoreResponse = {
  engine: "edsl", latencyMs: 25,
  scores: [{ personaId: "p1", segmentIndex: 0, interest: 4 }, { personaId: "p1", segmentIndex: 1, interest: 3 }],
  summary: { meanInterest: 3.5, spread: 0, meetingRate: 0, topObjections: [] },
};
const input = { goalId: "g1", text: "First sentence. Second sentence.", parentRunId: "previous" };

function createPorts(): PitchWorkflowPorts {
  return {
    findPanel: vi.fn().mockResolvedValue({ id: "panel-1", personas: [persona] }),
    score: vi.fn().mockResolvedValue(result),
    save: vi.fn().mockResolvedValue("saved-run"),
  };
}

describe("pitch workflow", () => {
  it("resolves the parent panel, scores complete sentences, and saves a linked run", async () => {
    const ports = createPorts();
    const output = await runPitchWorkflow("u1", input, ports);
    const sentences = [{ index: 0, text: "First sentence." }, { index: 1, text: "Second sentence." }];
    expect(ports.findPanel).toHaveBeenCalledWith("u1", "g1", "previous");
    expect(ports.score).toHaveBeenCalledWith("u1", "g1", { personas: [persona], segments: sentences, tier: "measured" });
    expect(ports.save).toHaveBeenCalledWith({
      userId: "u1", goalId: "g1", parentRunId: "previous", panelId: "panel-1",
      text: "First sentence. Second sentence.", sentences, response: result,
    });
    expect(output).toEqual({ runId: "saved-run", personas: [persona], sentences, response: result });
  });

  it("stops before scoring when the user has no authorized panel", async () => {
    const ports = createPorts();
    ports.findPanel = vi.fn().mockResolvedValue(null);
    await expect(runPitchWorkflow("u1", input, ports)).rejects.toThrow("owned pitch panel");
    expect(ports.score).not.toHaveBeenCalled();
    expect(ports.save).not.toHaveBeenCalled();
  });

  it("does not save an incomplete score matrix", async () => {
    const ports = createPorts();
    ports.score = vi.fn().mockResolvedValue({ ...result, scores: result.scores.slice(0, 1) });
    await expect(runPitchWorkflow("u1", input, ports)).rejects.toThrow("Incomplete");
    expect(ports.save).not.toHaveBeenCalled();
  });
});
