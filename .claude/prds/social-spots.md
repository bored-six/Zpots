# PRD: Social spots — feed, saves, personal map, profiles (v2)

**Ticket:** None (ad-hoc request, 2026-09-20)
**Status:** Planning (awaiting user "go")
**Created:** 2026-09-20
**Last Updated:** 2026-09-20
**Author:** Fable (planner). Coder / tester / reviewer agents execute.
**Supersedes:** the five-item map MVP and the earlier "Paseo" draft (name dropped: Paseo is a
real place in Zamboanga; the map is now personal, not public).

## Summary

Zpots is a social app for sharing spots in Zamboanga City, closer to Instagram or Snapchat than
to Google Maps. Home is a full-screen **Spots** deck: one spot per swipe, photo first, the
person who dropped it, how far it is. Two actions on every spot: **Guarda** (save it to my map)
and **Ya anda yo aqui** (I've been here). **Mi mapa** shows only my own posts, my saved spots,
and spots I've been to. There is no public map of everything. People have a @handle, an avatar,
a profile, and can follow each other ("Camina con"). Posting is camera-first.

User decisions (locked):
- Home = swipe deck of spots ordered by distance; lanes Cerca / Nuevo / Siguiendo; Hoy row stays.
- Map is personal: own + saved + been. No all-spots map.
- Names: home tab "Spots", map tab "Mi mapa". No place names.
- Identity: handle + avatar + profile page. Graph: follow people.
- Phone and desktop both first-class.
- Tests cover features and functions, never pure design.

## Design decisions

### Backend approach and why

| Decision | Choice | Reason |
|---|---|---|
| Profiles | New `public.profiles` table, PK = `auth.users.id`, trigger-created on sign-up, backfilled for existing users | Auth metadata is client-writable and not queryable across users. A table with RLS gives public read for cards and a unique handle. |
| Handles | `citext`, unique, `^[a-z0-9_]{3,20}$`, placeholder `zp_<8 hex>` + `needs_handle=true` until picked | Deterministic backfill, nobody blocked at sign-up, the app nudges once. |
| Avatars | New bucket `avatars`, path `<user_id>/<uuid>.<ext>`, owner insert/update/delete via folder policy; initials avatar rendered client-side as default | `spot-photos` policy hardcodes root uuid names and has no update/delete, so it cannot host replaceable files. Initials fallback keeps every card finished without an upload. |
| Saves | New `saves(user_id, spot_id, created_at)` table; RLS select/insert/delete own only | Saves are private. The personal map is one query on this table joined to `spot_cards`. |
| Been | Existing `confirmations` table is "been" | Already public-count logic (2 distinct flips to Confirmed). No new table. |
| Personal map query | SQL function `my_map()` returning `spot_cards` rows tagged `source in ('mine','saved','been')` | One round trip; union of three sources server-side under RLS. |
| Author on spots | `spots.created_by` gains an FK to `profiles(id)`; view `spot_cards` (security invoker) joins spots + profiles | PostgREST embedding needs an FK; a view keeps client queries a plain `select *` the test fake can serve. |
| Feed queries | SQL functions `feed_cerca(lat,lng,page_size,page_offset)`, `feed_nuevo(page_size,before_created_at,before_id)`, `feed_siguiendo(...)`, `hoy_row()` | Distance ordering and the follow join must be server-side; only the anon-key browser client exists. Matches existing function style. |
| Distance | Plain haversine in SQL, no PostGIS | City is 90 km across, N in the hundreds. |
| Follows | `follows(follower_id, followee_id)` PK, self-follow CHECK, reverse index; trigger-maintained counts on `profiles` | Same trigger pattern as `spots.confirmations`. Unfollow is the schema's **first DELETE policy**; saves also delete. Documented in the migration header. |
| Geolocation | `navigator.geolocation` once per session; fallback Plaza Pershing `[6.9106, 122.0736]` with a visible note | Cerca needs a point; denial must not break the deck. |
| Public map | Removed. `fetchSpots()` and the all-spots page go away | User decision. Also removes the unpaginated global query. |

### Architecture

```
Browser (Next 16, client components)
  /            Spots deck  ── lanes: Cerca | Nuevo | Siguiendo ── Hoy row
  /mapa        Mi mapa: my posts + saved + been (photo pins, popups)
  /post        Camera-first post flow
  /gente       Find people, following list
  /u/[handle]  Profile: avatar, counts, follow, grid of their spots
  /yo          → redirect to /u/<my handle>
  /settings    Account, handle, avatar
  /login       unchanged

src/lib/feed-repo.ts      feedCerca / feedNuevo / feedSiguiendo / hoyRow / spotsByUser
src/lib/saves-repo.ts     saveSpot / unsaveSpot / mySavedIds / myMap
src/lib/profiles-repo.ts  getMyProfile / getProfileByHandle / updateHandle / uploadAvatar
                          follow / unfollow / isFollowing / searchProfiles
src/lib/use-location.ts   geolocation hook with city-center fallback
src/lib/geo.ts            haversineMeters, formatDistance (pure, mirrored by SQL)

Supabase
  profiles, follows, saves tables; spot_cards view; feed_*, hoy_row, my_map, handle_available
  functions; avatars bucket
```

## Data model

### Migration `supabase/migrations/0004_social_spots.sql`

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
-- trigger on auth.users insert -> profiles row, handle 'zp_' || left(replace(id::text,'-',''), 8)
-- backfill existing users the same way, display_name from raw_user_meta_data->>'nickname'
-- RLS: select using(true); insert/update own; update cannot change id or the two counts

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows(followee_id, follower_id);
-- RLS: select using(true); insert with check (follower_id = auth.uid() and is_real_user());
--      delete using (follower_id = auth.uid())   -- first DELETE policy in this schema
-- triggers maintain profiles.follower_count / following_count

create table public.saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, spot_id)
);
create index saves_spot_idx on public.saves(spot_id);
-- RLS: select using (user_id = auth.uid()); insert with check (user_id = auth.uid() and is_real_user());
--      delete using (user_id = auth.uid())

