-- ============================================================================
-- Zpots — schema v1: spots / confirmations / reports + spot-photos bucket
-- Paste into Supabase SQL Editor and run once. Safe to re-run.
-- Roles: browser traffic arrives as `anon` (or `authenticated` if someone signs
-- up through Auth). Both are treated identically and minimally below.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1. Threshold: the ONLY place the number lives in SQL.
--    MUST equal CONFIRMATION_THRESHOLD in src/lib/spots.ts.
-- ----------------------------------------------------------------------------
create or replace function public.confirmation_threshold()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$ select 2 $$;

comment on function public.confirmation_threshold() is
  'Distinct confirmations needed to flip a spot to confirmed. Mirror of CONFIRMATION_THRESHOLD in src/lib/spots.ts.';

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.spots (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  note          text not null,
  lat           double precision not null,
  lng           double precision not null,
  nickname      text,
  photo_url     text not null,
  status        text not null default 'unconfirmed',
  confirmations integer not null default 0,
  created_at    timestamptz not null default now(),

  constraint spots_name_len            check (char_length(btrim(name)) between 1 and 80),
  constraint spots_note_len            check (char_length(btrim(note)) between 1 and 280),
  constraint spots_nickname_len        check (nickname is null or char_length(nickname) <= 40),
  constraint spots_lat_range           check (lat between -90 and 90),
  constraint spots_lng_range           check (lng between -180 and 180),
  constraint spots_photo_url_shape     check (
    char_length(photo_url) <= 2048
    and photo_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/spot-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$'
  ),
  constraint spots_status_enum         check (status in ('unconfirmed', 'confirmed')),
  constraint spots_confirmations_nonneg check (confirmations >= 0),
  constraint spots_status_matches_count check (
    (status = 'confirmed') = (confirmations >= public.confirmation_threshold())
  )
);

comment on table public.spots is 'Crowdsourced pins. confirmations/status are derived by trigger from public.confirmations; clients cannot set them.';

create table if not exists public.confirmations (
  spot_id      uuid not null references public.spots (id) on delete cascade,
  confirmer_id text not null,
  created_at   timestamptz not null default now(),
  primary key (spot_id, confirmer_id),
  constraint confirmations_confirmer_id_shape check (
    char_length(confirmer_id) between 8 and 64
    and confirmer_id ~ '^[A-Za-z0-9_-]+$'
  )
);

comment on table public.confirmations is 'One row per (spot, browser-local confirmer id). PK makes a repeat confirmation a 23505 no-op. confirmer_id is spoofable by design (no accounts).';

create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  spot_id    uuid not null references public.spots (id) on delete cascade,
  reason     text not null,
  details    text,
  created_at timestamptz not null default now(),
  -- MUST equal REPORT_REASONS in src/lib/validation.ts
  constraint reports_reason_enum  check (reason in ('spam', 'wrong_info', 'closed')),
  constraint reports_details_len  check (details is null or char_length(details) <= 500)
);

comment on table public.reports is 'Report signals. Never changes spot visibility; moderation is manual in the dashboard.';

create index if not exists spots_created_at_idx   on public.spots   (created_at desc);
create index if not exists reports_spot_id_idx    on public.reports (spot_id, created_at desc);
-- confirmations(spot_id) lookups are served by the PK's leading column.

-- ----------------------------------------------------------------------------
-- 3. Derived-state functions and triggers
-- ----------------------------------------------------------------------------

