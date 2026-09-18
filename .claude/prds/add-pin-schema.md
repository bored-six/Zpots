# PRD: Add-pin backend — Supabase schema, RLS, storage, and repo-layer contract

**Ticket:** None (ad-hoc request, 2026-09-18)
**Status:** Planning
**Created:** 2026-09-18
**Last Updated:** 2026-09-18
**Author role:** Planner (spec only — no application code, no DB execution, no commit)

---

## Goal

A human pastes one SQL script into the Supabase SQL Editor, and afterwards the already-committed tests in `src/__tests__/{validation,supabase,local-identity,spots-repo}.test.ts` can be made green by a builder implementing `src/lib/{supabase,spots-repo,local-identity}.ts` against that schema **without guessing a single table, column, bucket, or policy name**, while a malicious holder of the public anon key cannot delete anything, edit anyone's spot, or set a confirmation count.

---

## Assumptions (stated so nobody has to guess)

| # | Assumption | Basis |
|---|---|---|
| A1 | Table names: `public.spots`, `public.confirmations`, `public.reports`. Bucket: `spot-photos`. | `spots` + column `id` are pinned by `spots-repo.test.ts` (fake DB looks up `db.spots` and `r.id`). The others are free choices. |
| A2 | Postgres columns are `snake_case` (`photo_url`, `created_at`, `spot_id`, `confirmer_id`); the repo maps rows to the camelCase `Spot` type with a `toSpot()` mapper. | Postgres/Supabase convention. No test asserts on `createdAt` coming back, so the mapping is free. Rejected alternative: quoted camelCase columns to skip the mapper — unconventional and every future SQL touch needs quoting. |
| A3 | Spot `id` is a **client-generated UUID v4** (`crypto.randomUUID()`), not a DB default. | Required by the `createSpot` test shape — see Flag F2. The DB still validates it is a UUID via the column type. |
| A4 | Photo object path is `<spot-uuid>.<ext>` at the bucket root, `ext` derived from MIME (`image/jpeg`→`jpg`, `image/png`→`png`, `image/webp`→`webp`, `image/gif`→`gif`), never from the user's filename. | Lets storage policy and `photo_url` CHECK pin the shape with one regex; avoids filename injection. |
| A5 | The `authenticated` Postgres role is treated identically to `anon` in every policy and grant. | Supabase Auth email signups are on by default; anyone with the public anon key can mint an `authenticated` JWT. Policies must not silently widen for it. |
| A6 | `reports.details` is capped at 500 characters in the DB. | No client constant exists yet; 500 keeps rows small. See Flag F8. |
| A7 | Local confirmer id is stored under localStorage key `zpots:confirmer-id` as a UUID v4 string. | Test only requires "non-empty, persisted, stable across reload, differs across storages". |
| A8 | The Supabase project URL is a standard `https://<ref>.supabase.co` host. | Verified from `.env.local` by pattern match only (value not read into any doc). The `photo_url` CHECK regex depends on this — see Edge Cases. |
| A9 | `NEXT_PUBLIC_*` env vars are the only credentials the app ever sees. | Hard constraint from the task. Nothing in this spec or the SQL needs anything else. |

---

## Files to touch (later builder step — listed here so the contract is concrete)

| Path | New/Existing | What |
|---|---|---|
| `.claude/prds/add-pin-schema.md` | New (this file) | The spec + the SQL the human runs. **Only file this Planner writes.** |
| `supabase/migrations/0001_init.sql` | New (builder, later) | Verbatim copy of §4 SQL so the schema is version-controlled alongside the code. Not executed by any agent. |
| `package.json` | Existing | Add `@supabase/supabase-js` `^2` to `dependencies`. **It is not installed today** (`node_modules/@supabase` does not exist) even though `supabase.test.ts` implies it. |
| `src/lib/supabase.ts` | New | `getSupabaseClient()` singleton (§5.0). |
| `src/lib/spots-repo.ts` | New | `fetchSpots`, `createSpot`, `confirmSpot`, `reportSpot` (§5.1–5.4). |
| `src/lib/local-identity.ts` | New | `getLocalConfirmerId()` (§5.5). |
| `src/lib/validation.ts` | New (separate spec; only its DB-facing constants are constrained here) | `MAX_NAME_LENGTH=80`, `MAX_NOTE_LENGTH=280`, `MAX_NICKNAME_LENGTH=40`, `REPORT_REASONS=['spam','wrong_info','closed']`, photo `< 5*1024*1024` bytes, image MIME. The DB mirrors these exactly (§1). |

Not touched: `src/lib/spots.ts` (`Spot`, `CONFIRMATION_THRESHOLD`, `isConfirmed` stay as they are), `src/lib/map-config.ts`, any test file, `.env.local`.

---

## 1. Postgres schema

### 1.1 `public.spots`

