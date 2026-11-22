import type { CallPlacePayload } from "../payloads";
import type { Rule } from "./types";

/** Keeps a leading + and the digits, so formatting differences don't matter. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

/** §8 `call_target`: Atlas only calls the user's own verified number. */
export const callTarget: Rule = {
  id: "call_target",
  kind: "deny",
  check({ request, user }) {
    if (request.actionType !== "call.place") return null;
    if (!user?.phone || !user.phoneVerifiedAt) return "user has no verified phone number";
    const { toNumber } = request.payload as CallPlacePayload;
    return normalizePhone(toNumber) === normalizePhone(user.phone) ? null : "call target is not the user's verified number";
  },
};
