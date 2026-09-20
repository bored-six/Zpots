// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads the migration as plain text rather than importing it (SQL files
 * aren't importable modules) so this stays a fast, dependency-free check
 * that the migration's hardcoded numbers haven't drifted from
 * src/lib/city-bounds.ts. If either changes without the other, this test
 * is the guard that catches it.
 */
const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/0003_zamboanga_bounds.sql",
);

const EXPECTED_BOUNDS = {
  south: 6.78,
  west: 121.75,
  north: 7.48,
  east: 122.58,
};

describe("0003_zamboanga_bounds.sql", () => {
  it("exists", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("adds a check constraint on public.spots", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/alter table\s+public\.spots/i);
    expect(sql).toMatch(/add constraint\s+spots_within_zamboanga_city/i);
    expect(sql).toMatch(/check\s*\(/i);
  });

  it("the four bound numbers in the SQL match src/lib/city-bounds.ts's ZAMBOANGA_CITY_BOUNDS exactly", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");

    const latMatch = sql.match(
      /lat\s+between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/i,
    );
    const lngMatch = sql.match(
      /lng\s+between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/i,
    );

    expect(latMatch).not.toBeNull();
    expect(lngMatch).not.toBeNull();

    const [, latLow, latHigh] = latMatch as RegExpMatchArray;
    const [, lngLow, lngHigh] = lngMatch as RegExpMatchArray;

    expect(Number(latLow)).toBe(EXPECTED_BOUNDS.south);
    expect(Number(latHigh)).toBe(EXPECTED_BOUNDS.north);
    expect(Number(lngLow)).toBe(EXPECTED_BOUNDS.west);
    expect(Number(lngHigh)).toBe(EXPECTED_BOUNDS.east);
  });

  it("does not drop or delete any existing rows -- migration only adds a constraint", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/truncate/i);
  });
});