| Column | Type | Null | Default | Constraint | Maps to `Spot` |
|---|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` (unused by app; client supplies) | PK | `id` |
| `name` | `text` | no | — | `char_length(btrim(name)) BETWEEN 1 AND 80` | `name` |
| `note` | `text` | no | — | `char_length(btrim(note)) BETWEEN 1 AND 280` | `note` |
| `lat` | `double precision` | no | — | `BETWEEN -90 AND 90` | `lat` |
| `lng` | `double precision` | no | — | `BETWEEN -180 AND 180` | `lng` |
| `nickname` | `text` | yes | `NULL` | `NULL OR char_length <= 40` | `nickname` (`null` → `undefined`) |
| `photo_url` | `text` | no | — | `<= 2048` chars AND matches the public-URL regex for bucket `spot-photos` (§1.5) | *(no field on `Spot` today — Flag F3)* |
| `status` | `text` | no | `'unconfirmed'` | `IN ('unconfirmed','confirmed')` | `status` |
| `confirmations` | `integer` | no | `0` | `>= 0` | `confirmations` |
| `created_at` | `timestamptz` | no | `now()` | — | `createdAt` (ISO string) |
| *(table)* | | | | `(status = 'confirmed') = (confirmations >= public.confirmation_threshold())` | invariant guard |

Index: `spots_created_at_idx ON (created_at DESC)`.

### 1.2 `public.confirmations` — who confirmed what

| Column | Type | Null | Default | Constraint |
|---|---|---|---|---|
| `spot_id` | `uuid` | no | — | FK → `spots(id) ON DELETE CASCADE` |
| `confirmer_id` | `text` | no | — | `char_length BETWEEN 8 AND 64 AND ~ '^[A-Za-z0-9_-]+$'` |
| `created_at` | `timestamptz` | no | `now()` | — |
| *(table)* | | | | **`PRIMARY KEY (spot_id, confirmer_id)`** — this is the idempotency guarantee. A second insert of the same pair fails with SQLSTATE `23505` at the DB level, regardless of what the client does. |

No surrogate `id` column: the pair *is* the identity, and the client must send **exactly** these two columns (see Flag F5 for why nothing else may be in the insert payload). `(spot_id)` lookups are served by the PK's leading column, so no extra index.

### 1.3 `public.reports` — non-destructive signal

| Column | Type | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `spot_id` | `uuid` | no | — | FK → `spots(id) ON DELETE CASCADE` |
| `reason` | `text` | no | — | `IN ('spam','wrong_info','closed')` — must equal `REPORT_REASONS` |
| `details` | `text` | yes | `NULL` | `NULL OR char_length <= 500` |
| `created_at` | `timestamptz` | no | `now()` | — |

Index: `reports_spot_id_idx ON (spot_id, created_at DESC)`. Reports never touch `spots` — reported spots stay visible per `product.md`. Anon cannot read reports; the human reads them in the dashboard (moderation is out of scope).

### 1.4 Threshold lives in one SQL function

`public.confirmation_threshold() RETURNS integer IMMUTABLE` → `2`. It is the **only** place the number appears in SQL (used by the table CHECK, the trigger, and the UPDATE policy). It must equal `CONFIRMATION_THRESHOLD` in `src/lib/spots.ts`; this duplication is unavoidable because the DB must derive `status` without trusting the client (Flag F7).

### 1.5 `photo_url` regex

```
^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/spot-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$
```

This is exactly what `storage.from('spot-photos').getPublicUrl('<uuid>.<ext>').data.publicUrl` produces in supabase-js v2. It stops a client from storing an arbitrary external URL (hotlink/tracking pixel) in a public row. Limitation: a client could still point at a *different* Supabase project's bucket that happens to be named `spot-photos` — accepted; the payoff of pinning the project ref would require a placeholder in the paste-once script.

---

## 2. Row Level Security and privileges

### 2.1 The decision: denormalized `spots.confirmations` maintained by trigger

**Recommendation: keep `confirmations` as a real column on `spots`, maintained by a Postgres trigger from the `confirmations` table. Do not compute it live per read.**

Why:
- `Spot.confirmations: number` and the `fetchSpots` test both require the count to come back as a plain scalar on the row from a bare `select()`. A live `count()` would need either a view (with `security_invoker` so RLS still applies) or a PostgREST embedded count (`select('*, confirmations(count)')`, which returns `confirmations: [{count: n}]` — a different shape the mapper would have to special-case). Both add surface for no MVP benefit.
- The map reads every spot on every load; one table scan with no aggregate is the cheapest possible query.
- Correctness does not depend on the client: the counter is written only by SECURITY DEFINER trigger code that counts rows in `confirmations`. The client never supplies a number the DB believes.

Tradeoff you are accepting: two representations of one fact (rows vs. counter) kept in sync by a trigger. It can drift only if someone bypasses the trigger — e.g. `ALTER TABLE ... DISABLE TRIGGER` in the dashboard. The consistency CHECK `(status='confirmed') = (confirmations >= threshold)` catches the *status* half of any drift loudly; the count half is self-healing on the next confirmation of that spot. At MVP scale a live `count()` would also be perfectly fast; the deciding factor is fit with the existing `Spot`/test contract and zero mapping complexity, not performance.

### 2.2 How a client-issued UPDATE becomes harmless (the core of the security story)

The committed `confirmSpot` test forces the repo to call `from('spots').update({confirmations, status}).eq('id', ...)` (its fake client has no `rpc()` — Flag F1). So anon **must** be allowed to issue an UPDATE on `spots`. Three independent layers make that UPDATE unable to change anything the client controls:

1. **Column-level privilege.** `REVOKE ALL ON spots FROM anon, authenticated; GRANT UPDATE (confirmations, status) ...`. An UPDATE that names any other column (`name`, `photo_url`, `lat`, ...) is rejected by Postgres with `42501` before RLS even runs. This is the primitive Postgres provides for exactly this.
2. **`BEFORE UPDATE` trigger `spots_enforce_confirmation_state`** (SECURITY DEFINER) overwrites `NEW.confirmations` with `count(*)` from `confirmations` and `NEW.status` from the threshold. Whatever the client sent is discarded. Every UPDATE — the client's optimistic one and the trigger-driven one — ends up with the true values. It is deliberately **not** attached to INSERT: a new row is guarded by the INSERT policy `WITH CHECK (status = 'unconfirmed' AND confirmations = 0)` plus the table CHECK, so a client that sends a wrong starting value fails loudly with `42501` instead of being silently corrected.
3. **UPDATE policy `WITH CHECK`** re-asserts `confirmations = public.spot_confirmation_count(id)` and the matching status on the final row. Redundant with (2) while the trigger exists; it means dropping the trigger fails closed (`42501` on wrong values) instead of open.

Net effect: an anon `PATCH /spots?id=eq.X {"confirmations": 999, "status": "confirmed"}` returns the row with its *real* count and status. There is no request shape that moves the number.

The counter is actually bumped by `AFTER INSERT OR DELETE` trigger `confirmations_touch_spot` on `confirmations`, which issues `UPDATE spots SET confirmations = confirmations WHERE id = ...` as SECURITY DEFINER; the BEFORE trigger then recomputes. So the client's own UPDATE is *redundant* in production — it is kept because the tests require it and because it doubles as a self-healing recompute if a client crashes between insert and update.

Concurrency: `BEFORE ROW UPDATE` triggers lock the target tuple before firing, and every confirmation insert is transactionally tied to an UPDATE of its spot (via the AFTER trigger). Two simultaneous confirmers therefore serialize on the spot row; the count function is `VOLATILE` so the second one sees a fresh snapshot after waiting for the lock. No lost-update is possible.

### 2.3 Privilege + policy matrix (roles `anon` and `authenticated`, identical)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `spots` | all rows (`USING true`) | columns `id,name,note,lat,lng,nickname,photo_url,status,confirmations` only; policy `WITH CHECK (status='unconfirmed' AND confirmations=0)` | columns `confirmations,status` only; policy `USING true WITH CHECK (<recomputed values>)` | **no grant, no policy** |
| `confirmations` | **no grant, no policy** (confirmer ids are not readable; `confirmedByMe` is answered locally — Flag F9) | columns `spot_id,confirmer_id` only; policy `WITH CHECK true`; PK rejects duplicates with `23505` | no | no |
| `reports` | no | columns `spot_id,reason,details` only; policy `WITH CHECK true` | no | no |
| `storage.objects` | no policy (public bucket reads bypass RLS; API listing stays blocked) | `bucket_id='spot-photos' AND name ~ '<uuid>.(jpg\|png\|webp\|gif)'` | no (no overwrite via `upsert:true`) | no |

Functions callable by anon: `confirmation_threshold()` and `spot_confirmation_count(uuid)` — both must be executable by the invoking role because CHECK constraints and policy expressions run as the invoker. Both are harmless (return `2` / a count that is already public on the row). Trigger functions cannot be invoked via RPC ("trigger functions can only be called as triggers"), so their default grants are left alone.

The service role is never referenced, granted, or narrowed by this script. It keeps Supabase defaults and is not for any agent or app-side use.

---

## 3. Storage bucket

| Setting | Value | Why |
|---|---|---|
| Name / id | `spot-photos` | Matches `photo_url` regex and storage policy. |
| Public | **yes** | The repo test calls `getPublicUrl` (a pure URL builder) and stores the result in the row; a private bucket would need signed URLs the fake client does not model, and pins are public content anyway. |
| `file_size_limit` | `5242880` (5 MiB) | Backstop for the client's strict `< 5 MiB` rule. Files larger than this are rejected server-side by actual byte count. |
| `allowed_mime_types` | `image/jpeg, image/png, image/webp, image/gif` | See below. |
| INSERT policy | `bucket_id = 'spot-photos' AND name ~ '^<uuid-v4-shape>\.(jpg\|png\|webp\|gif)$'` | Only uuid-named root objects; no folders, no arbitrary names, no path games. |
| SELECT / UPDATE / DELETE policies | none | No listing, no overwrite, no deletion from the browser. Orphans are the human's to clean. |

**Is client-side enforcement sufficient? No — bucket-level enforcement is warranted.** The anon key is public by design. Without bucket limits anyone can script uploads of 50 MB blobs until the free-tier quota is gone, or upload `text/html` to a public bucket and serve phishing pages from your storage origin. Bucket-level `file_size_limit` checks real bytes; `allowed_mime_types` checks the declared `Content-Type` (Supabase does not content-sniff, and serves with `nosniff`, so a lying `image/png` HTML file is not rendered as HTML). That is the right amount of enforcement for an MVP.

HEIC/HEIF is intentionally excluded: most Android browsers cannot render it in `<img>`, and iOS Safari transcodes to JPEG for `<input accept="image/*">` by default. An iPhone set to "Keep originals" gets an upload error the UI should surface. Recommend `validation.ts` use the same four-type allow-list so the failure happens before upload (compatible with `validation.test.ts`, which only asserts jpeg/png accepted and text/plain rejected).

---

## 4. The SQL — paste this whole block into Supabase Dashboard → SQL Editor → Run

Idempotent (safe to re-run). Runs as the dashboard's `postgres` role, which owns everything it creates; ownership is what lets the `SECURITY DEFINER` functions bypass RLS. No secrets, no keys, no passwords are involved — the SQL Editor session is already authenticated by the human's dashboard login.

```sql
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
```

### 4.1 Optional verification (run separately, after the script; nothing is persisted)

```sql
-- Policies present?
select schemaname, tablename, policyname, cmd
  from pg_policies
 where (schemaname = 'public' and tablename in ('spots','confirmations','reports'))
    or (schemaname = 'storage' and policyname = 'spot_photos_insert_uuid_named_images')
 order by 1,2,3;
