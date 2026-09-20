# PRD: Paseo — social spot sharing (v2)

**Ticket:** None (ad-hoc request, 2026-09-20)
**Status:** Planning (awaiting user approval)
**Created:** 2026-09-20
**Last Updated:** 2026-09-20
**Author:** Fable (planner). Coder / tester / reviewer agents execute.
**Supersedes:** the five-item map MVP. Scope now lives in `CLAUDE.md` "Product scope — v2".

## Summary

Zpots becomes a social app for sharing spots in Zamboanga City. Home is the **Paseo**: a
full-screen vertical swipe deck of spot photos with the person who dropped them, ordered by
distance from you. The map is demoted to a live inset on each card and a **Mapa** tab where
every pin is the spot's photo. People have a @handle, an avatar, a profile ("Mi paseo"), and can
follow each other ("Camina con"). Posting is camera-first.

User decisions (locked):
- Concept: Paseo as described, including the Hoy row.
- Identity: handle + avatar + profile page.
- Graph: follow people (Siguiendo lane + Gente page).
- Platform: phone and desktop both first-class.
- Scope doc rewritten (done, `CLAUDE.md`).

## Design decisions

### Backend approach and why

| Decision | Choice | Reason |
|---|---|---|
| Profiles | New `public.profiles` table, PK = `auth.users.id`, created by trigger on user insert, backfilled for existing users | Auth metadata is client-writable and not queryable across users. A table with RLS gives public read for feed cards and a unique handle. |
| Handles | `citext`, unique, `^[a-z0-9_]{3,20}$`, placeholder `zp_<8 hex>` + `needs_handle=true` until the user picks one | Deterministic backfill, nobody is blocked at sign-up, the app nudges once. |
| Avatars | New bucket `avatars`, path `<user_id>/<uuid>.<ext>`, owner insert/update/delete via folder policy; **initials avatar rendered client-side as the default** | The existing `spot-photos` policy hardcodes root-level uuid names and has no update/delete, so it cannot host replaceable files. Initials fallback means every card looks finished without an upload. |
| Author on spots | `spots.created_by` gains a second FK to `profiles(id)`; a `security invoker` view `spot_cards` joins spots + profiles | PostgREST embedding needs an FK; a view keeps the client query a plain `select *` the test fake can serve. |
| Feed queries | Three Postgres functions: `paseo_cerca(lat, lng, page_size, page_offset)`, `paseo_nuevo(page_size, before_created_at, before_id)`, `paseo_siguiendo(page_size, before_created_at, before_id)`, plus `hoy_row()` | Distance ordering and the follow join must happen server-side; there is no server client, only the anon-key browser client. Functions match the existing trigger/function style in `0001_init.sql`. Cerca uses offset paging (small N, ordered by haversine); the time-ordered lanes use keyset paging. |
| Distance | Plain haversine in SQL, no PostGIS | The city is 90 km across and N is in the hundreds. PostGIS is not worth the extension for v2. |
| Follows | `follows(follower_id, followee_id, created_at)` PK on both, self-follow CHECK, reverse index; trigger-maintained `profiles.follower_count` / `following_count` | Same trigger pattern as `spots.confirmations`. Unfollow needs the schema's **first DELETE policy** (`delete using follower_id = auth.uid()`); it is documented in the migration header. |
| Geolocation | `navigator.geolocation` once per session; fallback to Plaza Pershing `[6.9106, 122.0736]` with a visible note | Cerca needs a point; denial must not break the walk. |
| Clustering on Mapa | Own grid clustering (0.004 deg cells) below zoom 14, photo pins at 14+ | Avoids a clustering dependency and its stylesheet; keeps the pin frame ours. |
| Pagination contract | `fetchSpots()` keeps its no-order contract for the map; feed functions own paging | Does not break the frozen map tests. |

### Architecture

```
Browser (Next 16, client components)
  /            Paseo deck  ── lanes: Cerca | Nuevo | Siguiendo ── Hoy row
  /mapa        Photo-pin map (clustered)          ┐ share SpotMap internals
  /post        Camera-first post flow             ┘
  /gente       Find people, following list
  /u/[handle]  Profile: Mi paseo route map, grid, follow button
  /yo          → redirect to /u/<my handle>
  /settings    Account, handle, avatar
  /login       unchanged

src/lib/feed-repo.ts      paseoCerca / paseoNuevo / paseoSiguiendo / hoyRow / spotsByUser
src/lib/profiles-repo.ts  getMyProfile / getProfileByHandle / updateHandle / uploadAvatar
                          follow / unfollow / isFollowing / searchProfiles
src/lib/use-location.ts   geolocation hook with city-center fallback
src/lib/geo.ts            haversineMeters, gridCellKey (pure, mirrored by SQL)

Supabase
  profiles, follows tables; spot_cards view; 4 SQL functions; avatars bucket
```

