# PRD: Paseo motion pass (Tier 1)

**Parent:** paseo-social.md
**Status:** Complete
**Created:** 2026-09-21

## Summary

Add the motion layer the Paseo deck has never had: card arrival choreography, a map
inset that travels instead of teleporting, a confirm that feels earned, a live vinta
ring on fresh Hoy posters, and Ken Burns drift on the active card. CSS-first — no
animation library. Two prerequisite fixes ship with it.

## Why prerequisites exist

1. **The deck never sees the swipe.** `SpotsDeck` is `snap-y snap-mandatory` for the eye
   only. There is no IntersectionObserver, no scroll handler, nothing reads `scrollTop`.
   `activeIndex` moves only on arrow keys, a Hoy tap, or a `?spot=` deep link. Swiping
   desyncs the desktop map and the +/-2 card window. Every scroll-aware animation
   depends on fixing this, and it is a real bug regardless.
2. **The card photo is not full-bleed.** `SpotPhoto`'s `<img>` carries popup styling
   (`max-h-40 rounded border`) that leaks into the full-screen card. Ken Burns on a
   160px image inside a full-screen card looks broken.

## CSS contract (Wave 1 owns globals.css; Wave 2 only consumes these names)

Wave 2 agents MUST NOT add keyframes, tokens, or animation rules to globals.css.
They attach the class names and data attributes below and nothing else.

### Tokens — in the existing `@theme` block

    --ease-paseo:  cubic-bezier(0.22, 0.61, 0.36, 1);
    --ease-settle: cubic-bezier(0.16, 1, 0.3, 1);
    --dur-fast:  180ms;
    --dur-base:  320ms;
    --dur-slow:  640ms;

NEVER prefix a custom property with `--zpots-`. `theme-tokens.test.ts` bans it outright.

### Keyframes (top level)

| Name | Effect |
|---|---|
| `paseo-photo-settle` | scale 1.06 -> 1, opacity 0.85 -> 1 |
| `paseo-veil-rise`    | opacity 0 -> 1, translateY 8px -> 0 |
| `paseo-line-rise`    | opacity 0 -> 1, translateY 10px -> 0 |
| `paseo-ken-burns`    | scale 1 -> 1.04 with slight translate, 8s, alternate, infinite |
| `paseo-mark-draw`    | stroke-dashoffset full -> 0 |
| `paseo-ring-pulse`   | scale 0.8 -> 1.5, opacity 0.9 -> 0, once |
| `paseo-vinta-spin`   | `--vinta-angle` 0deg -> 360deg, 8s linear infinite |

### Classes and attributes

| Hook | Where Wave 2 puts it | Behavior Wave 1 gives it |
|---|---|---|
| `.paseo-slot` + `data-index` + `data-active` | each snap slot div in SpotsDeck | scopes everything below |
| `.paseo-photo` | photo layer wrapper in SpotCardView | settle on active; then ken-burns on active only, `animation-play-state: paused` when not active |
| `.paseo-veil` | the tinta gradient div | veil-rise, delay `--dur-fast` |
| `.paseo-line` + inline `--paseo-line-index` | name (1), note (2), distance (3) | line-rise, `animation-delay: calc(var(--paseo-line-index,0) * 60ms + var(--dur-fast))` |
| `.paseo-mark` | the `<path>` inside `CheckIcon` | mark-draw over `--dur-base` |
| `.paseo-confirm-pulse` | a single ring `<span>` rendered beside the confirmed badge | ring-pulse once, vinta-colored, `pointer-events-none` |
| `.zpots-pin-icon--just-confirmed` | added by `createPinIcon` when flagged | mark-draw on the combined halo path |
| `.vinta-ring[data-fresh="true"]` | HoyRow ring span | vinta-spin via `@property --vinta-angle` |

Animations run only under `.paseo-slot[data-active="true"]`, except the confirm and pin
ones which are event-driven.

### Reduced motion (top level, not nested in any existing rule)

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }

## Test constraints discovered in the survey — do not trip these

- `theme-tokens.test.ts` regex-parses globals.css with `/\.vinta-rule\s*\{([^}]*)\}/`
  and the same shape for `.leaflet-container` and `.leaflet-tile-pane`. `[^}]*` means a
  NESTED block inside any of those three rules breaks the match. Keep new rules separate.
- `theme-tokens.test.ts:48` forbids any `--zpots-` prefixed variable.
- `no-raw-hex.test.ts` fails on `/#[0-9a-fA-F]{3,8}\b/` in any `.tsx` under
  `src/components` or `src/app`, exempting only `src/components/icons/**`. Use `var()`.
- `MapInset.test.tsx` asserts `flyTo` is called exactly once per center change, never on
  mount, never at zero size, and matches the options object with `expect.anything()` —
  so retuning duration is safe, adding a mount pan is not.
- `ConfirmButton.test.tsx:60` asserts text matching `/^confirmed$/i` exactly (anchored).
  A wrapper that injects extra text or whitespace into that accessible name breaks it.
- `SpotCardView.test.tsx:147` asserts the been-here button is ABSENT once confirmed, so
  the old button must fully unmount — no fade-out-while-mounted.
