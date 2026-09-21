# Zpots — Learnings

Rolling log of non-obvious discoveries. Newest first. Prune entries older than 60 days.

## [2026-09-19] - Auth migration (required email/password login)

- The `confirmations` wipe in `0002_auth.sql` uses `DELETE FROM public.confirmations`, not `TRUNCATE`, on purpose: `DELETE` fires the existing `confirmations_touch_spot` row trigger per row, which recounts every affected spot back to `confirmations = 0, status = 'unconfirmed'` as a side effect. `TRUNCATE` skips row triggers entirely and would leave every spot's cached `confirmations`/`status` stale (still showing old counts with no rows to back them up). This means pre-migration anonymous confirmations are not just deleted, they're deleted *and* every spot they had flipped to Confirmed silently reverts to Unconfirmed on the same run -- expected, not a bug, and worth remembering before running the script live.
- `supabase.auth.signUp()` returns an **obfuscated existing user** (`data.session === null`, `data.user.identities` is an empty array, no `error`) when the email is already registered *and* "Confirm email" is turned ON in the dashboard -- this is Supabase's deliberate anti-enumeration behavior, not a bug. It only surfaces as a real `user_already_exists` error when confirmation is OFF. The UI must show the same "check your inbox" copy for both a genuine new sign-up and a duplicate-email attempt when confirmation is on; trying to distinguish them client-side (e.g. checking `identities.length === 0` to change the message) would defeat the anti-enumeration protection Supabase is providing.
- Supabase JWTs carry an `is_anonymous` claim once the project's "Allow anonymous sign-ins" toggle is enabled -- and that toggle mints ordinary `authenticated`-role tokens, meaning a naive `TO authenticated` RLS policy would silently accept anonymous sessions as if they were real accounts. `is_real_user()` (`auth.uid() IS NOT NULL AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false)`) is the belt-and-suspenders check every write policy in `0002_auth.sql` uses, so flipping that toggle on later (by accident or otherwise) can never reopen anonymous writes even though the dashboard setting defends against it too.
- Postgres RLS `WITH CHECK` expressions can reference a column the calling role has **no SELECT grant on** -- policy expressions aren't subject to column-level privilege checks the way a `SELECT` query is. `reports_insert_own`'s `WITH CHECK (reported_by = auth.uid())` works even though `authenticated` never gets `SELECT` on `public.reports` at all. Confirmed by testing through the running app (insert succeeded) rather than assuming from documentation. If this ever throws `42501` specifically on that check, the fix is granting `SELECT (reported_by)`, not deleting the check.
- The `?next=` redirect-back param on `/login` needs an explicit open-redirect guard: accept only same-origin relative paths (starts with a single `/`, not `//`, no scheme colon before the first `/`, no backslash). A raw `router.replace(searchParams.get('next'))` would let a crafted link redirect a freshly-authenticated user to an attacker-controlled URL immediately after login -- exactly the moment they're most likely to trust where they land.
- Every row in `public.confirmations` from the pre-auth era was discarded by the migration (A6/D2) -- there is no user to map a random `localStorage`-issued string to, so "migrate" isn't an option, only "delete and recount." Anyone who anonymously confirmed a spot before this migration loses that vote, and any spot that vote had flipped to Confirmed reverts to Unconfirmed until two real accounts confirm it again. Stated here (and in the README/product.md) rather than left as a silent side effect of running the SQL.

## [2026-09-19] - Compass Rose theme + Settings page

