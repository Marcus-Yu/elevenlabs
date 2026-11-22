import { HttpError } from "wasp/server";
import type { StartThreadCalibration, SubmitThreadCalibration } from "wasp/server/operations";
import { z } from "zod";
import { gateway } from "../../server/gateway";
import type { GatewayResult } from "../../shared/contracts/gateway";
import {
  startCalibrationInput, submitCalibrationInput, type CalibrationCriteria, type CalibrationPanel,
} from "./calibration-contracts";
import { gatewayDisplay, type GatewayDisplay } from "./gateway-result";

export const startThreadCalibration: StartThreadCalibration<z.input<typeof startCalibrationInput>, GatewayDisplay<CalibrationPanel>> =
  async (input, context) => {
    if (!context.user) throw new HttpError(401, "Sign in to calibrate hiring preferences.");
    const parsed = startCalibrationInput.safeParse(input);
    if (!parsed.success) throw new HttpError(400, "Enter a hiring need up to 2,000 characters.");
    try {
      return gatewayDisplay(await gateway.execute({
        actionType: "calibration.profiles", userId: context.user.id,
        actor: { kind: "user", id: context.user.id }, origin: "thread", tainted: false,
        payload: parsed.data,
      }) as GatewayResult<CalibrationPanel>);
    } catch {
      throw new HttpError(503, "Calibration profiles are unavailable. Replay supports robotics hiring.");
    }
  };

export const submitThreadCalibration: SubmitThreadCalibration<z.input<typeof submitCalibrationInput>, GatewayDisplay<CalibrationCriteria>> =
  async (input, context) => {
    if (!context.user) throw new HttpError(401, "Sign in to submit your calibration reactions.");
    const parsed = submitCalibrationInput.safeParse(input);
    if (!parsed.success) throw new HttpError(400, "Send one reason per selected calibration profile.");
    try {
      return gatewayDisplay(await gateway.execute({
        actionType: "calibration.criteria", userId: context.user.id,
        actor: { kind: "user", id: context.user.id }, origin: "thread", tainted: false,
        payload: parsed.data,
      }) as GatewayResult<CalibrationCriteria>);
    } catch {
      throw new HttpError(503, "Calibration criteria are unavailable. Check the simulation service.");
    }
  };
