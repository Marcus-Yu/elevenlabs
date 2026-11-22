# Atlas overlay — design reference

Atlas is a desktop overlay, not a web page. It stays hidden until it is called (like Siri), shows up as a small ball, and shows information on cards that slide out beside the ball.

- `atlas-overlay.dc.html` is the design source, exported from the design canvas. It does not run on its own: `{{hole}}`, `<sc-if>` and `<sc-for>` are the canvas's template syntax, and `./support.js` is the canvas runtime. Its `<style>` block is plain CSS, and the `<script type="text/x-dc">` block is the state machine. Lift both as reference.
- The canvas itself is at https://claude.ai/artifact/T8m8kbcUMoAmi28ikhXENu. It is private to Aaron, so treat this folder as the copy agents work from.
- The two app windows in the mock are placeholders that stand for "whatever the user is doing". They are not part of Atlas.

## States

One state machine, five states. The mock loops them on a timer. In the product, the user's actions move between them.

| # | State | Mock hold | What happens |
|---|---|---|---|
| 0 | `hidden` | 2600 ms | Nothing on screen. The overlay must not block clicks. |
| 1 | `listening` | 3400 ms | The ball pops in (scale 0→1, 600 ms, `cubic-bezier(.34,1.56,.64,1)`). The scrim fades in (500 ms). Three rings ripple out (2.2 s each, 0.73 s apart, scale 1→2.1, opacity .7→0). Voice bars pulse in the orb colour. |
| 2 | `thinking` | 4800 ms | The ball pulses (scale .94↔1, 2 s). An accent arc spins around it (116 px, 1.1 s per turn). A dashed orbit (140 px) with an accent dot spins (3 s per turn). The voice bars hide. **Brief** (left) and **Research** (right) slide out of the ball. |
| 3 | `speaking` | 7200 ms | The ball grows to 1.18× and wobbles with the `talk` keyframes (1.15 s: scale .99–1.07 plus a border-radius morph). The halo pulses. The voice bars turn the accent colour (0.8 s). **Shortlist** (left) and **Gateway** (right) join, 300 ms after the first pair. The Brief footer changes from "Needs your OK" to "Approved", and Research changes from "Scanning" to "Done". |
| 4 | `leaving` | 1000 ms | The cards slide back into the ball (400 ms). The ball shrinks to 0 after a 300 ms delay (450 ms ease-in). The scrim fades out after 350 ms. Then the state goes back to `hidden`. |

Card entry: `translateX(±70px) scale(.9) blur(8px)` → none, 700 ms, `cubic-bezier(.2,.8,.2,1)`. Left cards start shifted right and right cards start shifted left, so they look like they come out of the ball.

Interaction in the mock: clicking the empty desktop summons Atlas, clicking the ball moves to the next state, and clicking outside the ball dismisses it. In the product, summoning is the hotkey or voice wake.

## Layout

The layout is anchored to one point: the cluster centre, at 50% of the screen width and 47% of the height.

- **Ball:** 96 px core inside a 180 px wrapper. The halo is 230 px.
- **Voice bars:** 5 bars, each 3 × 16 px with a 3 px gap, starting 88 px below the centre.
- **Left card column:** 320 px wide. Its right edge is 100 px left of the centre, and its top is 200 px above the centre.
- **Right card column:** 320 px wide. Its left edge is 100 px right of the centre, and its top is 150 px above the centre. The offset is deliberate.
- **Card stacking:** cards in a column are 14 px apart, and new cards stack downward, so cards already on screen never move.
- **Scrim:** covers the whole screen with `rgba(232,241,255,.5)` and `backdrop-filter: blur(12px)`.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--peri` (orb) | `#8EC5FF` | Orb body, halo, voice bars while listening |
| `--accent` | `#1F5EF0` | Spinner, orbit dot, voice bars while speaking, match badges, checks, "Approved". White text on it is 5.3:1. |
| Ink | `#0F1E3A` | Titles |
| Body | `#22365A` | Card body text, chips |
| Muted | `#5B6B86` | Labels, secondary text (5.5:1 on white) |
| Secondary blue | `#2B57B8` | Pending state, avatar letters, outline badges |
| Card | `rgba(255,255,255,.88)`, 1 px `rgba(61,134,232,.18)` border, 18 px radius, `blur(14px)`, shadow `0 20px 50px rgba(31,70,140,.10)` | All four cards |
| Chip border | `rgba(61,134,232,.28)` | Criteria chips, status pill |
| Avatar fill | `#E4EFFF` | Shortlist avatars, Gateway lock icon |

Orb gradient: `radial-gradient(circle at 34% 28%, #FFFFFF 0%, #DDEEFF 16%, #8EC5FF 42%, #4C93EC 74%, #2A62CF 100%)`, plus two rotating, blurred conic "swirls" (white and accent) and a gloss highlight. The source derives the stops from `--peri` with `color-mix(in oklch, …)`, so changing one variable recolours the whole orb.

Type: Bricolage Grotesque for card titles, Inter for body text, and Geist Mono for labels (11 px, uppercase, 0.14em letter-spacing). All three are Google Fonts.

## Cards and what they map to in the plan

| Card | Shows | Plan |
|---|---|---|
| Brief | Goal kind, role, criteria chips, a private-field note, and an approval state | Calibration → approved criteria (WP3, WP5) |
| Research | The source groups being checked, and the line "Every claim links to its source" | Delegated research (WP10). Every claim carries a `SourceRef`. |
| Shortlist | Anonymous candidates (A/B/C), criteria fit (3/3), source counts | Sourced shortlist (WP5). Names stay hidden until double opt-in (WP13). |
| Gateway | A field stripped from the share card, contact details hidden until opt-in, intro pending | Gateway rules and the activity log (WP1, WP6, WP13) |

The card content in the mock is sample data about a synthetic Orrery Robotics hire. Under AGENTS.md rule 5, the real UI must show real `SourceRef`s and label synthetic material as synthetic. The mock leaves that label out by design, so add it back in the build.

## Behaviour to keep

- Fully hidden when idle: no dock icon or corner bubble is shown in the design.
- No text on the overlay apart from the cards: no headline, captions or transcript under the ball.
- Animations switch off under `prefers-reduced-motion`. The mock collapses every animation and transition to an instant change.
