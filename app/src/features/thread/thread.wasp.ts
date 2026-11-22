import { action, api, apiNamespace, page, query, route, type Spec } from "@wasp.sh/spec";
import { chatApi, chatMiddleware } from "./chat-api" with { type: "ref" };
import { startThreadCalibration, submitThreadCalibration } from "./calibration-operations" with { type: "ref" };
import { getThreadSettings } from "./thread-settings" with { type: "ref" };
import { ThreadPage } from "./ThreadPage" with { type: "ref" };
import { decideThreadApproval, getThreadApproval } from "./approval-operations" with { type: "ref" };
import { confirmThreadMemory } from "./memory-operations" with { type: "ref" };

// Wasp declarations for the "thread" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const threadSpec: Spec = [
  apiNamespace("/api/chat", { middlewareConfigFn: chatMiddleware }),
  api("POST", "/api/chat", chatApi, { auth: true }),
  route("ThreadRoute", "/thread", page(ThreadPage, { authRequired: true })),
  action(startThreadCalibration, { entities: [] }),
  action(submitThreadCalibration, { entities: [] }),
  query(getThreadSettings, { entities: [] }),
  query(getThreadApproval, { entities: ["Approval"] }),
  action(decideThreadApproval, { entities: ["Approval", "ActionLog"] }),
  action(confirmThreadMemory, { entities: [] }),
];
