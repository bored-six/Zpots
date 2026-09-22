# Spec: "Ciudad Latina" redesign + Zamboanga-only map

**Ticket:** None (ad-hoc request, 2026-09-20)
**Status:** Approved by user, ready to build
**Author:** Fable (planner). Coder / tester / reviewer agents execute.

## Why

The map clamps to all of Mindanao and the backend accepts pins anywhere on Earth. The UI is
navy / parchment / brass with a binder-clip metaphor, and the raw OpenStreetMap tiles clash
with it. The user wants: Zamboanga City only, a warmer palette that reads as Zamboanga's
Spanish-colonial "Latin City" identity (Fort Pilar coral stone, vinta sails, azulejo tiles,
Chavacano), tinted tiles, and the same compass-rose pin but smaller and sharper.

User decisions (locked, do not re-ask):
- Tiles: keep OSM, tint with CSS.
- Motifs: colonial stone + vinta stripes + azulejo + Chavacano micro-copy. All four.
- Palette: warmer rework (not keep-and-refine).
- Pins: shrink and refine the compass rose, same confirmed / unconfirmed logic.

## Non-negotiable project rules

- Test-first. Tester writes the tests in this spec **before** the coder touches source; they
  must fail red. Coder makes them green without editing test intent.
- No emojis. No icon packs. All icons are hand-written SVG in `src/components/icons/`.
- No raw hex in components after this work. Everything goes through the tokens below.
- One commit per task, `{type}({scope}): {description}`, with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Accessible names stay **English**. Chavacano is visual primary text, English is the
  `aria-label` / secondary line. Existing wiring tests query buttons by English names and
  must keep passing.
- Read `node_modules/next/dist/docs/` before touching `layout.tsx` (Next 16 conventions differ).

---

## Task 1: Zamboanga-only bounds, client + server

### Files
- NEW `src/lib/city-bounds.ts` (pure, no Leaflet import, safe to use from validation)
- EDIT `src/lib/map-config.ts`
- EDIT `src/lib/validation.ts`
- EDIT `src/components/SpotMap.tsx` (only the bounds import + a defensive tap guard)
- NEW `supabase/migrations/0003_zamboanga_bounds.sql`
- RENAME tests: `*.mindanao.*` -> `*.city.*` (tester does this)

### Contract
```ts
// src/lib/city-bounds.ts
/** OSM relation 3617877 (Zamboanga City admin boundary) bbox, rounded outward to 2dp. */
export const ZAMBOANGA_CITY_BOUNDS = {
  south: 6.78, west: 121.75, north: 7.48, east: 122.58,
} as const;
/** Same box in Leaflet's [[south, west], [north, east]] literal shape. */
export const ZAMBOANGA_CITY_BOUNDS_LITERAL: [[number, number], [number, number]] =
  [[6.78, 121.75], [7.48, 122.58]];
export function isWithinZamboangaCity(lat: number, lng: number): boolean; // inclusive edges, false for NaN/non-finite
```
- `map-config.ts`: `MIN_ZOOM = 12`. Export `MAX_BOUNDS = ZAMBOANGA_CITY_BOUNDS_LITERAL`.
  Delete `MINDANAO_BOUNDS`. Rewrite the `MIN_ZOOM` doc comment: at zoom 12 a 1920px window
  shows ~0.66 deg of longitude, narrower than the 0.83 deg box, so the clamp never fights the
  viewport on normal screens; on wider screens Leaflet 1.9 centers rather than jitters.
- `SpotMap.tsx`: swap `MINDANAO_BOUNDS` -> `MAX_BOUNDS` in both the prop and the post-mount
  `setMaxBounds`. In the tap handler, if `!isWithinZamboangaCity(lat, lng)` do not open the
  add-pin modal; instead show the existing banner with `COPY.outsideCity` (see Task 4) for 3s.
- `validation.ts`: keep the -90..90 / -180..180 checks. Add, after them, a single check: if
  both are finite and `!isWithinZamboangaCity(lat, lng)` set
  `errors.lat = errors.lng = "Pins can only be placed inside Zamboanga City."`.
- Migration:
  ```sql
  -- Pins must sit inside Zamboanga City. Numbers mirror src/lib/city-bounds.ts; change both together.
  alter table public.spots
    add constraint spots_within_zamboanga_city
    check (lat between 6.78 and 7.48 and lng between 121.75 and 122.58);
  ```
  Do **not** delete or move existing rows. If the sandbox has out-of-bounds rows the migration
  will fail; report that to the user rather than working around it.

