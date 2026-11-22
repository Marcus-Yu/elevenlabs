import { getActivityLog, useQuery } from "wasp/client/operations";
import { describeAction } from "../../shared/humanize";

// Activity: every gateway decision for the signed-in user, in plain words, newest first.
export function ActivityPage() {
  const { data, error, isLoading, refetch } = useQuery(getActivityLog, { limit: 50 });
  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p>Everything Atlas tried to do for you, including what was blocked.</p>
      </header>
      <button type="button" onClick={() => void refetch()}>Refresh</button>
      {isLoading && <p>Loading…</p>}
      {error && <p role="alert">Could not load activity.</p>}
      {data && data.rows.length === 0 && <p>Nothing yet. Run the hiring demo or the match demo first.</p>}
      <ol className="space-y-2">
        {data?.rows.map((row) => {
          const { text, ruleTag } = describeAction(row);
          return (
            <li key={row.id} className="rounded border p-2">
              <span>{text}</span>
              {ruleTag && <small style={{ color: "#888", marginLeft: 6 }}>({ruleTag})</small>}
              <br />
              <small style={{ color: "#888" }}>{new Date(row.ts).toLocaleTimeString()}</small>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
