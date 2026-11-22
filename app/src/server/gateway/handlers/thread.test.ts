import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatTools } from "../../../features/thread/chat-tools";
import { createWorld, request, USER } from "../testing/world";
import { createCalibrationHandlers } from "./calibration";
import { createGoalProposalHandler } from "./threadChat";

const need = "Find a robotics engineer for private project Cobalt.";
const reason = "Must have ROS 2 for private project Cobalt.";

afterEach(() => vi.unstubAllGlobals());

describe("thread gateway handlers", () => {
  it("validates proposals through the gateway and leaves them available for review", async () => {
    const { gateway, store } = createWorld({ handlers: { "thread.propose_goal": createGoalProposalHandler() } });
    const tools = createChatTools({ userId: USER, execute: gateway.execute });
    const proposal = { kind: "hiring", statement: need };
    const result = await tools.propose_goal!.execute!(proposal, { toolCallId: "t1", messages: [], context: {} });
    expect(result).toMatchObject({ kind: "allowed", data: proposal });
    expect(store.goals.size).toBe(1);
    expect(store.logs.at(-1)).toMatchObject({ actionType: "thread.propose_goal", inputSummary: null });
  });

  it("redacts private chat content for denied and allowed calls", async () => {
    const { gateway, store } = createWorld();
    const send = (content: string) => gateway.execute(request("thread.chat", { messages: [{ role: "user", content }] }));
    expect((await send("We can spend one hundred eighty thousand dollars.")).decision).toMatchObject({ outcome: "deny", ruleId: "provider_minimum" });
    expect((await send(need)).decision.outcome).toBe("allow");
    expect(store.logs.map(({ inputSummary }) => inputSummary)).toEqual([null, null]);
  });

  it("labels the replay panel, preserves evidence IDs, and rejects unknown evidence without logging user text", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ minimumExperience: null, mustHaveSkills: [{ skill: "ROS 2", reactionIds: ["r1"] }], tradeOffs: [] }))
      .mockResolvedValueOnce(Response.json({ minimumExperience: null, mustHaveSkills: [{ skill: "ROS 2", reactionIds: ["forged"] }], tradeOffs: [] }));
    vi.stubGlobal("fetch", fetch);
    const { gateway, store } = createWorld({ handlers: createCalibrationHandlers({ ADAPTER_MODE: "replay" }) });
    const panel = await gateway.execute(request("calibration.profiles", { goalSummary: need }));
    expect(fetch).not.toHaveBeenCalled();
    expect(panel.data).toMatchObject({ source: "replay", profiles: expect.arrayContaining([expect.objectContaining({ synthetic: true })]) });
    const { profiles } = panel.data as { profiles: { id: string }[] };
    const input = { profiles, reactions: [{ id: "r1", profileId: profiles[0]!.id, decision: "pick", reason }] };
    const result = await gateway.execute(request("calibration.criteria", input));
    expect(result.data).toMatchObject({ mustHaveSkills: [{ skill: "ROS 2", reactionIds: ["r1"] }] });
    expect(fetch).toHaveBeenCalledWith(new URL("http://localhost:8000/calibrate/criteria"), expect.objectContaining({ body: JSON.stringify(input) }));
    await expect(gateway.execute(request("calibration.criteria", input))).rejects.toThrow("invalid evidence reference");
    expect(store.logs.map(({ inputSummary }) => inputSummary)).toEqual([null, null, null]);
    expect(store.logs.at(-1)?.reason).toBe("handler_error: request failed");
  });
});
