import { ActionTypeSchema, type ActionType } from "../../shared/contracts";
import type { Handler, HandlerMap } from "./types";

/** Holds one handler per action type. The engine looks handlers up here; it never imports them. */
export class HandlerRegistry {
  private readonly handlers = new Map<ActionType, Handler>();

  register(actionType: ActionType, handler: Handler): this {
    ActionTypeSchema.parse(actionType);
    if (this.handlers.has(actionType)) {
      throw new Error(`A handler for ${actionType} is already registered. Compose maps before registering.`);
    }
    this.handlers.set(actionType, handler);
    return this;
  }

  registerAll(map: HandlerMap): this {
    for (const [actionType, handler] of Object.entries(map)) {
      if (handler) this.register(actionType as ActionType, handler);
    }
    return this;
  }

  get(actionType: ActionType): Handler | undefined {
    return this.handlers.get(actionType);
  }

  actionTypes(): ActionType[] {
    return [...this.handlers.keys()];
  }
}

export function createRegistry(map: HandlerMap = {}): HandlerRegistry {
  return new HandlerRegistry().registerAll(map);
}
