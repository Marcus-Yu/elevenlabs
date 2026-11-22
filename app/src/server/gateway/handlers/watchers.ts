import { generateWatcherToken } from "../../../features/watchers/watchApi";
import { createMaritimeAdapter, type MaritimeAdapter } from "../../adapters/maritime";

// Watcher provisioning (WP10 step 4). Lives under gateway/handlers because AGENTS.md rule 2 lets only
// this folder import adapters. It is system work, not a user ActionType, so it has no gateway rule.
//
// The caller (goal activation in WP5) stores `tokenHash` on Goal.watcherTokenHash and `agentId`
// somewhere it can find it to retire the box. The plain token goes only to the box, as a secret env var.

export interface ProvisionInput {
  goalId: string;
  /** Public base URL of the Atlas server (PUBLIC_BASE_URL), reachable from Maritime. */
  atlasUrl: string;
  /** Build key from uploading watcher-box/ once (scripts/deploy-watcher.ts). */
  uploadS3Key: string;
}

export function createWatcherProvisioner(maritime: MaritimeAdapter) {
  return {
    async provision(input: ProvisionInput): Promise<{ agentId: string; tokenHash: string; reused: boolean }> {
      const { token, hash } = generateWatcherToken();
      const existing = await maritime.findWatcher(input.goalId);
      if (existing) {
        // Rotate the token on the existing box instead of creating a second one.
        await maritime.setEnv(existing.id, { WATCHER_TOKEN: token, ATLAS_URL: input.atlasUrl, WATCHER_GOAL_ID: input.goalId });
        return { agentId: existing.id, tokenHash: hash, reused: true };
      }
      const agent = await maritime.createWatcher({
        goalId: input.goalId,
        uploadS3Key: input.uploadS3Key,
        env: { ATLAS_URL: input.atlasUrl, WATCHER_GOAL_ID: input.goalId, WATCHER_TOKEN: token },
      });
      return { agentId: agent.id, tokenHash: hash, reused: false };
    },

    /** Deletes the box. The caller must also clear Goal.watcherTokenHash so the old token stops working. */
    async retire(agentId: string): Promise<void> {
      await maritime.deleteWatcher(agentId);
    },

    /** Local runtime and manual runs: ask the box to tick now. */
    async tick(agentId: string): Promise<unknown> {
      return maritime.chat(agentId, "tick");
    },
  };
}

export function createWatcherProvisionerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.MARITIME_API_KEY?.trim();
  if (!apiKey) throw new Error("MARITIME_API_KEY is required to provision watcher boxes (WATCHER_RUNTIME=maritime).");
  return createWatcherProvisioner(createMaritimeAdapter({ apiKey }));
}
