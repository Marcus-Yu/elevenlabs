// EXECUTION_BACKEND (WP7): `alter` sends through Alter's proxy; `local` (the default) is for
// development only — nothing leaves, and every ActionLog row is stamped so nobody mistakes a
// local run for a real send.

export type ExecutionBackend = "alter" | "local";

export const LOCAL_BACKEND_STAMP = "execution_backend=local";

export function executionBackendFrom(env: NodeJS.ProcessEnv = process.env): ExecutionBackend {
  return env.EXECUTION_BACKEND === "alter" ? "alter" : "local";
}
