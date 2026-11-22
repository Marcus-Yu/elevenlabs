import { HttpError } from "wasp/server";
import type { GetThreadSettings } from "wasp/server/operations";
import { gatewayEnvFrom } from "../../server/gateway/env";

export const getThreadSettings: GetThreadSettings<void, { shortlistReplay: boolean }> = async (_, context) => {
  if (!context.user) throw new HttpError(401);
  return { shortlistReplay: gatewayEnvFrom().adapterMode === "replay" };
};