### Tests (tester writes first, red)
- `src/__tests__/city-bounds.test.ts`: corners inclusive; Fort Pilar (6.904, 122.081) true;
  Manila (14.6, 120.98) false; Isabela, Basilan (6.70, 121.97) false; NaN / Infinity false.
- `src/__tests__/map-config.test.ts`: `MIN_ZOOM === 12`; `MAX_BOUNDS` deep-equals the literal;
  `ZAMBOANGA_CENTER` is inside `MAX_BOUNDS`; `MINDANAO_BOUNDS` is no longer exported.
- `src/__tests__/map-config.city.test.ts` (replaces `.mindanao.`): 1920px viewport at
  `MIN_ZOOM` spans fewer degrees of longitude than the box width (formula:
  `px / (256 * 2**zoom) * 360`).
- `src/__tests__/SpotMap.city.test.tsx` + `.real-leaflet.test.ts` (replace `.mindanao.`):
  same assertions, new constant.
- `src/__tests__/validation.test.ts`: add cases: inside city valid; (14.6, 120.98) yields the
  city error on both lat and lng; lat 200 still yields the range error, not the city error.
- `src/__tests__/migration-bounds.test.ts`: read `0003_zamboanga_bounds.sql` as text, regex
  out the four numbers, assert they equal `ZAMBOANGA_CITY_BOUNDS`. Guards drift.

---

## Task 2: Theme foundation (tokens, fonts, tile tint)

### Files
- EDIT `src/app/globals.css`
- EDIT `src/app/layout.tsx`
- EDIT `.claude/steering/structure.md` "Design notes" section (stale; rewrite to match this spec)

### Tokens
Declare in a Tailwind v4 `@theme` block so utilities like `bg-cream` / `text-ink` exist.
Keep the exact names; tests assert on them.

| Token | Hex | Role |
|---|---|---|
| `--color-cream` | `#f6eedc` | page and card surface (sun-bleached lime plaster) |
| `--color-cream-deep` | `#ecdfc3` | header band, secondary surface, map container bg |
| `--color-stone` | `#cdb693` | borders, dividers, disabled (Fort Pilar coral stone) |
| `--color-stone-deep` | `#7a6448` | muted text, unconfirmed pin. 4.9:1 on cream |
| `--color-ink` | `#2a2017` | body text |
| `--color-tinta` | `#1f1813` | modal scrim, footer, deepest chrome |
| `--color-terracotta` | `#b5482c` | primary action. 4.5:1 on cream, 5.3:1 with cream text |
| `--color-terracotta-deep` | `#8f3620` | primary hover / active |
| `--color-teal` | `#1f6f78` | confirmed state, focus ring, links. 5.0:1 on cream |
| `--color-teal-deep` | `#165259` | teal hover |
| `--color-cardinal` | `#9b2d20` | report / destructive text and ghost border only |
| `--color-vinta-red` | `#c8342b` | stripe only |
| `--color-vinta-yellow` | `#e8b63a` | stripe only |
| `--color-vinta-blue` | `#2c62a8` | stripe only |
| `--color-vinta-green` | `#2e8b57` | stripe only |

Remove every `--zpots-*` variable. Vinta colors are used **only** by `.vinta-rule` (below) and
never as text or fills elsewhere; that restraint is what keeps it from looking like a flag.

Shared CSS utilities in `globals.css`:
```css
.vinta-rule { height: 4px; background: linear-gradient(90deg,
  var(--color-vinta-red) 0 25%, var(--color-vinta-yellow) 25% 50%,
  var(--color-vinta-blue) 50% 75%, var(--color-vinta-green) 75% 100%); }
.leaflet-container { background: var(--color-cream-deep); font-family: var(--font-body); }
.leaflet-tile-pane { filter: sepia(0.38) saturate(0.72) contrast(0.92) brightness(1.04) hue-rotate(-6deg); }
.leaflet-control-attribution { background: color-mix(in srgb, var(--color-cream) 85%, transparent);
  color: var(--color-stone-deep); font-size: 10px; }
.leaflet-control-attribution a { color: var(--color-teal); }
```
The filter goes on the tile pane only. Markers and popups live in other panes and stay crisp.

