import type { ActionLog } from "wasp/entities";
import { HttpError } from "wasp/server";
import type { GetActivityLog } from "wasp/server/operations";
import { activityWhere, ActivityFilters, pageOf, parseArgs } from "../../server/gateway/queries";

// Activity log query (WP1): every gateway decision for the signed-in user, newest first.

export type ActivityPage = {
  rows: ActionLog[];
  /** Pass as `cursor` to get the next page; null on the last page. */
  nextCursor: string | null;
};

export const getActivityLog: GetActivityLog<Partial<ActivityFilters> | void, ActivityPage> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const parsed = parseArgs(ActivityFilters, args);
  if (!parsed.ok) throw new HttpError(400, parsed.message);
  const filters = parsed.data;
  const rows = await context.entities.ActionLog.findMany({
    where: activityWhere(context.user.id, filters),
    orderBy: [{ ts: "desc" }, { id: "desc" }],
    take: filters.limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  return pageOf(rows, filters.limit);
};