## Data model

### Migration `supabase/migrations/0004_paseo_social.sql`

```sql
create extension if not exists citext;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle citext not null unique,
  display_name text not null default '',
  avatar_url text,
  needs_handle boolean not null default true,
  follower_count integer not null default 0,
  following_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(display_name) <= 40)
);
-- trigger: on auth.users insert -> profiles row with handle 'zp_' || left(replace(id::text,'-',''), 8)
-- backfill: same for existing users, display_name from raw_user_meta_data->>'nickname'
-- RLS: select using(true) for anon+authenticated; insert/update own (id = auth.uid());
--      update may not change id, follower_count, following_count.

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows(followee_id, follower_id);
-- RLS: select using(true); insert with check (follower_id = auth.uid() and is_real_user());
--      delete using (follower_id = auth.uid()).  <-- first DELETE policy in this schema; documented.
-- triggers: maintain profiles.follower_count / following_count.

alter table public.spots
  add constraint spots_created_by_profile_fkey foreign key (created_by) references public.profiles(id);
create index spots_created_by_created_at_idx on public.spots(created_by, created_at desc);

create view public.spot_cards with (security_invoker = true) as
  select s.id, s.name, s.note, s.lat, s.lng, s.status, s.confirmations, s.created_at, s.photo_url,
         s.created_by, p.handle, p.display_name, p.avatar_url
  from public.spots s join public.profiles p on p.id = s.created_by;

-- functions (language sql, security invoker, stable):
--   paseo_cerca(lat double precision, lng double precision, page_size int, page_offset int)
--     returns setof (spot_cards + distance_m double precision) ordered by haversine, id
--   paseo_nuevo(page_size int, before_created_at timestamptz, before_id uuid)
--     keyset: (created_at, id) < (before_created_at, before_id), order desc
--   paseo_siguiendo(page_size int, before_created_at timestamptz, before_id uuid)
--     same, where created_by in (select followee_id from follows where follower_id = auth.uid())
--   hoy_row()
--     returns (profile + latest spot id today) for followees with a spot where created_at >= now() - interval '24 hours'

-- storage: bucket 'avatars' public read, 2 MiB, jpeg/png/webp;
--   insert/update/delete to authenticated where (storage.foldername(name))[1] = auth.uid()::text
```

Guard test: `migration-paseo.test.ts` reads the SQL as text and asserts every table, index, policy
name, function name, and the delete policy comment exist. `geo.test.ts` asserts the TS haversine
and the SQL formula agree on three known pairs (Fort Pilar to Plaza Pershing ~1.2 km, etc.).

### Types

```ts
// src/lib/profiles.ts
export interface Profile { id: string; handle: string; displayName: string; avatarUrl: string | null;
  needsHandle: boolean; followerCount: number; followingCount: number; createdAt: string }
// src/lib/spots.ts  (Spot gains an author)
export interface SpotAuthor { id: string; handle: string; displayName: string; avatarUrl: string | null }
export interface SpotCard extends Spot { author: SpotAuthor; distanceM?: number }
```
`Spot` itself is unchanged so the map and its frozen tests keep working. `nickname` stays on `Spot`
as legacy and is no longer rendered anywhere.

## Copy (append to `src/lib/copy.ts`, ASCII only, native review still pending)

```
paseo:          Paseo / Walk                  cerca: Cerca / Near me
nuevo:          Nuevo / New                   siguiendo: Siguiendo / Following
hoy:            Hoy / Today                   mapa: Mapa / Map
gente:          Gente / People                yo: Yo / Me
follow:         Camina con / Follow           unfollow: Deja de camina / Unfollow
followingState: Ta camina / Following         followers: Seguidores / Followers
followingCount: Siguiendo / Following         miPaseo: Mi paseo / My walk
pickHandle:     Escoge tu handle / Pick your handle
handleTaken:    Ya tiene ese handle / That handle is taken
takePhoto:      Saca foto / Take a photo      choosePhoto: Escoge foto / Choose a photo
whereIsIt:      Donde este? / Where is it?    usingCenter: Ta usa el centro del ciudad / Using the city center
noSpotsYet:     Nuay pa spots / No spots yet  findPeople: Busca gente / Find people
nobodyToday:    Nuay pa quien ya sale hoy / Nobody has gone out today
distanceAway:   {n} de aqui / {n} away        droppedBy: De / By
```
`copy.test.ts` already enforces cv != en and ASCII; extend the key list.

## UI spec