### Fonts (all `next/font/google`, `display: "swap"`)
| Var | Family | Weights | Use |
|---|---|---|---|
| `--font-wordmark` | Cinzel | 600 | the word "Zpots" only |
| `--font-display` | Alegreya | 600, 700, italic 500 | headings, spot names, tagline (italic) |
| `--font-body` | Alegreya Sans | 400, 500, 700 | everything else |

Alegreya is by Huerta Tipografica (Argentina), a Latin-American calligraphic serif; that is the
story behind the choice. Remove Geist, Geist Mono, Cormorant Garamond, Work Sans entirely
(imports, class names, CSS vars). `body` gets `font-family: var(--font-body)`, `bg-cream`, `text-ink`.

### Tests (red first)
- `src/__tests__/theme-tokens.test.ts`: read `globals.css` as text. Assert every token name
  above exists with the exact hex. Assert no `--zpots-` remains. Assert `.leaflet-tile-pane`
  rule contains `sepia(`. Assert `.vinta-rule` exists.
- `src/__tests__/no-raw-hex.test.ts`: glob `src/components/**/*.tsx` and `src/app/**/*.tsx`,
  fail if any file matches `/#[0-9a-fA-F]{3,8}\b/` outside `src/components/icons/**` (icons may
  hardcode the halo cream, nothing else). List offenders in the failure message.
- `src/__tests__/fonts.test.tsx`: read `layout.tsx` as text; assert imports of `Alegreya`,
  `Alegreya_Sans`, `Cinzel`; assert no `Geist`, `Cormorant`, `Work_Sans`.

---

## Task 3: Pins, smaller and sharper

### Files
- EDIT `src/lib/pin-icon.ts`
- EDIT `src/components/icons/pin-icons.tsx`
- EDIT `src/app/globals.css` (`.zpots-pin-icon` rules)

### Contract
- `ICON_SIZE = 22`. Keep the 0..32 viewBox and paths. `ICON_ANCHOR = [11, 21]`
  (tail tip (16,30) scaled by 22/32, rounded). `POPUP_ANCHOR = [0, -19]`.
- Colors: `unconfirmed: "#7a6448"` (stone-deep), `confirmed: "#1f6f78"` (teal). These two hex
  values are the only ones allowed in `pin-icon.ts`, and they must equal the tokens; add a
  comment saying so.
- `pin-icons.tsx`, in viewBox units:
  - halo stroke `3.2` (was 4), color `#f6eedc` (cream, was white), opacity `0.95`
  - unconfirmed: rose + tail `fill="#f6eedc"` at `fillOpacity={0.85}` (was none) so it reads
    over tinted tiles; `currentColor` stroke `2.0` (was 1.75); center ring stroke `1.4`
  - confirmed: unchanged fill logic; center dot `r=2` filled `#f6eedc` (was cardinal)
  - default `size` prop becomes 22
- CSS:
  ```css
  .zpots-pin-icon { background: none; border: 0; }
  .zpots-pin-icon svg { display: block; transform-origin: 50% 94%; transition: transform 120ms ease-out; }
  .zpots-pin-icon:hover svg, .leaflet-marker-icon:focus-visible.zpots-pin-icon svg { transform: scale(1.18); }
  .zpots-pin-icon--confirmed svg { filter: drop-shadow(0 1px 1px rgb(31 24 19 / 0.35)); }
  ```
  `createPinIcon` adds `zpots-pin-icon--confirmed` / `--unconfirmed` to `className`.

### Tests (red first)
- `src/__tests__/pin-icon.test.ts`: `createPinIcon("confirmed").options` has
  `iconSize [22,22]`, `iconAnchor [11,21]`, `popupAnchor [0,-19]`, className contains both
  `zpots-pin-icon` and `zpots-pin-icon--confirmed`; html contains `#1f6f78`; unconfirmed html
  contains `#7a6448` and `fill-opacity="0.85"`; neither html contains `stroke="white"`.
- Snapshot-free. Assert on attributes, not markup strings, except the two color checks.

---

## Task 4: UI surfaces + Chavacano copy

Depends on Task 2 tokens. Do not start until Task 2 is green.

