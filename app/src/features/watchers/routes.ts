import type { WatcherBrief, WatcherReport, WatcherTool } from "wasp/server/api";
import { gateway } from "../../server/gateway";
import { handleBrief, handleRun, handleTool, type WatchDeps } from "./watchApi";

type Entities = Parameters<WatcherTool>[2]["entities"];

function singleGoalId(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function dependencies(entities: Entities): WatchDeps {
  return {
    loadGoal: (id) => entities.Goal.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, kind: true, statement: true, watcherTokenHash: true, icp: true },
    }),
    async matchedDomains(goalId) {
      const matches = await entities.Match.findMany({
        where: { goalId },
        select: { company: { select: { domain: true } } },
      });
      return matches.map(({ company }) => company.domain);
    },
    execute: gateway.execute,
    startRun: (goalId, runtime) => entities.WatcherRun.create({ data: { goalId, runtime }, select: { id: true } }),
    async finishRun(goalId, id, stats) {
      // The API input is JSON. Serialize before passing the object to Prisma.
      const jsonStats = JSON.parse(JSON.stringify(stats));
      const result = await entities.WatcherRun.updateMany({
        where: { goalId, id, finishedAt: null },
        data: { finishedAt: new Date(), stats: jsonStats },
      });
      if (result.count === 1) return true;
      const finished = await entities.WatcherRun.findFirst({ where: { goalId, id }, select: { finishedAt: true } });
      return finished?.finishedAt != null;
    },
  };
}

export const watcherBrief: WatcherBrief = async (req, res, { entities }) => {
  res.set("Cache-Control", "no-store");
  const result = await handleBrief(singleGoalId(req.params.goalId), req.get("authorization"), dependencies(entities));
  res.status(result.status).json(result.body);
};

export const watcherTool: WatcherTool = async (req, res, { entities }) => {
  res.set("Cache-Control", "no-store");
  try {
    const result = await handleTool(singleGoalId(req.params.goalId), req.get("authorization"), req.body, dependencies(entities));
    res.status(result.status).json(result.body);
  } catch {
    // Gateway failures can contain provider details. Never return them to the box.
    res.status(502).json({ error: "watcher_tool_failed" });
  }
};

export const watcherReport: WatcherReport = async (req, res, { entities }) => {
  res.set("Cache-Control", "no-store");
  const result = await handleRun(singleGoalId(req.params.goalId), req.get("authorization"), req.body, dependencies(entities));
  res.status(result.status).json(result.body);
};