Shared rules from the Ciudad Latina redesign apply (tokens, one warm shadow, radii, Alegreya,
teal focus, no raw hex, no emojis, hand-drawn SVG icons only).

### Navigation
- **Phone (< 1024px):** bottom bar, 64px, cream-deep, stone top border. Five items: Paseo, Mapa,
  camera (center, terracotta circle 56px raised 12px above the bar), Gente, Yo. Active item teal
  with a 3px vinta rule under the icon. Icons new in `src/components/icons/nav-icons.tsx`:
  `WalkIcon` (footsteps), `MapIcon` (folded map), `CameraIcon`, `PeopleIcon` (two heads),
  `MeIcon` (compass-rose person).
- **Desktop (>= 1024px):** left rail 88px with the same five items stacked, wordmark at top.
  Content area is two columns: left 480px walk column, right the live map filling the rest.

### Paseo deck (`/`)
- Lane tabs at the top: Cerca | Nuevo | Siguiendo, Alegreya Sans 700 uppercase 12px, active
  underlined with a vinta rule. Siguiendo shows a sign-in gate when signed out.
- Hoy row under the tabs (Siguiendo and Cerca lanes only): 48px avatars with a 3px vinta-stripe
  ring, handle beneath in 11px. Tap scrolls the deck to that spot. Hidden when empty and signed out.
- Cards: full viewport height minus nav on phone; 480 x 720 in the desktop column. Photo
  `object-cover` fills the card, a tinta-to-transparent gradient over the bottom 40%. Overlaid:
  avatar 40px + @handle + display name (cream), spot name Alegreya 700 24px, note 15px max 2 lines,
  barangay/distance line 13px ("1.2 km de aqui"), status pill, and the confirm CTA
  ("Ya anda yo aqui", stacked bilingual, terracotta) with Report as a ghost icon button.
- Map inset: 112 x 112px, top-right of the card, rounded 6px, stone border, tinted tiles, one
  photo pin, no controls, `dragging=false`. Pans with 250ms ease when the active card changes.
  Tap opens `/mapa?spot=<id>` centered on it.
- Swipe: CSS scroll-snap `y mandatory`, one card per snap; keyboard up/down; on desktop the
  right-column map pans to the active card's spot instead of the inset.
- Paging: fetch 10, prefetch next page when the active index is within 3 of the end. Skeleton
  card in cream-deep while loading. Empty lane shows `noSpotsYet` with a `StoneArch` above it.

### Mapa (`/mapa`)
- The existing SpotMap, plus `PhotoPin`: 44px circle photo clipped inside the compass-rose frame
  (frame stroke teal for confirmed, stone-deep for unconfirmed), cream halo. `ClusterPin`: a
  stack of two offset cream squares with the count in Alegreya 700 and a small photo of the
  newest spot. Clustering below zoom 14 by `gridCellKey(lat, lng, 0.004)`; tap zooms to 15 at the
  cell center. `?spot=<id>` opens that popup.

### Post (`/post`)
- Signed-out: sign-in gate. Step 1: full-screen camera pane, primary "Saca foto" opens
  `<input type="file" accept="image/*" capture="environment">`, secondary "Escoge foto". Preview
  fills the pane after pick. Step 2: name and note inputs over the photo's bottom third, location
  chip "Donde este?" showing GPS accuracy; if GPS is missing or outside the city, a 240px map
  appears for a tap (existing tap-guard logic). Submit = existing `createSpot`. Success routes to
  `/` with the new card first in Nuevo and a cream toast "Ya sale tu spot / Your spot is up".

### Profile (`/u/[handle]`)
- Header: avatar 88px (upload on own profile), @handle, display name, follower / following
  counts, "Camina con" primary (teal when following = "Ta camina", tap again to unfollow with an
  inline confirm). Below: **Mi paseo** map 200px tall, non-interactive, this person's dropped
  spots as photo pins connected by a dashed teal path in creation order; on your own profile your
  confirmed spots are added as hollow pins. Then a 3-column photo grid; tap opens the spot in the
  deck (`/?spot=<id>` scrolls Nuevo to it).
- Own profile shows "Escoge tu handle" banner while `needsHandle`.

### Gente (`/gente`)
- Search box by handle or display name (`searchProfiles`, ilike, 20 results). Below it,
  "Siguiendo" list with follow state, then "Gente nueva" = 10 most recent posters you do not follow.

### Handle gate
- After sign-in, if `needsHandle`, a modal card (same style as the sign-in gate) asks for a handle
  with live availability (`handle_available(text)` SQL function, anon-callable). Skippable once;
  banner on own profile until set.

### Settings
- Adds handle edit and avatar upload; nickname field removed (legacy data untouched).

