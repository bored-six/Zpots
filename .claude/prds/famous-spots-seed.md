# PRD: Famous spots become real rows — seed, save, and a map you can fill

**Ticket:** None (ad-hoc request, 2026-09-22)
**Parent:** famosos-lane.md (which this supersedes on the client-side question)
**Status:** Planning
**Created:** 2026-09-22
**Author:** Fable (planner). Coder / tester / reviewer agents execute.

## Summary

The user stated the product model plainly: **you open Zpots, the famous Zamboanga spots are
already on the map, and your own map fills up as you save the ones you come across.** Today the
first half works as a picture and the second half is impossible — the 20 famous spots are
client-side constants (`src/lib/preview-spots.ts`), their ids do not exist server-side, and every
save/been/report path early-returns on `isPreviewSpot(spotId)`.

This PRD turns those 20 into real `public.spots` rows with real uuids, so they can be saved,
confirmed, reported and linked to; adds a **save action to the map popup** (today the popup can
only *un*save); and retires the preview/fallback machinery that only existed because the rows
were fake.

## Scope change, stated plainly

Two locked decisions move. Neither is being quietly contradicted.

1. **`famosos-lane.md` says "Why client-side and not seeded — the user explicitly said no
   seeding."** That decision is reversed by this request. The three blockers it cited are all
   real and all solved below (photo CHECK → D1, `spot_cards` inner-joins profiles → D2, insert
   policy forbids starting `confirmed` → D3). `famosos-lane.md` gets a Change Log line pointing
   here; do not delete it, it is the record of why the client-side version existed.
2. **`social-spots.md` says "Map is personal: own + saved + been. No all-spots map."** Mi mapa
   now also shows the 20 seeded spots as a fourth source. This is still not an all-spots map —
   it is the personal map plus a fixed, curated 20-pin base layer, which is precisely the
   "famous spots are already on the map" the user asked for. `social-spots.md` gets a Change Log
   line. `CLAUDE.md` item 2 ("On the full map every pin is the spot's photo…") needs no change;
   item 6's Mi paseo description does. [2026-09-22: photo pins removed; `famoso` reuses `preview`
   styling, which is now the Grabado category pin — `pin-revamp-spec.md` §14. This "needs no
   change" line is now wrong; see that note.]

## Requirements

### Original requirements (user)

- Open the app → famous Zamboanga spots are already on the map.
- Save a spot you come across → it lands on your own map.
- Therefore: the famous spots must be saveable, which means they must be rows.

### Discovered requirements (from reading the code)

- **Attribution has to become a database column.** Once a seeded spot is a real row it shows up
  in Cerca, Nuevo (see D6), the profile grid and the map popup — not just the Famosos lane. The
  CC BY-SA credit has to travel with the row, so `photo_credit` goes on `spots` and on the
  `spot_cards` view. This single fact forces the view change in D4.
- **A save action on the map popup** (`SpotMap.tsx:550` only has Quita, gated on
  `source === "saved"`). Without it, "see a famous spot on the map, save it" has no button.
- **Unsave must stop removing the pin** for seeded spots. `mapa/page.tsx handleUnsave` filters
  the pin out of state; for a seeded spot the pin has to stay and revert to the `famoso` source.
- **`my_map()`'s new branch needs the same `not exists` guards the `saved` branch has**, or a
  saved famous spot returns twice (once as `saved`, once as `famoso`) — `union` will not dedupe
  rows whose `source` column differs.

### Where the briefing I was given was stale (verified, not assumed)

- `preview-spots.ts` holds **20** spots, not 5 (`famosos-lane.md`, commits `8662068`, `5f00f19`).
  It also already has an optional `photoUrl` — **4 entries have no photo at all** (Duyan Spot,
  Muruk Haven, Yakan Weaving Village, Canelar Barter Trade Center). That is what forces D5.
- The `isPreviewSpot` guards are at `SpotsDeck.tsx:560, 579, 595, 613`, not 478/497.
- There is a **fourth lane, Famosos**, reading `previewCards()` synchronously at
  `SpotsDeck.tsx:248`. It is a shipped product surface, not an empty state.
- `spots.created_by` **is** nullable (`0002_auth.sql`: `default auth.uid() references auth.users
  (id) on delete set null`). But nullable is not usable here — see D2.
- `MapSource` already has a `"preview"` member (`src/lib/spots.ts:58`) and `SpotCard` already has
  `photoCredit?`. The types shrink-and-rename rather than grow.

## Design decisions (with reasons)

### D1 — Copy the photos into the `spot-photos` bucket. Do not widen the `photo_url` CHECK.

`spots.photo_url` is regex-locked to
`^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/spot-photos/<uuid>\.(jpg|png|webp|gif)$`
(`0001_init.sql:44-47`). Three options were on the table:

| Option | Verdict |
|---|---|
| (a) Copy the Wikimedia files into `spot-photos` at seed time | **Chosen** |
| (b) Widen the CHECK to allowlist `upload.wikimedia.org` | Rejected |
| (c) Make `photo_url` free-form and validate in the client | Rejected outright |

**Why (a).** `photo_url` is in the `insert` grant — the browser sets it. Widening the host
allowlist (b) widens it *for every user post forever*, not just for the 20 seeded rows; any
signed-in account could then point a spot at an arbitrary Wikimedia-hosted image. There is a
narrower variant of (b) — couple the host to the new `seeded` flag in the CHECK — and it would
work, but it buys nothing over (a) while keeping the failure mode `famosos-lane.md` already
flagged: **dead hot-links render a placeholder**, and one of the 16 URLs (Manicahan Beach) was
never even resolved to a final thumb URL. Wikimedia also asks third-party sites not to hot-link
`upload.wikimedia.org`. Hosting our own copy removes all of that and leaves the strictest
constraint in the schema untouched.

**Licensing consequence — non-negotiable, this is the whole cost of (a).**

- The photos are CC BY-SA 4.0, CC BY 3.0/4.0, and CC0. BY-SA and BY both permit redistribution
  including hosting a copy, **provided attribution, the licence name, and a link survive**.
- **Copy the exact bytes. Do not resize, re-encode, crop or strip EXIF.** A transformation makes
  the copy an adaptation, which drags in ShareAlike obligations on the derivative. The upload
  script streams the 1280px thumb through unmodified. (The one file whose source extension is
  uppercase — Climaco Freedom Park, `.JPG` — is stored as `.jpg`; a filename is not a
  transformation.)
