import type { GatewayEnv } from "./rules/types";

export function gatewayEnvFrom(env: NodeJS.ProcessEnv = process.env): GatewayEnv {
  const adapterMode = env.ADAPTER_MODE === "live" || env.ADAPTER_MODE === "record" ? env.ADAPTER_MODE : "replay";
  return {
    outreachMode: env.OUTREACH_MODE === "live" ? "live" : "sandbox",
    redirectTo: env.OUTREACH_REDIRECT_TO?.trim() || null,
    adapterMode,
  };
}