-- expect 5 public rows + 1 storage row

-- Bucket present with limits?
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'spot-photos';

-- Simulate the browser role. Everything below rolls back.
begin;
set local role anon;
select count(*) from public.spots;                       -- OK (0)
-- Each of the next lines should FAIL with "permission denied" (42501):
-- select * from public.confirmations;
-- delete from public.spots;
-- update public.spots set name = 'x';
rollback;
```

---

## 5. Repo-layer contract (what the builder implements; exact calls, no guessing)

All functions live in `src/lib/spots-repo.ts` except where noted, obtain the client via `getSupabaseClient()` from `@/lib/supabase` **at call time** (the test mocks that module), and reject with an `Error` whenever a Supabase result has non-null `error`. Use `Error(message, { cause: error })` — no custom error hierarchy.

### 5.0 `getSupabaseClient(): SupabaseClient` — `src/lib/supabase.ts`

- Read `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` **inside the function, as literal property accesses** (Next.js inlines `NEXT_PUBLIC_*` into the browser bundle only for literal `process.env.X` references; dynamic `process.env[key]` breaks in the browser). Reading at call time is also what lets `supabase.test.ts` mutate env between `vi.resetModules()` calls.
- Throw if either is `undefined` **or empty string** (test: empty URL must throw).
- Module-level singleton: second call returns the same instance.
- `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })` — there is no auth; this stops the GoTrue client from touching `localStorage` and emitting lock warnings.

### 5.1 Row shape and mapper

```ts
type SpotRow = {
  id: string; name: string; note: string; lat: number; lng: number;
  nickname: string | null; photo_url: string;
  status: SpotStatus; confirmations: number; created_at: string;
};
function toSpot(row: SpotRow): Spot   // nickname null -> omitted/undefined; created_at -> createdAt
```

`toSpot` maps `created_at → createdAt` only. Do **not** add a `row.createdAt` fallback to satisfy mocks; no test asserts on `createdAt`. See Flag F3 for `photo_url → photoUrl`.

### 5.2 `fetchSpots(): Promise<Spot[]>`

| Step | Call | Notes |
|---|---|---|
| 1 | `client.from('spots').select('*')` and `await` it directly | **No `.order()`, `.limit()`, `.range()` chained** — the test's `select` mock returns a bare Promise, so any chained method is `undefined`. Sort client-side (`createdAt` desc) if the UI needs an order. |
| 2 | `if (error) throw` | Test: error must reject, not resolve `[]`. |
| 3 | `return (data ?? []).map(toSpot)` | Empty table → `[]`. |

Known limit: PostgREST caps unbounded selects at 1000 rows (Supabase default `max-rows`). Fine for MVP; flag in learnings when it matters.

### 5.3 `createSpot(input: NewSpotInput): Promise<Spot>`

Preconditions before any network call: run `validateNewSpot(input)`; if invalid, throw. This covers the "null photoFile must reject without touching storage" test and is defense in depth beyond the form.

| Step | Call | Exact args |
|---|---|---|
| 1 | Generate `id = crypto.randomUUID()` | Client-generated (A3). |
| 2 | `ext = extensionForMime(photoFile.type)` | `image/jpeg→jpg`, `image/png→png`, `image/webp→webp`, `image/gif→gif`; anything else → throw before upload (bucket would reject anyway). |
| 3 | `objectPath = \`${id}.${ext}\`` | Root of bucket, no folder (matches storage policy + `photo_url` CHECK). |
| 4 | `const { error } = await client.storage.from('spot-photos').upload(objectPath, photoFile, { contentType: photoFile.type, cacheControl: '31536000', upsert: false })` | If `error` → throw. **Insert must not run.** |
| 5 | `const { data: { publicUrl } } = client.storage.from('spot-photos').getPublicUrl(objectPath)` | Synchronous; use the same `objectPath` you uploaded, not `data.path` from step 4. |
| 6 | Build the insert payload with **exactly** these keys (column grant rejects anything else with `42501`): `{ id, name: name.trim(), note: note.trim(), lat, lng, nickname: nickname?.trim() || null, photo_url: publicUrl, status: 'unconfirmed', confirmations: 0 }` | Tests assert `status`/`confirmations` are present in the payload and that `publicUrl` appears among its values. Never send `created_at`. |
| 7 | `const { data, error } = await client.from('spots').insert(payload)` — awaited **directly, no `.select().single()` chain** | See Flag F2 for why. With real supabase-js v2 this returns `data: null` (`Prefer: return=minimal`). |
| 8 | `if (error) throw` | |
| 9 | `return toSpot(data ?? { ...payload, created_at: new Date().toISOString() })` | Production always takes the fallback; the client-side `created_at` is a display approximation until the next `fetchSpots`. The `data ??` branch exists only because the committed test mock echoes a row from a bare `insert()` — Flag F2. |