- `photo_credit` is **required wherever the photo is the subject**: the deck card, the map
  popup, and any expanded view. Where the photo is a thumbnail that links somewhere carrying the
  credit — the 44px map pin, the `/u/zpots` profile grid tile — the credit goes on the tile as a
  `title` plus visually-hidden text, and the linked view renders it visibly. There must be no
  surface that shows one of these photos at subject size with no credit.
- CC0 entries (Bolong Beach, Lantawan Grassland, Manicahan Beach) legally need no credit. Carry
  it anyway — one code path, and the existing data already has the strings.

**Ops shape.** SQL cannot write bucket bytes, and there is no `supabase` CLI on this machine, so
the copy is a one-off Node script (`scripts/upload-seed-photos.mjs`) run by the user with the
service-role key. See "The photo upload step".

### D2 — `created_by` points at a real system account, `@zpots`. Not null, not a fake uuid.

`spot_cards` is `spots join profiles on p.id = s.created_by` — an **inner** join. A row with
`created_by is null` is invisible to `feed_cerca`, `feed_nuevo`, `feed_siguiendo`, `my_map` and
every profile query. Nullable authorship is therefore not an option that produces a working
feature; it produces 20 invisible rows.

Turning the join into a `left join` was considered and rejected: the view's column list would
need `handle`/`display_name` nullable, which ripples into `SpotAuthor` (currently non-optional)
and every card that renders `@{handle}`, to buy an author-less spot nobody asked for.

**Decision.** One real Supabase auth user, created through **Dashboard → Authentication → Add
user** (not by `insert into auth.users`, which is unsupported and fragile). Email
`zpots@zpots.app`, email-confirmed. The `0004` trigger mints its profile automatically; migration
`0007` renames the handle to `zpots`, sets `display_name = 'Zpots'`, `needs_handle = false`, and
resolves its id **by email** so the migration never hardcodes a uuid that differs per project.

**What the profile link does.** Exactly what it does for anyone: `@zpots` → `/u/zpots` → avatar,
counts, and a grid of all 20 famous spots. No special-casing in `SpotCardView` (the current
`isPreview` branch that replaces the author link with a "Vista previa" chip is deleted). The
account is followable, and following it puts famous spots in Siguiendo — that is coherent
("camina con Zpots") and costs zero branches. **Do not delete this auth user**: `0004` added
`spots_created_by_profile_fkey` with no `on delete` action, so deleting it is refused by the FK
rather than nulling the column.

### D3 — Seeded spots start `unconfirmed` with `confirmations = 0`. The card shows a Landmark chip instead of a status pill.

They are famous, but `confirmed` is earned by two distinct people. Beyond principle, **a faked
confirmed state is actively unstable**:

`spots_status_matches_count` requires `(status = 'confirmed') = (confirmations >= 2)`, so seeding
`confirmed` means seeding `confirmations = 2` with zero rows in `public.confirmations`. The first
time a real person taps "Ya anda yo aqui", `confirmations_touch_spot` fires, `spots_enforce_
confirmation_state` recomputes from the source of truth, and the spot **loses** a confirmation
(2 → 1) and flips **back** to Unconfirmed. A user vouching for Fort Pilar would visibly
downgrade it. Reject.

Seeding two system accounts to manufacture the confirmations is fake social proof and pollutes
those accounts' "been" lists. Reject.

**Decision.** Row state is honest: `unconfirmed`, `0`. The UI stops showing a status pill on
seeded spots and shows a **Landmark chip** instead — famous is its own kind of vouching, and
"Unconfirmed: Fort Pilar" reads like a bug. Confirmations still accrue normally; at 2 the row
flips to `confirmed` and the chip stays.

**Copy-collision hazard, read before choosing the string.** The Famosos lane label is
`{ cv: "Famosos", en: "Famous" }`. `SpotsDeck.test.tsx:132-138` builds substring regexes from
`COPY.*.en` and `getByRole` throws on multiple matches, which is why `famosos-lane.md` picked
"Famous" in the first place. A chip whose `en` is also "Famous" reintroduces exactly that
collision. Use `famosoChip: { cv: "Famoso", en: "Landmark" }`, and **grep the test suite for
`.en`-derived regexes before committing the string.**

### D4 — `spot_cards` gains two columns, appended at the end. The functions that spell out `sc.*` must be re-issued in the same migration.

`photo_credit` and `seeded` have to reach the client on every surface that renders a seeded spot
(D1's attribution rule; D6's Nuevo filter), which means they have to be on `spot_cards`, which
every feed selects from.

**The trap.** `create or replace view` may only *append* columns. That is fine. But
`feed_cerca` and `my_map` are declared with an explicit `returns table (...)` list and their
bodies say `select sc.*, …`. The moment the view widens from 13 to 15 columns, both functions
raise `42804 structure of query does not match function result type` **at call time, not at
migration time** — the migration will look like it succeeded and the app will break. Migration
`0007` must therefore re-issue `feed_cerca` and `my_map` with the two extra columns in their
declared return tables. `feed_nuevo` and `feed_siguiendo` are `returns setof public.spot_cards`
and adapt on their own — but they still need re-issuing for D6's `where not seeded`.

**Do not `drop view public.spot_cards`.** `0004`'s own header explains why (`2BP01`; the setof
functions depend on the composite type) and a test already asserts the file contains no
`drop view`. Keep that true in `0007`.

**Fallback if `create or replace view` is refused** (it should not be — appending is legal even
with dependents — but this cannot be rehearsed locally): drop `feed_nuevo` and `feed_siguiendo`
first, replace the view, then recreate all functions. Put that escape hatch in the migration as
a commented block, not as live SQL.

### D5 — `photo_url` becomes nullable **for seeded rows only**.

Four of the 20 have no freely-licensed photo, and `photo_url` is `not null`. Dropping those four
would regress the shipped Famosos lane from 20 to 16. Making the column plainly nullable removes
the database's backstop against a photo-less user post (the post flow enforces a photo only in
the client).

**Decision.** Nullable column, plus a CHECK that only seeded rows may use it:

```
photo_url is null or <existing bucket regex>      -- shape rule, unchanged otherwise
photo_url is not null or seeded                   -- only seeded rows may be photo-less
```

