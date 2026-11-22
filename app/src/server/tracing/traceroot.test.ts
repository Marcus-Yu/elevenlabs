import { describe, expect, it } from "vitest";
import { currentTraceId, toSpanAttributes, traceRun } from "./traceroot";

describe("traceroot helpers", () => {
  it("flattens attributes and drops empty values", () => {
    expect(toSpanAttributes({ "atlas.fact_ids": ["f1", "f2"], "atlas.score": 0.8, "atlas.goal_id": null, ok: true })).toEqual({
      "atlas.fact_ids": "f1,f2",
      "atlas.score": 0.8,
      ok: true,
    });
  });

  it("runs the function untraced when TraceRoot is not initialised", async () => {
    expect(await traceRun("pipeline", { "atlas.goal_id": "g1" }, async () => 42)).toBe(42);
    expect(currentTraceId()).toBeNull();
  });
});
