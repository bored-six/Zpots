-- ============================================================================
-- Zpots — schema v2: required login for writes
-- Run AFTER 0001_init.sql. Safe to re-run.
--
-- What changes:
--   * confirmations.confirmer_id: text (browser-random) -> uuid FK auth.users
--     Existing rows are dev-test data with no user to map to; they are deleted.
--   * spots.created_by / reports.reported_by: DB-filled from auth.uid(), never
--     sent by the client. reports gets one-report-per-user-per-spot.
--   * anon loses every INSERT/UPDATE grant and policy (keeps SELECT on spots).
--   * authenticated keeps the same column-level grants, now with policies keyed
--     on auth.uid(), plus SELECT of its OWN confirmations rows.
--   * storage insert policy re-issued TO authenticated only.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1. Helper: a real, non-anonymous signed-in user.
--    Supabase's optional "anonymous sign-ins" mint authenticated-role JWTs with
--    is_anonymous=true; this keeps them out of every write policy even if that
--    toggle is ever enabled by accident.
-- ----------------------------------------------------------------------------
create or replace function public.is_real_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

comment on function public.is_real_user() is
  'True only for a JWT with a sub claim and is_anonymous != true. Used by every write policy.';

grant execute on function public.is_real_user() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. confirmations.confirmer_id: text -> uuid referencing auth.users.
--    Guarded so it runs exactly once (only while the column is still text).
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'confirmations'
       and column_name  = 'confirmer_id'
       and data_type    = 'text'
  ) then
    -- Dev-test rows from the anonymous era. DELETE (not TRUNCATE) so the
    -- AFTER DELETE trigger confirmations_touch_spot recounts every affected
    -- spot back to 0 / 'unconfirmed'. TRUNCATE would skip row triggers and
    -- leave spots.confirmations stale.
    delete from public.confirmations;

    -- The text-shape CHECK calls char_length(); it must go before the type change.
    alter table public.confirmations
      drop constraint if exists confirmations_confirmer_id_shape;

    alter table public.confirmations
      alter column confirmer_id type uuid using confirmer_id::uuid;
  end if;
end
$$;

alter table public.confirmations
  alter column confirmer_id set default auth.uid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'confirmations_confirmer_id_fkey'
       and conrelid = 'public.confirmations'::regclass
  ) then
    alter table public.confirmations
      add constraint confirmations_confirmer_id_fkey
      foreign key (confirmer_id) references auth.users (id) on delete cascade;
  end if;
end
$$;

comment on table public.confirmations is
  'One row per (spot, auth user). PK makes a repeat confirmation a 23505 no-op. confirmer_id is auth.uid(), enforced by policy.';
comment on column public.confirmations.confirmer_id is
  'auth.users.id of the confirmer. Client sends it explicitly; policy requires it to equal auth.uid().';

-- ----------------------------------------------------------------------------
-- 3. Accountability columns. Filled by DEFAULT, never in any INSERT grant, so
--    the browser cannot set them; policies below assert they equal auth.uid().
-- ----------------------------------------------------------------------------
alter table public.spots
  add column if not exists created_by uuid
    default auth.uid()
    references auth.users (id) on delete set null;

alter table public.reports
  add column if not exists reported_by uuid
    default auth.uid()
    references auth.users (id) on delete set null;

comment on column public.spots.created_by is
  'auth.users.id of the account that added the pin. DB default; not client-settable. Publicly readable as a bare uuid.';
comment on column public.reports.reported_by is
  'auth.users.id of the reporter. DB default; not client-settable. Not readable by browser roles.';

-- One report per account per spot. NULLs (legacy rows) do not collide.
create unique index if not exists reports_one_per_user_per_spot
  on public.reports (spot_id, reported_by);

-- ----------------------------------------------------------------------------
-- 4. Privileges: anon reads spots and nothing else. authenticated writes with
--    the same column-level grants as before, plus reads its own confirmations.
-- ----------------------------------------------------------------------------
revoke all on table public.spots         from anon, authenticated;
revoke all on table public.confirmations from anon, authenticated;
revoke all on table public.reports       from anon, authenticated;

grant select on table public.spots to anon, authenticated;

grant insert (id, name, note, lat, lng, nickname, photo_url, status, confirmations)
  on table public.spots to authenticated;
grant update (confirmations, status)
  on table public.spots to authenticated;

grant select on table public.confirmations to authenticated;
grant insert (spot_id, confirmer_id)
  on table public.confirmations to authenticated;

grant insert (spot_id, reason, details)
  on table public.reports to authenticated;

-- No DELETE anywhere. No UPDATE on confirmations/reports. No SELECT on reports.
-- created_by / reported_by are deliberately absent from every INSERT grant.

-- ----------------------------------------------------------------------------
-- 5. Row Level Security (already enabled by 0001; re-asserted for safety).
-- ----------------------------------------------------------------------------
alter table public.spots         enable row level security;
alter table public.confirmations enable row level security;
alter table public.reports       enable row level security;

-- spots: everyone reads everything (unchanged).
drop policy if exists spots_select_all on public.spots;
create policy spots_select_all on public.spots
  for select to anon, authenticated
  using (true);

-- spots: only a real signed-in user may add a pin; it must start Unconfirmed
-- with zero confirmations and be attributed to the caller.
drop policy if exists spots_insert_new_unconfirmed on public.spots;
create policy spots_insert_new_unconfirmed on public.spots
  for insert to authenticated
  with check (
    public.is_real_user()
    and status = 'unconfirmed'
    and confirmations = 0
    and created_by = auth.uid()
  );

-- spots: the recompute-only UPDATE (column grants + BEFORE trigger + this
-- WITH CHECK; see 0001 section 2.2) is now limited to signed-in users.
drop policy if exists spots_update_recompute_only on public.spots;
create policy spots_update_recompute_only on public.spots
  for update to authenticated
  using (public.is_real_user())
  with check (
    confirmations = public.spot_confirmation_count(id)
    and status = case
                   when confirmations >= public.confirmation_threshold() then 'confirmed'
                   else 'unconfirmed'
                 end
  );

-- confirmations: a user may read only their own rows (feeds "you confirmed
-- this spot" in the UI) and may insert only as themself.
drop policy if exists confirmations_insert_any on public.confirmations;
drop policy if exists confirmations_insert_own on public.confirmations;
create policy confirmations_insert_own on public.confirmations
  for insert to authenticated
  with check (public.is_real_user() and confirmer_id = auth.uid());

drop policy if exists confirmations_select_own on public.confirmations;
create policy confirmations_select_own on public.confirmations
  for select to authenticated
  using (confirmer_id = auth.uid());

-- reports: insert-only, attributed to the caller.
drop policy if exists reports_insert_any on public.reports;
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (public.is_real_user() and reported_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. Storage: uploads now require a real signed-in user. Bucket settings and
--    the uuid-name rule are unchanged from 0001.
-- ----------------------------------------------------------------------------
drop policy if exists spot_photos_insert_uuid_named_images on storage.objects;
create policy spot_photos_insert_uuid_named_images on storage.objects
  for insert to authenticated
  with check (
    public.is_real_user()
    and bucket_id = 'spot-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$'
  );

-- ----------------------------------------------------------------------------
-- 7. Make PostgREST pick up the new grants/columns immediately.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- OPTIONAL, run separately if wanted: remove the leftover anonymous-era test
-- spot noted in learnings.md. Cascades to its reports. Its photo object in the
-- bucket must be deleted by hand in Dashboard -> Storage.
-- ----------------------------------------------------------------------------
-- delete from public.spots where name = 'zzz-integration-test-delete-me';