Upload succeeded but insert failed → the object is an orphan (anon cannot delete). Accept for MVP; a retry generates a fresh uuid and a fresh object. Note it in learnings.

### 5.4 `confirmSpot(spotId: string, confirmerId: string): Promise<Spot>`

Order matters — read the spot **before** inserting the confirmation, so the client's optimistic `+1` is arithmetically right in both the test fake (no trigger) and production (trigger already bumped the row by the time an after-insert read would happen).

| Step | Call | Notes |
|---|---|---|
| 1 | `const { data: current, error } = await client.from('spots').select('*').eq('id', spotId).single()` | Missing spot → real client `PGRST116` / fake `not found` → throw. Happens before any write. |
| 2 | `const { error: insErr } = await client.from('confirmations').insert({ spot_id: spotId, confirmer_id: confirmerId })` — awaited directly, **no `.select()`** (anon has no SELECT on this table) | Payload must be **exactly these two keys** — Flag F5. |
| 3 | `inserted = insErr == null`; if `insErr && insErr.code !== '23505'` → throw | PostgREST surfaces the PK violation as `code: '23505'` (HTTP 409); the fake uses the same code. |
| 4 | If `!inserted` (duplicate): `return toSpot(current)` — no write | Idempotent: a second call from the same browser is a read. |
| 5 | `next = current.confirmations + 1`; `status = isConfirmed({ ...current, confirmations: next }) ? 'confirmed' : 'unconfirmed'` | Use `isConfirmed` from `@/lib/spots`; never inline `2`. |
| 6 | `const { data: updated, error: updErr } = await client.from('spots').update({ confirmations: next, status }).eq('id', spotId).select().single()` | Payload must be exactly these two keys (column grant). In production the BEFORE trigger + WITH CHECK replace/verify the values; the returned row is authoritative. |
| 7 | `if (updErr) throw; return toSpot(updated)` | |