`seeded` is absent from every `grant insert` column list (`0002` grants an explicit list), so a
browser can neither set `seeded` nor insert a photo-less spot. The backstop survives intact.
`SpotPhoto` already renders the placeholder for a missing photo — verified live in
`famosos-lane.md`, no change needed.

### D6 — Which lanes seeded spots appear in.

| Lane | Seeded spots | Why |
|---|---|---|
| **Cerca** | Yes | This *is* the request: open the app, famous spots near you. Also means Cerca is never empty, which kills the preview fallback. |
| **Nuevo** | **No** (`where not sc.seeded`) | They are not new. A brand-new Nuevo is honestly empty and says `noSpotsYet`. |
| **Siguiendo** | Only if you follow `@zpots` | Falls out of D2 for free. |
| **Famosos** | Yes, exclusively (`feed_famosos`) | The lane's whole content. |

`created_at` for all 20 is backdated to a single sentinel `2020-01-01T00:00:00Z` so real posts
always outrank them in any `created_at desc` ordering, and so they can never appear in `hoy_row()`
(24h window).

### D7 — Mi mapa gains a fourth source, `famoso`, served by the same `my_map()` call.

`my_map()` is already `grant execute … to anon` and is `security invoker`, so with
`auth.uid() = null` the `mine`/`been`/`saved` branches return nothing and a new `famoso` branch
returns the 20. **Signed-out and signed-in use the identical code path** — `SignedOutView`'s
hardcoded `PREVIEW_MAP_SPOTS` constant disappears, and `saves-repo.myMap()` stops short-circuiting
to `[]` for signed-out visitors.

Precedence, and the dedupe guard: `mine` > `been` > `saved` > `famoso`. The `famoso` branch needs
`not exists` guards against all three of the others, mirroring what the `saved` branch already
does against `mine`/`been`. Without them a saved famous spot returns two rows that `union` will
not collapse, because `source` differs.

Pin styling: `famoso` reuses today's `preview` styling (44px photo pin), so nothing visibly
changes for a signed-out visitor. [2026-09-22: photo pins removed; `famoso` reuses `preview`
styling, which is now the Grabado category pin — `pin-revamp-spec.md` §14.] Legend gains a
fourth toggle. **Four checkboxes in a
`flex gap-4` row at 375px is a real layout risk** — `famosos-lane.md` hit exactly this with four
lane tabs. Verify at phone width.

### D8 — `preview-spots.ts` survives only as seed data, imported by nothing that ships.

Its five exports have four different jobs today. After this work:

| Export | Fate |
|---|---|
| `PREVIEW_SPOTS` (the 20 entries) | **Kept**, renamed `FAMOUS_SEED_SPOTS`, file renamed `src/lib/famous-seed-data.ts` |
| `PREVIEW_AUTHOR` | Deleted — the author is a real profile row now |
| `previewCards(origin)` | Deleted — the Famosos lane calls `feedFamosos()` |
| `previewBounds()` | Deleted — Mi mapa always uses `fitToCity` |
| `previewMapSpots()` | Deleted — pins come from `my_map()` |
| `isPreviewSpot(id)` | Deleted — with it, all four `SpotsDeck` guards and `SpotCardView`'s `isPreview` branch |

**Why keep the data file at all,** given the rows are the source of truth? Because the migration
needs the 20 names, notes, coordinates and credits as SQL literals, and the upload script needs
the source URL → target uuid mapping. Rather than let the SQL and a JSON manifest drift, the TS
module stays the single authoring surface and a guard test asserts migration `0007` contains
every id, name, coordinate and credit from it — the same "test reads the SQL as text" pattern
`migration-social.test.ts` already uses. It is imported **only** by that test and by
`scripts/upload-seed-photos.mjs`, never by `src/app` or `src/components`; a guard test enforces
that, so it never ships in a bundle.

Each entry gains a `seedId` (the fixed uuid used as both the `spots.id` and the storage object
name — one identifier, not two) and a `sourceUrl` (the Wikimedia thumb). `status`,
`confirmations`, `author` and the `preview-` ids come out.

**Count trap — read this before writing the seed INSERT. The array has 20 entries, not 21.**
`PREVIEW_AUTHOR` is declared at `preview-spots.ts:24` with `id: "preview-account"`, *above*
`export const PREVIEW_SPOTS` at line 35. It is the shared `SpotAuthor` every entry points at, not
a spot — but it carries the same `preview-` prefix, so an unanchored grep counts it as one:

```
grep -c 'id: "preview-'      src/lib/preview-spots.ts   # 21  <- wrong, includes PREVIEW_AUTHOR
grep -c '^    id: "preview-' src/lib/preview-spots.ts   # 20  <- correct, anchored to the array indent
```

Seeding from the unanchored count produces a 21st row named after the author constant. Derive the
row list from the exported array (or from `FAMOUS_SEED_SPOTS.length`), never from a prefix grep.

The tests in this plan do catch it — but only because
`migration-famous-seed.test.ts` keys off the data module's `seedId`s and
`famous-seed-data.test.ts` pins the count at exactly 20. **That protection is order-dependent:**
anyone who writes the SQL first and back-fills the test from the SQL they just wrote inherits the
bad count in both places and the suite goes green on 21 rows. Wave 0 is before Waves 2a/2b for
this reason, not as a formality. Note also that the *existing*
`src/__tests__/preview-spots.test.ts:27-30` asserts a range (`>= 3`, `<= 24`), not an exact count,
so it would not have caught an off-by-one either; the exact-count assertion is new here.

### D9 — Save from the map popup.

`SpotMap` gains `onSave?: (spotId: string) => void` and `savedSpotIds?: ReadonlySet<string>`,
alongside the existing `onUnsave`.

- Popup renders **Guarda** when `onSave` is provided and the spot is not currently saved
  (`source` is `famoso` or `been`, or `savedSpotIds` lacks the id).
- Popup renders **Quita** when the spot is saved (`source === "saved"` or `savedSpotIds` has it).
- **Never both, never neither-when-savable.** Own spots (`source === "mine"`) get neither.
- Signed out: the button renders and, on tap, opens the existing `SignInPrompt` gate —
  the same "gate at the moment of the gated action" rule `mapa/page.tsx` already documents. It
  must not call `saveSpot`.
- Optimistic, matching `handleUnsave`: save flips the local source to `saved` (pin restyles,
  button becomes Quita) before the request resolves; a rejection reverts it.

