-- ============================================================================
-- Zpots — schema v4: social spots (profiles, follows, saves, feed)
-- Run AFTER 0001_init.sql, 0002_auth.sql, 0003_zamboanga_bounds.sql. Safe to
-- re-run. Additive only: no existing row in any table is read, updated, or
-- deleted by this migration.
--
-- What's new:
--   * public.profiles  -- one row per auth.users account (handle, avatar,
--     follower/following counts). Trigger-created on signup; backfilled here
--     for accounts that already existed.
--   * public.follows / public.saves -- this migration's first two DELETE
--     policies (unfollow, unsave). Every earlier policy in 0001/0002 was
--     insert-only or select-only; nothing before this could be deleted from
--     the browser.
--   * spots.created_by gets a second FK, to profiles(id) (the first, from
--     0002, is to auth.users(id)) so PostgREST can embed the author.
--   * public.spot_cards -- security-invoker view joining spots to profiles.
--   * feed_cerca / feed_nuevo / feed_siguiendo / hoy_row / my_map /
--     handle_available -- SQL, STABLE, SECURITY INVOKER functions. Every one
--     that reads auth.uid() is written so a null auth.uid() (signed out)
--     naturally filters every row out rather than raising -- there is no
--     special-cased error path for "not signed in".
--   * storage bucket 'avatars', public read, folder-scoped owner writes.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1. citext, for case-insensitive, unique handles.
-- ----------------------------------------------------------------------------
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- 2. profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  handle           citext not null unique,
  display_name     text not null default '',
  avatar_url       text,
  needs_handle     boolean not null default true,
  follower_count   integer not null default 0,
  following_count  integer not null default 0,
  created_at       timestamptz not null default now(),

  constraint profiles_handle_format    check (handle ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(display_name) <= 40),
  constraint profiles_follower_count_nonneg  check (follower_count >= 0),
  constraint profiles_following_count_nonneg check (following_count >= 0)
);

comment on table public.profiles is
  'One row per auth.users account. Created by the on_auth_user_created trigger below; handle defaults to a zp_ placeholder until the user picks one (needs_handle).';

-- Placeholder handle 'zp_' || first 8 hex chars of the uuid (no dashes) is
-- deterministic and needs no uniqueness retry loop at signup time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, handle, display_name, needs_handle)
  values (
    new.id,
    'zp_' || left(replace(new.id::text, '-', ''), 8),
    coalesce(new.raw_user_meta_data ->> 'nickname', ''),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT on auth.users: creates the matching profiles row. SECURITY DEFINER because the inserting role during signup has no grants on public.profiles.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: every auth.users row that predates this migration and has no
-- profiles row yet gets the same placeholder shape the trigger gives new
-- signups. ON CONFLICT DO NOTHING (plus the NOT EXISTS guard) makes this
-- statement idempotent on re-run.
insert into public.profiles (id, handle, display_name, needs_handle)
select
  u.id,
  'zp_' || left(replace(u.id::text, '-', ''), 8),
  coalesce(u.raw_user_meta_data ->> 'nickname', ''),
  true
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

alter table public.profiles enable row level security;

-- profiles: every handle/avatar/count is public (feed cards, profile pages).
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select to anon, authenticated
  using (true);

-- profiles: a signed-in user may create their own row directly (belt and
-- suspenders alongside the trigger above; still only ever as themself).
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (public.is_real_user() and id = auth.uid());

-- profiles: a signed-in user may update their own row. id and the two
-- trigger-maintained counters are simply absent from the UPDATE column grant
-- below, so no client can move them even indirectly through this policy.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (public.is_real_user() and id = auth.uid())
  with check (public.is_real_user() and id = auth.uid());

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert (id, handle, display_name, avatar_url, needs_handle)
  on table public.profiles to authenticated;
grant update (handle, display_name, avatar_url, needs_handle)
  on table public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 3. follows ("Camina con")
-- ----------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

comment on table public.follows is
  'follower_id follows followee_id. profiles.follower_count/following_count are trigger-maintained from this table -- never write them directly.';

create index follows_followee_idx on public.follows(followee_id, follower_id);

create or replace function public.follows_adjust_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count  = follower_count  + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set follower_count  = greatest(follower_count  - 1, 0) where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.follows_adjust_counts() is
  'AFTER INSERT/DELETE on follows: keeps profiles.follower_count/following_count in sync. SECURITY DEFINER since the caller (a follower) has no UPDATE grant on profiles.';

drop trigger if exists follows_adjust_counts on public.follows;
create trigger follows_adjust_counts
  after insert or delete on public.follows
  for each row execute function public.follows_adjust_counts();

alter table public.follows enable row level security;

-- follows: the graph is public (follower/following lists, counts).
drop policy if exists follows_select_all on public.follows;
create policy follows_select_all on public.follows
  for select to anon, authenticated
  using (true);

-- follows: only a real signed-in user may follow, and only as themself.
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (follower_id = auth.uid() and public.is_real_user());

-- follows: unfollow. This is this migration's first DELETE policy (and this
-- schema's first ever) -- saves' delete policy below is the second. Every
-- table created in 0001/0002 was select/insert-only from the browser.
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = auth.uid());