Under the test fake: step 1 reads via `select→eq→single`, step 2 hits the two-shared-values duplicate detector, step 6 applies the patch via `update→eq→select→single`. All four `confirmSpot` tests pass with this sequence.

`confirmedByMe` for `ConfirmButton` is **not** answered by this function or the schema; keep a local set of confirmed spot ids in `localStorage` next to the confirmer id (Flag F9).

### 5.5 `reportSpot(spotId: string, reason: string, details?: string): Promise<void>`

| Step | Call | Notes |
|---|---|---|
| 1 | `if (!isValidReportReason(reason)) throw` | Before `client.from(...)` is ever called (test asserts `from` not invoked). Exact-match only: `'Spam'`, `' spam'` are invalid. |
| 2 | Normalize `details`: `trim()`; empty/undefined → `null`; if `> 500` chars, throw client-side (mirrors DB CHECK). | |
| 3 | `const { error } = await client.from('reports').insert({ spot_id: spotId, reason, details })` — awaited directly, no `.select()` | Exactly these three keys. Test asserts the details string appears among the payload's values when provided. |
| 4 | `if (error) throw` | Resolve `void`. |

### 5.6 `getLocalConfirmerId(): string` — `src/lib/local-identity.ts`

- Access the **bare global `localStorage`** (i.e. `globalThis.localStorage`), never `window.localStorage`. The test stubs the global; in Vitest's jsdom environment `window.localStorage` is jsdom's real store and would make tests 1 and 4 fail.
- Key: `zpots:confirmer-id`.
- Read; if the stored value is missing, empty, longer than 64 chars, or fails `^[A-Za-z0-9_-]+$` (matches the DB CHECK, so a hand-edited value cannot cause a `23514` on confirm) → generate, `setItem`, return.
- Generation: `crypto.randomUUID()` when available (jsdom 29 in this repo and all browsers on HTTPS/localhost have it); fallback to 16 bytes from `crypto.getRandomValues` rendered as hex. `randomUUID` is **undefined on insecure origins** (e.g. testing on `http://192.168.x.x` from a phone) — the fallback is not optional.
- Module-level cache after first successful read/write is allowed (test 2) but **must not** be the only store (test 1 checks something was persisted; test 3 checks a fresh module instance re-reads the same value).
- Wrap `getItem`/`setItem` in `try/catch`. If `localStorage` is undefined (SSR) or throws (`SecurityError` in sandboxed iframes, quota in private mode): fall back to an in-memory id for the session and do not persist. Document that this browser is then "a new person" each reload — consistent with the accepted spoofability tradeoff.