**Unsave changes behaviour.** Today it filters the pin out of state. New rule: unsaving a
**seeded** spot reverts its source to `famoso` and the pin stays; unsaving a non-seeded spot that
is only on the map because it was saved still removes the pin.

## Data model

### Migration `supabase/migrations/0007_famous_spots_seed.sql`

Next free number; `0006` is the highest. Hand-pasted into the hosted SQL editor, so — per
`.claude/learnings.md`, **2026-09-20, "Applying migrations to a hosted Supabase project"** —
every statement is idempotent and the file assumes a previous run may have partially committed
despite `begin;/commit;`:

- `add column if not exists` for `spots.photo_credit` and `spots.seeded`.
- `pg_constraint` guards around every `add constraint`; `alter table … drop constraint if exists`
  before re-adding the reshaped `spots_photo_url_shape`.
- `create or replace` for the view and all functions; `drop function if exists` with exact
  argument types before each `create or replace function` whose return shape changes (the `42P13`
  guard `0004` documents).
- `insert … on conflict (id) do update` for the 20 rows.
- **No `insert into storage.buckets`** — `42501` on current projects; the bucket already exists.
- **No `drop view`** anywhere.
- `notify pgrst, 'reload schema';` at the end.
- A commented verification `select` block at the end (row counts, null-photo count, the four
  function signatures), per the same learnings entry.

Contents, in order:

```sql
-- 1. columns
alter table public.spots add column if not exists photo_credit text;
alter table public.spots add column if not exists seeded boolean not null default false;
-- CHECK: photo_credit null or <= 300 chars
-- CHECK (replaces spots_photo_url_shape): photo_url is null or <bucket regex>  [regex verbatim from 0001]
-- CHECK spots_photo_only_seeded_null: photo_url is not null or seeded
-- CHECK spots_seeded_photo_has_credit: photo_url is null or not seeded or photo_credit is not null
-- index: spots_seeded_idx on public.spots(seeded) where seeded

-- 2. the system author, resolved by email, never hardcoded
do $$ declare seed_author uuid; begin
  select id into seed_author from auth.users where email = 'zpots@zpots.app';
  if seed_author is null then
    raise exception 'Create the zpots system account first: Dashboard > Authentication > Add user, email zpots@zpots.app, then re-run this file.';
  end if;
  update public.profiles
     set handle = 'zpots', display_name = 'Zpots', needs_handle = false
   where id = seed_author;
  -- 3. the 20 rows
  insert into public.spots
    (id, name, note, lat, lng, photo_url, photo_credit, seeded, created_by, created_at, status, confirmations)
  values (...20 literal rows..., false_seeded_is_true, seed_author, '2020-01-01T00:00:00Z', 'unconfirmed', 0)
  on conflict (id) do update set
    name = excluded.name, note = excluded.note, lat = excluded.lat, lng = excluded.lng,
    photo_url = excluded.photo_url, photo_credit = excluded.photo_credit,
    seeded = excluded.seeded, created_by = excluded.created_by;
    -- status/confirmations/created_at deliberately NOT updated -- see below
end $$;

-- 4. view: create or replace, two columns APPENDED, existing 13 untouched in name and order
--    ... s.created_by, p.handle, p.display_name, p.avatar_url, s.photo_credit, s.seeded

-- 5. functions re-issued: feed_cerca (return table +2 cols), feed_nuevo (+ where not sc.seeded),
--    feed_siguiendo (+ where not sc.seeded? NO -- see D6, Siguiendo keeps them), my_map (+2 cols, + famoso branch),
--    feed_famosos (new). grant execute on feed_famosos(...) to anon, authenticated;
```

**The `do update` set list is load-bearing.** Re-running `0007` after the spots have earned
confirmations must not reset `status`/`confirmations` — writing `status = 'unconfirmed'` onto a
row with `confirmations = 3` fails the `spots_status_matches_count` CHECK with `23514` and aborts
the whole file. Omit both columns from the update, and `created_at` too (nothing should re-date a
spot).

`feed_famosos`:

```sql
drop function if exists public.feed_famosos(double precision, double precision, integer, integer);
create or replace function public.feed_famosos(
  lat double precision, lng double precision,
  page_size integer default 50, page_offset integer default 0
) returns table (<the 15 spot_cards columns>, distance_m double precision)
language sql stable security invoker set search_path = ''
as $$ select sc.*, <the same haversine expression as feed_cerca, verbatim> as distance_m
     from public.spot_cards sc where sc.seeded
     order by distance_m asc, sc.id asc limit page_size offset page_offset $$;
```

`my_map()`'s new fourth branch:

```sql
union
select sc.*, 'famoso'::text as source
from public.spot_cards sc
where sc.seeded
  and (auth.uid() is null or (
        sc.created_by <> auth.uid()
    and not exists (select 1 from public.confirmations c where c.spot_id = sc.id and c.confirmer_id = auth.uid())
    and not exists (select 1 from public.saves sv where sv.spot_id = sc.id and sv.user_id = auth.uid())
  ))
```

**RLS note for the reviewer.** The seed `insert` runs as `postgres`, which owns these tables and
is not subject to RLS (they are `enable`d, never `force`d), so `spots_insert_new_unconfirmed`
(which would demand `created_by = auth.uid()`, null here) does not apply. Table CHECKs *do* still
apply, which is why the rows must be `unconfirmed`/`0` regardless of D3's product reasoning.

### The photo upload step — `scripts/upload-seed-photos.mjs`

New `scripts/` directory (none exists today). Plain `.mjs`, run as
`node --env-file=.env.local scripts/upload-seed-photos.mjs`. No new dependency:
`@supabase/supabase-js@^2.116.0` is already in `dependencies` and Node's global `fetch` does the
download.

- Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment. The
  service-role key **must not be committed, must not be added to `.env.local.example` with a
  real value, and must never appear in a `NEXT_PUBLIC_` name.** Exit with a clear message if it
  is absent.
- For each of the 16 photographed entries: `fetch(sourceUrl)` → assert `200` and a
  `content-type` of `image/jpeg`/`png`/`webp` → assert `content-length` under 5 MiB (the bucket
  limit) → `upload(\`${seedId}.jpg\`, bytes, { contentType, upsert: false })` into `spot-photos`.
- **Streams bytes through untouched** (D1). No sharp, no canvas, no re-encode.
- Idempotent: an existing object comes back as a duplicate error; treat it as success and log
  `skipped`.
