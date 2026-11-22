import { TAINT_ALLOWED } from "./actionGroups";
import type { Rule } from "./types";

/** §8 `taint`: a requester that read outside content may only read, submit matches and draft. */
export const taint: Rule = {
  id: "taint",
  kind: "deny",
  check({ request }) {
    if (!request.tainted || TAINT_ALLOWED.has(request.actionType)) return null;
    return `tainted request cannot perform ${request.actionType}`;
  },
};