### 5.7 Constants that must stay in sync (three places, by necessity)

| Fact | TS | SQL |
|---|---|---|
| Confirmation threshold | `CONFIRMATION_THRESHOLD` (`spots.ts`) | `public.confirmation_threshold()` |
| Report reasons | `REPORT_REASONS` (`validation.ts`) | `reports_reason_enum` CHECK |
| Name/note/nickname max | `MAX_*_LENGTH` (`validation.ts`) | `spots_*_len` CHECKs |
| Photo size | `< 5 * 1024 * 1024` (`validation.ts`) | bucket `file_size_limit = 5242880` |
| Photo MIME | image allow-list (`validation.ts`) | bucket `allowed_mime_types` + path regex |
| Details max | *(none yet — add `MAX_REPORT_DETAILS_LENGTH = 500`)* | `reports_details_len` |

Add a comment at each TS constant pointing at `supabase/migrations/0001_init.sql`.

---

## 6. Flags — things the tests assume that the schema cannot satisfy cleanly

**F1 — No `rpc()` in the `confirmSpot` fake forces a client-driven UPDATE on `spots`.**
The cleanest production design is a single `confirm_spot(spot_id, confirmer_id)` SECURITY DEFINER RPC with **no** UPDATE grant on `spots` at all. The committed fake client exposes only `from/select/eq/insert/update/single/then`, so `client.rpc(...)` would throw `TypeError` in tests. This spec therefore makes the client UPDATE *safe* (column grants + trigger + WITH CHECK, §2.2) instead of impossible. Consequence: the repo computes `confirmations`/`status` optimistically and production discards them. This works and is secure, but it is duplicated logic driven by a test constraint. **Recommendation:** in a later ticket, add `rpc` to the fake, switch `confirmSpot` to the RPC, and revoke UPDATE on `spots` entirely. Do not do it in this pass.

**F2 — The `createSpot` mock returns a representation from a bare `insert()`.**
Real supabase-js v2 sends `Prefer: return=minimal` unless `.select()` is chained, so `await from('spots').insert(row)` yields `data: null`. The mock's `insert()` returns a plain `Promise` (no `.select`), so chaining is impossible in tests. Resolution: client-generated `id` (so the repo can build the created `Spot` without a server echo) plus `toSpot(data ?? localCopy)` (§5.3 step 9). The `data ??` branch is dead in production; it exists for the mock. **Recommendation:** later, change the mock to `insert → { select → { single } }` and drop the fallback. Not in this pass (test files are frozen).

**F3 — `Spot` has no photo field.**
The test requires the public URL to be stored in the row, and the brief says a pin has a photo — but `Spot` (`spots.ts`) cannot carry it, so the UI cannot render it. The schema stores `photo_url`. **Recommendation:** additive change `photoUrl?: string` on `Spot` in the wiring step (optional field; breaks no existing test; not a redefinition). `toSpot` then maps `photo_url → photoUrl`. Orchestrator decision.

**F4 — `SEED_SPOTS` (`fort-pilar`) cannot exist in this database.**
Its id is not a UUID and it has no photo (`photo_url NOT NULL`). If the map keeps rendering `SEED_SPOTS` alongside `fetchSpots()` results, tapping Confirm on Fort Pilar sends `id=eq.fort-pilar` → Postgres `22P02 invalid input syntax for type uuid` → rejected. **Recommendation:** once `fetchSpots` is wired, the map renders DB rows only; keep `SEED_SPOTS` exported so `spots.test.ts` stays green; the human can add Fort Pilar through the UI with a real photo. The SQL deliberately does **not** seed it.

**F5 — The "≥2 shared scalar values" duplicate rule shapes the confirmations insert payload.**
The fake flags an insert as a duplicate if any existing row in the same table shares two or more scalar values with it, *regardless of column names*. Implications, all satisfied by this schema:
- The insert must contain **exactly** `{ spot_id, confirmer_id }`. Any additional constant-valued key (`source: 'web'`, a status, a boolean) would be shared by two *different* confirmers of the same spot and falsely trip the detector — breaking the "two distinct confirmers → 2" test. Hence: no surrogate id or timestamp from the client; DB defaults own `created_at`. The column-level grant (`insert (spot_id, confirmer_id)`) enforces the same thing in production.
- Two different confirmers share only `spot_id` (1 value) → allowed. Same confirmer twice shares both (2 values) → `23505`. Matches a composite PK exactly.
- Theoretical fake-only false positive: a `confirmer_id` string equal to some `spot_id` string. Cannot happen with UUID spot ids vs. separately generated confirmer ids in production, and the tests use distinct literals.
Verdict: **compatible; no schema change needed.**

