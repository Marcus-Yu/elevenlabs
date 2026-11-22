import { useState } from "react";
import { getMatchDemo, runMatchStep, useQuery } from "wasp/client/operations";

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
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h1>Double opt-in match</h1>
      <p>User A is you (demo, Orrery Robotics hiring manager). User B <span style={tag}>Synthetic second user</span> is a synthetic robotics engineer created for this demo. Every step goes through the gateway; nothing is sent.</p>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <section style={box}>
        <h2>1. A reviews the anonymous share card</h2>
        {d.draftA && (<>
          <p>Draft (before the gateway):</p>
          <ul>{Object.entries(d.draftA).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul>
          <button onClick={() => run("publishA")}>Opt in to anonymous matching, approve and publish (card.publish)</button>
        </>)}
        {d.cardA && <CardView card={d.cardA} />}
      </section>

      <section style={box}>
        <h2>2. B's card <span style={tag}>Synthetic second user</span></h2>
        {d.cardB ? <CardView card={d.cardB} /> : <button disabled={!d.cardA} onClick={() => run("publishB")}>simulate synthetic user B publishing</button>}
      </section>

      <section style={box}>
        <h2>3. Anonymous match</h2>
        {!d.match ? <button disabled={!d.cardA || !d.cardB} onClick={() => run("match")}>Match the two anonymous cards</button> : (<>
          <p><b>Rationale:</b> {d.match.rationale}</p>
          <p>Identities hidden until both sides accept and approve a reveal.</p>
          <p>A accepted: {d.match.aAccepted ? "yes" : "no"} {!d.match.aAccepted && <button onClick={() => run("acceptA")}>Accept as A</button>}</p>
          <p>B accepted: {d.match.bAccepted ? "yes" : "no"} {!d.match.bAccepted && <button disabled={!d.match.aAccepted} onClick={() => run("acceptB")}>simulate synthetic user B</button>}</p>
        </>)}
      </section>

      {d.match?.aAccepted && d.match.bAccepted && (
        <section style={box}>
          <h2>4. Choose identity fields to reveal (card.reveal, needs approval)</h2>
          <div>A: {d.revealA ? `approval ${d.revealA.status}: ${d.revealA.fields.join(", ")}` : (<>{picker(pickA, setPickA)}<button onClick={() => run("revealA", pickA)}>Request and approve reveal as A</button></>)}</div>
          <div style={{ marginTop: 8 }}>B: {d.revealB ? `approval ${d.revealB.status}: ${d.revealB.fields.join(", ")}` : (<>{picker(pickB, setPickB)}<button onClick={() => run("revealB", pickB)}>simulate synthetic user B approving reveal</button></>)}</div>
        </section>
      )}

      {d.intro && (
        <section style={box}>
          <h2>5. Introduction draft <span style={{ ...tag, background: "#e5e7eb" }}>UNSENT</span></h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{d.intro}</pre>
          <p>Draft only. There is no send button in this demo.</p>
        </section>
      )}
      <button onClick={() => run("reset")} style={{ marginTop: 16 }}>Reset demo</button>
    </div>
  );
}

function CardView({ card }: { card: CardInfo }) {
  return (<>
    <p>Published (anonymous):</p>
    <ul>{Object.entries(card.published).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul>
    {card.stripped.length > 0 && <p style={{ color: "#b45309" }}>Stripped by rule <code>{card.ruleId}</code>: {card.stripped.join(", ")}<br /><small>{card.logReason}</small></p>}
  </>);
}
