import type { PrismaClient } from "@prisma/client";
import { alterConfigFrom } from "../../adapters/alter";
import { executionBackendFrom } from "../../execution/backend";
import { gatewayEnvFrom } from "../env";
import type { HandlerMap } from "../types";
import { createOutreachHandlers } from "./outreach";

/** Wires the outreach handler to Prisma and env (WP7). */
export function createOutreachHandlersFromEnv(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env): HandlerMap {
  const gatewayEnv = gatewayEnvFrom(env);
  return createOutreachHandlers({
    backend: executionBackendFrom(env),
    outreachMode: gatewayEnv.outreachMode,
    redirectTo: gatewayEnv.redirectTo,
    alter: alterConfigFrom(env),
    goalAutonomy: async (goalId) => (await prisma.goal.findUnique({ where: { id: goalId }, select: { autonomy: true } }))?.autonomy ?? null,
    recordAlterApproval: async (approvalId, alterApprovalId) => {
      await prisma.approval.update({ where: { id: approvalId }, data: { alterApprovalId } });
    },
  });
}