- `pin-icon.adversarial.test.tsx:69-78` requires the confirmed className match
  `/\bzpots-pin-icon--confirmed\b/` and NOT `/\bzpots-pin-icon--unconfirmed\b/`. A new
  modifier class must not contain the other status as a whole word.
- `SpotsDeck` tests depend on `data-testid="spots-deck"` and `data-active-id` on the root,
  and on `SpotCardView` staying the single child per slot. Class names on the scroller
  are unasserted and free to change.
- `shell.test.tsx` requires exactly one `.vinta-rule` element on the page.
- `MapInsetInner.pergamino.test.tsx:93-100` reads MapInsetInner.tsx as source text and
  asserts it never imports or renders `PlaceLabelsLayer`.
- A `transform` on the slot wrapper makes it a containing block for the absolutely
  positioned map inset, and `globals.css` `.leaflet-container { isolation: isolate }`
  exists to fix an AppNav z-40 stacking bug. Animate inner layers, never the slot wrapper.

## Waves

| Wave | Task | Files | Parallel |
|---|---|---|---|
| 1 | CSS foundation: tokens, keyframes, classes, `@property`, reduced-motion | `src/app/globals.css` | no |
| 2.1 | Scroll-driven active index + slot attributes + stagger wiring + full-bleed photo fix | `SpotsDeck.tsx`, `SpotCardView.tsx`, `SpotPhoto.tsx` | yes |
| 2.2 | Map travels: distance-scaled flyTo + fading trail polyline | `MapInsetInner.tsx` | yes |
| 2.3 | Confirm earned: mark draw + ring pulse + pin modifier | `ConfirmButton.tsx`, `icons/status-icons.tsx`, `lib/pin-icon.ts` | yes |
| 2.4 | Hoy freshness: migration returning `created_at`, plumb to `data-fresh` | `supabase/migrations/0006_hoy_created_at.sql`, `lib/feed-repo.ts`, `HoyRow.tsx`, `SpotsDeck.tsx` | yes |
| 3 | Full suite, lint, tsc, review | — | no |
| 4.1 | Fix: pin icon identity so the halo draws once | `MapInsetInner.tsx`, `SpotMap.tsx`, `PostFlow.tsx` | yes |
| 4.2 | Fix: reconcile the deck when a programmatic scroll is overtaken | `SpotsDeck.tsx` | yes |

Wave 2.1 and 2.4 both touch `SpotsDeck.tsx`. 2.4 only adds a `createdAt` pass-through to
`HoyRow`; 2.1 owns the slot markup and the observer. Run 2.4 after 2.1 to avoid a clash.

## Workflow rules (from CLAUDE.md)

- Tests first, red before green, written against this contract and not reshaped after.
- One commit per task, `{type}(paseo-motion-task-N): {description}`, with the
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line.
- No emojis. No icon packs.

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-21 | Created | Tier 1 motion pass approved, full scope with prerequisites |
| 2026-09-21 | Review round 1 REJECTED | Confirm animation fired on `status === "confirmed"` rather than the transition, so it replayed every time a confirmed card re-entered the ±2 window. Pin halo was implemented and unit-tested but called by nobody. `scrollIntoView` fired on every index change, including ones the observer derived from the user's own scroll. |
| 2026-09-21 | Fixes 3.1 / 3.2 | Added `useJustConfirmed` transition hook; wired the pin halo through `SpotMap`/`SpotCardView`; split `activeIndex` into `activeMove {index, origin}` so only programmatic moves scroll. |
| 2026-09-21 | Review round 2 REJECTED | Inline `createPinIcon(...)` in JSX allocated a new `L.DivIcon` per render; react-leaflet compares icons by reference, so Leaflet rewrote `innerHTML` and restarted the one-shot halo. The programmatic-scroll guard could stick permanently when a gesture overtook an in-flight move, since `IntersectionObserver` only fires on crossings. |
| 2026-09-21 | Fixes 4.1 / 4.2 | Memoized pin icons (`useMemo`, plus a `usePinIconCache` for `.map()` loops); cancel the scroll guard on `wheel`/`touchstart`/`pointerdown`, which `scrollIntoView` never dispatches. |
| 2026-09-21 | Review round 3 APPROVED | 1250 tests, tsc, lint and production build all green. |

## Known gaps at completion

- The dev database holds one spot with no photo, so the IntersectionObserver swipe path and the
  full-bleed photo fix have never run against real data — they are covered only by mocked tests.
  Both review rounds found their bugs in exactly this kind of mocked-out layer. Seeding several
  photo-bearing spots would close it.
- `useJustConfirmed` treats "status flipped while mounted" as "the user just confirmed it". True
  today because nothing subscribes to external status changes; adding realtime would invalidate it.
- A gesture that fires without relocating the viewport (tapping a button mid-flight) can cancel the
  guard early. Self-correcting within a frame because `observe()` replays intersection state; noted,
  not fixed.
- `PostFlow.tsx`'s `tappedLocationIcon` memo has no dedicated regression test. That pin never carries
  the halo, so a regression there is DOM thrash, not broken motion.
