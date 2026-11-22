import type { HandlerMap } from "../types";
import { createDiscoveryHandlersFromEnv } from "./discovery";
import { matchSubmission } from "./matchSubmission";
import { createStubHandlers } from "./stubs";

/** Real handlers replace the gateway's explicit offline stubs. */
export function createHandlerMap(env: NodeJS.ProcessEnv = process.env): HandlerMap {
  const discovery = createDiscoveryHandlersFromEnv(env);
  return {
    ...createStubHandlers(),
    "company.search": discovery["company.search"],
    "jobs.search": discovery["jobs.search"],
    "contact.search": discovery["contact.search"],
    "web.read": discovery["web.read"],
    "match.submit": matchSubmission,
  };
}