- Prints a summary table and a non-zero exit code if any file failed, so the user knows before
  pasting the migration.
- The migration's `photo_url` literals are `<SUPABASE_URL>/storage/v1/object/public/spot-photos/<seedId>.jpg`
  — the same uuid as the row id, which is what makes the two artefacts checkable against each
  other by a test.

### Types (`src/lib/spots.ts`)

```ts
export interface Spot { …; photoUrl?: string; }               // unchanged
export interface SpotCard extends Spot {
  author: SpotAuthor;
  distanceM?: number;
  photoCredit?: string;    // no longer "preview spots only" -- update the doc comment
  seeded?: boolean;        // new
}
export type MapSource = "mine" | "saved" | "been" | "famoso";  // "preview" removed
```

`SpotCardRow` (`src/lib/spots-repo.ts`) gains `photo_credit?: string | null` and
`seeded?: boolean`; `toSpotCard` maps both, omitting `photoCredit` when null so the existing
`{card.photoCredit && …}` renders stay honest.

**Also delete** the dead `SEED_SPOTS` constant at `src/lib/spots.ts:64` — a v1 leftover
("One real, recognizable seed spot for this milestone: Fort Pilar") with a string id, no author
and a `nickname`. Leaving a thing called `SEED_SPOTS` next to real seed spots is a trap.

### Copy (`src/lib/copy.ts`)

```
famosoChip:  Famoso / Landmark        -- NOT "Famous"; see D3's collision note
emptyMapHint: <replaces previewHint>  -- "save a spot and it lands here", famous pins are real now
```

Remove `preview` and `previewHint` as currently worded; `copy.preview.test.ts` is rewritten, not
patched. Existing `save` (Guarda) / `unsave` (Quita) / `mine` / `been` / `saved` keys are reused
as-is; `famoso` joins the legend list.

## Component inventory

| Component | Type | Path | Change |
|---|---|---|---|
| Migration 0007 | SQL | `supabase/migrations/0007_famous_spots_seed.sql` | New |
| Upload script | Node | `scripts/upload-seed-photos.mjs` | New |
| Seed data | TS | `src/lib/famous-seed-data.ts` | Renamed from `preview-spots.ts`, gutted to data |
| Types | TS | `src/lib/spots.ts` | `MapSource`, `SpotCard`, delete `SEED_SPOTS` |
| Row mapper | TS | `src/lib/spots-repo.ts` | `SpotCardRow` + `toSpotCard` map 2 new columns |
| Feed repo | TS | `src/lib/feed-repo.ts` | New `feedFamosos(lat, lng, pageSize?)` |
| Saves repo | TS | `src/lib/saves-repo.ts` | `myMap()` calls the RPC even when signed out |
| Deck | TSX | `src/components/SpotsDeck.tsx` | Famosos → `feedFamosos`; delete 4 `isPreviewSpot` guards, `isPreview` state, the preview-fallback branch and its banner |
| Card | TSX | `src/components/SpotCardView.tsx` | Delete `isPreview`; credit renders whenever present; Landmark chip replaces the status pill when `seeded` |
| Map | TSX | `src/components/SpotMap.tsx` | `onSave` + `savedSpotIds`; Guarda/Quita mutual exclusion; `famoso` pin |
| Pin icons | TS | `src/lib/pin-icon.ts` | `"preview"` → `"famoso"` in `iconForMapSpot` |
| Mi mapa | TSX | `src/app/mapa/page.tsx` | One view for both auth states; 4th legend toggle; save handler; unsave keeps seeded pins |
| Copy | TS | `src/lib/copy.ts` | Keys above |

## Test plan — written first, red before green

Project rule, restated because it is the part most often skipped: **these tests are written
against the contract in this document, committed failing, and never reshaped afterwards to match
whatever got built.** If a test and the implementation disagree, the PRD arbitrates — and if the
PRD is wrong, it gets a Change Log line before the test moves.

**Standing limitation, stated once:** there is no local Postgres, docker, psql or `supabase` CLI
on this machine, so **no test can execute the migration or exercise real RLS**. SQL coverage is
static (the file read as text) plus a statement-by-statement human audit plus the commented
verification query at the end of `0007`. Do not let anyone claim the RLS tests below prove more
than they do.

### New: `src/__tests__/famous-seed-data.test.ts` (node)

1. Exactly 20 entries; `seedId` unique, lowercase, matches the storage-object uuid regex from
   `0001`; no `preview-` prefixed id survives anywhere in the module.
2. `name` 1–80 chars trimmed, `note` 1–280 trimmed (DB CHECKs) **and** ≤ 140 (the card rule
   `famosos-lane.md` set).
3. Photo optional; **if `sourceUrl` is present then `photoCredit` is non-empty** — the invariant
   `famosos-lane.md` locked, restated because D1 makes it a licensing obligation rather than a
   nicety.
4. Every `sourceUrl` is `https://upload.wikimedia.org/...`; exactly 4 entries have none.
5. Every lat/lng falls inside the city-outline polygon (reuse the existing outline helper).

### New: `src/__tests__/migration-famous-seed.test.ts` (node, reads `0007` as text)

1. Contains no `drop view`, no `drop table`, no `truncate`, no `insert into storage.buckets`.
2. `add column if not exists` for both new columns; every `add constraint` is inside a
   `pg_constraint` guard; every `create policy` is preceded by `drop policy if exists`.
3. Every one of the 20 `seedId`s from the data module appears in the file, as does every `name`,
   every `photoCredit` string, and every lat/lng to the data module's precision.
4. Every `photo_url` literal matches `0001`'s bucket regex **and** its uuid equals that row's
   `seedId`.
5. Every seeded row literal carries `'unconfirmed'` and `0`; the `on conflict … do update` set
   list mentions neither `status`, nor `confirmations`, nor `created_at`.
6. `seeded` and `photo_credit` appear in no `grant insert (` column list in any migration file
   (glob all of `0001`–`0007`).
7. The file re-issues `feed_cerca`, `feed_nuevo`, `feed_siguiendo`, `my_map`, and creates
   `feed_famosos`; `grant execute on function public.feed_famosos` names `anon`.
8. The `spot_cards` replacement keeps the original 13 column expressions in their original order
   and appends exactly `s.photo_credit, s.seeded`.
