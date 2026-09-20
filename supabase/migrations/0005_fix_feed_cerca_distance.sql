-- ============================================================================
-- Zpots — schema v5: fix feed_cerca's distance_m always coming back 0
-- Run AFTER 0001_init.sql .. 0004_social_spots.sql. Safe to re-run.
--
-- Bug: 0004 declared feed_cerca's IN parameters as `lat`/`lng`, which are
-- identical to the `lat`/`lng` columns feed_cerca selects from
-- public.spot_cards. Every unqualified `lat`/`lng` reference inside the
-- haversine expression resolved to the COLUMN, not the parameter -- so the
-- formula computed the distance from each row to ITSELF, and distance_m
-- came back 0 for every row regardless of the caller's actual location.
-- Cerca's whole point is distance ordering, so this made the default feed
-- lane meaningless.
--
-- Fix: drop and recreate feed_cerca with parameters renamed to origin_lat/
-- origin_lng, which cannot collide with any spot_cards column, and qualify
-- every column reference in the haversine body as sc.lat/sc.lng so the
-- intent stays unambiguous even if a future rename collides again.
--
-- Everything else about the function -- return shape, language sql, stable,
-- security invoker, empty search_path, grants to anon/authenticated -- is
-- unchanged from 0004.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- feed_cerca -- same signature shape and positional argument order as 0004
-- (origin_lat, origin_lng, page_size, page_offset), only the first two
-- parameter names changed. DROP FUNCTION IF EXISTS with 0004's exact
-- argument types first: CREATE OR REPLACE FUNCTION cannot rename parameters
-- on an existing function, and would otherwise leave the old, buggy
-- `lat`/`lng` names in place.
-- ----------------------------------------------------------------------------
drop function if exists public.feed_cerca(double precision, double precision, integer, integer);
create or replace function public.feed_cerca(
  origin_lat double precision,
  origin_lng double precision,
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
        sin(radians(origin_lat - sc.lat) / 2) ^ 2
        + cos(radians(origin_lat)) * cos(radians(sc.lat)) * sin(radians(origin_lng - sc.lng) / 2) ^ 2
      )
    ) as distance_m
  from public.spot_cards sc
  order by distance_m asc, sc.id asc
  limit page_size offset page_offset
$$;

grant execute on function public.feed_cerca(double precision, double precision, integer, integer)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Make PostgREST pick up the renamed parameters.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
