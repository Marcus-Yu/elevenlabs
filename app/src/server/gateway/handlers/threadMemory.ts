import { memoryDraft } from "../../../features/thread/memory-proposal";
import { defineHandler } from "../types";
/** A proposal does not write memory; only a subsequent authenticated user action can do that. */
export const threadMemoryProposal = defineHandler({ payload: memoryDraft, async run(payload) { return { data: payload }; } });
