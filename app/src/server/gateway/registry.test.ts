import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRegistry, HandlerRegistry } from "./registry";
import { defineHandler } from "./types";

const handler = defineHandler({ payload: z.object({}), run: async () => ({ data: 1 }) });

describe("HandlerRegistry", () => {
  it("registers and looks up handlers by action type", () => {
    const registry = createRegistry({ "web.read": handler });
    expect(registry.get("web.read")).toBe(handler);
    expect(registry.get("company.search")).toBeUndefined();
    expect(registry.actionTypes()).toEqual(["web.read"]);
  });

  it("refuses a second handler for the same action type", () => {
    const registry = new HandlerRegistry().register("web.read", handler);
    expect(() => registry.register("web.read", handler)).toThrow(/already registered/);
  });

  it("refuses an action type outside the §7 contract", () => {
    expect(() => new HandlerRegistry().register("email.blast" as never, handler)).toThrow();
  });

  it("lets a later map replace a stub when maps are composed before registering", () => {
    const replacement = defineHandler({ payload: z.object({}), run: async () => ({ data: 2 }) });
    const registry = createRegistry({ ...{ "web.read": handler }, ...{ "web.read": replacement } });
    expect(registry.get("web.read")).toBe(replacement);
  });
});