alter table public.spots
  add constraint spots_created_by_profile_fkey foreign key (created_by) references public.profiles(id);
create index spots_created_by_created_at_idx on public.spots(created_by, created_at desc);

create view public.spot_cards with (security_invoker = true) as
  select s.id, s.name, s.note, s.lat, s.lng, s.status, s.confirmations, s.created_at, s.photo_url,
         s.created_by, p.handle, p.display_name, p.avatar_url
  from public.spots s join public.profiles p on p.id = s.created_by;

-- functions (language sql, security invoker, stable):
--   feed_cerca(lat, lng, page_size, page_offset)  -> spot_cards + distance_m, ordered by haversine, id
--   feed_nuevo(page_size, before_created_at, before_id)      keyset desc on (created_at, id)
--   feed_siguiendo(page_size, before_created_at, before_id)  same, created_by in my followees
--   hoy_row()          followees with a spot in the last 24h: profile + latest spot id, max 20
--   my_map()           spot_cards + source text: 'mine' | 'saved' | 'been' (mine wins, then been, then saved)
--   handle_available(text) boolean, callable by anon

-- storage: bucket 'avatars' public read, 2 MiB, jpeg/png/webp;
--   insert/update/delete to authenticated where (storage.foldername(name))[1] = auth.uid()::text
```

Guard test `migration-social.test.ts` reads the SQL as text and asserts every table, index, policy,
function, and the delete-policy comment exist. `geo.test.ts` asserts the TS haversine and the SQL
formula agree on known pairs.

### Types

```ts
// src/lib/profiles.ts
export interface Profile { id; handle; displayName; avatarUrl: string | null; needsHandle: boolean;
  followerCount: number; followingCount: number; createdAt: string }