-- Count of confirmations for one spot.
-- SECURITY DEFINER: callable from policy expressions and triggers even though
-- anon has no SELECT on public.confirmations.
-- VOLATILE on purpose: inside a trigger that waited on a row lock, a STABLE
-- function would reuse the statement's stale snapshot and undercount.
create or replace function public.spot_confirmation_count(p_spot_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  select count(*)::integer into n
    from public.confirmations c
   where c.spot_id = p_spot_id;
  return n;
end;
$$;

-- BEFORE UPDATE on spots: confirmations/status are always recomputed from the
-- source of truth. Whatever a client sent in those two columns is discarded.
-- Not attached to INSERT on purpose: inserts are policed by the INSERT policy
-- WITH CHECK below so a bad starting value fails loudly rather than being
-- silently normalized. Together with column-level UPDATE grants (section 4) this turns
-- any anon UPDATE into a pure "recompute this row" request.
create or replace function public.spots_enforce_confirmation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  n := public.spot_confirmation_count(new.id);
  new.confirmations := n;
  new.status := case
                  when n >= public.confirmation_threshold() then 'confirmed'
                  else 'unconfirmed'
                end;
  return new;
end;
$$;

drop trigger if exists spots_enforce_confirmation_state on public.spots;
create trigger spots_enforce_confirmation_state
  before update on public.spots
  for each row execute function public.spots_enforce_confirmation_state();

-- AFTER INSERT OR DELETE on confirmations: touch the parent spot so the BEFORE
-- trigger above recomputes it. SECURITY DEFINER so it works regardless of the
-- caller's grants on spots. On a cascading spot delete the UPDATE matches zero
-- rows and is a harmless no-op.
create or replace function public.confirmations_touch_spot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.spots
     set confirmations = confirmations  -- value is irrelevant; BEFORE trigger recomputes
   where id = coalesce(new.spot_id, old.spot_id);
  return null;
end;
$$;

drop trigger if exists confirmations_touch_spot on public.confirmations;
create trigger confirmations_touch_spot
  after insert or delete on public.confirmations
  for each row execute function public.confirmations_touch_spot();

-- CHECK constraints and policy expressions run as the invoking role, so the
-- browser roles need EXECUTE on the two helpers they reference. Both are
-- harmless to expose (one returns 2, the other returns a count that is already
-- public on the spots row).
grant execute on function public.confirmation_threshold()          to anon, authenticated;
grant execute on function public.spot_confirmation_count(uuid)     to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Privileges: start from nothing for browser roles, grant exactly what the
--    app needs, at column granularity where it matters.
--    (Supabase default privileges hand new tables ALL to anon/authenticated;
--     the REVOKEs undo that for these three tables.)
-- ----------------------------------------------------------------------------
revoke all on table public.spots         from anon, authenticated;
revoke all on table public.confirmations from anon, authenticated;
revoke all on table public.reports       from anon, authenticated;

grant select on table public.spots to anon, authenticated;
grant insert (id, name, note, lat, lng, nickname, photo_url, status, confirmations)
  on table public.spots to anon, authenticated;
grant update (confirmations, status)
  on table public.spots to anon, authenticated;

grant insert (spot_id, confirmer_id)
  on table public.confirmations to anon, authenticated;

grant insert (spot_id, reason, details)
  on table public.reports to anon, authenticated;

-- No DELETE anywhere. No UPDATE on confirmations/reports. No SELECT on
-- confirmations/reports (write-only from the browser).

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.spots         enable row level security;
alter table public.confirmations enable row level security;
alter table public.reports       enable row level security;

-- spots: everyone reads everything.
drop policy if exists spots_select_all on public.spots;
create policy spots_select_all on public.spots
  for select to anon, authenticated
  using (true);

-- spots: anyone may add a pin, but it must start Unconfirmed with zero
-- confirmations. There is deliberately no BEFORE INSERT normalization, so a
-- client that sends anything else fails loudly with 42501 (this policy) or
-- 23514 (table CHECK) instead of being silently corrected.
drop policy if exists spots_insert_new_unconfirmed on public.spots;
create policy spots_insert_new_unconfirmed on public.spots
  for insert to anon, authenticated
  with check (status = 'unconfirmed' and confirmations = 0);

-- spots: anyone may issue an UPDATE, but column grants restrict it to
-- confirmations/status, the BEFORE trigger overwrites both with the truth,
-- and this WITH CHECK verifies the final row against the truth. A client
-- PATCHing confirmations=999 gets back the real number.
drop policy if exists spots_update_recompute_only on public.spots;
create policy spots_update_recompute_only on public.spots
  for update to anon, authenticated
  using (true)
  with check (
    confirmations = public.spot_confirmation_count(id)
    and status = case
                   when confirmations >= public.confirmation_threshold() then 'confirmed'
                   else 'unconfirmed'
                 end
  );

-- confirmations: insert-only. Duplicate (spot_id, confirmer_id) is rejected by
-- the primary key with SQLSTATE 23505; the repo treats that as "already done".
drop policy if exists confirmations_insert_any on public.confirmations;
create policy confirmations_insert_any on public.confirmations
  for insert to anon, authenticated
  with check (true);

-- reports: insert-only.
drop policy if exists reports_insert_any on public.reports;
create policy reports_insert_any on public.reports
  for insert to anon, authenticated
  with check (true);

-- ----------------------------------------------------------------------------
-- 6. Storage: public bucket for spot photos, uuid-named root objects only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spot-photos',
  'spot-photos',
  true,
  5242880,                                                   -- 5 MiB, real bytes
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists spot_photos_insert_uuid_named_images on storage.objects;
create policy spot_photos_insert_uuid_named_images on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'spot-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$'
  );

-- No SELECT policy: the bucket is public, so /storage/v1/object/public/...
-- reads do not consult RLS, while API listing stays blocked.
-- No UPDATE policy: upload({ upsert: true }) onto an existing path is refused.
-- No DELETE policy: photos cannot be removed from the browser.

-- ----------------------------------------------------------------------------
-- 7. Make PostgREST pick up the new tables/grants immediately.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