**F6 — `fetchSpots` cannot order server-side.**
The mock's `select()` returns a bare Promise, so `.order('created_at')` is a `TypeError` in tests. Sort client-side or not at all. The `created_at` index is still useful for the dashboard and future paging.

**F7 — The threshold and `REPORT_REASONS` are necessarily duplicated in SQL.**
`product.md` says the threshold lives only in `isConfirmed`. The DB cannot import TypeScript and must not trust the client, so `public.confirmation_threshold()` mirrors it (single SQL site). Changing the threshold later = edit both + run `update public.spots set confirmations = confirmations;` to recompute every row through the trigger. Same for reasons (CHECK constraint, chosen over a Postgres enum because `ALTER TABLE ... DROP/ADD CONSTRAINT` is simpler than enum surgery).

**F8 — No client cap exists for report `details`.**
`validation.test.ts` defines no `MAX_REPORT_DETAILS_LENGTH`. DB caps at 500. The repo should mirror it (§5.5 step 2) so users get an inline error rather than a `23514`. Adding the constant to `validation.ts` breaks no test.

**F9 — `ConfirmButton` expects `spot.confirmedByMe`, which nothing in the schema serves.**
Serving it from the DB would require anon SELECT on `confirmations` (exposes every confirmer id publicly) and a filter the client controls anyway. **Recommendation:** store confirmed spot ids in `localStorage` (`zpots:confirmed-spots`, JSON array) alongside the confirmer id, written after `confirmSpot` resolves, read when building props for `ConfirmButton`. If storage is cleared, the confirmer id is gone too, so the user really is "someone new" — coherent with the identity model. Out of scope for the schema; belongs to the wiring step.

**F10 — `@supabase/supabase-js` is not installed.** `package.json` lacks it; `supabase.test.ts` cannot pass until it is added.

**F11 — Column-level grants make payload shape a hard contract.** Any extra key in an insert/update payload → `42501 permission denied for table` in production, while the mocks accept anything. The builder must send exactly the keys listed in §5. Reviewer should diff payloads against the GRANT lines.

---

## 7. Edge cases the builder and reviewer must account for

**Data / schema**
- Name/note of only whitespace or NBSP: DB `btrim` only strips ASCII space, but the client trims with `String#trim()` (which handles NBSP) and rejects empties first; DB check is the backstop. Store the trimmed strings.
- JS `.length` counts UTF-16 units, Postgres `char_length` counts code points; the client limit is always ≥ as strict, so the DB never rejects what the client accepted.
- `lat`/`lng` `NaN` serializes to `null` → NOT NULL violation → rejected even if validation were bypassed.
- Two people confirm the same spot in the same instant: row lock on `spots` serializes them; VOLATILE count sees both. Final count 2, status `confirmed`.
- Confirmer taps twice quickly: second insert → `23505` → resolved with the current row, no write.
- Spot deleted (by the human) between fetch and confirm: `.single()` fails in step 1 → rejected before any insert; FK would also reject.
- Human deletes a confirmation row in the dashboard: `AFTER DELETE` trigger recounts and may flip status back to `unconfirmed`.
- Human deletes a spot: cascades to confirmations and reports; the cascade's touch-UPDATE matches 0 rows, no error. The photo object remains (manual cleanup).
- Threshold changed later: see F7 — rows do not recompute until touched.
- `photo_url` CHECK assumes `*.supabase.co`; a future custom storage domain requires editing `spots_photo_url_shape`.

**Storage**
- Upload succeeds, insert fails → orphan object; anon cannot delete; retry uses a new uuid.
- Client MIME lies (`text/html` declared as `image/png`): bucket accepts, serves as `image/png` with `nosniff`; not rendered as HTML. Acceptable.
- File exactly 5 MiB: client rejects (strict `<`); bucket would accept (`<=`). Client is the tighter gate; bucket is the backstop against bypass.
- Upload of a path that already exists (uuid collision, effectively impossible): `409` because there is no UPDATE policy and `upsert: false`.
- HEIC from an iPhone set to "Keep originals": bucket rejects → `createSpot` rejects before insert → UI must surface "unsupported image type".

**Auth / roles**
- Someone signs up via Auth with the public key and gets an `authenticated` JWT: every policy/grant is identical, nothing widens. Optional hardening (dashboard, not SQL, out of scope): disable email signups.
- The SQL Editor runs as the owner and **bypasses RLS**; testing policies from the editor requires `set local role anon` (§4.1) or the real app.

**Client environment**
- `crypto.randomUUID` is undefined on insecure origins → fallback via `getRandomValues` (§5.6). Applies to both confirmer id and spot id generation — reuse one helper.
- `localStorage` throws or is missing (SSR, sandboxed iframe, some private modes) → in-memory id, no persistence, no crash.
- Offline: every repo function rejects with the fetch error; nothing partially applied except the storage/insert orphan case above.
- PostgREST 1000-row default cap on `fetchSpots`.

