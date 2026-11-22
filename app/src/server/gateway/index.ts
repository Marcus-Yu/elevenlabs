import { prisma } from "wasp/server";
import { createGateway, type Gateway } from "./engine";
import { gatewayEnvFrom } from "./env";
import { createHandlerMap } from "./handlers/index";
import { createPrismaStore } from "./prismaStore";
import { createRegistry } from "./registry";

// Server entry point. Call sites import from here:
//   import { gateway } from "../server/gateway";   (adjust the relative path)
//   const result = await gateway.execute(actionRequest);

let instance: Gateway | null = null;

function getGateway(): Gateway {
  instance ??= createGateway({
    store: createPrismaStore(prisma),
    registry: createRegistry(createHandlerMap(process.env, { memoryItems: prisma.memoryItem })),
    env: gatewayEnvFrom(process.env),
  });
  return instance;
}

export const gateway: Gateway = {
  execute: (request) => getGateway().execute(request),
  decideApproval: (input) => getGateway().decideApproval(input),
};

export { GatewayHandlerError } from "./pipeline";
export type { DecideApprovalInput } from "./approvals";
export type { Gateway } from "./engine";