- `next/font/google` fonts (Cinzel, Cormorant Garamond, Work Sans) need no new npm package -- same pattern as the existing Geist/Geist Mono wiring in `layout.tsx`: import from `next/font/google`, assign a `variable`, add the class to `<html>`, then reference `var(--font-x)` in CSS/inline styles. Cormorant Garamond needed `style: ["italic"]` explicitly since the tagline is italic-only.
- New compass-rose pin silhouette is symmetric about its vertical axis (unlike the old faceted gem, whose tip sat at x=15 in a 0..32 box), so `ICON_ANCHOR`/`POPUP_ANCHOR` in `pin-icon.ts` moved from `[15,30]`/`[1,-28]` to `[16,30]`/`[0,-28]` -- centered on the new tail's tip. No test hardcoded the old numbers, and `npm test` stayed green after the change.
- Storage-key exports (`CONFIRMER_ID_STORAGE_KEY`, `CONFIRMED_SPOTS_STORAGE_KEY`) were purely additive (`export const X = "..."; const OLD_NAME = X;`) -- did not require touching either frozen test file, both still pass unmodified.
- Verified the new chrome server-rendered correctly via `curl localhost:3000` and `localhost:3000/settings` (both 200, expected text present) and by grepping the freshly-compiled dev chunk for the new pin path data vs. a stale cached chunk still holding the old gem shape -- no computer-use/chrome MCP browser tool was available in this session to click through it live, same gap noted in the prior two sessions' entries.

## [2026-09-19] - Restricting the map to Mindanao

