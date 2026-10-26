# Spec: Ubicacion — geolocation timeout, "you are here" marker, directions link

**Slug:** `ubicacion`
**Created:** 2026-09-21
**Last updated:** 2026-09-21 (user answered the Chavacano question; the watchdog was Claude's call —
see "Resolved before implementation")
**Status:** **APPROVED — every decision is locked. No open questions. Build it as written.**
**Author:** Planner. Tester writes the red tests first; Builder implements; Reviewer gates.
**Governing docs:** `CLAUDE.md`, `.claude/steering/structure.md`, `.claude/prds/social-spots.md`,
`.claude/prds/pergamino-map.md` (D4).

> **TEST-FIRST IS MANDATORY.** Every test file named below is written and confirmed **failing red**
> before a single line of its implementation exists. Do not write the implementation first and
> then the test. Do not adjust an assertion to match what you built.

---

## Goal

Three small, related fixes so the app knows where the user is, shows it honestly, and can hand
them off to their own maps app: (A) the geolocation lookup can no longer hang forever, (B) the
full map at `/mapa` draws a custom "me" mark — and **never** draws one at the Plaza Pershing
fallback, and (C) every spot card and map popup offers a one-tap "Directions" link.

---

## Assumptions (stated, not confirmed)

> These four are the planner's own calls and were **not** raised with the user. Of the two items the
> planner escalated, only **one** reached the user: the Chavacano strings, which they answered
> directly. The watchdog was decided by Claude without asking. See "Resolved before implementation"
> at the end of this file for who decided what.

1. **A1.** Nobody wants a second permission prompt. The one-lookup-per-session singleton in
   `use-location.ts` stays exactly as it is; nothing in this spec adds a retry button or a
   `watchPosition`.
2. **A2.** `LocationStatus` is **not** widened with a `"timeout"` member. Every consumer branches
   on `isFallback`, never on `status === "denied"` specifically (verified: `SpotsDeck.tsx:564`,
   `PostFlow.tsx:283`), and the app's behaviour on timeout is byte-identical to its behaviour on
   denial — use the city center and say so. A third status would force every consumer to grow a
   branch for zero user-visible difference. **Do not add it.**
3. **A3.** Directions is not gated behind sign-in. It reads no data, writes no data, and calls no
   RPC. It shows signed-out and it shows on preview (famous-places) cards.
4. **A4.** Nobody is adding a map SDK, a routing library, or a new npm dependency for any of this.

---

## SCOPE FLAG — Task C is an accepted deviation

`CLAUDE.md` lists seven v2 features and says "Anything not in the 7 items above" is out of scope.
**Directions is not one of the seven.** The user explicitly approved it in conversation on
2026-09-21. It ships as an accepted deviation, recorded in `.claude/prds/social-spots.md` using
that file's existing convention — a **Change Log row** (the file already carries a
`| 2026-09-20 | Deviations accepted: ... | Test contracts / scope |` row; follow that shape) plus
an entry under **Open items for the user**.

Required row, added in task 3's commit:

```
| 2026-09-21 | Deviation accepted: a "Directions" deep link on the spot card and both map popups, though it is not one of the 7 v2 features | User approved in conversation 2026-09-21; no account, no schema, no new dependency, no gate |
```

