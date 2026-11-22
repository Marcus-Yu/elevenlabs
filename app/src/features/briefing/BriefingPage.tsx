import { Link } from "react-router";

// "/" lands on the demo script so the click path is obvious.
const STEPS: { to: string; label: string; detail: string }[] = [
  { to: "/thread", label: "1. Hiring goal", detail: "Load the robotics demo criteria, show calibration profiles, react, apply." },
  { to: "/thread", label: "2. Sourced shortlist", detail: "Create goal, then Research shortlist (replayed Fiber results with sources)." },
  { to: "/thread", label: "3. Reject “too junior”", detail: "Type the reason on a candidate and press Reject." },
  { to: "/thread", label: "4. Confirm and rerank", detail: "Confirm the proposed preference; the better rerun shows before/after fit." },
  { to: "/match", label: "5. Double opt-in", detail: "Walk the numbered steps; user B is synthetic." },
  { to: "/match", label: "6. Unsent intro", detail: "The intro draft is shown, never sent." },
  { to: "/activity", label: "7. Activity log", detail: "Every gateway action and rule decision." },
];

export function BriefingPage() {
  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Atlas demo</h1>
        <p>A hiring manager's goal, through a sourced shortlist, to a double opt-in introduction that is never sent.</p>
      </header>
      <ol className="space-y-3">
        {STEPS.map((s) => (
          <li key={s.label} className="rounded border p-3">
            <Link to={s.to} className="font-semibold underline">{s.label}</Link>
            <p>{s.detail}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
