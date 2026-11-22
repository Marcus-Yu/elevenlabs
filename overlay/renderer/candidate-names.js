// Fictional display names for the anonymous shortlist aliases. The records behind them are real
// public profiles, so these are pseudonyms (AGENTS.md rule 5): show them with an "alias" tag and keep
// "Names are aliases until both sides opt in". Operations and tool arguments keep the alias A/B/C.
// ("Sam Rivera" is reserved for the synthetic opt-in user on /match.)
export const DISPLAY_NAMES = { A: "Maya Chen", B: "Jordan Ellis", C: "Priya Raman" };

/** Alias → display name; unknown aliases fall back to "Candidate X". */
export const displayName = (alias) => DISPLAY_NAMES[alias] ?? `Candidate ${alias}`;

/**
 * A spoken reference ("B", "Jordan", "Jordan Ellis", "candidate b") → alias, or "" if unknown.
 * Pass the current snapshot's candidates so names resolve against the stable per-person mapping
 * (names follow the person, not the list position); without them the A/B/C defaults are used.
 */
export function aliasFor(ref, candidates) {
  const r = String(ref ?? "").trim().toLowerCase().replace(/^candidate\s+/, "");
  if (/^[abc]$/.test(r)) return r.toUpperCase();
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const n = String(c.displayName ?? "").toLowerCase();
      if (n && (r === n || r === n.split(" ")[0] || r === n.split(" ")[1])) return c.alias;
    }
    return "";
  }
  for (const [alias, name] of Object.entries(DISPLAY_NAMES)) {
    const n = name.toLowerCase();
    if (r === n || r === n.split(" ")[0] || r === n.split(" ")[1]) return alias;
  }
  return "";
}
