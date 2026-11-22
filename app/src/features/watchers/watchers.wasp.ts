import { api, page, route, type Spec } from "@wasp.sh/spec";
import { WatchersPage } from "./WatchersPage" with { type: "ref" };
import { watcherBrief, watcherReport, watcherTool } from "./routes" with { type: "ref" };

const tokenAuth = { auth: false, entities: ["Goal", "Match", "WatcherRun"] };

export const watchersSpec: Spec = [
  route("WatchersRoute", "/watchers", page(WatchersPage, { authRequired: true })),
  api("GET", "/api/watch/:goalId/brief", watcherBrief, tokenAuth),
  api("POST", "/api/watch/:goalId/tool", watcherTool, tokenAuth),
  api("POST", "/api/watch/:goalId/run", watcherReport, tokenAuth),
];