9. `my_map`'s `famoso` branch contains `not exists` guards naming `public.saves` **and**
   `public.confirmations`, and a `created_by <> auth.uid()` term.
10. The file ends with `notify pgrst, 'reload schema';`.

### New: `src/__tests__/upload-seed-photos.test.ts` (node)

The script's pure helpers are exported for this; the network call is faked.
1. Target object name is `<seedId>.jpg` at bucket root, never nested, never the source filename.
2. Refuses to run without `SUPABASE_SERVICE_ROLE_KEY` and never falls back to the anon key.
3. A `409`/duplicate from `upload` counts as success; any other error counts as failure and the
   summary exit code is non-zero.
4. Rejects a response whose `content-length` exceeds 5 MiB or whose `content-type` is not an
   allowed image type, without uploading.
5. Never transforms bytes — asserts the uploaded body is reference-identical to the fetched body.

### Changed: `src/__tests__/saves-repo.test.ts`

1. `saveSpot` while signed out rejects via `requireUserId` and **never** reaches `.insert`.
2. Double save: a `23505` resolves as a no-op (existing) — plus a non-`23505` error still throws.
3. `saveSpot` on a deleted/nonexistent spot surfaces the FK violation (`23503`) as a thrown
   error, not a silent success.
4. `unsaveSpot` filters on `user_id` **and** `spot_id` (RLS is the backstop, not the only guard).
5. `myMap()` **calls the RPC when signed out** and maps the returned rows — the current
   short-circuit-to-`[]` is now a bug.
6. `myMap()` maps `source: "famoso"` and the new `photo_credit`/`seeded` columns.
7. A user whose only saves are seeded spots gets those rows back with `source === "saved"`, and
   **no duplicate row** with `source === "famoso"` for the same id (fake-RPC fixture encodes the
   SQL contract; the real guarantee is the `not exists` clauses in `0007`).

### Changed: `src/__tests__/feed-repo.test.ts`

1. `feedFamosos` calls `rpc("feed_famosos", { lat, lng, page_size })` with those exact names.
2. It returns all 20 in one call and the deck never asks for a second page.
3. Rows map `seeded: true` and `photoCredit` through `toSpotCard`.

### Rewritten: `src/__tests__/SpotsDeck.famosos.test.tsx`

1. The Famosos lane fetches via `feedFamosos`, not from a module constant.
2. **Save, Been and Report are reachable on a Famosos card** — the exact inverse of what this
   file asserts today. Each calls its repo function with the spot's uuid.
3. The author line links to `/u/zpots`.
4. `hasMore` stays false; no prefetch fires at the end of the lane.
5. Switching away and back does not re-enter a preview fallback (there is none).

### Deleted: `src/__tests__/SpotsDeck.preview.test.tsx`, `src/__tests__/SpotCardView.preview.test.tsx`, `src/__tests__/copy.preview.test.ts`, `src/__tests__/preview-spots.test.ts`

They pin behaviour this PRD removes. Delete them in the same commit that removes the behaviour —
**not earlier** (a green suite between the two commits would be lying).

`SpotsDeck.preview.test.tsx` has one assertion worth rehoming rather than losing: *"Cerca failed:
still shows Could not load + Retry, never the previews."* Move it to `SpotsDeck.test.tsx` as
"Cerca failed: shows Could not load + Retry, and renders no cards."

### Changed: `src/__tests__/mapa-page.test.tsx`

1. Signed out: pins come from the `my_map` RPC; no module constant is rendered; the map is
   browsable and shows no standing sign-in gate.
2. Signed in with zero personal pins: the 20 famous pins still render **and** the `emptyMap`
   overlay shows.
3. **The empty-state transition:** after the user's first successful save, the overlay disappears
   without a refetch, and the saved pin is present exactly once.
4. Saving from a popup while signed out opens `SignInPrompt` and never calls `saveSpot`.
5. Saving a `famoso` pin optimistically flips it to `saved`; a rejected `saveSpot` reverts it to
   `famoso` and the pin is still on the map.
6. **Unsaving a seeded spot keeps the pin** and reverts its source to `famoso`.
7. Unsaving a non-seeded saved spot removes the pin (existing behaviour, re-pinned).
8. The legend's fourth toggle hides and re-shows only the `famoso` pins.
9. Attribution: a popup for a spot with `photoCredit` renders the credit line; the assertion is
   on presence, not styling.

### Changed: `src/__tests__/SpotMap.popup.test.tsx`

1. Guarda renders only when `onSave` is passed and the spot is not saved.
2. Guarda and Quita never render simultaneously; `source === "mine"` renders neither.
3. `onSave` receives the spot id.
4. `photoCredit` renders for **any** spot carrying one, not only a preview-sourced one.

### Changed: `src/__tests__/SpotCardView.test.tsx`

1. A `seeded` card renders the Landmark chip and **no** Unconfirmed/Confirmed pill.
2. A `seeded` card that has reached `confirmed` still renders the Landmark chip.
3. Any card with `photoCredit` renders it.
4. The author block is always a link to `/u/<handle>` — no "Vista previa" branch remains.

### New: `src/__tests__/no-seed-data-in-app.test.ts` (node)

Globs `src/app/**` and `src/components/**` and asserts none of them imports
`@/lib/famous-seed-data`, and that the strings `preview-spots`, `isPreviewSpot`, `previewCards`,
`previewBounds`, `previewMapSpots` and `PREVIEW_AUTHOR` appear nowhere under `src/`. This is what
makes D8's "survives only as seed data" enforceable rather than aspirational.

### Whole-suite gates (every wave)

`npm test` green · `npm run lint` clean · `npx tsc --noEmit` clean · `npm run build` clean ·
existing guardrails unchanged and still passing: no-raw-hex, copy ASCII + `cv !== en`, aria
English names, theme tokens.

## Edge cases and failure modes

1. **Save while signed out** — button visible, tap opens the gate, `saveSpot` never called, no
   optimistic state change. Both on the deck card and in the map popup.
2. **Double save** — `23505` swallowed (already handled); the optimistic UI must not toggle
   back off on the second tap.
3. **Save a spot that no longer exists** — `23503` FK violation; surface an error rather than a
   silent success, and revert the optimistic pin.
4. **`photo_url` CHECK** — an object name that is not `<uuid>.<ext>` at bucket root, or a URL
   assembled from the wrong project ref, fails the CHECK and aborts the whole seed insert. The
   migration test compares each literal against `0001`'s regex precisely so this is caught before
   the user pastes anything.
