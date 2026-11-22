import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Gateway } from "../../server/gateway/engine";
import type { GatewayResult } from "../../shared/contracts/gateway";
import { startCalibrationInput, type CalibrationPanel } from "./calibration-contracts";
import { goalProposal, type GoalProposal } from "./goal-proposal";
import { gatewayDisplay } from "./gateway-result";
import { memoryDraft, memoryPreview } from "./memory-proposal";

export function createChatTools({ userId, execute }: { userId: string; execute: Gateway["execute"] }): ToolSet {
  const readMemory = async (payload: unknown) => {
    try {
      const result = await execute({ actionType: "memory.read", userId, actor: { kind: "agent", id: "thread" }, origin: "thread", tainted: true, payload });
      const display = gatewayDisplay(result);
      if (display.kind !== "allowed") return display;
      if (display.stub || !Array.isArray(display.data)) return { kind: "unavailable" as const, message: "Memory is unavailable." };
      const parsed = z.array(memoryPreview.strip()).safeParse(display.data);
      return parsed.success ? { kind: "allowed" as const, data: parsed.data, stub: false } : { kind: "unavailable" as const, message: "Memory is unavailable." };
    } catch {
      return { kind: "unavailable" as const, message: "Memory is unavailable." };
    }
  };
  return {
    list_hiring_goals: tool({
      description: "Find the signed-in user's active hiring goals and whether each has a researched shortlist.",
      inputSchema: z.object({}).strict(),
      async execute() {
        try { return gatewayDisplay(await execute({ actionType: "thread.list_hiring_goals", userId, actor: { kind: "agent", id: "thread" }, origin: "thread", tainted: true, payload: {} })); }
        catch { return { kind: "unavailable" as const, message: "Hiring goals are unavailable." }; }
      },
    }),
    list_matches: tool({
      description: "List an existing researched hiring shortlist for a goal ID from list_hiring_goals or supplied by the user. Candidate identities remain private.",
      inputSchema: z.object({ goalId: z.string().min(1).max(200) }),
      async execute({ goalId }) {
        try { return gatewayDisplay(await execute({ actionType: "thread.list_matches", userId, goalId, actor: { kind: "agent", id: "thread" }, origin: "thread", tainted: true, payload: {} })); }
        catch { return { kind: "unavailable" as const, message: "The shortlist is unavailable." }; }
      },
    }),
    explain_match: tool({
      description: "Explain a shortlisted match using its goal ID and match ID returned by list_matches. Candidate identities remain private.",
      inputSchema: z.object({ goalId: z.string().min(1).max(200), matchId: z.string().min(1).max(250) }),
      async execute({ goalId, matchId }) {
        try { return gatewayDisplay(await execute({ actionType: "thread.explain_match", userId, goalId, actor: { kind: "agent", id: "thread" }, origin: "thread", tainted: true, payload: { matchId } })); }
        catch { return { kind: "unavailable" as const, message: "The match is unavailable." }; }
      },
    }),
    recall_memory: tool({
      description: "Find the signed-in user's saved memories when needed. Use the returned IDs to identify an item the user asks to forget.",
      inputSchema: z.object({ text: z.string().max(200).optional() }),
      execute: (payload) => readMemory({ ...payload, limit: 20 }),
    }),
    remember: tool({
      description: "Propose a memory for the user to review and confirm. This does not save it.",
      inputSchema: memoryDraft,
      async execute(payload) {
        try {
          const display = gatewayDisplay(await execute({ actionType: "thread.propose_memory", userId, actor: { kind: "agent", id: "thread" }, origin: "thread", tainted: true, payload }));
          if (display.kind !== "allowed") return display;
          const parsed = memoryDraft.safeParse(display.data);
          return !display.stub && parsed.success ? { kind: "memory_proposal" as const, action: "remember" as const, memory: parsed.data } : { kind: "unavailable" as const, message: "Memory proposal unavailable." };
        } catch { return { kind: "unavailable" as const, message: "Memory proposal unavailable." }; }
      },
    }),
    forget: tool({
      description: "Propose deletion of a saved memory for user confirmation. Look up its ID first if needed. This does not delete it.",
      inputSchema: z.object({ id: z.string().min(1).max(200) }),
      async execute({ id }) {
        const result = await readMemory({ limit: 200 });
        if (result.kind !== "allowed") return result;
        const items = z.array(memoryPreview).safeParse(result.data);
        const item = items.success ? items.data.find((entry) => entry.id === id) : undefined;
        return item ? { kind: "memory_proposal" as const, action: "forget" as const, memory: item } : { kind: "unavailable" as const, message: "Memory was not found." };
      },
    }),
    propose_goal: tool({
      description: "Show a draft goal reflecting the user's stated intent. This prepares a proposal for review without creating a goal.",
      inputSchema: goalProposal,
      async execute(payload) {
        try {
          return gatewayDisplay(await execute({
            actionType: "thread.propose_goal",
            userId,
            actor: { kind: "agent", id: "thread" },
            origin: "thread",
            tainted: true,
            payload,
          }) as GatewayResult<GoalProposal>);
        } catch {
          return { kind: "unavailable" as const, message: "The goal proposal is unavailable." };
        }
      },
    }),
    calibrate_profiles: tool({
      description: "Prepare a synthetic calibration panel after the user asks to calibrate a hiring need.",
      inputSchema: startCalibrationInput,
      async execute(payload) {
        try {
          return gatewayDisplay(await execute({
            actionType: "calibration.profiles",
            userId,
            actor: { kind: "agent", id: "thread" },
            origin: "thread",
            tainted: true,
            payload,
          }) as GatewayResult<CalibrationPanel>);
        } catch {
          return { kind: "unavailable" as const, message: "Calibration profiles are unavailable." };
        }
      },
    }),
  };
}