### Default avatar
- `Avatar` component: image when `avatarUrl`, else initials on a background chosen from
  [teal, terracotta, stone-deep, vinta-blue, vinta-green] by hashing the handle. Deterministic,
  server/client identical (no random).

## Waves

Tests are written first for each wave and must fail red. **One coder per git worktree** this time;
the orchestrator merges. File ownership per wave is disjoint by design.

| Wave | Task | Owner files | Type |
|---|---|---|---|
| 0 | Red tests for waves 1 to 3 | `src/__tests__/**` | auto |
| 1a | Migration 0004 + `handle_available` + avatars bucket | `supabase/migrations/0004_paseo_social.sql` | auto |
| 1b | Extract `createFakeSupabase` to `src/__tests__/helpers/fake-supabase.ts`; add `.order .range .limit .in .delete .ilike .rpc .gte` and view/function tables | that file + existing tests' imports | auto |
| 1c | Copy keys, nav/social icons, `Avatar`, `geo.ts`, `use-location.ts` | `copy.ts`, `icons/nav-icons.tsx`, `icons/social-icons.tsx`, `Avatar.tsx`, `geo.ts`, `use-location.ts` | auto |
| 2a | `profiles-repo.ts`, `profiles.ts` types | those | auto |
| 2b | `feed-repo.ts`, `SpotCard` type, `spots-repo` returns `created_by` | those | auto |
| 3a | Nav shell (bottom bar + desktop rail), route scaffolds, handle gate | `AppNav.tsx`, `ClipboardShell.tsx`, `app/**` layouts | auto |
| 3b | Paseo deck + Hoy row + map inset | `PaseoDeck.tsx`, `SpotCardView.tsx`, `HoyRow.tsx`, `MapInset.tsx`, `app/page.tsx` | auto |
| 3c | PhotoPin, ClusterPin, Mapa page | `pin-icon.ts`, `icons/pin-icons.tsx`, `SpotMap.tsx`, `app/mapa/page.tsx` | auto |
| 3d | Post flow | `app/post/page.tsx`, `PostFlow.tsx`, `AddSpotForm.tsx` | auto |
| 3e | Profile, Gente, settings changes | `app/u/[handle]/page.tsx`, `app/gente/page.tsx`, `app/yo/page.tsx`, `app/settings/page.tsx`, `MiPaseoMap.tsx` | auto |
| 4 | Adversarial tests, reviewer gate, browser verification phone + desktop, docs | | checkpoint:human-verify |
| 5 | Apply migration 0004 to Supabase | user runs it | checkpoint:human-action |

Wave 3 tasks may run in parallel (separate worktrees) after wave 2 merges; 3b/3c/3e all import
from 2a/2b only.

## Testing

- Unit: `geo.test.ts`, `use-location.test.ts` (denied, granted, outside-city), `Avatar.test.tsx`
  (deterministic initials + color), `profiles-repo.test.ts`, `feed-repo.test.ts` (paging cursors,
  rpc names and args), `migration-paseo.test.ts`.
- Component: `PaseoDeck.test.tsx` (lanes, snap order, prefetch trigger, sign-in gate on
  Siguiendo, Hoy tap scrolls), `SpotCardView.test.tsx` (author, distance formatting, confirm and
  report by English names), `PhotoPin` in `pin-icon.test.ts` (44px, clip path, frame color by
  status), clustering in `geo.test.ts`, `PostFlow.test.tsx` (capture attribute, GPS path, map
  fallback path, outside-city), `profile-page.test.tsx` (follow toggle optimistic + rollback,
  own vs other), `gente-page.test.tsx`, `AppNav.test.tsx` (active state, camera button).
- Guardrails already in place: no-raw-hex, copy ASCII, aria English names, theme tokens.
- Bulk: `PaseoDeck` with 200 cards renders only the visible window (assert DOM count <= 5).

## Business rules

- Cerca falls back to the city center silently except for one note line; it never blocks.
- A spot's author is the signed-in user; `created_by` is set by the DB default, never the client.
- Follow/unfollow is idempotent in the repo layer (insert ignores duplicates, delete of nothing
  is not an error).
- Hoy = followees with a spot in the last 24 hours, newest first, max 20.
- A user cannot follow themselves (DB check + hidden button on own profile).
- Handles are lowercase, 3 to 20 chars, letters digits underscore, unique case-insensitively.
- Everything readable signed-out except the Siguiendo lane, Hoy row, and follow lists' actions.

## Open items for the user

1. Apply migration 0004 after QA (Wave 5). Also 0003 is still unapplied.
2. Chavacano copy review by a native speaker (now ~25 more strings).
3. Existing users get `zp_xxxxxxxx` handles and a nudge to pick one.

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-20 | PRD created | User redirected product from map tool to social spot sharing |