- Leaflet's `maxBounds` only restricts *panning* (the center gets clamped, with `maxBoundsViscosity` controlling how elastic the clamp feels); it does not, by itself, stop a user from zooming out far enough that the *viewport* shows land beyond the bounds' edges. That's `minZoom`'s job. Checked the actual numbers before touching anything: at the existing `MIN_ZOOM = 11`, even a generously wide 2560px browser window only shows ~1.8 degrees of longitude (`2560 / (256*2^11) * 360`), which is already far smaller than Mindanao's own ~7-8 degree width, let alone the full Philippines' ~11 degree span. So `MIN_ZOOM` did not need raising — it already over-satisfies the "can't see outside Mindanao" requirement by a wide margin. Left it unchanged and just added the formula-based test + code comment instead of bumping the number for its own sake.
- `MapContainerProps extends MapOptions` (Leaflet's own map options interface) in `react-leaflet` v5, so `maxBounds`/`maxBoundsViscosity` pass straight through with no extra typing needed — confirmed in `node_modules/react-leaflet/lib/MapContainer.d.ts` before assuming the props existed.
- The frozen `SpotMap.test.tsx` mock for `MapContainer` only destructures `{ center, zoom, children }`, so it silently ignores any new props (`maxBounds`, `maxBoundsViscosity`, `minZoom` were already being ignored too) — safe to add new `MapContainer` props without touching or breaking that frozen file. New coverage for those props lives in a separate `SpotMap.mindanao.test.tsx` with its own scoped mock.
- No browser-automation tool (computer-use, chrome MCP, playwright) was available in this session either — same gap as the previous session's note. Verified via `npm test`/`tsc`/`lint`/`build` only; did not visually check the running dev server.

## [2026-09-18] - Wiring the map (tap-to-place, confirm, report)

- `react-leaflet`'s `MapContainer` is `React.ForwardRefExoticComponent<... & React.RefAttributes<LeafletMap>>` -- passing a plain callback `ref` gives the real Leaflet `Map` instance, so `map.on("click", ...)` is the correct way to detect a map tap. This needs no new import (`useMapEvents`/`useMap`) from `react-leaflet`, which matters because `SpotMap.test.tsx`'s frozen mock only exports `{ MapContainer, TileLayer, Marker, Popup }` -- importing any other named hook from `react-leaflet` would be `undefined` there and crash on render. Verified empirically: passing `ref` to a non-`forwardRef` mock function component is a silent no-op (React only logs a dev warning, doesn't throw), so the click-to-place feature degrades gracefully to "does nothing" under that old mock without breaking any of its assertions.
- Leaflet disables click-propagation from both `Marker` and `Popup` onto the map by default, so a `map.on("click", ...)` handler naturally never fires when the user is actually interacting with an existing pin or its popup buttons -- "not on an existing marker" from the tap-to-place spec falls out for free, no manual event-target checking needed.
- Embedding `ConfirmButton` in the same popup as the existing status pill created a real collision: `ConfirmButton`'s confirmed-state badge renders the bare literal text "Confirmed", and the old `SpotMap.test.tsx` (frozen, unmodifiable) asserts `within(popup).getByText(/^confirmed$/i)` resolves to exactly one element. Since `ConfirmButton`'s own text is a frozen contract too, the fix had to be on the *status pill's* wording (mine to change) -- relabeled it "Confirmed pin" / "Unconfirmed pin" so only `ConfirmButton`'s badge matches the bare-word regex. Worth remembering any time a new frozen component is dropped into markup that already has its own status text.
- `AddSpotForm`'s `onSubmit` prop is synchronous (`(input) => void`) with no error-display prop of its own -- there's no way to inject a server-side failure message *inside* that component without touching its frozen contract. Resolved by keeping the error banner in the wrapping overlay (SpotMap.tsx) directly above the still-mounted `AddSpotForm`; the user's typed input survives because the form is never unmounted on failure, only on success/cancel. Flagging this as a real prop-shape gap rather than a workaround to hide: a future non-frozen revision of `AddSpotForm` should probably accept an optional `error` prop.
- `react-hooks/set-state-in-effect` (the new React ESLint rule) flags a synchronous `setState` at the top of a `useEffect` body. Reading `localStorage`-backed initial state (here: `getLocallyConfirmedSpotIds()`) belongs in a lazy `useState(() => ...)` initializer instead -- it's SSR-safe already (the module guards a missing/throwing `localStorage` and returns an empty result), and a fresh client-side mount re-runs the initializer with the real browser storage anyway, so no effect is needed at all.
- Live round-trip against the real Supabase project (via curl, exact payload shapes from `spots-repo.ts`) confirmed the schema's derived-state design works end-to-end outside the mocked tests: two distinct `confirmations` inserts flip `status` to `confirmed` and `confirmations` to `2` purely via the DB trigger; a client `PATCH .../spots` sending `{confirmations:999,status:'unconfirmed'}` comes back unchanged (`confirmed`, `2`) because the `BEFORE UPDATE` trigger recomputes it; a duplicate `(spot_id, confirmer_id)` pair correctly 409s with `23505`. Left one row in production for manual cleanup: `id` logged in the session output, `name = 'zzz-integration-test-delete-me'` (anon has no DELETE grant by design, so this can't be cleaned up from the client).

## [2026-09-18] - Environment

- System `git` is 2.15.0: no `git init -b`, no `git branch --show-current`. Set the default branch with `git symbolic-ref HEAD refs/heads/main` after `git init`.
- `create-next-app` rejects capitalized package names, so it cannot scaffold directly into a folder named `Zpots`. Scaffold into a lowercase temp dir, move the files over, then set `name` in `package.json` manually.
- `npx tsc --noEmit` fails on a fresh checkout until `npx next typegen` has run once — Next 16's `LayoutProps<"/">` comes from generated `.next/types`, which is gitignored. Run typegen before typechecking in CI.
- `next dev` rewrites an `AGENTS.md` agent-rules block on every run and generates a `CLAUDE.md` containing `@AGENTS.md`. Project rules were appended below that import line rather than replacing it, so the regeneration does not clobber them.
- A CSS import inside a component loaded via `next/dynamic({ ssr: false })` lands in its own lazy-loaded chunk, which gets injected *after* the global stylesheet — so its rules win same-specificity ties even though it's imported "first" in source order. Fix: hoist the third-party CSS import (`leaflet/dist/leaflet.css`) into the root layout, above the `./globals.css` import, so load order is deterministic instead of dynamic-chunk-dependent.

## [2026-09-18] - Add-pin backend (F1/F2/F11 in confirmation)

- F1 confirmed in practice: the frozen `confirmSpot` fake exposes only `from/select/eq/insert/update/single/then` (no `rpc`), so `confirmSpot` does the column-grant-guarded client UPDATE the spec describes rather than an RPC. Read-before-insert ordering matters: the fake's duplicate detector only flags a row as a repeat if it shares 2+ scalar values with an existing row in the *same* table, so the confirmations insert payload must be exactly `{ spot_id, confirmer_id }` (F11) — one extra constant key and two different confirmers of the same spot would falsely collide.
- F2 confirmed: `insert(payload)` in the fake resolves a plain `Promise` with no `.select()` chain available, so `createSpot` must await the bare insert and fall back to `toSpot({ ...payload, created_at: new Date().toISOString() })` when `data` is null. In the real supabase-js v2 client this branch is not dead in tests but *is* dead in production only once `Prefer: return=minimal` behavior is confirmed against a live project — worth re-checking once the schema is live.
- `getLocalConfirmerId` and spot-id generation share one `generateUuid()` helper (`src/lib/uuid.ts`) that tries `crypto.randomUUID()` first and falls back to `crypto.getRandomValues` — needed because Vitest/jsdom and insecure-origin phones both can lack `randomUUID`.
- TypeScript quirk (not fixed, flagged instead): `src/__tests__/spots-repo.test.ts` passes a `Spot`-typed object literal into `createFakeSupabase(seedRows: Record<string, Record<string, unknown>[]>)` in 4 places. Because `Spot` is a named interface without an index signature, TS raises `TS2322 Index signature for type 'string' is missing in type 'Spot'` there — confirmed via `git stash` that this error already existed on the original frozen commit before any implementation code was written, so it's pre-existing and not something a library-code change can fix. It blocks a fully clean `npx tsc --noEmit` and `npm run build` unless someone edits that test file (out of scope for this pass) or relaxes tsconfig's `include` to exclude test files (a separate, deliberate tradeoff not taken here).

## [2026-09-18] - Testing

- Do not render real Leaflet in jsdom — it needs layout measurement and goes flaky. Mock `react-leaflet` with stand-ins that serialize props into `data-*` attributes and assert on the wiring instead.
- `next/dynamic(..., { ssr: false })` cannot be called directly inside a Server Component (Next 16 throws "ssr: false is not allowed with next/dynamic in Server Components"). Needs a small `'use client'` wrapper (`src/components/MapView.tsx`) that owns the dynamic import; the page itself stays a server component.
- That `ssr: false` bailout shows up in the raw SSR HTML as a `BAILOUT_TO_CLIENT_SIDE_RENDERING` comment/stack trace embedded in the response. This is expected Next.js behavior for client-only components, not a real error — do not mistake it for a bug when curling the page directly.
- No browser-automation tool (computer-use, chrome MCP, puppeteer/playwright) was available in this session's toolset, only Bash/Read/Write/Edit. Verified the client bundle loads (200 on the chunk URL) and the dev server log stayed clean across requests as a substitute for an actual console check — flagged this gap explicitly rather than claiming a browser was opened.

## 2026-09-20 - Redesign ("Ciudad Latina") and Zamboanga-only bounds

- **Tile theming without a tile provider:** `filter: sepia() saturate() ...` on `.leaflet-tile-pane` only. Markers and popups live in other panes, so they stay crisp. The rule must come after the `leaflet.css` import to win the cascade (covered by `tile-tint-cascade.adversarial.test.ts`).
- **Leaflet maxBounds smaller than the viewport does not jitter** in 1.9: `_getBoundsOffset` centers the map instead. So `MIN_ZOOM` 12 with the ~0.83 deg wide city box is safe even on ultra-wide screens.
- **Bilingual UI rule:** Chavacano is the visual primary, English is the `aria-label`. Tests query by English names, so copy changes never break the regression net. All strings live in `src/lib/copy.ts`; they are best-effort Zamboangueno and still need a native speaker's check before launch.
- **Bounds live in three places on purpose:** `src/lib/city-bounds.ts` (client), `supabase/migrations/0003_zamboanga_bounds.sql` (check constraint), and `migration-bounds.test.ts` guards that the two sets of numbers never drift.
- **Anti-pattern: two coder agents in one git working tree.** Their `git add`/`commit` calls raced on the shared index and merged two tasks into one commit; it had to be split by hand afterwards. Run parallel coders in separate worktrees, or serialize commits.
- **Dev database has junk "probe" pins** (placed in the sea, fake `x.supabase.co` photo URLs) left over from earlier testing. They are what you see when the popup photo fails to load.

## 2026-09-20 - Social spots build (feed, saves, personal map, profiles, follows)

- **`next/dynamic` only code-splits a real `import()`:** wrapping a component with `dynamic(() => Promise.resolve({ default: X }))` in the same file that imports react-leaflet at top level still evaluates Leaflet during prerender and breaks `npm run build` with "window is not defined". Put the Leaflet part in its own file and `dynamic(() => import("./Inner"), { ssr: false })`, like `MapView.tsx`.
- **`useSearchParams()` needs a Suspense boundary** in any statically prerendered page, or the build fails. `app/page.tsx` and `login/page.tsx` wrap the client component in `<Suspense>`.
- **Offset paging can overlap:** `feed_cerca` pages by offset ordered by distance, so a spot inserted between fetches shifts rows. The deck de-dupes appended pages by id. The time-ordered lanes use keyset paging and do not have this problem.
- **Optimistic toggles need a per-item request token:** a double tap on Save fires two requests; reverting on any rejection can undo a duplicate that succeeded. Only the latest request's outcome is applied.
- **Vitest mock proxies throw on reading a missing export**, not just on calling it. When a component starts importing `Polygon`/`useMap` from react-leaflet, every per-file react-leaflet mock must export stand-ins, or the whole file fails. Fixed in the mocks, not with feature detection in the component.
- **`vi.clearAllMocks()` keeps queued `mockResolvedValueOnce` values**, which leak into the next test. Use `vi.resetAllMocks()` in `beforeEach`.
- **Test-driven contract quirks to know:** `uploadAvatar` only uploads and returns a URL; `updateAvatarUrl` persists it. `handle_available(handle)` takes the arg named `handle`. `feedNuevo` never touches auth.
- **Known limitation:** a `?spot=` deep link to a spot beyond the first feed page falls back to the top card; the adversarial test documents it.
- **Migrations 0003 and 0004 are still unapplied.** Until 0004 runs, every feed function 404s and the deck shows "Could not load". Expected, not a bug.

## 2026-09-20 - Preview spots (famous-places fallback)

- **Preview spots are client-only constants** (`src/lib/preview-spots.ts`), never DB rows: the `spots.photo_url` CHECK only accepts the `spot-photos` bucket, and their ids do not exist server-side. Every consumer tells them apart by the `preview-` id prefix (`isPreviewSpot`) or `source: "preview"` on the map. The card hides Save/Been/Report and the profile link; the deck short-circuits its handlers as a second guard.
- **When they show:** deck Cerca/Nuevo lanes only when the first page is empty (never on a failed load, never in Siguiendo); Mi mapa signed-out, and signed-in until `my_map()` returns a real pin. Once the dev DB has any spot the deck fallback disappears, so verify it by mocking the feed, not against the running server.
- **`fitToCity` on a percentage-height wrapper fits into a zero-size container** and lands at max zoom with every pin off-screen. Any map page needs the flex-column + `min-h-0 flex-1` skeleton `SignedInView` uses.
- **Fit-to-city leaves downtown below the fold:** the outline is tall (6.78 to 7.48 lat) and clamps to MIN_ZOOM 12 centered mid-city. `SpotMap`'s new `fitBounds` prop (compared by value, capped at zoom 15) frames the preview cluster instead; it is declared after the fit-to-city effect so it wins on the same mount.
- **Photos are hot-linked from Wikimedia Commons** (CC BY-SA, attribution in `photoCredit`, rendered on the card and in the popup). `SpotPhoto`'s onError placeholder covers a dead link; `next.config` needs no `remotePatterns` because the app uses plain `<img>`.
- **Full-suite timeouts while `next dev` and the browser pane are running** (AddSpotForm, profile-page, settings-page) pass alone; the CPU contention, not the code, is the cause.

## 2026-09-20 - Applying migrations to a hosted Supabase project

Three real failures hitting a live project with migration 0004, worth not repeating:

- **The SQL editor cannot own `storage.buckets`.** `insert into storage.buckets ...` fails with `42501: must be owner of table buckets` on current projects, even though 0001 did it successfully when this project was created. Create buckets in Dashboard > Storage and keep only `storage.objects` policies in SQL.
- **A failed run is not necessarily rolled back.** Despite the `begin; ... commit;` wrapper, the editor had already committed the tables before the failing statement, so the re-run died on `42P07: relation "profiles" already exists`. Every migration that a human pastes must be idempotent: `if not exists`, `or replace`, `drop policy/trigger if exists`, and a `pg_constraint` guard around `add constraint`.
- **Never `drop view` when functions return `setof` that view.** `feed_nuevo` and `feed_siguiendo` are declared `returns setof public.spot_cards`, which depends on the view's composite type, so a drop fails with `2BP01`. Use `create or replace view`, which keeps the type OID. `drop ... cascade` would have silently removed the functions. A test now asserts the file contains no `drop view`.
- **Do not let a test regex drive SQL shape.** The `drop view` above was introduced only so an existing regex would keep matching. Change the test, not the DDL.
- **No local Postgres here** (no docker, psql, or supabase CLI), so migrations cannot be rehearsed before the user runs them. Compensate with a statement-by-statement static audit and a commented verification query at the end of the file.

## 2026-09-20 - Pergamino: drawing the map instead of tinting a picture of it

- **Raster tile labels cannot be restyled.** Street and place names in an OpenStreetMap raster tile are pixels in a PNG, baked in before the tile reaches the phone. CSS can tint, blur or flatten them along with everything else, never change the typeface. Custom map typography requires vector tiles, full stop. Worth saying out loud early: it is the kind of thing someone will otherwise spend an afternoon trying to filter their way out of.
- **"Light" basemaps are designed to be invisible.** Esri's Light Gray Canvas and friends exist as a backdrop for data overlays, so a road is only a few percent darker than the ground beside it. Under the Pergamino filter that difference disappears entirely and the map reads as blank paper. Any label-free raster basemap must be judged on its ink, not its name.
- **Free label-free raster basemaps have mostly moved behind API keys.** CARTO's `light_nolabels` now returns tiles watermarked "API KEY REQUIRED" with a 200 status, so it fails silently rather than loudly. Check the pixels, not the status code.
- **`protomaps-leaflet` reads the *global* `L` at call time** (`frontends/leaflet.ts` is `declare const L: any`). It works today only because Leaflet 1.9.4 ships no `module`/`exports` field, so bundlers pick the UMD build, which happens to set `window.L`. That is an accident, not a contract: set the global explicitly before calling `leafletLayer`.
- **A fire-and-forget async effect needs its own catch.** The archive probe was written never to throw, which made the surrounding `attach()` look safe — but it also awaited `import("protomaps-leaflet")`, and a dynamic import genuinely rejects on a CDN blip, an ad blocker or a stale chunk after a redeploy. That rejection left the component with no mode set and the map permanently blank. Catch inside the async body, and gate any logging on the same mounted check as the state update so a teardown does not spam the console.
- **Extend an unfaithful test double, do not defend against it in production.** Four suites forward a hand-written fake Leaflet map through `MapContainer`'s ref, implementing only the handful of methods the code happened to call. When a new layer legitimately called `getPane`, 35 tests broke. The fix is to teach the double the methods a real `L.Map` always has. Adding `typeof map.getPane === "function"` guards to components would have been test-driven damage: production branches for a state that cannot occur.
- **Plan assumptions about mocks need checking per file.** The spec asserted no existing `react-leaflet` mock would need changing because the map stays null in jsdom. True only for the files that never forward a live ref; the ones that do exercise click and fitBounds wiring broke immediately.
- **Parallel agents in one tree work if none of them touch git.** Ten tasks ran as five-then-two-then-two concurrent agents, each forbidden from `git add`/`commit`, with the orchestrator committing per task from a known file list afterwards. No index races, and commits stayed atomic. This is the answer to the earlier "two coder agents merged two tasks into one commit" anti-pattern.
- **Give each parallel agent a disjoint file list and say who owns what.** Where a Wave 1 task genuinely needed a type from a sibling task's unwritten file, the agent correctly deferred one assertion rather than improvising scope; that deferral then had to be tracked and backfilled, so it is cheaper to order such pairs across waves than to call them independent.

## [2026-09-21] - Motion pass (paseo-motion): mocked layers hide real bugs

**Anti-pattern: a green suite means nothing when the test mocks the layer the bug lives in.**
Two review rounds each found ship-blocking bugs behind a fully green 1245-test suite. Both times
the test mocked out exactly the mechanism that was broken:
- `MapInsetInner.just-confirmed.test.tsx` / `SpotMap.just-confirmed.test.tsx` mocked react-leaflet's
  `Marker` as `<div data-testid="marker" />`, dropping the `icon` prop — so they could not see that
  inline `createPinIcon(...)` in JSX allocated a new `L.DivIcon` every render, which react-leaflet
  reference-compares and Leaflet answers with `div.innerHTML = options.html`, restarting the
  one-shot halo animation. Fix: mocks now capture the `icon` prop by reference and assert identity
  stability across unrelated re-renders.
- `SpotsDeck.motion.test.tsx` had a test literally titled "does not fight a programmatic move" that
  never fired an intersection event mid-gesture. It tested nothing.

**Rule:** when mocking a library boundary, ask what the real library does with the value you are
dropping. If the answer is "compares it by reference" or "writes it to the DOM", the mock has
erased the contract.

**Anti-pattern: animating on a state value instead of a transition.** `ConfirmButton` fired the
"earned" confirm animation whenever `status === "confirmed"`. Because `SpotsDeck` mounts/unmounts
cards in a ±2 window, scrolling past an old confirmed spot replayed it every time. A one-shot
celebration must be driven by the `false → true` transition on a mounted instance
(`src/lib/use-just-confirmed.ts`), never by the current value.

**Pattern: `IntersectionObserver` only fires on threshold crossings.** Any guard that waits for a
specific element's crossing can stick forever if the user lands somewhere else — nothing arrives to
self-correct. Guards need a reconciliation path, not just a timeout that nulls a ref. Cancelling on
`wheel`/`touchstart`/`pointerdown` works because `scrollIntoView` never dispatches those, so they
are an unambiguous "the user took over" signal.

**Gotcha: `useMemo` cannot memoize per item inside a `.map()`.** `SpotMap` needed a `useRef`-backed
cache (`usePinIconCache`) keyed on the inputs the icon actually consumes. Bounded because the spot
arrays are a bounded per-city fetch, not infinite scroll.

**Verified, contrary to expectation: `var()` DOES resolve in an SVG presentation attribute.**
`setAttribute('stroke', 'var(--color-terracotta)')` computes correctly in Chromium 152, same as
setting it as a CSS property. Leaflet `pathOptions={{ color: "var(--...)" }}` therefore works.

**Repo constraint worth remembering:** `theme-tokens.test.ts` regex-parses `globals.css` with
`/\.SELECTOR\s*\{([^}]*)\}/` for `.vinta-rule`, `.leaflet-container`, `.leaflet-tile-pane` — a
nested block inside any of those three breaks the match. It also bans any `--zpots-` prefixed
custom property outright.

**Process note:** the dev server from a parallel session served a stale HMR chunk throwing
`getSlotRef is not defined` long after the source stopped referencing it. `npm run build` is the
authoritative check when a console error contradicts clean source.
