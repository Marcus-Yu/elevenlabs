import { defineConfig } from "vitest/config";

// Unit tests for server, shared logic and pure component rendering.
// Kept separate from vite.config.ts so tests run without a compiled Wasp SDK.
// These source files otherwise inherit Wasp’s preserved JSX, which Vitest cannot execute.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
