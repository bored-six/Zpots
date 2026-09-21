// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads supabase/migrations/0006_hoy_created_at.sql as plain text (SQL
 * files aren't importable) and asserts the fix for the vinta ring
 * freshness signal (paseo-motion.md task 2.4): 0004's hoy_row() filters and
 * orders by created_at but never returns it, so the client has no way to
 * tell a 5-minute-old post from a 20-hour-old one. This migration adds
 * created_at to hoy_row()'s return shape.
 */
const MIGRATION_PATH = path.join(process.cwd(), "supabase/migrations/0006_hoy_created_at.sql");

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf-8");
}

describe("0006_hoy_created_at.sql", () => {
  it("exists", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("is wrapped in a transaction and reloads PostgREST's schema cache", () => {
    const sql = readMigration();
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
    expect(sql).toMatch(/notify pgrst, 'reload schema';/);
  });

  it("drops the old hoy_row() signature before recreating it -- changing a return type requires DROP FUNCTION first", () => {
    const sql = readMigration();
    expect(sql).toMatch(/drop function if exists public\.hoy_row\(\s*\)\s*;/i);
  });

  it("recreates hoy_row() with created_at added to the returns table", () => {
    const sql = readMigration();
    const fnMatch = sql.match(/create (or replace )?function\s+public\.hoy_row\s*\(\s*\)\s*\nreturns table\s*\(([\s\S]*?)\)/i);
    expect(fnMatch).toBeTruthy();
    const returnList = fnMatch![2];
    expect(returnList).toMatch(/spot_id\s+uuid/i);
    expect(returnList).toMatch(/created_at\s+timestamptz/i);
  });

  it("selects created_at in the function body's final select list", () => {
    const sql = readMigration();
    const bodyMatch = sql.match(/create (or replace )?function\s+public\.hoy_row[\s\S]*?\$\$([\s\S]*?)\$\$/i);
    expect(bodyMatch).toBeTruthy();
    const body = bodyMatch![2];
    expect(body).toMatch(/select[\s\S]*created_at[\s\S]*from\s+latest/i);
  });

  it("keeps the same filter/order/limit as 0004 -- last 24h, newest first, max 20", () => {
    const sql = readMigration();
    expect(sql).toMatch(/interval\s+'24 hours'/i);
    expect(sql).toMatch(/order by\s+l\.created_at desc/i);
    expect(sql).toMatch(/limit 20/i);
  });

  it("keeps security invoker, stable, language sql, and an empty search_path", () => {
    const sql = readMigration();
    const fnBlock = sql.slice(sql.search(/create (or replace )?function\s+public\.hoy_row/i));
    expect(fnBlock).toMatch(/language sql/i);
    expect(fnBlock).toMatch(/stable/i);
    expect(fnBlock).toMatch(/security invoker/i);
    expect(fnBlock).toMatch(/set search_path = ''/i);
  });

  it("re-grants execute on hoy_row() to anon and authenticated -- signed-out resolves zero rows client-side, not via a missing grant", () => {
    const sql = readMigration();
    expect(sql).toMatch(/grant execute on function public\.hoy_row\(\s*\)\s*\n?\s*to anon, authenticated;/i);
  });

  it("uses the same header/comment documentation style as 0005 (a leading banner comment block)", () => {
    const sql = readMigration();
    expect(sql).toMatch(/^-- =+\n(--[^\n]*\n)+-- =+\n/);
  });
});