---

## 8. Out of scope (do not touch in this feature)

- Any moderation UI, report review, auto-hiding at N reports, or deleting anything from the browser.
- Accounts, `auth.users`, Supabase Auth configuration (disabling signups is a dashboard toggle the human may flip; not part of this work).
- Realtime subscriptions; "new pins appear immediately" is satisfied by optimistically appending the `Spot` returned from `createSpot` and by refetch on load.
- Pagination, viewport-bounded queries, PostGIS, categories, search, filters.
- Rate limiting / CAPTCHA / abuse throttling.
- Image transforms, thumbnails, EXIF stripping, orphan cleanup jobs.
- Editing or deleting one's own spot.
- Changing `Spot`, `CONFIRMATION_THRESHOLD`, `isConfirmed`, or any test file. (F3's optional `photoUrl` is a separately approved additive change, not part of this schema task.)
- Using or referencing any credential other than the two `NEXT_PUBLIC_*` values.

---

## 9. Acceptance criteria (Reviewer uses verbatim)

**Schema script (human action — `checkpoint:human-action`)**
- [ ] The §4 block, pasted as-is into the Supabase SQL Editor on the empty project, runs to completion with no error in one execution.
- [ ] Running the same block a second time also completes with no error (idempotency).
- [ ] §4.1 policy query returns exactly 5 rows for `public` (`spots_select_all`, `spots_insert_new_unconfirmed`, `spots_update_recompute_only`, `confirmations_insert_any`, `reports_insert_any`) and 1 row for `storage`.
- [ ] `storage.buckets` has `spot-photos` with `public = true`, `file_size_limit = 5242880`, and exactly the four MIME types.
- [ ] Under `set local role anon`: `select` on `spots` succeeds; `select` on `confirmations`, `select` on `reports`, `delete from spots`, `update spots set name = 'x'`, and `update spots set photo_url = 'x'` each fail with `42501`.
- [ ] Under `set local role anon`: inserting a spot with `confirmations = 5` or `status = 'confirmed'` fails (policy violation `42501`); inserting with `0`/`'unconfirmed'` succeeds.
- [ ] Under `set local role anon`: after inserting one spot and two `confirmations` rows with distinct `confirmer_id`, `select status, confirmations from spots` shows `confirmed, 2`; inserting one of those pairs again fails with `23505`; `update spots set confirmations = 999, status = 'unconfirmed'` succeeds and the row still reads `confirmed, 2`.
- [ ] No line of the script or this document contains a service-role key, database password, connection string, or JWT.

**Repo layer (builder output, verified by `npm test`)**
- [ ] `@supabase/supabase-js@^2` is in `package.json` `dependencies` and installed.
- [ ] `src/__tests__/supabase.test.ts`, `local-identity.test.ts`, `spots-repo.test.ts`, and `validation.test.ts` pass, unmodified.
- [ ] The three pre-existing suites (`spots.test.ts`, `map-config.test.ts`, `SpotMap.test.tsx`, `smoke.test.tsx`) still pass.
- [ ] `createSpot` insert payload keys are exactly `id, name, note, lat, lng, nickname, photo_url, status, confirmations`; `confirmSpot` confirmation payload keys are exactly `spot_id, confirmer_id`; `confirmSpot` update payload keys are exactly `confirmations, status`; `reportSpot` payload keys are exactly `spot_id, reason, details`. (Diff against the GRANT lines in §4 step 4.)
- [ ] `confirmSpot` reads the spot **before** inserting the confirmation, treats only `error.code === '23505'` as a duplicate, skips the update on duplicate, and derives `status` via `isConfirmed` with no literal `2`.
- [ ] `fetchSpots` chains nothing after `select('*')`; `createSpot` chains nothing after `insert(...)`; the `confirmations` and `reports` inserts chain nothing.
- [ ] `createSpot` performs `validateNewSpot` before touching storage, uploads before inserting, and never inserts when the upload errors.
- [ ] Storage object path is `<uuid>.<jpg|png|webp|gif>` with the extension derived from MIME, and `getPublicUrl` is called with that same path.
- [ ] `getSupabaseClient` reads env inside the function via literal `process.env.NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY`, throws on missing **or empty**, and is a singleton; `createClient` is called with `persistSession: false`.
- [ ] `getLocalConfirmerId` uses bare `localStorage` (not `window.localStorage`), key `zpots:confirmer-id`, validates stored value shape, has a non-`randomUUID` fallback, and survives `localStorage` being undefined or throwing.
- [ ] No TS constant for threshold, reasons, or length limits was re-declared; TS constants carry a comment pointing at the SQL mirror.
- [ ] `supabase/migrations/0001_init.sql` exists and is byte-identical to the §4 block.
- [ ] `npx tsc --noEmit` and `npm run lint` are clean.
- [ ] `.claude/learnings.md` gained entries for: the no-`rpc` fake → guarded-UPDATE design (F1), the `return=minimal` echo fallback (F2), and the exact-payload-keys rule (F11).

---

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-18 | Initial spec + SQL | Planner output for the add-pin backend |