revoke all on table public.follows from anon, authenticated;
grant select on table public.follows to anon, authenticated;
grant insert (follower_id, followee_id) on table public.follows to authenticated;
grant delete on table public.follows to authenticated;

-- ----------------------------------------------------------------------------
-- 4. saves ("Guarda") -- private bookmarks onto Mi mapa.
-- ----------------------------------------------------------------------------
create table public.saves (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  spot_id    uuid not null references public.spots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, spot_id)
);

comment on table public.saves is
  'Private bookmarks. Never public -- select is scoped to the caller''s own rows, unlike confirmations ("been"), which counts toward the public Confirmed threshold.';

create index saves_spot_idx on public.saves(spot_id);

alter table public.saves enable row level security;

-- saves: private. A user reads only their own saved spots.
drop policy if exists saves_select_own on public.saves;
create policy saves_select_own on public.saves
  for select to authenticated
  using (user_id = auth.uid());

-- saves: a real signed-in user may save a spot, only as themself.
drop policy if exists saves_insert_own on public.saves;
create policy saves_insert_own on public.saves
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_real_user());

-- saves: unsave. This migration's second DELETE policy (see follows above for
-- the first).
drop policy if exists saves_delete_own on public.saves;
create policy saves_delete_own on public.saves
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.saves from anon, authenticated;
grant select on table public.saves to authenticated;
grant insert (user_id, spot_id) on table public.saves to authenticated;
grant delete on table public.saves to authenticated;

-- ----------------------------------------------------------------------------
-- 5. spots.created_by -> profiles, for PostgREST/view embedding.
--    (The existing 0002 FK to auth.users(id) is untouched; this is additive.)
-- ----------------------------------------------------------------------------
alter table public.spots
  add constraint spots_created_by_profile_fkey
  foreign key (created_by) references public.profiles(id);

create index spots_created_by_created_at_idx on public.spots(created_by, created_at desc);

-- ----------------------------------------------------------------------------
-- 6. spot_cards -- the read shape every feed/profile query selects from.
-- ----------------------------------------------------------------------------
create view public.spot_cards
with (security_invoker = true) as
select
  s.id, s.name, s.note, s.lat, s.lng, s.status, s.confirmations, s.created_at, s.photo_url,
  s.created_by, p.handle, p.display_name, p.avatar_url
from public.spots s
join public.profiles p on p.id = s.created_by;

comment on view public.spot_cards is
  'Spot + author read shape. security_invoker so it runs under the CALLER''s own grants/RLS on spots and profiles, not the view owner''s -- anon/authenticated already have SELECT on both underlying tables.';

grant select on public.spot_cards to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Feed, map, and handle functions.
--    All: language sql, stable, security invoker. Distance uses the standard
--    haversine formula, mean Earth radius 6371000 m -- mirrored in TypeScript
--    by src/lib/geo.ts's haversineMeters, no PostGIS.
-- ----------------------------------------------------------------------------

