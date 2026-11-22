import { tool, type ToolSet } from "ai";
import type { Gateway } from "../../server/gateway/engine";
import type { GatewayResult } from "../../shared/contracts/gateway";
import { startCalibrationInput, type CalibrationPanel } from "./calibration-contracts";
import { goalProposal, type GoalProposal } from "./goal-proposal";
import { gatewayDisplay } from "./gateway-result";

export function createChatTools({ userId, execute }: { userId: string; execute: Gateway["execute"] }): ToolSet {
  return {
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
