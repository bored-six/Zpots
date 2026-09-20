// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads supabase/migrations/0005_fix_feed_cerca_distance.sql as plain text
 * (SQL files aren't importable) and asserts the fix for feed_cerca's
 * parameter/column collision: 0004 named the IN parameters `lat`/`lng`,
 * identical to spot_cards' own `lat`/`lng` columns, so every unqualified
 * reference inside the haversine expression resolved to the COLUMN instead
 * of the parameter -- `distance_m` came back 0 for every row regardless of
 * the caller's actual location. This migration drops and recreates
 * feed_cerca with non-colliding parameter names (origin_lat/origin_lng) and
 * fully qualified column references.
 */
const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/0005_fix_feed_cerca_distance.sql",
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf-8");
}

describe("0005_fix_feed_cerca_distance.sql", () => {
  it("exists", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("is wrapped in a transaction and reloads PostgREST's schema cache", () => {
    const sql = readMigration();
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
    expect(sql).toMatch(/notify pgrst, 'reload schema';/);
  });

  it("drops the old feed_cerca(double precision, double precision, integer, integer) signature before recreating it", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /drop function if exists public\.feed_cerca\(\s*double precision\s*,\s*double precision\s*,\s*integer\s*,\s*integer\s*\)\s*;/i,
    );
  });

  it("recreates feed_cerca with non-colliding parameter names", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create (or replace )?function\s+public\.feed_cerca\s*\(/i);
    // The new parameters must not be bare "lat"/"lng" -- that's the exact
    // collision with spot_cards.lat/spot_cards.lng being fixed here.
    const fnMatch = sql.match(/create (or replace )?function\s+public\.feed_cerca\s*\(([\s\S]*?)\)\s*\n?returns/i);
    expect(fnMatch).toBeTruthy();
    const paramList = fnMatch![2];
    expect(paramList).toMatch(/origin_lat\s+double precision/i);
    expect(paramList).toMatch(/origin_lng\s+double precision/i);
    expect(paramList).not.toMatch(/(^|[^_a-z])lat\s+double precision/i);
    expect(paramList).not.toMatch(/(^|[^_a-z])lng\s+double precision/i);
  });

  it("keeps the same return shape: setof spot_cards columns plus distance_m", () => {
    const sql = readMigration();
    expect(sql).toMatch(/distance_m double precision/i);
  });

  it("keeps security invoker, stable, language sql, and an empty search_path", () => {
    const sql = readMigration();
    const fnBlock = sql.slice(sql.search(/create (or replace )?function\s+public\.feed_cerca/i));
    expect(fnBlock).toMatch(/language sql/i);
    expect(fnBlock).toMatch(/stable/i);
    expect(fnBlock).toMatch(/security invoker/i);
    expect(fnBlock).toMatch(/set search_path = ''/i);
  });

  it("contains no unqualified bare lat/lng inside the haversine body -- every column reference is sc.lat/sc.lng", () => {
    const sql = readMigration();
    const bodyMatch = sql.match(/create (or replace )?function\s+public\.feed_cerca[\s\S]*?\$\$([\s\S]*?)\$\$/i);
    expect(bodyMatch).toBeTruthy();
    const body = bodyMatch![2];

    // Every "lat"/"lng" token in the body must be immediately preceded by
    // "sc." (a spot_cards column reference) or be part of the
    // origin_lat/origin_lng parameter names. No bare "lat"/"lng" allowed.
    const bareLatOrLng = /(?<![a-z_.])(?<!sc\.)(lat|lng)(?![a-z_])/gi;
    const matches = [...body.matchAll(bareLatOrLng)].map((m) => m[0]);
    expect(matches).toEqual([]);
  });

  it("re-grants execute on the new signature to anon and authenticated", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /grant execute on function public\.feed_cerca\([^)]*\)\s*\n?\s*to anon, authenticated;/i,
    );
  });

  it("uses the same header/comment documentation style as 0004 (a leading banner comment block)", () => {
    const sql = readMigration();
    expect(sql).toMatch(/^-- =+\n(--[^\n]*\n)+-- =+\n/);
  });
});