-- Cerca: every spot, ordered by distance from (lat, lng). Public -- no
-- auth.uid() involved, so it works identically signed in or signed out.
create function public.feed_cerca(
  lat double precision,
  lng double precision,
  page_size integer default 10,
  page_offset integer default 0
)
returns table (
  id uuid, name text, note text, lat double precision, lng double precision, status text,
  confirmations integer, created_at timestamptz, photo_url text, created_by uuid,
  handle citext, display_name text, avatar_url text, distance_m double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    sc.*,
    2 * 6371000 * asin(
      sqrt(
        sin(radians(lat - sc.lat) / 2) ^ 2
        + cos(radians(lat)) * cos(radians(sc.lat)) * sin(radians(lng - sc.lng) / 2) ^ 2
      )
    ) as distance_m
  from public.spot_cards sc
  order by distance_m asc, sc.id asc
  limit page_size offset page_offset
$$;

-- Nuevo: newest first, keyset-paginated on (created_at, id). Public.
create function public.feed_nuevo(
  page_size integer default 10,
  before_created_at timestamptz default null,
  before_id uuid default null
)
returns setof public.spot_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select sc.*
  from public.spot_cards sc
  where before_created_at is null
     or (sc.created_at, sc.id) < (before_created_at, before_id)
  order by sc.created_at desc, sc.id desc
  limit page_size
$$;

-- Siguiendo: same paging as Nuevo, scoped to accounts I follow. Empty
-- follows (or auth.uid() null when signed out) yields an empty "in ()" set,
-- so this returns zero rows rather than erroring.
create function public.feed_siguiendo(
  page_size integer default 10,
  before_created_at timestamptz default null,
  before_id uuid default null
)
returns setof public.spot_cards
language sql
stable
security invoker
set search_path = ''
as $$
  select sc.*
  from public.spot_cards sc
  where sc.created_by in (
          select f.followee_id from public.follows f where f.follower_id = auth.uid()
        )
    and (
          before_created_at is null
          or (sc.created_at, sc.id) < (before_created_at, before_id)
        )
  order by sc.created_at desc, sc.id desc
  limit page_size
$$;

-- Hoy: followees with a spot in the last 24h, one row per person (their
-- latest), newest first, max 20. auth.uid() null -> zero followees -> zero
-- rows.
create function public.hoy_row()
returns table (
  spot_id uuid, id uuid, handle citext, display_name text, avatar_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (s.created_by) s.created_by, s.id as spot_id, s.created_at
    from public.spots s
    join public.follows f on f.followee_id = s.created_by
    where f.follower_id = auth.uid()
      and s.created_at >= now() - interval '24 hours'
    order by s.created_by, s.created_at desc
  )
  select l.spot_id, p.id, p.handle, p.display_name, p.avatar_url
  from latest l
  join public.profiles p on p.id = l.created_by
  order by l.created_at desc
  limit 20
$$;

-- Mi mapa: my own posts, spots I've been to, spots I've saved -- one row per
-- spot, tagged with a single source (mine wins over been, been wins over
-- saved). auth.uid() null -> every branch's equality against auth.uid()
-- fails -> zero rows.
create function public.my_map()
returns table (
  id uuid, name text, note text, lat double precision, lng double precision, status text,
  confirmations integer, created_at timestamptz, photo_url text, created_by uuid,
  handle citext, display_name text, avatar_url text, source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select sc.*, 'mine'::text as source
  from public.spot_cards sc
  where sc.created_by = auth.uid()

  union

  select sc.*, 'been'::text as source
  from public.spot_cards sc
  join public.confirmations c on c.spot_id = sc.id
  where c.confirmer_id = auth.uid()
    and sc.created_by <> auth.uid()

  union

  select sc.*, 'saved'::text as source
  from public.spot_cards sc
  join public.saves sv on sv.spot_id = sc.id
  where sv.user_id = auth.uid()
    and sc.created_by <> auth.uid()
    and not exists (
      select 1 from public.confirmations c2
      where c2.spot_id = sc.id and c2.confirmer_id = auth.uid()
    )
$$;

-- Handle availability check, for the live indicator in the handle-pick modal.
-- Callable by anon: the handle gate can run before a user has finished
-- signing in, and it only ever reads the already-public handle column.
create function public.handle_available(handle text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles p where p.handle = handle_available.handle
  )
$$;

grant execute on function public.feed_cerca(double precision, double precision, integer, integer)
  to anon, authenticated;
grant execute on function public.feed_nuevo(integer, timestamptz, uuid)
  to anon, authenticated;
grant execute on function public.feed_siguiendo(integer, timestamptz, uuid)
  to anon, authenticated;
grant execute on function public.hoy_row()
  to anon, authenticated;
grant execute on function public.my_map()
  to anon, authenticated;
grant execute on function public.handle_available(text)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. Storage: public bucket for avatars, folder-scoped owner writes.
--
--    Before running this file:
--    1. Dashboard > Storage > New bucket: name `avatars`, Public bucket ON,
--       file size limit 2 MB, allowed MIME types image/jpeg, image/png,
--       image/webp. Newer Supabase projects don't grant the SQL editor's
--       role ownership of storage.buckets, so this migration can't create
--       or update the bucket itself -- do it by hand, once, first.
--    2. If the three policy statements below are also refused (error
--       mentions table objects), create them in Dashboard > Storage >
--       Policies on the avatars bucket: INSERT/UPDATE/DELETE for
--       authenticated with the check
--       `(storage.foldername(name))[1] = auth.uid()::text`.
-- ----------------------------------------------------------------------------

-- avatars: any signed-in user may upload into their own folder
-- (<user_id>/<uuid>.<ext>), and only their own -- (storage.foldername(name))[1]
-- is the first path segment, compared to the caller's own uuid as text.
drop policy if exists avatars_insert_own_folder on storage.objects;
create policy avatars_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    public.is_real_user()
    and bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- avatars: replacing your own avatar is an update in place (upsert), scoped
-- the same way as insert above.
drop policy if exists avatars_update_own_folder on storage.objects;
create policy avatars_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    public.is_real_user()
    and bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- avatars: a user may delete only objects in their own folder.
drop policy if exists avatars_delete_own_folder on storage.objects;
create policy avatars_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No SELECT policy: the bucket is public, so /storage/v1/object/public/...
-- reads do not consult RLS, while API listing of someone else's folder stays
-- blocked (same pattern as spot-photos in 0001).

-- ----------------------------------------------------------------------------
-- 9. Make PostgREST pick up the new tables/views/functions/grants.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