// src/lib/spots.ts (Spot unchanged; SpotCard adds author + optional distance + map source)
export interface SpotAuthor { id; handle; displayName; avatarUrl: string | null }
export interface SpotCard extends Spot { author: SpotAuthor; distanceM?: number }
export type MapSource = "mine" | "saved" | "been";
export interface MapSpot extends SpotCard { source: MapSource }
```
`nickname` stays on `Spot` as legacy and is never rendered.

## Copy (append to `src/lib/copy.ts`, ASCII only, native review pending)

```
spots:          Spots / Spots                 (brand word, same in both; exempt from cv!=en rule)
cerca:          Cerca / Near me               nuevo: Nuevo / New
siguiendo:      Siguiendo / Following         hoy: Hoy / Today
miMapa:         Mi mapa / My map              gente: Gente / People
yo:             Yo / Me
save:           Guarda / Save                 saved: Guardao / Saved
unsave:         Quita / Remove                been: Ya anda yo aqui / I've been here   (existing confirmVisit)
follow:         Camina con / Follow           unfollow: Deja de camina / Unfollow
followingState: Ta camina / Following         followers: Seguidores / Followers
followingCount: Siguiendo / Following
pickHandle:     Escoge tu handle / Pick your handle
handleTaken:    Ya tiene ese handle / That handle is taken
takePhoto:      Saca foto / Take a photo      choosePhoto: Escoge foto / Choose a photo
whereIsIt:      Donde este? / Where is it?    usingCenter: Ta usa el centro del ciudad / Using the city center
noSpotsYet:     Nuay pa spots / No spots yet  emptyMap: Guarda un spot para mira aqui / Save a spot to see it here
findPeople:     Busca gente / Find people     nobodyToday: Nuay pa quien ya sale hoy / Nobody has gone out today
distanceAway:   {n} de aqui / {n} away        droppedBy: De / By
spotIsUp:       Ya sale tu spot / Your spot is up
```

## UI spec

Shared rules from the Ciudad Latina redesign apply (tokens, one warm shadow, radii, Alegreya,
teal focus, no raw hex, no emojis, hand-drawn SVG icons only).

### Navigation
- **Phone (< 1024px):** bottom bar 64px, cream-deep, stone top border. Spots, Mi mapa, camera
  (center, terracotta 56px circle raised above the bar), Gente, Yo. Active = teal + 3px vinta rule.
  New icons in `icons/nav-icons.tsx`: `SpotsIcon` (compass rose, reuse pin silhouette),
  `MapIcon` (folded map), `CameraIcon`, `PeopleIcon`, `MeIcon`; `icons/social-icons.tsx`:
  `BookmarkIcon` (save), `BookmarkFilledIcon`, `FollowIcon`.
- **Desktop (>= 1024px):** left rail 88px, same five items, wordmark at top. Spots page is two
  columns: 480px deck on the left, the active card's location on a live map on the right.

### Spots deck (`/`)
- Lane tabs Cerca | Nuevo | Siguiendo. Siguiendo shows the sign-in gate when signed out.
- Hoy row under the tabs (Siguiendo and Cerca): 48px avatars with a vinta-stripe ring, handle
  beneath. Tap moves the deck to that spot. Hidden when empty.
- Card: full viewport height minus nav on phone; 480 x 720 in the desktop column. Photo fills,
  tinta gradient over the bottom 40%. Overlaid: avatar + @handle + display name, spot name
  Alegreya 700 24px, note max 2 lines, distance line, status pill. Actions row: **Guarda**
  (ghost cream, bookmark icon, becomes filled teal "Guardao" when saved) and **Ya anda yo aqui**
  (terracotta primary). Report is a small ghost icon button. Saving and unsaving are optimistic.
- Map inset 112px, top-right: tinted tiles, one photo pin for this spot, no controls. Tap opens
  `/mapa?spot=<id>` **only if** the spot is on my map (saved/been/mine); otherwise it expands
  inline to a 240px preview on the card. Desktop pans the right-column map instead.
- Swipe: CSS scroll-snap `y mandatory`, keyboard up/down. Fetch 10, prefetch when within 3 of the
  end. Skeleton card while loading. Empty lane shows `noSpotsYet` under a `StoneArch`.

### Mi mapa (`/mapa`)
- Signed-out: sign-in gate with `emptyMap` copy. Signed-in: `my_map()` results on the existing
  SpotMap (bounds, tint, popup unchanged). Pin by source: `mine` = 44px photo pin in a teal
  compass frame; `been` = solid teal compass pin; `saved` = hollow stone-deep compass pin.
  Legend chip row at the top: Mios / Ya anda / Guardao (toggles filter, all on by default).
  Popup adds **Quita** for saved spots. `?spot=<id>` opens that popup. Empty state: `emptyMap`.
  No clustering: a personal map is small.

### Post (`/post`)
- Signed-out gate. Step 1: camera pane, "Saca foto" opens
  `<input type="file" accept="image/*" capture="environment">`, secondary "Escoge foto".
  Step 2: name and note over the photo's bottom third, "Donde este?" chip with GPS state; if GPS
  is missing or outside the city, a 240px map for a tap (existing tap guard). Submit = existing
  `createSpot`. Success routes to `/` on Nuevo with the new card first and a cream toast `spotIsUp`.
  Own posts appear on Mi mapa automatically (`source = mine`).

### Profile (`/u/[handle]`)
- Avatar 88px (upload on own), @handle, display name, follower / following counts, "Camina con"
  primary (teal "Ta camina" when following; tap again to unfollow with inline confirm). Then a
  3-column grid of their spot photos; tap opens the deck on that spot (`/?spot=<id>`).
- Own profile shows the "Escoge tu handle" banner while `needsHandle`. No follow button on self.

### Gente (`/gente`)
- Search by handle or display name (ilike, 20 results). Then "Siguiendo" list with follow state,
  then "Gente nueva": 10 most recent posters I do not follow.

### Handle gate
- After sign-in, if `needsHandle`, a modal card (sign-in gate style) with live availability via
  `handle_available`. Skippable once; banner on own profile until set.

### Settings
- Adds handle edit and avatar upload; nickname field removed.

### Default avatar
- `Avatar`: image when `avatarUrl`, else initials on a background from
  [teal, terracotta, stone-deep, vinta-blue, vinta-green] chosen by hashing the handle.
  Deterministic, identical on server and client.

## Waves

Tests first per wave, must fail red. **One coder per git worktree**; the orchestrator merges.
File ownership is disjoint by design.

| Wave | Task | Owner files | Type |
|---|---|---|---|
| 0 | Red behavior tests for waves 1 to 3 | `src/__tests__/**` | auto |
| 1a | Migration 0004 | `supabase/migrations/0004_social_spots.sql` | auto |
| 1b | Extract `createFakeSupabase` to `src/__tests__/helpers/fake-supabase.ts`; add `.order .range .limit .in .delete .ilike .rpc .gte` and view/function tables | that file + test imports | auto |
| 1c | Copy keys, nav/social icons, `Avatar`, `geo.ts`, `use-location.ts` | listed files | auto |
| 2a | `profiles-repo.ts`, `profiles.ts` | those | auto |
| 2b | `feed-repo.ts`, `saves-repo.ts`, `SpotCard`/`MapSpot` types, `spots-repo` exposes `created_by`, remove `fetchSpots` | those | auto |
| 3a | Nav shell (bottom bar + desktop rail), route scaffolds, handle gate | `AppNav.tsx`, `ClipboardShell.tsx`, `app/**` layouts | auto |
| 3b | Spots deck + Hoy row + map inset + save/been actions | `SpotsDeck.tsx`, `SpotCardView.tsx`, `HoyRow.tsx`, `MapInset.tsx`, `app/page.tsx` | auto |
| 3c | Mi mapa: photo pin, source pins, legend, Quita, `app/mapa/page.tsx` | `pin-icon.ts`, `icons/pin-icons.tsx`, `SpotMap.tsx`, `app/mapa/page.tsx` | auto |
| 3d | Post flow | `app/post/page.tsx`, `PostFlow.tsx`, `AddSpotForm.tsx` | auto |
| 3e | Profile, Gente, settings changes | `app/u/[handle]/page.tsx`, `app/gente/page.tsx`, `app/yo/page.tsx`, `app/settings/page.tsx` | auto |
| 4 | Adversarial tests, reviewer gate, browser verification phone + desktop, docs | | checkpoint:human-verify |
| 5 | Apply migrations 0003 and 0004 to Supabase | user | checkpoint:human-action |

Wave 3 tasks run in parallel worktrees after wave 2 merges.

## Testing

**User rule: test features and functions, not pure design.** No assertions on sizes, classes,
colors, or layout. Visuals are checked in the browser by the orchestrator.

- Unit: `geo.test.ts` (haversine, distance formatting, TS vs SQL agreement),
  `use-location.test.ts` (granted, denied, outside-city fallback), `Avatar.test.tsx`
  (same handle always same initials and palette index; image when URL), `profiles-repo.test.ts`
  (handle validation, availability, follow/unfollow idempotent), `saves-repo.test.ts`
  (save/unsave idempotent, `myMap` maps sources), `feed-repo.test.ts` (paging cursors, rpc
  names and args), `migration-social.test.ts`.
- Behavior: `SpotsDeck.test.tsx` (lane switching, next-page prefetch, Siguiendo gate, Hoy tap
  moves active card, `?spot=` deep link, save toggles optimistic and rolls back on error),
  `SpotCardView.test.tsx` (author shown, distance, save and been and report reachable by English
  names), `mapa-page.test.tsx` (gate when signed out, pins by source, legend filters, Quita
  removes the pin, `?spot=` opens popup), `PostFlow.test.tsx` (capture attribute, GPS path skips
  map, denied GPS shows map, outside-city blocked, `createSpot` called once, routes home),
  `profile-page.test.tsx` (follow toggle optimistic + rollback, no follow on self, handle banner),
  `gente-page.test.tsx` (search calls repo, follow state), `AppNav.test.tsx` (routes only).
- Guardrails in place: no-raw-hex, copy ASCII, aria English names, theme tokens.
- Bulk: deck with 200 cards mounts only the visible window (DOM cards <= 5).

## Business rules

- The map shows only my posts, my saves, and my been spots. Never all spots.
- Save is private; Been is public (counts toward Confirmed at 2 distinct users).
- A spot can be both saved and been; the map shows it as been.
- Cerca falls back to the city center with one note line; it never blocks.
- `created_by` is set by the DB default, never the client.
- Follow, unfollow, save, unsave are idempotent in the repo layer.
- Hoy = followees with a spot in the last 24 hours, newest first, max 20.
- No self-follow (DB check + no button). Handles lowercase, 3 to 20, letters digits underscore.
- Readable signed-out: Spots deck (Cerca, Nuevo), profiles, Gente search. Everything else gates.

## Open items for the user

1. Apply migrations 0003 and 0004 after QA (Wave 5).
2. Chavacano copy review by a native speaker.
3. Existing users get `zp_xxxxxxxx` handles and a nudge to pick one.

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-20 | PRD created, replacing the Paseo draft | Name was a real place; map made personal per user |