Tasks A and B are **not** deviations — they are bug/polish work on feature 2 ("Map inset and Mapa
tab") and on the Geolocation design decision already recorded in `social-spots.md`.

---

# TASK A — Geolocation options + watchdog

## A.1 Files to touch

| Path | Change |
|---|---|
| `src/lib/use-location.ts` | Add exported options + watchdog constants; pass options as the 3rd arg; add a settle-once watchdog |
| `src/__tests__/use-location.options.test.ts` | **NEW** — the red tests |
| `src/__tests__/SpotsDeck.location-note.test.tsx` | **NEW** — the red test for the visible "Using the city center" note |

Nothing else. Do not touch `src/__tests__/use-location.test.ts` (it stays green untouched — see
"Existing tests at risk").

## A.2 The honest problem statement (read this before implementing)

Per the W3C Geolocation API algorithm, the `timeout` in `PositionOptions` **starts counting after
the user grants permission**, not when `getCurrentPosition` is called. Browser behaviour varies,
but the spec is explicit. That means a `PositionOptions.timeout` **on its own does not fix the
stated bug** ("a hung permission prompt leaves `status: 'loading'` forever") — a user who never
taps Allow or Block is not covered by it.

So Task A is **two** changes, both required:

1. `PositionOptions` as the third argument — covers *permission granted, fix never acquires*
   (indoors, GPS cold, airplane mode toggled).
2. A wall-clock **watchdog** `setTimeout` inside `startLocating()` — covers *prompt never
   answered*, which is the case in the bug report.

Shipping only (1) leaves the reported bug alive. Do not ship only (1).

## A.3 Exact values and why

Add these two exported constants to `src/lib/use-location.ts`:

```ts
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
};

export const LOCATION_WATCHDOG_MS = 12_000;
```

They are **exported** so tests can assert the contract directly instead of reaching into a mock's
call args, and so the watchdog's "must be longer than the browser's own timeout" relationship is
assertable.

| Option | Value | Justification |
|---|---|---|
| `enableHighAccuracy` | **`false`** | This is a walking-scale city app. The fix feeds two things: haversine ordering of the Cerca lane, and a dot on a city-wide map. A coarse WiFi/cell fix (typically 20–100 m in an urban area) is well inside the noise of a distance line that renders as "840 m away". `true` powers up the GPS radio, which on a cold start can take 10–30 s outdoors and much longer indoors, and drains battery — for a single fix that the app takes **once per session and never refreshes**, that cost buys precision nobody can perceive. |
| `timeout` | **`10_000`** (10 s) | A coarse fix is usually sub-2 s on WiFi. 10 s is generous enough that a slow-but-working device still lands on `granted` rather than being cut off, and short enough that a device that is never going to answer stops pretending. Below ~5 s you start failing legitimate slow fixes; above ~15 s the user has already given up on the Cerca lane. |
| `maximumAge` | **`300_000`** (5 min) | The hook caches one result per session in module state and never refetches, so on a reload or a return visit the browser is asked again from scratch. Accepting a cached position up to 5 minutes old lets the browser answer instantly instead of re-acquiring. On foot, 5 minutes is at most a few hundred metres — again inside the noise of a rounded distance line. `0` would force a fresh acquisition on every single page load, which is precisely the slow path this task is trying to kill. |
| `LOCATION_WATCHDOG_MS` | **`12_000`** | Strictly greater than `timeout` (10 s) on purpose: give the browser's own timeout a chance to fire first, so the normal path produces a real `PositionError` (code 3) through the existing error callback and the watchdog stays a last resort. The 2 s margin covers the browser's own scheduling slop. |

## A.4 Behaviour contract

`startLocating()` becomes:

- A module-level `settled` boolean (separate from the existing `started`) guards **every** state
  transition. The first of {success, failure, watchdog} to fire wins; every later one is a no-op.
- `geolocation.getCurrentPosition(success, failure, GEOLOCATION_OPTIONS)` — the third argument is
  `GEOLOCATION_OPTIONS` itself (the same object reference; do not inline a literal).
- Immediately after the call, schedule `setTimeout(watchdog, LOCATION_WATCHDOG_MS)`. Store the
  handle; **clear it** in both the success and failure paths.
- The watchdog body: if `settled`, return. Otherwise
  `setState({ status: "denied", coords: FALLBACK_COORDS, isFallback: true })` — byte-identical to
  what the existing failure callback at `:60-62` already does.
- The **no-API branch** (`if (!geolocation)`) settles immediately and must schedule **no timer at
  all**.
- The existing success branch keeps its in-city check unchanged: an out-of-city fix still collapses
  to `denied` + `FALLBACK_COORDS` + `isFallback: true`.

**Timeout routes to the existing error callback.** A `PositionError` with `code: 3` (TIMEOUT)
reaches the same single, argument-ignoring failure callback at `:60-62` as `code: 1` (PERMISSION_DENIED)
and `code: 2` (POSITION_UNAVAILABLE). No new branch. Confirmed: the callback never reads `error`.

**Therefore `isFallback` is `true` after a timeout**, and the "Using the city center" note renders:
- `SpotsDeck.tsx:564` — `{lane === "cerca" && location.isFallback && <Bilingual k="usingCenter" />}`
- `PostFlow.tsx:283` — `{location.isFallback && <Bilingual k="usingCenter" />}`

Neither file changes. The note appearing is nonetheless an explicit acceptance criterion, tested
below, because it is the user-visible half of this fix.

**Late-callback rule (do not "improve" this).** Once settled to `denied`, a late `success(...)`
with a valid in-city fix is **ignored** — the state does not upgrade to `granted`. Reason: the deck
has already sorted and the user's thumb is already on it; a surprise re-sort mid-swipe is a worse
bug than slightly stale ordering. This is deliberate, and it is a tested assertion.

## A.5 Test contracts — `src/__tests__/use-location.options.test.ts` (NEW)

Follow the existing file's harness: `vi.resetModules()` in `beforeEach`, dynamic
`await import("@/lib/use-location")` per test, `installGeolocation()` / `removeGeolocation()`
helpers copied from `use-location.test.ts`.

1. `getCurrentPosition` is called with **exactly three** arguments (`mock.calls[0]).toHaveLength(3)`).
2. The third argument is the exported `GEOLOCATION_OPTIONS` object (`toBe`, same reference).
3. `GEOLOCATION_OPTIONS` deep-equals `{ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }`.
4. `GEOLOCATION_OPTIONS.enableHighAccuracy` is **strictly `false`**, not `undefined` (asserts the
   key is present, not merely falsy).
5. `LOCATION_WATCHDOG_MS > GEOLOCATION_OPTIONS.timeout`.
6. **Timeout error routes to denied+fallback:** failure callback invoked with
   `{ code: 3, message: "Timeout expired" }` → `status === "denied"`, `coords` deep-equals
   `{ lat: 6.9106, lng: 122.0736 }`, `isFallback === true`.
7. **Watchdog fires:** `vi.useFakeTimers()`, `getCurrentPosition` never calls back. Initially
   `status === "loading"`. After `vi.advanceTimersByTime(LOCATION_WATCHDOG_MS)` inside `act()`,
   `status === "denied"`, `coords` deep-equals the fallback, `isFallback === true`.
8. **NEGATIVE — watchdog does not clobber a success:** success fires immediately with in-city coords
   → `granted`. Then advance past `LOCATION_WATCHDOG_MS` → still `granted`, coords unchanged.
9. **NEGATIVE — settle-once:** watchdog fires first (as in 7), *then* a captured `success` is invoked
   with valid in-city coords → state stays `denied` / fallback / `isFallback: true`.
10. **NEGATIVE — no timer when there is no API:** `removeGeolocation()`, fake timers on → status is
    `denied` immediately and `vi.getTimerCount() === 0`.
11. **NEGATIVE — no crash when `navigator` itself is undefined:** the existing
    `typeof navigator !== "undefined"` guard still holds; importing and calling the hook throws
    nothing. (Assert via `expect(() => renderHook(...)).not.toThrow()`.)
12. **NEGATIVE — a late watchdog after unmount does not throw:** unmount the only hook instance
    before advancing timers; advancing past the watchdog throws nothing and logs no React
    `act(...)` error (spy on `console.error`, expect not called).
13. The timer is cleared on success: with fake timers, after a successful fix,
    `vi.getTimerCount() === 0`.

## A.6 Test contracts — `src/__tests__/SpotsDeck.location-note.test.tsx` (NEW)

There is currently **no** test anywhere that the Cerca lane shows the fallback note (verified:
only `PostFlow.test.tsx:149` covers the `PostFlow` copy of it). This file fills that gap and is the
user-visible acceptance criterion for Task A.

Mock `@/lib/use-location` the same way `SpotsDeck.test.tsx:33-35` does
(`vi.mock("@/lib/use-location", () => ({ useLocation: () => useLocationMock() }))`), plus whatever
`@/lib/feed-repo` / `@/components/AuthProvider` mocks `SpotsDeck.test.tsx` already uses — copy its
harness, do not invent a new one.

1. With `{ status: "denied", coords: FALLBACK, isFallback: true }` and the Cerca lane active, the
   text matching `COPY.usingCenter.en` ("Using the city center") is in the document.
2. **NEGATIVE:** with `{ status: "granted", coords: {lat: 6.93, lng: 122.06}, isFallback: false }`,
   that text is **not** in the document.
3. Assertions derive the expected string from `COPY.usingCenter.en`, never a hardcoded literal
   (matches `aria-names.adversarial.test.tsx`'s convention).

---

# TASK B — "You are here" marker on the full map

## B.1 Decisions, up front

### B.1.a MapInset does **not** get one

`MapInset` / `MapInsetInner` stays untouched. Reasons:

- It is **112 px** (240 px expanded) and shows exactly one spot. At city zoom a second mark within a
  few hundred metres of the spot pin physically overlaps it; the inset stops reading as "here is the
  spot" and starts reading as mush.
- It is **non-interactive** and deliberately a locator thumbnail, not a navigation surface. There is
  nothing to do with a "me" dot there.
- `MapInsetInner` already flies/pans per card. A "me" dot would slide around with every swipe and
  read as if *the user* were moving across the city.
- The inset is rendered **once per card in a deck**. Adding a `useLocation()` subscription (or a
  prop drill) per card is N subscriptions for zero value.

### B.1.b SpotMap takes a **prop**, it does not call `useLocation()`

New optional prop on `SpotMapProps`:

```ts
/**
 * The viewer's own confirmed position, or null when there isn't a real one
 * (loading, denied, or an out-of-city fix). The caller is responsible for
 * never passing the Plaza Pershing fallback here -- see mapa/page.tsx.
 */
userLocation?: LatLng | null;
```

(`LatLng` imports from `@/lib/geo`, which `SpotMap.tsx` does not import yet — add it.)

**Why a prop and not the hook**, three reasons, the first two structural:

1. **The D4 convention in `pergamino-map.md` applies by analogy.** D4's rule is "components take an
   explicit prop; the owner holds the live thing and passes it down; that way the component does
   nothing and renders nothing under a test double that doesn't provide it." Exactly the same shape
   here: a page owns the acquisition, `SpotMap` renders what it is handed.
2. **Five existing assertions count markers exactly** — `SpotMap.test.tsx:176` (0), `:181` (2),
   `:224` (1), `:239` (1). If `SpotMap` resolved the location itself, the marker count would depend
   on ambient `navigator.geolocation`, which those frozen suites do not control. With a prop they
   never pass, the value is `undefined`, no marker renders, and all four counts stay true **by
   correct behaviour**, not by luck. "We were not told where the viewer is, so we do not draw them"
   is the right behaviour in its own right.
3. `structure.md`: "Components stay thin — props in, markup out. No data fetching mixed with
   rendering logic." `useLocation()` is data acquisition.

### B.1.c The three states, exactly

`src/app/mapa/page.tsx` derives, in **both** `SignedOutView` and `SignedInView` (browsing the map
needs no account, so the dot shows signed-out too):

```
const { coords, isFallback } = useLocation();
const userLocation = isFallback ? null : coords;
```

| State | `isFallback` | What `/mapa` renders |
|---|---|---|
| `loading` | `true` | No mark. No accuracy circle. No note. Nothing provisional. |
| `granted` (real, in-city fix) | `false` | The `YouAreHereMark` at `coords`, non-interactive, no popup. |
| `denied` / timeout / out-of-city fallback | `true` | **No mark.** No note. |

**The `isFallback` rule is enforced in two places and tested in both:** the page never passes
fallback coords (`mapa-page.you-are-here.test.tsx`), and `SpotMap` never draws a mark for a
`null` / `undefined` / non-finite `userLocation` (`SpotMap.you-are-here.test.tsx`). Drawing a dot at
Plaza Pershing would be the app lying about where the user is standing, which is worse than drawing
nothing.

**No `usingCenter` note on `/mapa`.** Deliberate: on the deck, "Using the city center" explains why
the *ordering* looks wrong. On the map nothing is being anchored to the city center — the dot is
simply not drawn. Printing "Using the city center" there would explain a thing that isn't happening.
This is a tested negative.

### B.1.d No GPS accuracy circle. Recommended, and this is the recommendation.

Do not build one. Three reasons:

1. With `enableHighAccuracy: false` (Task A), `coords.accuracy` is routinely 20–2000 m. Drawn
   honestly at the map's default zoom, that circle can swallow half of downtown and makes the map
   look broken rather than informative.
2. It needs `Circle` from `react-leaflet` — a **new named export**. Per `.claude/learnings.md`:
   "Vitest mock proxies throw on reading a missing export... every per-file react-leaflet mock must
   export stand-ins, or the whole file fails." That is ten `SpotMap*.test.tsx` files plus
   `mapa-page.test.tsx`'s neighbours, all edited, for a feature nobody asked for. `Marker` is
   already imported; the mark costs zero mock changes.
3. The product question is "am I near this?", and the card's distance line already answers it. A
   precision halo answers a question walking-scale users don't ask.

Consequence: `coords.accuracy` is never read, and **nothing new is added to `LocationResult`**.

## B.2 Files to touch

| Path | Change |
|---|---|
| `src/components/icons/pin-icons.tsx` | **ADD** `YouAreHereMark` |
| `src/lib/pin-icon.ts` | **ADD** `createYouAreHereIcon()` + its size/anchor constants |
| `src/components/SpotMap.tsx` | **ADD** `userLocation` prop + the one extra `<Marker>` |
| `src/app/mapa/page.tsx` | **ADD** `useLocation()` in both views; derive and pass `userLocation` |
| `src/lib/copy.ts` | **ADD** the `youAreHere` key |
| `src/app/globals.css` | **ADD** the `.zpots-pin-icon--me` rule |
| `src/__tests__/pin-icon.you-are-here.test.ts` | **NEW** |
| `src/__tests__/SpotMap.you-are-here.test.tsx` | **NEW** |
| `src/__tests__/mapa-page.you-are-here.test.tsx` | **NEW** |
| `src/__tests__/copy.ubicacion.test.ts` | **NEW** |

## B.3 The icon — `YouAreHereMark`

**File:** `src/components/icons/pin-icons.tsx` (append; do not touch the three existing pins).

**Signature — matches `PinIconProps` exactly, same as its three siblings:**

```ts
export function YouAreHereMark({ size = 22, className, ...props }: PinIconProps)
```

Same `VIEW_BOX = "0 0 32 32"` constant already in the file. Same `aria-hidden="true"` and
`focusable="false"` on the `<svg>` as the siblings (the accessible name lives on the wrapper the
factory builds — see B.4).

**What it draws, and the visual grammar:**

The spot pins own the **compass rose plus a tail**: four kites at N/E/S/W, a tapering tail whose tip
is the map anchor. "Me" must not read as one of those at a glance, so it deliberately drops **both**
the rose and the tail:

| Element | Geometry | Purpose |
|---|---|---|
| Halo ring | `<circle cx=16 cy=16 r=7.5>`, `fill="none"`, `stroke="#f6eedc"`, `strokeOpacity={0.95}`, `strokeWidth={3.2}` | Same cream halo language and same 3.2 weight as all three existing pins, so the mark belongs to the family and separates from busy tiles |
| Disc | `<circle cx=16 cy=16 r=5>`, `fill="#b5482c"`, `stroke="none"` | Terracotta = the app's own voice (the add-spot FAB, the camera button). The two pin colours are stone-deep and teal; terracotta is the third and is already "this is you acting" |
| Inner ring | `<circle cx=16 cy=16 r=7.5>`, `fill="none"`, `stroke="#f6eedc"`, `strokeWidth={2}` | The universally-read "ring around a dot = my position", redrawn in Zpots cream instead of the stock blue-and-white |
| Four ticks | short strokes on the **inter-cardinal** diagonals, from r≈10 to r≈12.5, `stroke="#f6eedc"`, `strokeWidth={1.6}`, `strokeLinecap="round"` | The compass family resemblance without being the rose. Spot pins own N/E/S/W; "me" owns NE/SE/SW/NW. Places point cardinal, you point between them |

Tick paths (rounded from r·cos45° at r=10 and r=12.5 about centre (16,16); round as you like, keep
them symmetric):

```
NE: M23.1,8.9  L24.8,7.2
SE: M23.1,23.1 L24.8,24.8
SW: M8.9,23.1  L7.2,24.8
NW: M8.9,8.9   L7.2,7.2
```

**Colour rule — read this, it protects a steering-doc invariant.** Both hex values (`#f6eedc` cream,
`#b5482c` terracotta) are hardcoded **inside `pin-icons.tsx`**, exactly the way the three existing
pins already hardcode `#f6eedc`. `src/components/icons/**` is explicitly exempted by
`no-raw-hex.test.ts:16`. The factory in `pin-icon.ts` therefore passes **only `size`** and adds
**zero** new hex, which keeps `structure.md`'s rule — "the only two hex values allowed in
`src/lib/pin-icon.ts`" — true and unchanged. Do **not** pass `style: { color: "#b5482c" }` from the
factory; that would break the steering doc and force a doc edit for no gain. `#b5482c` must equal
`--color-terracotta` in `globals.css:19`.

## B.4 The factory — `createYouAreHereIcon()`

**File:** `src/lib/pin-icon.ts` (append; do not touch `createPinIcon` or `createPhotoPinIcon`).

```ts
const ME_ICON_SIZE = 26;
/** Centred, not tail-tipped: this mark has no tail, so the point it names IS its centre. */
const ME_ICON_ANCHOR: [number, number] = [13, 13];

export function createYouAreHereIcon(): L.DivIcon
```

Body contract:

- `renderToStaticMarkup(createElement(YouAreHereMark, { size: ME_ICON_SIZE }))` — `size` only.
- Wrap that markup in a labelled span so the mark has an accessible name (the inner `<svg>` is
  `aria-hidden`, and Leaflet's `alt` option lands on a `<div>` where it means nothing to AT):

  ```
  <span role="img" aria-label="<escaped>" title="<escaped>">…svg…</span>
  ```

  where `<escaped>` is `escapeHtmlAttribute(COPY.youAreHere.en)` — reuse the `escapeHtmlAttribute`
  helper already in this file (`pin-icon.ts:90`), and import `COPY` from `@/lib/copy`. The name is
  the **English** string, matching the repo-wide rule "accessible names stay English"
  (`structure.md` design notes, `aria-names.adversarial.test.tsx`).
- Returns `L.divIcon({ html, className: "zpots-pin-icon zpots-pin-icon--me", iconSize: [26, 26], iconAnchor: [13, 13] })`.
- **Omit `popupAnchor`.** No popup is ever attached to this marker; an unused option only invites a
  test to assert on it.
- `zpots-pin-icon` is required, not cosmetic: it carries the `background: none; border: 0` reset at
  `globals.css:334-337` without which Leaflet paints its default white box behind the divIcon.

**The Chavacano string is not rendered anywhere.** There is no text surface on a dot. `youAreHere.cv`
exists in `COPY` for parity with every other key (and because `copy.adversarial.test.ts` would fail a
cv that equals en anyway), and so a future label bubble or map legend can use it. Do not invent a
label bubble to give it a home.

## B.5 CSS — `src/app/globals.css`

Add, next to the existing `.zpots-pin-icon` rules (around `:334-357`):

```css
/* The "me" mark is a centred ring, not a tailed pin: the shared
   .zpots-pin-icon svg transform-origin (50% 94%, tuned for a tail tip) is
   wrong for it, and it takes no pointer events -- the marker is rendered
   interactive={false} so it can never steal a click meant for a spot pin
   or for tap-to-place. */
.zpots-pin-icon--me svg {
  transform-origin: 50% 50%;
}

.zpots-pin-icon--me {
  pointer-events: none;
}
```

No new `@theme` token, no new keyframe. Verified safe against `theme-tokens.test.ts`,
`paseo-motion-css.test.ts`, and `tile-tint-cascade.adversarial.test.ts:49` (that last one only fails
a selector containing **both** `.leaflet-tile-pane` and `.zpots-pin-icon`; neither rule above does).

## B.6 `SpotMap.tsx` wiring

- Import `type { LatLng } from "@/lib/geo"` and `{ createYouAreHereIcon }` from `@/lib/pin-icon`.
- Add `userLocation` to `SpotMapProps` (B.1.b) and destructure it in the signature.
- Build the icon **once per component instance**, not per render:
  `const meIcon = useMemo(() => createYouAreHereIcon(), [])`. Reason, straight from
  `paseo-motion.md` fix-round-2 finding 1 and the `usePinIconCache` comment at `SpotMap.tsx:186-199`:
  react-leaflet's `Marker` only calls `setIcon` on a **reference** change, so a fresh object every
  render churns the DOM node. This icon never varies, so `useMemo` with `[]` is the whole story — do
  **not** route it through `usePinIconCache`.
- Guard and render, **after** the `visibleMapSpots` loop inside `<MapContainer>` so it draws above
  spot pins in DOM order:

  ```tsx
  {userLocation && hasFiniteCoords({ lat: userLocation.lat, lng: userLocation.lng }) && (
    <Marker
      position={[userLocation.lat, userLocation.lng]}
      icon={meIcon}
      interactive={false}
    />
  )}
  ```

  Reuse the existing `hasFiniteCoords` helper at `SpotMap.tsx:43` — same reason it exists for spots:
  Leaflet's `LatLng` constructor throws on `(NaN, NaN)` and would take the whole map down.
- **No `<Popup>` child.** The mark is a locator, not a thing you open.
- No new `react-leaflet` import. `Marker` is already imported, so **no existing react-leaflet mock
  has to change** — this is the same payoff D4 bought, and the reason the accuracy circle is out.

## B.7 `src/app/mapa/page.tsx` wiring

- `import { useLocation } from "@/lib/use-location";`
- In **`SignedOutView`** and in **`SignedInView`**, call the hook and derive
  `const userLocation = isFallback ? null : coords;`
- Pass `userLocation={userLocation}` to each view's `<SpotMap …>`.
- Change nothing else — not `fitToCity`, not `fitBounds`, not the legend, not the empty-state
  overlay. Specifically: **do not** re-centre or fly the map to the user's position. The map's
  opening view is the whole city (`fitToCity`) and that stays.

## B.8 Copy — `src/lib/copy.ts`

Append, with a section comment naming this spec:

```ts
// Ubicacion (this spec): the viewer's own position on the full map, and
// the directions hand-off. Unlike the rest of this file, these two cv
// strings are NOT best-effort -- a Chavacano speaker confirmed both on
// 2026-09-21, so they sit outside the "needs a native-speaker review"
// flag in this file's header.
youAreHere: { cv: "Aqui tu ta", en: "You are here" },
```

**Chavacano — FINAL, confirmed by the user, who is a Chavacano speaker (2026-09-21).** `"Aqui tu ta"`
is the second-person progressive form and it is the string that ships. It is ASCII (no accent on
`aqui`), matching the file's convention and `copy.test.ts`'s ASCII rule, and it sits in the same
register as the existing `confirmVisit` (`"Ya anda yo aqui"`) and `outsideCity`
(`"Aqui lang na Zamboanga"`).

This string is **not** open for interpretation during implementation. Do not substitute, shorten,
re-person, or "improve" it. Type it exactly as written above.

## B.9 Test contracts — Task B

### `src/__tests__/pin-icon.you-are-here.test.ts` (NEW)

Model on `pin-icon.test.ts` + `pin-icon.adversarial.test.tsx` — assert on DivIcon **options** and on
substrings, never on a full markup snapshot.

1. `createYouAreHereIcon().options.iconSize` deep-equals `[26, 26]`.
2. `.options.iconAnchor` deep-equals `[13, 13]`.
3. `.options.popupAnchor` is `undefined`.
4. `className` matches `/\bzpots-pin-icon\b/` **and** `/\bzpots-pin-icon--me\b/`.
5. **NEGATIVE:** `className` matches none of `/--confirmed\b/`, `/--unconfirmed\b/`, `/--photo\b/`.
6. `html` contains `role="img"`.
7. `html` contains `aria-label="` + `COPY.youAreHere.en` (derive from `COPY`, never a literal).
8. `html` contains `title="` + `COPY.youAreHere.en`.
9. `html` contains `#b5482c` (terracotta) and `#f6eedc` (cream).
10. **NEGATIVE — it is not a spot pin:** `html` contains neither the tail path substring `M13.5,22`
    nor the north-kite substring `M16,2` (both are in `pin-icons.tsx`'s shared silhouette).
11. **NEGATIVE:** `html` does not contain `#1f6f78` (teal) or `#7a6448` (stone-deep) — the me-mark
    must not borrow either spot-status colour.
12. `html` contains `width="26"` and `height="26"` (the factory's size actually reaches the svg).
13. The inner `<svg>` is `aria-hidden="true"` (the wrapper span owns the name, not the svg).
14. `renderToStaticMarkup(createElement(YouAreHereMark))` produces **zero** `console.error` calls
    (spy + restore, same as `pin-icon.adversarial.test.tsx:19-31`).
15. Bare `YouAreHereMark` defaults to `width="22"` / `height="22"` (PinIconProps default honoured).
16. `createPinIcon("confirmed")` / `("unconfirmed")` options are **unchanged** — a one-line
    regression guard that the append didn't disturb the existing factories.

### `src/__tests__/SpotMap.you-are-here.test.tsx` (NEW)

Copy the react-leaflet mock harness from `SpotMap.test.tsx:10-71` (`MapContainer`, `Marker`, `Popup`,
`Polygon`, `Polyline`, `useMap`) plus the `@/components/BasemapLayer` stand-in. **Extend the `Marker`
stand-in** to serialise the icon's class, since that is what identifies the me-mark:

```tsx
Marker: ({ position, icon, interactive, children }) => (
  <div
    data-testid="marker"
    data-position={JSON.stringify(position)}
    data-icon-class={String((icon as { options?: { className?: string } })?.options?.className ?? "")}
    data-interactive={String(interactive)}
  >{children}</div>
)
```

Also export a `Circle` stand-in rendering `data-testid="circle"` so assertion 8 can be made.

1. `userLocation={{ lat: 6.92, lng: 122.08 }}` + one `mapSpots` entry → exactly **2** markers;
   exactly **one** has `data-icon-class` matching `/zpots-pin-icon--me/`; its `data-position` is
   `[6.92, 122.08]`.
2. **NEGATIVE — `null`:** `userLocation={null}` + one spot → exactly **1** marker, **zero** with
   `--me`.
3. **NEGATIVE — omitted:** prop not passed at all + one spot → exactly **1** marker, **zero** with
   `--me`. *(This is the assertion that protects `SpotMap.test.tsx`'s frozen counts.)*
4. **NEGATIVE — NaN lat:** `userLocation={{ lat: NaN, lng: 122.08 }}` → zero `--me` markers, and
   `expect(() => render(...)).not.toThrow()`.
5. **NEGATIVE — NaN lng:** `userLocation={{ lat: 6.92, lng: NaN }}` → same.
6. **NEGATIVE — Infinity:** `userLocation={{ lat: Infinity, lng: 122.08 }}` → same.
7. The me-marker carries `data-interactive="false"` and has **no** `popup` testid inside it.
8. **NEGATIVE — no accuracy circle:** `queryAllByTestId("circle")` is empty in every case above.
9. Zero spots + a real `userLocation` → exactly **1** marker, and it is the `--me` one.
10. The me-marker's icon object is **reference-stable** across a re-render with the same
    `userLocation` (rerender the same element; assert the marker node was not replaced — assert via
    a stable `data-icon-class` and that `createYouAreHereIcon` is called once, by spying on the
    module).

### `src/__tests__/mapa-page.you-are-here.test.tsx` (NEW)

Copy `mapa-page.test.tsx`'s harness (mocks for `next/navigation`, `@/components/AuthProvider`,
`@/lib/saves-repo`, `@/components/SpotMap`) and **add** a `vi.mock("@/lib/use-location", …)`. The
`SpotMap` stand-in must surface the prop:
`<div data-testid="spot-map-user-location">{props.userLocation ? JSON.stringify(props.userLocation) : "null"}</div>`

1. Signed-in + `{ status: "granted", coords: { lat: 6.93, lng: 122.06 }, isFallback: false }` →
   `spot-map-user-location` reads `{"lat":6.93,"lng":122.06}`.
2. **NEGATIVE — fallback:** signed-in + `{ status: "denied", coords: FALLBACK, isFallback: true }` →
   reads `"null"`. Additionally assert the rendered text does **not** contain `"6.9106"` or
   `"122.0736"` anywhere — the Plaza Pershing coordinates must never reach the map.
3. **NEGATIVE — loading:** signed-in + `{ status: "loading", coords: FALLBACK, isFallback: true }` →
   reads `"null"`.
4. Signed-**out** + granted → reads the real coords (browsing needs no account).
5. **NEGATIVE:** signed-out + fallback → `"null"`.
6. **NEGATIVE — no note on the map:** in case 2, `COPY.usingCenter.en` is **not** in the document.
7. The existing Mi mapa behaviour is unaffected: with a granted location, the legend still renders
   and `myMap()` is still called once.

### `src/__tests__/copy.ubicacion.test.ts` (NEW)

Model on `copy.pergamino.test.ts` / `copy.preview.test.ts`.

1. `COPY.youAreHere.en === "You are here"`.
2. `COPY.youAreHere.cv === "Aqui tu ta"`.
3. `COPY.youAreHere.cv !== COPY.youAreHere.en` (also case-insensitively).
4. Both strings are ASCII-only (`/[^\x00-\x7F]/` does not match).
5. `"youAreHere"` is in `Object.keys(COPY)`.

---

# TASK C — Directions deep link

## C.1 Decisions, up front

### C.1.a Where it goes: the spot card **and** both map popups

- **`SpotCardView.tsx`** — the deck is home; it is where most people see a spot at all, and the card
  already carries the distance line. "840 m away" sitting next to "Directions" is the natural pair.
- **The `mapSpots` popup in `SpotMap.tsx`** (`/mapa`) — a spot you put on your personal map is
  precisely the one you are planning to walk to.
- **The `spots` popup in `SpotMap.tsx`** too. Both popups are the same `zpots-popup` markup inside
  one component; shipping directions on one and not the other is an arbitrary split a user would
  notice immediately, and it is one extra JSX line.

### C.1.b One universal URL. No Apple Maps special case. Recommended.

```
https://www.google.com/maps/dir/?api=1&destination=<encoded "lat,lng">
```

- Works on Android, desktop, and iOS Safari. On iOS with Google Maps installed the OS offers/uses the
  app; without it, Google Maps web still gives walking directions.
- An Apple Maps branch would need user-agent sniffing, which is unreliable (iPadOS reports as macOS)
  and untestable without stubbing `navigator.userAgent`. A wrong guess sends an Android user to a
  dead `maps://` scheme. One URL, zero branches, zero platform state.
- **Encode with `encodeURIComponent(\`${lat},${lng}\`)`**, which yields `6.9098%2C122.079`. Google
  accepts both the literal comma and the encoded one; using the encoder makes the contract exact and
  removes any chance of a stray locale/format surprise leaking into a URL.

### C.1.c It is an `<a>`, not a `<button>` — and that matters for the test suite

`SpotMap.mapSpots-gating.test.tsx:67-68` asserts `queryByRole("button", { name: /report/i })` and
`/confirm/i` are null for a read-only popup. A link has `role="link"`, so a Directions **anchor**
cannot collide with that contract. Rendering it as a button would risk it. Use an anchor.

### C.1.d It needs an icon. Yes.

Every sibling control in the card's actions row (`BookmarkIcon`, `CheckIcon` via `ConfirmButton`,
`FlagIcon` via `ReportButton`) carries one. A text-only link would read as an afterthought bolted on.
Same custom-SVG rules as Task B: hand-drawn, no icon pack, no emoji.

## C.2 Files to touch

| Path | Change |
|---|---|
| `src/lib/directions.ts` | **NEW** — `directionsUrl()` |
| `src/components/DirectionsLink.tsx` | **NEW** — the anchor |
| `src/components/icons/action-icons.tsx` | **ADD** `DirectionsArrowIcon` |
| `src/lib/copy.ts` | **ADD** the `directions` key |
| `src/components/SpotCardView.tsx` | **ADD** the link |
| `src/components/SpotMap.tsx` | **ADD** the link to both popups |
| `.claude/prds/social-spots.md` | **ADD** the Change Log row + open item (the scope deviation) |
| `src/__tests__/directions.test.ts` | **NEW** |
| `src/__tests__/DirectionsLink.test.tsx` | **NEW** |
| `src/__tests__/SpotCardView.directions.test.tsx` | **NEW** |
| `src/__tests__/SpotMap.directions.test.tsx` | **NEW** |
| `src/__tests__/copy.directions.test.ts` | **NEW** |

## C.3 `src/lib/directions.ts` (NEW)

Pure module, named export only, kebab-case filename — `structure.md`: "Pure logic goes in
`src/lib/`… Anything with a branch or a rule belongs in a module that can be unit tested without a
DOM."

```ts
import type { LatLng } from "@/lib/geo";

/** Universal cross-platform directions base -- see spec C.1.b for why there is no Apple Maps branch. */
const DIRECTIONS_BASE = "https://www.google.com/maps/dir/?api=1&destination=";

/**
 * A directions deep link for a destination, or `null` when the coordinates
 * can't produce an honest one. Callers render nothing on `null` -- a
 * half-formed maps URL is worse than no button.
 */
export function directionsUrl(destination: LatLng): string | null;
```

Behaviour:
- `Number.isFinite(lat) && Number.isFinite(lng)` → `DIRECTIONS_BASE + encodeURIComponent(\`${lat},${lng}\`)`.
- Otherwise `null`. That covers `NaN`, `Infinity`, `-Infinity`, and anything cast in as `undefined`.
- Reads no browser global. No `navigator`, no `window`, no `document`.

## C.4 `src/components/icons/action-icons.tsx` — `DirectionsArrowIcon`

Append. Signature matches the file's existing icon props type (check the top of that file and use
it verbatim — same `size` default and `...props` spread as `AddSpotIcon`/`SignInIcon`).
`aria-hidden="true"` and `focusable="false"` like its siblings.

**What it draws:** a navigator's **course dart** — a slim isoceles arrowhead pointing **north-east**
(up and to the right, on the 45° diagonal), stroke-only in `currentColor`, with a shallow notch cut
into its tail so it reads as a dart rather than a solid triangle. Same viewBox and the same 1.7–1.8
`strokeWidth`, `strokeLinejoin="round"` drawing language as the other action icons.

Not a bent road-sign arrow, not a turn-by-turn chevron stack, not a location pin. Deliberately on the
**same inter-cardinal diagonal** as `YouAreHereMark`'s four ticks, so "me" and "go there" share an
axis that the cardinal-facing spot pins don't — one system, read at a glance.

## C.5 `src/components/DirectionsLink.tsx` (NEW)

```tsx
"use client";

interface DirectionsLinkProps {
  lat: number;
  lng: number;
  /**
   * "light" (default) is for the cream popup surface. "dark" is for the
   * card, where the control sits on the tinta photo veil next to the
   * cream-on-dark Save/Been buttons.
   */
  tone?: "light" | "dark";
}
export default function DirectionsLink({ lat, lng, tone = "light" }: DirectionsLinkProps)
```

- Compute `const url = directionsUrl({ lat, lng })`. **If `url` is `null`, return `null`.**
- Otherwise:

```tsx
<a
  href={url}
  target="_blank"
  rel="noopener noreferrer"
  aria-label={bilingualLabel("directions")}
  className={/* tone-based; tokens only, no raw hex -- no-raw-hex.test.ts scans this file */}
>
  <DirectionsArrowIcon size={16} />
  <Bilingual k="directions" tone={tone === "dark" ? "inherit" : "muted"} layout="stack" />
</a>
```

- Styling: match the existing controls' shape — `inline-flex min-h-10 items-center gap-1.5
  whitespace-nowrap rounded px-4 py-1.5 text-sm font-bold`, then `border border-cream
  text-cream hover:bg-cream/10` for `dark` and `border border-stone text-ink hover:bg-cream-deep`
  for `light`. **Tailwind tokens only — zero hex literals in this file.**
- `min-h-10` is not optional: it is the touch-target size every other control in these rows uses.

## C.6 `src/lib/copy.ts`

Append under the same section comment Task B added (which already records that both of these cv
strings are native-speaker confirmed, not best-effort):

```ts
directions: { cv: "Anda alla", en: "Directions" },
```

**Chavacano — FINAL, confirmed by the user, who is a Chavacano speaker (2026-09-21).**
`"Anda alla"` ("go there") is the string that ships. `anda` is already the verb this file uses for
going (`confirmVisit`: `"Ya anda yo aqui"`; `been`: `"Ya anda"`), `alla` is standard, it is ASCII,
and it matches the short imperative register of the other controls (`"Guarda"`, `"Quita"`,
`"Reporta"`, `"Cancela"`).

This string is **not** open for interpretation during implementation. Do not substitute, lengthen,
or "improve" it. Type it exactly as written above.

## C.7 Placement — `SpotCardView.tsx`

The existing actions row is wrapped in `{!isPreview && (…)}` at `:193-221`. Directions must render
for **preview cards too** (a famous-places preview has real coordinates; directions hits no RPC and
needs no account — that is the whole reason the preview guard exists for Save/Been/Report).

So: add a **separate, always-rendered row** immediately **after** the `{!isPreview && (…)}` block and
before the closing `</div>` of the overlay column:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <DirectionsLink lat={card.lat} lng={card.lng} tone="dark" />
</div>
```

Do **not** put it inside the `!isPreview` block, and do **not** restructure that block. Keeping it in
its own row is what lets `SpotCardView.preview.test.tsx`'s four "hides Save/Been/Report" assertions
stay green byte-for-byte.

Never gated: do not route it through `SignInPrompt`, do not consult `authStatus`.

## C.8 Placement — `SpotMap.tsx`, both popups

**`spots` loop** (`:465-500`, the write-mode popup): add `<DirectionsLink lat={spot.lat} lng={spot.lng} />`
inside the existing `<div className="zpots-popup-actions">`, immediately after `<ReportButton …/>`.

**`mapSpots` loop** (`:503-570`, the Mi mapa popup): the actions `<div>` there is conditional on
`{(onConfirmSpot || onReportSpot) && …}` — and `/mapa` passes **neither**, so that div does not
render at all. Directions must therefore go **outside** that conditional: add its own
`<div className="zpots-popup-actions"><DirectionsLink lat={spot.lat} lng={spot.lng} /></div>`
immediately **after** the `(onConfirmSpot || onReportSpot)` block and **before** the `onUnsave`
"Quita" button.

Exactly one directions link per popup. Do not also add one inside the conditional block.

## C.9 Test contracts — Task C

### `src/__tests__/directions.test.ts` (NEW)

1. `directionsUrl({ lat: 6.9098, lng: 122.079 })` **exactly equals**
   `"https://www.google.com/maps/dir/?api=1&destination=6.9098%2C122.079"`.
2. Negative coordinates: `{ lat: -6.9, lng: -122.1 }` → `…destination=-6.9%2C-122.1`.
3. Integer coordinates: `{ lat: 7, lng: 122 }` → `…destination=7%2C122` (no trailing `.0`).
4. **NEGATIVE:** `NaN` lat → `null`. `NaN` lng → `null`.
5. **NEGATIVE:** `Infinity` and `-Infinity` in either slot → `null`.
6. **NEGATIVE:** `undefined` cast into either slot → `null`, no throw.
7. **NEGATIVE — no platform branch:** for a valid input the result contains none of `maps://`,
   `comgooglemaps://`, `maps.apple.com`, `geo:`.
8. The result always starts with `https://`.
9. Purity: two calls with the same input return the same string; deleting `globalThis.navigator`
   for the duration of a call changes nothing and throws nothing.

### `src/__tests__/DirectionsLink.test.tsx` (NEW)

1. Renders a `link` whose accessible name matches `COPY.directions.en` (derive from `COPY`).
2. Its `href` equals `directionsUrl({ lat, lng })` for the props given (import the real function).
3. `target` is `"_blank"`.
4. `rel` contains `noopener` **and** `noreferrer` (assert on the attribute string, both substrings).
5. **NEGATIVE — it is a link, not a button:** `queryByRole("button")` is null.
6. **NEGATIVE — no URL, no element:** with `lat={NaN}`, the render output is empty
   (`container.firstChild` is `null`) — no stub, no disabled control, no empty anchor.
7. The Chavacano `COPY.directions.cv` text is on screen but its span is `aria-hidden="true"`, and the
   anchor's `aria-label` is not the cv string (the `Bilingual` contract, mirroring
   `aria-names.adversarial.test.tsx:44-52`).
8. Both `tone="light"` and `tone="dark"` render a working link with the same href and the same
   accessible name (behaviour, not classes — per `social-spots.md`, "test features and functions,
   not pure design").

### `src/__tests__/SpotCardView.directions.test.tsx` (NEW)

Harness: copy `SpotCardView.test.tsx`'s `next/navigation` mock and its `makeCard`/`baseProps` helpers.

1. A real card renders a `link` named `/directions/i` whose `href` is
   `directionsUrl({ lat: card.lat, lng: card.lng })`.
2. **A preview card renders it too** — `PREVIEW_SPOTS[0]`, link present. (The negative-of-the-negative:
   preview hides Save/Been/Report but must **not** hide Directions.)
3. **NEGATIVE — no gate:** with `authStatus="signed-out"`, the link is present and clicking it opens
   no sign-in prompt (`queryByRole("heading", { name: /sign in/i })` stays null).
4. **NEGATIVE — bad coords:** a card with `lat: NaN` renders no directions link and does not throw;
   the rest of the card (name, note, author) still renders.
5. Exactly **one** directions link per card (`getAllByRole("link", { name: /directions/i })` has
   length 1).
6. The existing controls are untouched: for a real signed-in card, Save, "I've been here" and Report
   are all still findable by their English names.

### `src/__tests__/SpotMap.directions.test.tsx` (NEW)

Harness: copy the react-leaflet mock from `SpotMap.mapSpots-gating.test.tsx`.

1. A `mapSpots` popup with **neither** `onConfirmSpot` nor `onReportSpot` still shows a `link` named
   `/directions/i` — proves it lives outside the actions conditional.
2. That link's `href` is `directionsUrl({ lat: spot.lat, lng: spot.lng })`.
3. A `spots` (write-mode) popup shows one too, with the right href.
4. **NEGATIVE — the gating contract survives:** in case 1,
   `queryByRole("button", { name: /confirm/i })` and `{ name: /report/i }` are both still null.
5. Exactly **one** directions link per popup, for both loops.
6. **NEGATIVE — bad coords:** a `mapSpots` entry with `lat: NaN` is already filtered by
   `hasFiniteCoords` and renders no marker at all; a well-formed spot alongside it still renders its
   link. No throw.
7. A `mapSpots` popup with `onUnsave` wired renders **both** the Quita button and the directions
   link (the new block did not displace the old one).

### `src/__tests__/copy.directions.test.ts` (NEW)

1. `COPY.directions.en === "Directions"`.
2. `COPY.directions.cv === "Anda alla"`.
3. `cv !== en`, also case-insensitively.
4. Both ASCII-only.
5. `"directions"` is in `Object.keys(COPY)`.

---

# Existing tests at risk — checked file by file

I grepped for this rather than guessing. Findings:

| File | Risk | Verdict |
|---|---|---|
| `src/__tests__/use-location.test.ts` | Its `getCurrentPosition` mocks take `(success, failure)` positionally and ignore extra args — a 3rd arg does not break them. Test 1 uses a never-resolving mock with **real** timers and asserts `"loading"` synchronously, so the 12 s watchdog cannot fire first. Test 7 ("no update after unmount") stays true because the watchdog is guarded by `settled` and by the same listener/mount checks. | **Stays green untouched. Do not edit it.** If the watchdog leaves a pending real timer at file teardown, guard it with `settled` — do **not** "fix" it by editing this file. |
| `src/__tests__/SpotsDeck*.test.tsx`, `PostFlow*.test.tsx`, `page.homeMap.test.tsx`, `AppNav.adversarial.test.tsx` | All eight `vi.mock("@/lib/use-location", …)`. Fully insulated from Task A. | **No impact.** |
| `src/__tests__/SpotMap.test.tsx` (`:176` = 0, `:181` = 2, `:224` = 1, `:239` = 1) | Exact marker counts. This is the headline risk of Task B. It passes **no** `userLocation`, so `undefined` → no me-marker → every count holds. | **Green — and this is exactly why the prop design was chosen over a hook.** Re-run and confirm, do not assume. |
| All ten `SpotMap*.test.tsx` react-leaflet mocks | Task B adds `interactive` to an existing `<Marker>` and imports **no new** react-leaflet export. `.learnings.md`: a missing export makes the mock proxy throw — avoided entirely. | **No mock edits needed.** (And the single strongest argument against the accuracy `Circle`.) |
| `src/__tests__/mapa-page.test.tsx` | Its `SpotMap` stand-in is a typed function that ignores unknown props, so `userLocation` passes through harmlessly. **But** `mapa/page.tsx` will now call the real `useLocation()` (unmocked here). In jsdom `navigator.geolocation` is undefined → the hook settles to `denied` synchronously inside the effect → `userLocation = null`. No throw. | **Must be re-run and confirmed green untouched.** Only if it actually breaks may you add a `vi.mock("@/lib/use-location", …)` to it, and you must say so in the commit body. |
| `src/__tests__/copy.test.ts` | Parameterised over `Object.keys(COPY)`; two new keys auto-enrol. Requires: non-empty cv+en, ASCII-only. `"Aqui tu ta"/"You are here"` and `"Anda alla"/"Directions"` both pass. It also has explicit "has at least the entries named in the spec" lists — additive keys don't break those. | **Green. Verify, don't assume.** |
| `src/__tests__/copy.adversarial.test.ts` | Requires `cv !== en` (case-insensitively), and no leading/trailing whitespace, for every key outside the `["spots"]` allowlist. Both new keys satisfy all three. **Do not add either key to `SAME_TEXT_ALLOWLIST`** — `:32` asserts the allowlist is exactly `["spots"]` and would fail. | **Green, provided the two cv strings stay as specified.** |
| `src/__tests__/no-raw-hex.test.ts` | Scans `src/components/**/*.tsx` + `src/app/**/*.tsx`, excluding `src/components/icons/**`. New hex lives **only** in `pin-icons.tsx` (excluded). `SpotMap.tsx`, `mapa/page.tsx`, `SpotCardView.tsx`, `DirectionsLink.tsx` must contain **zero** hex. `src/lib/**` is not scanned at all. | **Green if the colour rule in B.3 is followed.** |
| `src/__tests__/pin-icon.test.ts`, `pin-icon.adversarial.test.tsx` | Assert only on `createPinIcon`. Appending a factory does not touch them. | **Green.** Assertion 16 in the new file is the belt-and-suspenders guard. |
| `src/__tests__/theme-tokens.test.ts`, `paseo-motion-css.test.ts` | Both read `globals.css` as text. Neither enumerates `.zpots-pin-icon*` rules nor forbids new selectors. No new `--zpots-` prefixed variable is introduced (both files ban that). | **Green.** |
| `src/__tests__/tile-tint-cascade.adversarial.test.ts:49` | Fails any selector containing **both** `.leaflet-tile-pane` and `.zpots-pin-icon`. Neither new rule does. | **Green.** |
| `src/__tests__/SpotMap.mapSpots-gating.test.tsx:67-68` | `queryByRole("button", { name: /confirm|report/i })` must stay null for a read-only popup. The directions affordance is an **anchor** (`role="link"`), so it cannot collide. | **Green — and this is why C.1.c mandates an `<a>`.** |
| `src/__tests__/SpotCardView.preview.test.tsx:51-58, 72-73` | Asserts Save/Saved/Been/Report are absent for a preview card, and that no `a[href="/u/<handle>"]` exists and no link is named by the handle. The directions anchor has a different href and a different accessible name. Placing it **outside** the `!isPreview` block (C.7) is what keeps `:51-58` true. | **Green.** |
| `src/__tests__/SpotCardView.test.tsx`, `SpotCardView.motion.test.tsx`, `SpotsDeck*.test.tsx` | Grepped for `getAllByRole("button")` / `queryAllByRole("button")` across the whole suite: **zero hits**. No control-count assertion exists to break. | **Green.** |
| `src/__tests__/aria-names.adversarial.test.tsx` | Renders only `ConfirmButton`, `ReportButton`, `AddSpotForm`, `SignInPrompt`. Untouched by all three tasks. | **No impact.** |
| `src/__tests__/SpotMap.popup.test.tsx`, `SpotMap.wiring*.test.tsx`, `SpotMap.just-confirmed.test.tsx`, `SpotMap.city*.test.*`, `SpotMap.fitbounds.test.tsx`, `SpotMap.fitToCity.zero-size.test.tsx`, `SpotMap.pergamino.test.tsx` | Adding one anchor inside popup markup and one optional marker. No count assertions in any of them. | **Re-run all of them. Expected green.** |

**Rule: every one of the above is verified by running the suite, not by reading this table.** A full
`npm test` must be green before each commit.

---

# Out of scope — do not touch

- `MapInsetInner.tsx` / `MapInset.tsx` — no "me" mark, no location hook, no new prop (B.1.a).
- Any GPS accuracy circle, halo, or heading/compass arrow (B.1.d).
- `watchPosition`, live tracking, a "recenter on me" button, or a retry/re-prompt control.
- Widening `LocationStatus` with a `"timeout"` member (A2).
- Apple Maps, `geo:`, `comgooglemaps://`, or any user-agent branch (C.1.b).
- In-app routing, turn-by-turn, distance-to-walk estimates, or an embedded route line.
- Any Supabase migration, RPC, table, column, or policy. **Zero backend change in all three tasks.**
- Any new npm dependency.
- Editing `src/__tests__/use-location.test.ts`, `SpotMap.test.tsx`, `copy.test.ts`,
  `copy.adversarial.test.ts`, `SpotCardView.preview.test.tsx`, or
  `SpotMap.mapSpots-gating.test.tsx`. If one of them goes red, **the implementation is wrong**, not
  the test.
- The Chavacano strings: they are **final and user-confirmed**. Ship exactly `"Aqui tu ta"` and
  `"Anda alla"`. Do not substitute, re-translate, or re-open them.

---

# Task ordering and parallelism

```
Task A ──┐
         ├── (independent, disjoint files, run in parallel)
Task B ──┘
              │
              └──► Task C   (must wait for B)
```

- **A ∥ B.** Zero file overlap. A touches `src/lib/use-location.ts` only. B never imports from it
  (the page does, but the page is B's own file).
- **C after B — mandatory.** They collide on **two** files: `src/lib/copy.ts` and
  `src/components/SpotMap.tsx`. Running them in parallel worktrees produces a merge conflict in
  both. Sequence them.
- If only one worker is available, run **A → B → C**.

---

# Commit plan

Scope convention taken from `git log --oneline -15`: `{type}({slug}-task-{n})` for numbered work
(`feat(paseo-motion-task-2.4)`, `fix(pergamino-task-7.1)`) and `{type}({slug})` for docs
(`docs(pergamino)`). Subjects are sentence-case, imperative, no trailing period.

Slug for this spec: **`ubicacion`**.

One commit per task. Tests and implementation ship in the **same** commit (the tests were written
first and failed red; the commit is the green state).

```
fix(ubicacion-task-1): Stop the location lookup from hanging forever

feat(ubicacion-task-2): Draw the viewer's own position on the full map

feat(ubicacion-task-3): Open the user's maps app for directions to a spot
```

- Task 3's commit also carries the `.claude/prds/social-spots.md` Change Log row and open item for
  the accepted scope deviation.
- Every commit body ends with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

- Before each commit: `npm test` green, `npx tsc --noEmit` clean, `npm run lint` clean.
- After all three: append to `.claude/learnings.md` anything non-obvious that came up (the W3C
  timeout-starts-after-permission detail is a strong candidate).

---

# Acceptance criteria — the Reviewer uses this verbatim

### Process
- [ ] Every new test file listed below existed and was **confirmed failing red** before its
      implementation was written. Evidence is in the task notes, not assumed.
- [ ] No existing test was edited, weakened, or deleted to make new code pass.
- [ ] `npm test` is fully green.
- [ ] `npx tsc --noEmit` reports zero errors.
- [ ] `npm run lint` reports zero errors.
- [ ] `npm run build` succeeds.

### Task A
- [ ] `src/lib/use-location.ts` exports `GEOLOCATION_OPTIONS` deep-equal to
      `{ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }`.
- [ ] `getCurrentPosition` is called with exactly three arguments, the third being that object by
      reference.
- [ ] `src/lib/use-location.ts` exports `LOCATION_WATCHDOG_MS = 12000`, strictly greater than
      `GEOLOCATION_OPTIONS.timeout`.
- [ ] A `setTimeout` watchdog exists, collapses to `{ status: "denied", coords: FALLBACK_COORDS, isFallback: true }`,
      and is cleared on both success and failure.
- [ ] A `settled` guard makes the first of {success, failure, watchdog} win; every later callback is
      a no-op — including a late success after the watchdog.
- [ ] No timer is scheduled on the `!geolocation` branch.
- [ ] `LocationStatus` was **not** widened with `"timeout"`.
- [ ] A TIMEOUT error (`code: 3`) reaches the existing failure callback and yields
      `isFallback === true`.
- [ ] `src/__tests__/use-location.options.test.ts` exists with all 13 assertions from A.5, including
      every negative case.
- [ ] `src/__tests__/SpotsDeck.location-note.test.tsx` exists and proves "Using the city center"
      shows on fallback and is absent on a real fix.
- [ ] `src/__tests__/use-location.test.ts` is byte-identical to its state before this work.

### Task B
- [ ] `YouAreHereMark` exists in `src/components/icons/pin-icons.tsx` with the `PinIconProps`
      signature, `size = 22` default, `aria-hidden="true"`, `focusable="false"`.
- [ ] It draws a ring + terracotta disc + four inter-cardinal ticks. It contains **no** compass-rose
      kite and **no** tail path.
- [ ] `#b5482c` equals `--color-terracotta` in `globals.css`. Both hex values live in
      `pin-icons.tsx`, and **`src/lib/pin-icon.ts` gained zero new hex literals** — `structure.md`'s
      "only two hex values" rule still holds, unedited.
- [ ] `createYouAreHereIcon()` exists in `src/lib/pin-icon.ts` with `iconSize [26,26]`,
      `iconAnchor [13,13]`, no `popupAnchor`, className `"zpots-pin-icon zpots-pin-icon--me"`.
- [ ] Its html wraps the svg in `<span role="img" aria-label=… title=…>` using
      `COPY.youAreHere.en`, escaped via the existing `escapeHtmlAttribute`.
- [ ] `SpotMap` takes `userLocation?: LatLng | null` as a **prop**. It does **not** call
      `useLocation()`.
- [ ] The me-marker renders only when `userLocation` is non-null **and** passes `hasFiniteCoords`.
- [ ] The me-marker is `interactive={false}` and has no `<Popup>` child.
- [ ] The icon is built once via `useMemo(…, [])`, not per render, and not via `usePinIconCache`.
- [ ] `mapa/page.tsx` derives `isFallback ? null : coords` in **both** `SignedOutView` and
      `SignedInView`. The Plaza Pershing fallback never reaches `SpotMap`.
- [ ] `/mapa` renders no mark while loading, no mark on denial/timeout, and no `usingCenter` note in
      either case.
- [ ] `MapInsetInner.tsx` and `MapInset.tsx` are unchanged.
- [ ] No accuracy circle. No `Circle` import from react-leaflet anywhere. No react-leaflet mock was
      edited.
- [ ] `globals.css` gained the `.zpots-pin-icon--me` transform-origin and `pointer-events: none`
      rules, and no new `--zpots-` prefixed variable.
- [ ] `COPY.youAreHere` is `{ cv: "Aqui tu ta", en: "You are here" }`, and `"youAreHere"` is **not** in
      `copy.adversarial.test.ts`'s `SAME_TEXT_ALLOWLIST`.
- [ ] All four Task B test files exist with every assertion from B.9, including all six negative
      cases in `SpotMap.you-are-here.test.tsx`.
- [ ] `SpotMap.test.tsx`'s four marker-count assertions are still green, untouched.

### Task C
- [ ] `src/lib/directions.ts` exports `directionsUrl(destination: LatLng): string | null`, pure, no
      browser globals.
- [ ] For `{ lat: 6.9098, lng: 122.079 }` it returns exactly
      `https://www.google.com/maps/dir/?api=1&destination=6.9098%2C122.079`.
- [ ] It returns `null` for NaN, Infinity, and undefined in either slot.
- [ ] Exactly one URL format. No Apple Maps branch, no user-agent sniffing, no `maps://` / `geo:` /
      `comgooglemaps://` anywhere in the codebase.
- [ ] `DirectionsLink` renders an `<a>` with `target="_blank"` and `rel="noopener noreferrer"`, and
      renders `null` when the URL is null.
- [ ] It is a `link`, never a `button` — `SpotMap.mapSpots-gating.test.tsx` is still green.
- [ ] `DirectionsArrowIcon` is a hand-drawn custom SVG in `action-icons.tsx`, NE-pointing dart,
      `currentColor`, matching the file's existing props type and drawing language. No icon pack, no
      emoji.
- [ ] `COPY.directions` is `{ cv: "Anda alla", en: "Directions" }`, ASCII, cv ≠ en.
- [ ] The link appears on the spot card (including **preview** cards), on the `/mapa` `mapSpots`
      popup **with no confirm/report handlers wired**, and on the write-mode `spots` popup.
- [ ] Exactly one directions link per card and per popup.
- [ ] It is never gated: present and functional when `authStatus === "signed-out"`, and clicking it
      opens no `SignInPrompt`.
- [ ] `SpotCardView.preview.test.tsx` is still green, untouched — the link sits **outside** the
      `!isPreview` block.
- [ ] Zero raw hex in `DirectionsLink.tsx`; `no-raw-hex.test.ts` is green.
- [ ] All five Task C test files exist with every assertion from C.9.
- [ ] `.claude/prds/social-spots.md` carries the Change Log row recording the accepted scope
      deviation **and** an entry under "Open items for the user".

### Cross-cutting
- [ ] No emojis anywhere in code, copy, comments, or commit messages.
- [ ] No icon-pack imports; every new glyph is a hand-drawn SVG in `src/components/icons/**`.
- [ ] Zero Supabase/schema/RPC changes. Zero new npm dependencies.
- [ ] Three commits, `{type}(ubicacion-task-{n}): {Sentence case subject}`, each ending with
      `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- [ ] Non-obvious findings appended to `.claude/learnings.md`.

---

# Resolved before implementation (do not re-open)

1. **Chavacano — RESOLVED 2026-09-21, confirmed by the user, who is a Chavacano speaker.**
   `youAreHere.cv` is `"Aqui tu ta"` (second person). `directions.cv` is `"Anda alla"`. Both are
   authoritative and final. These two keys are **exempt** from the standing "needs a native-speaker
   review" flag in `copy.ts`'s header, since a native speaker has now reviewed them — note that in
   the section comment when you append them. No alternatives, no substitutions.
2. **Scope deviation — RESOLVED.** Directions is feature #8 against a 7-feature v2 list. Approved by
   the user in conversation 2026-09-21 and recorded in `social-spots.md`'s Change Log per section
   "SCOPE FLAG" above.
3. **The watchdog — RESOLVED 2026-09-21, decided by Claude. NOT raised with the user.** It ships. `PositionOptions.timeout`
   alone does not fix the reported bug (the timer only starts after permission is granted, so an
   unanswered prompt still hangs forever), so the 12 s wall-clock watchdog with the settle-once guard
   is **required**, alongside
   `{ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }`. Do not ship the options
   object on its own. If the user later objects to the extra machinery, this is the one decision in
   this spec that was made on their behalf — reopen it freely.

# Open items for the user

None. Everything in this spec is decided. Implement it as written.
