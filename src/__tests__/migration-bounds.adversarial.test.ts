// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Adversarial pass on 0003_zamboanga_bounds.sql (spec Task 1). The frozen
 * migration-bounds.test.ts already checks the constraint exists, uses
 * `between`, matches ZAMBOANGA_CITY_BOUNDS, and contains no delete/drop/
 * truncate. This file adds the checks the spec calls out explicitly that
 * aren't yet covered: the exact constraint name, and no UPDATE statement
 * anywhere in the file (an UPDATE could silently rewrite out-of-bounds
 * rows instead of the spec's required fail-loud-and-report-to-the-user
 * behavior).
 */
const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/0003_zamboanga_bounds.sql",
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf-8");
}

describe("adversarial", () => {
  it("the constraint is named exactly spots_within_zamboanga_city (not a close variant like spots_zamboanga_bounds or spot_within_zamboanga_city)", () => {
    const sql = readMigration();
    const nameMatch = sql.match(/add constraint\s+(\S+)/i);
    expect(nameMatch).not.toBeNull();
    const constraintName = (nameMatch as RegExpMatchArray)[1].replace(/[,;]$/, "");
    expect(constraintName).toBe("spots_within_zamboanga_city");
  });

  it("uses the SQL `between` operator for both lat and lng, not a hand-rolled >= / <= pair", () => {
    const sql = readMigration();
    const checkBody = sql.match(/check\s*\(([^;]*)\)/is);
    expect(checkBody).not.toBeNull();
    const body = (checkBody as RegExpMatchArray)[1];
    expect(body).toMatch(/lat\s+between\s+-?\d/i);
    expect(body).toMatch(/lng\s+between\s+-?\d/i);
  });

  it("contains no UPDATE statement anywhere (must not silently rewrite existing out-of-bounds rows)", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/\bupdate\s+public\.spots\b/i);
    expect(sql).not.toMatch(/^\s*update\s/im);
  });

  it("contains exactly one statement (a single ALTER TABLE ... ADD CONSTRAINT), not multiple semicolon-separated statements that could hide a second, unreviewed change", () => {
    const sql = readMigration();
    // Strip `--` line comments across the whole file first -- splitting by
    // `;` before stripping comments would wrongly break a comment line's
    // own punctuation (e.g. a semicolon inside a code comment) into a
    // separate "statement".
    const withoutComments = sql.replace(/--.*$/gm, "");
    const statements = withoutComments
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^alter table\s+public\.spots/i);
  });
});