### Files
- NEW `src/lib/copy.ts`
- NEW `src/components/Bilingual.tsx`
- NEW `src/components/icons/ornaments.tsx` additions: `VintaRule` (wraps `.vinta-rule`),
  `AzulejoBand` recolored (teal + terracotta on cream-deep, stone hairlines), `StoneArch`
  (a shallow arch path used as the header's bottom edge). Delete `BinderClip`.
- EDIT `src/components/ClipboardShell.tsx` (keep the filename to limit churn; the component
  is now a plaza / stone-wall frame, not a clipboard; update its doc comment)
- EDIT `src/components/SpotMap.tsx`, `AddSpotForm.tsx`, `ConfirmButton.tsx`, `ReportButton.tsx`,
  `SignInPrompt.tsx`, `src/app/login/page.tsx`, `src/app/settings/page.tsx`
- EDIT `src/app/globals.css` popup rules

### Copy contract
```ts
// src/lib/copy.ts -- every UI string with a Chavacano primary and English secondary.
export const COPY = {
  addSpot:          { cv: "Marca un lugar",                en: "Add a spot" },
  tapToPlace:       { cv: "Toca el mapa para pone el pin", en: "Tap the map to place your pin" },
  confirmVisit:     { cv: "Ya anda yo aqui",               en: "I've been here" },
  report:           { cv: "Reporta",                       en: "Report" },
  statusConfirmed:  { cv: "Confirmao",                     en: "Confirmed" },
  statusUnconfirmed:{ cv: "No pa confirmao",               en: "Unconfirmed" },
  loading:          { cv: "Ta carga",                      en: "Loading" },
  outsideCity:      { cv: "Aqui lang na Zamboanga",        en: "Pins can only be placed inside Zamboanga City" },
  signInFirst:      { cv: "Entra primero",                 en: "Sign in to continue" },
  tagline:          { cv: "Ciudad Latina de Asia",         en: "Asia's Latin City, one spot at a time" },
  cancel:           { cv: "Cancela",                       en: "Cancel" },
  save:             { cv: "Guarda",                        en: "Save" },
} as const;
export type CopyKey = keyof typeof COPY;
```
Use plain ASCII "aqui" (no accent) to match how Zamboanguenos usually type it.
**Flag for the user:** the planner is not a native Chavacano speaker. These are best-effort
Zamboangueno forms and must be checked by a local before launch. That is why every string
lives in one file.

`<Bilingual k="confirmVisit" />` renders:
```html
<span class="..." aria-hidden="true">Ya anda yo aqui</span>
<span class="... text-[0.7em] text-stone-deep">I've been here</span>
```
and the *parent* button / element gets `aria-label={COPY[k].en}`. Provide a `bilingualLabel(k)`
helper that returns the English string for that purpose. Buttons that carry `<Bilingual>` must
set `aria-label` so `getByRole("button", { name: /i've been here/i })` still resolves.

### Visual system (apply consistently)
- **Radii:** cards and popups 6px, buttons and inputs 4px, FAB full pill. Nothing at 2px anymore.
- **Borders:** 1px `stone` on cream surfaces. No pure-black or grey borders.
- **Shadows:** one warm shadow `0 6px 18px rgb(31 24 19 / 0.22)` for floating things (FAB,
  popup, modal card). Nothing else casts a shadow.
- **Type scale:** wordmark 28px Cinzel; h1/spot name 20px Alegreya 700; section label
  12px Alegreya Sans 700 uppercase tracking `0.12em` stone-deep; body 15px; helper 13px.
- **Focus:** `outline: 2px solid var(--color-teal); outline-offset: 2px` everywhere.

### Surfaces
- **Shell / header:** page bg `cream`. Header is a `cream-deep` band: 6px `AzulejoBand` along the
  very top, then wordmark "Zpots" + section label "CIUDAD DE ZAMBOANGA" in terracotta +
  italic tagline `COPY.tagline` (cv primary, en secondary, both display-italic, stone-deep).
  Bottom edge of the header is `StoneArch` in `stone` then a `VintaRule`. Settings button:
  36px round, stone border, existing compass glyph in ink, hover fills `cream-deep`.
  Map sits below with a 1px stone top border. No binder clip, no navy anywhere.
- **FAB:** terracotta pill, cream text, `<Bilingual k="addSpot">` with a small hand-drawn
  compass-plus SVG at left. Armed state: teal, `<Bilingual k="tapToPlace">`. Top-right, 16px inset.
- **Banner pill** (tap hint / outside-city warning): `cream-deep` bg, stone border, ink text,
  a 4px `vinta-rule` as its left edge (rotate the gradient to vertical).
- **Add-pin modal:** scrim `tinta` at 55%. Card: cream, 6px, stone border, `VintaRule` across the
  top edge, title "Marca un lugar / Add a spot" Alegreya 700, form per input rules below.
- **Inputs:** cream bg, stone border, 4px, 44px min height, teal focus ring. Labels are section
  labels. Errors 13px cardinal. Photo picker: dashed stone border, cream-deep on hover.
- **Buttons:** primary terracotta/cream, hover terracotta-deep; secondary ghost (stone border,
  ink text, hover cream-deep); destructive ghost (cardinal text and border). All Alegreya Sans
  700, 15px, 4px radius, 40px min height.
- **Popup:** cream, 6px, stone border, warm shadow, `VintaRule` top edge. Spot name Alegreya 700
  20px; note body 15px; photo 4px radius with stone border. Status pill: confirmed = teal bg /
  cream text `<Bilingual k="statusConfirmed">`; unconfirmed = stone-deep 1px border / stone-deep
  text `<Bilingual k="statusUnconfirmed">`. Actions row: primary `confirmVisit`, destructive ghost
  `report`. Confirmation count in body 13px stone-deep.
- **Sign-in gate:** same card treatment. Keep the existing per-action English headings
  (add / confirm / report) exactly as they are, since frozen tests check them. Add
  `<Bilingual k="signInFirst">` as a section-label eyebrow line **above** the heading in all
  three variants. Primary "Sign in" (English only, it is a navigation label), secondary `cancel`.
- **Login page:** card inside the shell, Google button = secondary ghost with the existing Google
  mark, divider hairline stone with "o / or" in stone-deep, inputs and primary as above.
- **Settings page:** card, sections separated by a 1px `AzulejoBand` variant at 40% opacity
  instead of plain hairlines. Links teal, underline on hover only.

### Tests (red first)
- `src/__tests__/copy.test.ts`: every `COPY` entry has non-empty `cv` and `en`; no entry
  contains an emoji or a non-ASCII character; `bilingualLabel("confirmVisit")` returns
  "I've been here".
- `src/__tests__/Bilingual.test.tsx`: renders both strings; the cv span is `aria-hidden`.
- Extend `ConfirmButton.test.tsx`, `ReportButton.test.tsx`, `SignInPrompt.test.tsx`,
  `AddSpotForm.test.tsx`, `SpotMap.wiring.test.tsx`: existing English-name queries must still
  pass (they are the regression net); add one assertion per component that the visible text
  contains the Chavacano primary.
- `src/__tests__/shell.test.tsx`: `ClipboardShell` renders the wordmark, "CIUDAD DE ZAMBOANGA",
  a `.vinta-rule`, and does **not** render anything with class or test-id containing `binder`.
- `no-raw-hex.test.ts` from Task 2 now covers every file touched here.

---

## Task 5: Docs and verification

- Rewrite `.claude/steering/structure.md` "Design notes" to this spec's palette, fonts, pin
  spec, and the "Chavacano strings need native review" caveat.
- Append `.claude/learnings.md` entry dated 2026-09-20: tile tint via pane filter, the
  Leaflet-centers-when-bounds-smaller-than-viewport fact, the aria-label-stays-English rule.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all green.
- Orchestrator runs the dev server in the browser pane and takes screenshots at desktop and
  mobile for the user: header + map, popup open, add-pin modal, login.

## Execution order

1. Tester: write all red tests for Tasks 1 to 4 (one commit: `test(redesign): ...`). Run
   `npm test` and report which files fail and why; confirm nothing fails for a wrong reason
   (typo, bad import path).
2. Coder A: Task 1 + Task 3 (disjoint files from Coder B except `globals.css`; A owns only
   the `.zpots-pin-icon` block, B owns everything else in that file).
   Coder B: Task 2. Run in parallel. Each commits its own task.
3. Coder C: Task 4 after 2 is green. Commit.
4. Tester: adversarial pass. Try to break bounds edge cases, aria names, tinted-tile CSS
   ordering vs Leaflet's stylesheet, `renderToStaticMarkup` of the new pins, hydration on
   settings page (there was a previous hydration bug there).
5. Reviewer: gate against this spec. APPROVED or REJECTED with reasons.
6. Orchestrator: Task 5 docs, browser screenshots, report.
