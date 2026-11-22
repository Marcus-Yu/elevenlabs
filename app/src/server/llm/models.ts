// Claude model ids (docs/IMPLEMENTATION_PLAN.md §4).
// Current models reject `temperature`, `budget_tokens` and forced `tool_choice`: never send them.

export const REASONING_MODEL = "claude-opus-5-5";

/** FAST_MODEL from the environment, defaulting to REASONING_MODEL. */
export function resolveFastModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.FAST_MODEL?.trim() || REASONING_MODEL;
}

export const FAST_MODEL = resolveFastModel();
