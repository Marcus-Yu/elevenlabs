import type { Rule } from "./types";

/** §8 `opt_out`: never contact an address or domain on the opt-out list. */
export const optOut: Rule = {
  id: "opt_out",
  kind: "deny",
  check({ recipient, recipientOptedOut }) {
    return recipient && recipientOptedOut ? "recipient or domain has opted out" : null;
  },
};
