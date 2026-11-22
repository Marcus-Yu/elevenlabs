import { prisma } from "wasp/server";
import { createGateway, type Gateway } from "./engine";
import { gatewayEnvFrom } from "./env";
import { createHandlerMap } from "./handlers/index";
import { createPrismaStore } from "./prismaStore";
import { createRegistry } from "./registry";
import { executionBackendFrom } from "../execution/backend";
import { withLogStamp } from "../execution/logStamp";
import { traceGateway } from "../tracing/traceGateway";
import { initTracing } from "../tracing/traceroot";

// Server entry point. Call sites import from here:
//   import { gateway } from "../server/gateway";   (adjust the relative path)
//   const result = await gateway.execute(actionRequest);

let instance: Gateway | null = null;

function getGateway(): Gateway {
  if (!instance) {
    initTracing(process.env);
    // WP7: a span per call, and every ActionLog row gets the trace id and the backend stamp.
    instance = traceGateway(
      createGateway({
        store: withLogStamp(createPrismaStore(prisma), executionBackendFrom(process.env)),
        registry: createRegistry(
          createHandlerMap(process.env, {
            memoryItems: prisma.memoryItem,
            matchDatabase: prisma,
            threadGoals: prisma.goal,
            executeThreadTool: (request) => getGateway().execute(request),
            prisma,
          }),
        ),
        env: gatewayEnvFrom(process.env),
      }),
    );
  }
  return instance;
}

export const gateway: Gateway = {
  execute: (request) => getGateway().execute(request),
  decideApproval: (input) => getGateway().decideApproval(input),
};

export { GatewayHandlerError } from "./pipeline";
export type { DecideApprovalInput } from "./approvals";
export type { Gateway } from "./engine";
