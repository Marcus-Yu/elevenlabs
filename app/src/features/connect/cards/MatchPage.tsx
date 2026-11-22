import { useState } from "react";
import { getMatchDemo, runMatchStep, useQuery } from "wasp/client/operations";
import { humanStatus } from "../../../shared/humanize";

// /match: two-user double opt-in demo. User B is synthetic; nothing is sent.

type Fields = Record<string, string>;
interface CardInfo { published: Fields; stripped: string[]; ruleId: string; logReason: string | null }
interface Demo {
  draftA: Fields | null; cardA: CardInfo | null; cardB: CardInfo | null;
  match: { rationale: string; aAccepted: boolean; bAccepted: boolean; revealedAt: string | null } | null;
  revealA: { status: string; fields: string[] } | null; revealB: { status: string; fields: string[] } | null;
  intro: string | null;
}
const IDS = ["name", "company", "email"];
const box: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 8, padding: 12, margin: "12px 0" };
const tag: React.CSSProperties = { background: "#fde68a", padding: "2px 6px", borderRadius: 4, fontSize: 12, marginLeft: 8 };

export function MatchPage() {
  const { data, refetch, error: qErr } = useQuery(getMatchDemo);
  const [err, setErr] = useState<string | null>(null);
  const [pickA, setPickA] = useState<string[]>(["name", "company"]);
  const [pickB, setPickB] = useState<string[]>(["name", "email"]);
  const d = data as Demo | undefined;
  const run = async (step: string, fields?: string[]) => {
    setErr(null);
    try { await runMatchStep({ step: step as never, fields }); await refetch(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  if (qErr) return <p>Error: {String(qErr)}</p>;
  if (!d) return <p>Loading…</p>;
  const picker = (sel: string[], set: (v: string[]) => void) => IDS.map((f) => (
    <label key={f} style={{ marginRight: 12 }}>
      <input type="checkbox" checked={sel.includes(f)} onChange={(e) => set(e.target.checked ? [...sel, f] : sel.filter((x) => x !== f))} /> {f}
    </label>
  ));
  const m = d.match;
  const current = !d.cardA ? 1 : !d.cardB ? 2 : !m ? 3 : !m.aAccepted ? 4 : !m.bAccepted ? 5 : !(d.revealA && d.revealB) ? 6 : d.intro ? 8 : 7;
  const step = (n: number, title: string, body: React.ReactNode) => (
    <section style={{ ...box, opacity: n > current ? 0.5 : 1, borderColor: n === current ? "#2563eb" : "#ccc" }}>
      <h2>{n}. {title} {n < current && <small>✓ done</small>}{n === current && <small> ← current step</small>}</h2>
      {body}
    </section>
  );
  const btn = (n: number, label: string, onClick: () => void, extra = true) =>
    <button disabled={n !== current || !extra} onClick={onClick}>{label}</button>;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h1>Double opt-in match</h1>
      <p>User A is you (demo, Orrery Robotics hiring manager). User B <span style={tag}>Synthetic second user</span> is a synthetic robotics engineer created for this demo. Every step is checked by Atlas's privacy rules; nothing is sent. Press the highlighted step's button; the others unlock in order.</p>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      {step(1, "Publish A's card", <>
        {d.draftA && !d.cardA && (<>
          <p>Your draft card (before privacy rules):</p>
          <ul>{Object.entries(d.draftA).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul>
        </>)}
        {d.cardA ? <CardView card={d.cardA} /> : btn(1, "1. Publish A's card", () => run("publishA"))}
      </>)}

      {step(2, "B publishes (simulated)", <>
        <span style={tag}>Synthetic second user</span>
        {d.cardB ? <CardView card={d.cardB} /> : <p>{btn(2, "2. B publishes (simulated)", () => run("publishB"))}</p>}
      </>)}

      {step(3, "Match", m ? (<>
        <p><b>Rationale:</b> {m.rationale}</p>
        <p>Identities hidden until both sides accept and approve a reveal.</p>
      </>) : btn(3, "3. Match", () => run("match")))}

      {step(4, "A accepts", m?.aAccepted ? <p>A accepted.</p> : btn(4, "4. A accepts", () => run("acceptA")))}

      {step(5, "B accepts (simulated)", m?.bAccepted ? <p>B accepted <span style={tag}>Synthetic second user</span></p> : btn(5, "5. B accepts (simulated)", () => run("acceptB")))}

      {step(6, "Choose what each side reveals (needs both OKs)", <>
        <div>A: {d.revealA ? `${humanStatus(d.revealA.status)}: shares ${d.revealA.fields.join(", ")}` : (<>{picker(pickA, setPickA)}{btn(6, "6a. A reveals", () => run("revealA", pickA), pickA.length > 0)}</>)}</div>
        <div style={{ marginTop: 8 }}>B (simulated): {d.revealB ? `${humanStatus(d.revealB.status)}: shares ${d.revealB.fields.join(", ")}` : (<>{picker(pickB, setPickB)}{btn(6, "6b. B reveals (simulated)", () => run("revealB", pickB), !!d.revealA && pickB.length > 0)}</>)}</div>
        {current === 6 && !d.revealA && <small>Pick fields, then press 6a; 6b unlocks after A.</small>}
      </>)}

      {step(7, "Intro draft (unsent)", d.intro ? (<>
        <span style={{ ...tag, background: "#e5e7eb" }}>UNSENT</span>
        <pre style={{ whiteSpace: "pre-wrap" }}>{d.intro}</pre>
        <p>Draft only. There is no send button in this demo.</p>
      </>) : <p>{current === 7 ? "The intro appears once both reveals are approved." : "Appears after both reveals."} <span style={{ ...tag, background: "#e5e7eb" }}>UNSENT</span></p>)}

      <button onClick={() => run("reset")} style={{ marginTop: 16 }}>Reset demo</button>
    </div>
  );
}

function CardView({ card }: { card: CardInfo }) {
  return (<>
    <p>Shared anonymously:</p>
    <ul>{Object.entries(card.published).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul>
    {card.stripped.length > 0 && <p style={{ color: "#b45309" }}>Removed before sharing: {card.stripped.join(", ")} (private, never matched on) <small style={{ color: "#888" }}>({card.ruleId})</small></p>}
  </>);
}
