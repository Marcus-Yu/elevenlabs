import { z } from "zod";
import {
  calibrationCriteria, calibrationProfiles, startCalibrationInput, submitCalibrationInput,
  type CalibrationPanel,
} from "../../../features/thread/calibration-contracts";
import { defineHandler, type HandlerMap, type HandlerResult } from "../types";

const demoPanel: CalibrationPanel["profiles"] = [
  { id: "cal-1", label: "Controls specialist", yearsExperience: 9, skills: ["C++", "ROS 2", "Motion control"], workStyle: "Hands-on integration", synthetic: true },
  { id: "cal-2", label: "Perception engineer", yearsExperience: 6, skills: ["Python", "OpenCV", "Computer vision"], workStyle: "Experiment-driven", synthetic: true },
  { id: "cal-3", label: "Systems generalist", yearsExperience: 11, skills: ["C++", "ROS 2", "Systems integration"], workStyle: "Cross-functional delivery", synthetic: true },
  { id: "cal-4", label: "Early-career developer", yearsExperience: 2, skills: ["Python", "ROS 2"], workStyle: "Pairs with senior engineers", synthetic: true },
  { id: "cal-5", label: "Automation engineer", yearsExperience: 7, skills: ["PLC", "Safety systems"], workStyle: "Production reliability", synthetic: true },
  { id: "cal-6", label: "Robotics researcher", yearsExperience: 4, skills: ["Python", "SLAM", "Simulation"], workStyle: "Research and prototyping", synthetic: true },
];

async function simulationRequest(baseUrl: string, path: string, input: unknown) {
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(35_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch {
    throw new Error("Calibration simulation is unavailable.");
  }
}

export function createCalibrationHandlers(env: NodeJS.ProcessEnv): HandlerMap {
  const baseUrl = env.SIM_URL || "http://localhost:8000";
  const mode = env.SIM_CALIBRATION_MODE;
  if (mode && mode !== "live" && mode !== "replay") throw new Error("SIM_CALIBRATION_MODE must be live or replay.");
  const live = mode ? mode === "live" : env.ADAPTER_MODE === "live" || env.ADAPTER_MODE === "record";
  return {
    "calibration.profiles": defineHandler({
      payload: startCalibrationInput,
      async run({ goalSummary }): Promise<HandlerResult<CalibrationPanel>> {
        if (!live) {
          if (!/\brobotic(?:s)?\b/i.test(goalSummary)) {
            throw new Error("Replay calibration is available for the robotics demo only.");
          }
          return { data: { profiles: demoPanel, source: "replay" } satisfies CalibrationPanel };
        }
        const response = z.object({ profiles: calibrationProfiles }).safeParse(
          await simulationRequest(baseUrl, "/calibrate/profiles", { need: goalSummary }),
        );
        if (!response.success) throw new Error("Calibration returned an invalid panel.");
        return { data: { profiles: response.data.profiles, source: "live" } satisfies CalibrationPanel };
      },
    }),
    "calibration.criteria": defineHandler({
      payload: submitCalibrationInput,
      async run(input) {
        const response = calibrationCriteria.safeParse(await simulationRequest(baseUrl, "/calibrate/criteria", input));
        if (!response.success) throw new Error("Calibration returned invalid criteria.");
        const { minimumExperience, mustHaveSkills, tradeOffs } = response.data;
        const validIds = new Set(input.reactions.map(({ id }) => id));
        const criteria = [minimumExperience, ...mustHaveSkills, ...tradeOffs];
        if (criteria.some((item) => item?.reactionIds.some((id) => !validIds.has(id)))) {
          throw new Error("Calibration returned an invalid evidence reference.");
        }
        return { data: response.data };
      },
    }),
  };
}
