-- ============================================================================
-- Zpots — schema v6: add created_at to hoy_row() for vinta ring freshness
-- Run AFTER 0001_init.sql .. 0005_fix_feed_cerca_distance.sql. Safe to re-run.
--
-- Bug: hoy_row() (0004) already filters on `s.created_at >= now() - interval
-- '24 hours'` and orders by it, but never returns it -- its `returns table`
-- shape stops at (spot_id, id, handle, display_name, avatar_url). Without
-- created_at on the row, the client has no way to tell a 5-minute-old post
-- from a 20-hour-old one, which the paseo-motion vinta ring (spins only for
-- posts from the last hour) needs.
--
-- Fix: drop and recreate hoy_row() with created_at added to both the
-- returns table and the final select. CREATE OR REPLACE FUNCTION cannot
-- change an existing function's return type, so DROP FUNCTION IF EXISTS
-- comes first (idempotent -- safe to re-run this migration).
--
-- Everything else about the function -- parameters (none), filter, order,
-- limit, language sql, stable, security invoker, empty search_path, grants
-- to anon/authenticated -- is unchanged from 0004.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- hoy_row -- same filter/order/limit as 0004, created_at added to the
-- returns table and the select list. DROP FUNCTION IF EXISTS first: Postgres
-- rejects CREATE OR REPLACE FUNCTION when the return type changes.
-- ----------------------------------------------------------------------------
drop function if exists public.hoy_row();
create or replace function public.hoy_row()
returns table (
  spot_id uuid, id uuid, handle citext, display_name text, avatar_url text, created_at timestamptz
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
  select l.spot_id, p.id, p.handle, p.display_name, p.avatar_url, l.created_at
  from latest l
  join public.profiles p on p.id = l.created_by
  order by l.created_at desc
  limit 20
$$;

grant execute on function public.hoy_row()
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Make PostgREST pick up the changed return shape.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
