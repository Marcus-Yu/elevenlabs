import { defineConfig } from "vitest/config";

// Unit tests for server and shared logic (gateway rules, adapters, contracts).
// Kept separate from vite.config.ts so tests run without a compiled Wasp SDK.
// React component tests can use `wasp test client` instead.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