5. **Photos not uploaded yet** — the migration succeeds and the app shows placeholder tiles, not
   a crash. The correct order is: create the account → run the upload script → paste `0007`.
   State this in the migration header.
6. **Migration re-run after real confirmations exist** — the `do update` set list must omit
   `status`/`confirmations`, or `23514` aborts the file. Covered by test 5 of the migration test.
7. **Migration re-run before the system account exists** — the `raise exception` message tells
   the user exactly what to do; nothing partially applies (the insert is inside the same
   `do $$` block).
8. **Duplicate map pin for a saved famous spot** — the `not exists` guards in the `famoso`
   branch. `union` does not save us here because `source` differs.
9. **`my_map()` after the view widens** — silent `42804` at call time if the function is not
   re-issued. This is the single most likely way to ship a broken app from this migration.
10. **Deleting the `@zpots` auth user** — refused by `spots_created_by_profile_fkey`. Documented,
    not worked around.
11. **A user follows `@zpots`, then unfollows** — Siguiendo empties back out; the famous spots
    remain in Cerca, Famosos and the map. No stale state.
12. **Confirming a famous spot to the threshold** — count 0 → 1 → 2 flips `status` to
    `confirmed`; the Landmark chip is unaffected; the trigger recompute is honest because the
    seeded count was honest.
13. **RLS on `saves`** — select/insert/delete are all `user_id = auth.uid()`, `authenticated`
    only; nothing in this change touches those policies, and nothing should. A second account
    must not see the first's saves. **Not testable locally** (see the standing limitation); it
    is verified by reading `0004` and by the user's post-apply spot check.
14. **Four legend checkboxes at 375px** and the existing four lane tabs. Verify in a browser;
    `famosos-lane.md` already found the tab strip overflows to 404px and scrolls horizontally,
    which was accepted.
15. **Mixed licences** — one CC BY 3.0, three CC0, the rest CC BY-SA. The render path does not
    branch on licence; the credit string already encodes it.
16. **Deploying code before the migration** — `feed_famosos` does not exist yet and PostgREST
    returns `PGRST202`; the Famosos lane shows its load error. Acceptable for a few minutes, but
    the wave order below puts the migration first for exactly this reason.

## Out of scope

- Adding, editing or removing famous spots from inside the app. The 20 are changed by editing
  the data module and re-running `0007`.
- Any moderation, admin or curation UI.
- A 21st spot. `famosos-lane.md`'s "Known gaps" (Once Islas' arbitrary point, Grand Masjid
  Barbara's EXIF coordinate, City Hall ~190 m from Plaza Pershing, the four photo-less entries)
  are carried forward unchanged, not fixed here.
- Re-photographing the four photo-less spots.
- Comments, DMs, categories, search, filters — still out per `CLAUDE.md`.
- The pergamino basemap, labels, the city mask, `MapInset` motion — do not touch.
- Renaming the Famosos lane, its copy, or the `SpotsDeck` lane machinery beyond swapping the data
  source.
- Changing `CONFIRMATION_THRESHOLD`.
- Any change to `spot-photos` bucket settings or storage policies.

## Assumptions

1. **System account email is `zpots@zpots.app`**, handle `zpots`, display name `Zpots`. If the
   user prefers another address, it changes one literal in `0007` and one line here.
2. **The user will run a Node script with the service-role key.** This is the one new ops step;
   everything else is dashboard + SQL editor as usual. If that is unacceptable, the fallback is
   uploading 16 files by hand in Dashboard → Storage named `<seedId>.jpg` — tedious but
   equivalent, and the seedIds are in the data module.
3. **`create or replace view` accepts appended columns with `setof` dependents.** Believed
   correct; cannot be rehearsed locally; the commented fallback in `0007` covers it.
4. **All 16 source URLs still return 200.** They were re-verified during the `famosos-lane`
   review on 2026-09-21. The upload script re-verifies at run time, which is when it matters.
5. **Manicahan Beach's exact thumb URL is still unresolved** — `famosos-lane.md` says "search
   Commons for CyraFelix's Manicahan Beach … and resolve the exact thumb URL before use." Resolve
   it in Wave 1b or ship that entry photo-less (5 photo-less instead of 4); either is acceptable,
   the data module's invariants hold both ways.
6. **`created_at` backdating to 2020-01-01 is cosmetically fine.** Nothing in the UI renders a
   spot's date today.

## Wave execution plan

Tests first per wave, red before green. One coder per git worktree; file ownership is disjoint.

| Wave | Task | Owner files | Depends on | Type |
|---|---|---|---|---|
| 0 | Every red test in the plan above, including the deletions staged but not committed | `src/__tests__/**` | — | auto |
| 1a | Data module: rename `preview-spots.ts` → `famous-seed-data.ts`, strip to data, add `seedId` + `sourceUrl`, resolve the Manicahan URL | `src/lib/famous-seed-data.ts` | 0 | auto |
| 1b | Types + copy: `MapSource`, `SpotCard.seeded`, `SpotCardRow`/`toSpotCard`, copy keys, delete `SEED_SPOTS` | `src/lib/spots.ts`, `src/lib/spots-repo.ts`, `src/lib/copy.ts` | 0 | auto |
| 2a | Migration `0007` | `supabase/migrations/0007_famous_spots_seed.sql` | 1a | auto |
| 2b | Upload script | `scripts/upload-seed-photos.mjs` | 1a | auto |
| 2c | Repo layer: `feedFamosos`, `myMap` signed-out path | `src/lib/feed-repo.ts`, `src/lib/saves-repo.ts` | 1b | auto |
| 3a | Deck: Famosos from the RPC, delete all four guards, the preview fallback, `isPreview` state and banner | `src/components/SpotsDeck.tsx` | 2c | auto |
| 3b | Card: delete `isPreview`, always-on credit, Landmark chip | `src/components/SpotCardView.tsx` | 1b | auto |
| 3c | Map popup: `onSave`/`savedSpotIds`, Guarda/Quita exclusivity, `famoso` pin | `src/components/SpotMap.tsx`, `src/lib/pin-icon.ts` | 1b | auto |
| 3d | Mi mapa: one view for both auth states, 4th legend toggle, save handler, unsave keeps seeded pins | `src/app/mapa/page.tsx` | 2c, 3c | auto |
| 4 | Delete the four obsolete test files + dead exports; `no-seed-data-in-app` goes green; docs (`CLAUDE.md`, the two Change Log lines from "Scope change") | test files, `CLAUDE.md`, `.claude/prds/*.md` | 3a–3d | auto |
| 5 | **User:** create the `zpots` account in the Dashboard | — | 4 | checkpoint:human-action |
| 6 | **User:** run the upload script, confirm 16/16 | — | 5, 2b | checkpoint:human-action |
| 7 | **User:** paste `0007` into the SQL editor, run the commented verification block | — | 6, 2a | checkpoint:human-action |
| 8 | Browser verification at 375px and desktop; adversarial pass; reviewer gate | — | 7 | checkpoint:human-verify |

Waves 1a/1b run in parallel. 2a/2b/2c run in parallel. 3a–3d run in parallel after 2c (3d also
needs 3c's prop contract, so 3c lands first or they share a worktree). **Waves 5–7 must run in
that order and must complete before Wave 8** — account, then photos, then SQL. Running the SQL
before the account exists raises a deliberate exception; running it before the photos exist
produces placeholder tiles.

## Acceptance criteria

The reviewer uses this list verbatim.

- [ ] 20 rows exist in `public.spots` with `seeded = true`, `created_by` = the `zpots` profile,
      `status = 'unconfirmed'`, `confirmations = 0`, `created_at = 2020-01-01`.
- [ ] 16 objects exist in `spot-photos` named `<spot uuid>.jpg`, byte-identical to their
      Wikimedia sources; 4 rows have `photo_url is null`.
- [ ] Every row with a photo has a non-empty `photo_credit`, and the credit renders on the deck
      card and in the map popup. No surface shows one of these photos at subject size without a
      credit.
- [ ] `photo_url`'s bucket regex is unchanged apart from allowing `null`; no host allowlist was
      widened.
- [ ] `seeded` and `photo_credit` appear in no `grant insert` column list; a browser cannot set
      either.
- [ ] Signed out, `/mapa` shows the 20 famous pins from `my_map()` with no module constant
      involved, and is pan/zoom/popup browsable with no standing gate.
- [ ] Signed in with an empty personal map: the famous pins show **and** the `emptyMap` overlay
      shows; after the first save the overlay disappears with no refetch.
- [ ] A famous spot can be saved from the map popup and from the deck card; it then appears on
      Mi mapa with `source = "saved"` exactly once, and the popup button reads Quita.
- [ ] Unsaving a famous spot leaves the pin on the map as `famoso`. Unsaving a non-seeded saved
      spot removes the pin.
- [ ] Save/Been/Report and the `/u/zpots` author link all work on a Famosos card. No
      `isPreviewSpot` early-return survives anywhere.
- [ ] A famous spot shows the Landmark chip and no status pill; the chip's English string does
      not collide with any other `COPY.*.en` in a `getByRole` name query.
- [ ] Nuevo excludes seeded spots; Cerca includes them; Siguiendo includes them only when
      `@zpots` is followed; Hoy never shows them.
- [ ] `feed_cerca`, `feed_nuevo`, `feed_siguiendo` and `my_map` were all re-issued in `0007` and
      return data after the view widened (checked live, not just statically).
- [ ] `0007` contains no `drop view`, no `insert into storage.buckets`, and is idempotent —
      applied twice in a row with no error and no duplicate or reset rows.
- [ ] `src/lib/famous-seed-data.ts` is imported only by its guard test and the upload script;
      `no-seed-data-in-app.test.ts` is green.
- [ ] The service-role key is not committed and appears in no `NEXT_PUBLIC_` variable.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean.
- [ ] Verified by hand at 375px and on desktop: four legend checkboxes and four lane tabs both
      usable; photo-less cards and photo-less pins legible.
- [ ] `CLAUDE.md`, `social-spots.md` and `famosos-lane.md` updated per "Scope change".

## Doc drift found while writing this

1. **`prds/social-spots.md:209`** — "Mi mapa (`/mapa`) · Signed-out: sign-in gate with `emptyMap`
   copy." `src/app/mapa/page.tsx:61-67` deliberately overrode this ("browsing the map needs no
   account (CLAUDE.md), so there is no standing gate here"). The PRD has said the wrong thing
   since the override landed. This work rewrites that view anyway — fix the line.
2. **No PRD mentions `src/lib/preview-spots.ts` by that name as a thing that exists.**
   `famosos-lane.md` describes its contents and `social-spots.md` predates it; neither has it in a
   Component Inventory. A 360-line module that fed two shipped surfaces was effectively
   undocumented. Fixed by this document's Component Inventory.
3. **`src/lib/spots.ts:64` `SEED_SPOTS`** — a v1 leftover, unreferenced, with a string id and a
   `nickname`. Not mentioned in any PRD. Deleted in Wave 1b.
4. **`social-spots.md:211`** — "Pin by source: `mine` = 44px photo pin… `been` = solid teal…
   `saved` = hollow stone-deep." It never gained the `preview` source that shipped later, and now
   needs `famoso`. Fix alongside item 1. [2026-09-22: photo pins removed; `famoso` reuses
   `preview` styling, which is now the Grabado category pin — `pin-revamp-spec.md` §14.]

## Push-back on the framing I was given

- The briefing described `preview-spots.ts` as 5 hardcoded constants used as an empty-state
  fallback. It is 20 entries backing a **shipped lane**. That changes the shape of the job: this
  is not "make a placeholder real", it is "move a live feature from the client to the database",
  which is why the deletion list in D8 and the test-deletion list are as long as they are.
- The briefing framed option (a) as "copy the Wikimedia images into the bucket **at seed time**".
  SQL cannot write bucket bytes and there is no CLI here, so "seed time" cannot be inside the
  migration. It is a separate, earlier, human-run step. Anyone who plans this as one migration
  will produce 20 rows pointing at 404s.
- The briefing asked whether `created_by` is nullable. It is — and the answer is still "do not use
  null", because `spot_cards`' inner join makes a null-author row invisible everywhere. Nullability
  was never the real constraint; the join was.
- The single highest-risk item in this plan is not the seed data or the licensing. It is D4:
  widening `spot_cards` silently breaks `feed_cerca` and `my_map` at call time, on a hosted
  database, with no local rehearsal available. Audit that part twice.

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-22 | Created | User clarified the product model: famous spots present on first open, personal map fills up from saves |
