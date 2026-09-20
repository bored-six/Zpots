// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads supabase/migrations/0004_social_spots.sql as plain text (SQL files
 * aren't importable) and asserts the schema pieces social-spots.md commits
 * to: profiles/follows/saves tables, the spot_cards view, the feed/hoy/map/
 * handle functions, the avatars bucket, and the migration's two DELETE
 * policies (its first ever, per the design decision doc).
 */
const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/0004_social_spots.sql",
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf-8");
}

describe("0004_social_spots.sql", () => {
  it("exists", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("enables the citext extension for the handle column", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create extension if not exists citext/i);
  });

  describe("profiles table", () => {
    it("is created with the expected columns", () => {
      const sql = readMigration();
      expect(sql).toMatch(/create table\s+(if not exists\s+)?public\.profiles/i);
      expect(sql).toMatch(/handle\s+citext\s+not null\s+unique/i);
      expect(sql).toMatch(/needs_handle\s+boolean/i);
      expect(sql).toMatch(/follower_count\s+integer/i);
      expect(sql).toMatch(/following_count\s+integer/i);
    });

    it("enforces the handle format as a CHECK constraint", () => {
      const sql = readMigration();
      expect(sql).toMatch(/handle\s*~\s*'\^\[a-z0-9_\]\{3,20\}\$'/i);
    });

    it("references auth.users with cascade delete for the id", () => {
      const sql = readMigration();
      expect(sql).toMatch(/references\s+auth\.users\s*\(\s*id\s*\)\s*on delete cascade/i);
    });
  });

  describe("follows table", () => {
    it("is created with a composite primary key and the no-self-follow check", () => {
      const sql = readMigration();
      expect(sql).toMatch(/create table\s+(if not exists\s+)?public\.follows/i);
      expect(sql).toMatch(/primary key\s*\(\s*follower_id\s*,\s*followee_id\s*\)/i);
      expect(sql).toMatch(/follower_id\s*<>\s*followee_id/i);
    });

    it("indexes followee_id for reverse (who-follows-me) lookups", () => {
      const sql = readMigration();
      expect(sql).toMatch(/create index[^;]*on\s+public\.follows\s*\(\s*followee_id/i);
    });

    it("has a DELETE policy scoped to the caller (unfollow)", () => {
      const sql = readMigration();
      expect(sql).toMatch(
        /create policy[^;]*on\s+public\.follows[\s\S]*?for delete[\s\S]*?using\s*\(\s*follower_id\s*=\s*auth\.uid\(\)\s*\)/i,
      );
    });
  });

  describe("saves table", () => {
    it("is created with a composite primary key on (user_id, spot_id)", () => {
      const sql = readMigration();
      expect(sql).toMatch(/create table\s+(if not exists\s+)?public\.saves/i);
      expect(sql).toMatch(/primary key\s*\(\s*user_id\s*,\s*spot_id\s*\)/i);
    });

    it("indexes spot_id", () => {
      const sql = readMigration();
      expect(sql).toMatch(/create index[^;]*on\s+public\.saves\s*\(\s*spot_id/i);
    });

    it("has a DELETE policy scoped to the caller (unsave)", () => {
      const sql = readMigration();
      expect(sql).toMatch(
        /create policy[^;]*on\s+public\.saves[\s\S]*?for delete[\s\S]*?using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i,
      );
    });
  });

  it("adds the created_by -> profiles foreign key on spots", () => {
    const sql = readMigration();
    expect(sql).toMatch(/alter table\s+public\.spots/i);
    expect(sql).toMatch(/foreign key\s*\(\s*created_by\s*\)\s*references\s+public\.profiles\s*\(\s*id\s*\)/i);
  });

  it("creates the spot_cards security-invoker view joining spots and profiles", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create view\s+public\.spot_cards/i);
    expect(sql).toMatch(/security_invoker\s*=\s*true/i);
    expect(sql).toMatch(/join\s+public\.profiles/i);
  });

  describe("functions", () => {
    const expectedFunctions = [
      "feed_cerca",
      "feed_nuevo",
      "feed_siguiendo",
      "hoy_row",
      "my_map",
      "handle_available",
    ];

    it.each(expectedFunctions)("defines function public.%s", (name) => {
      const sql = readMigration();
      expect(sql).toMatch(new RegExp(`create (or replace )?function\\s+public\\.${name}\\s*\\(`, "i"));
    });
  });

  it("creates the avatars storage bucket, public, with an image mime allowlist", () => {
    const sql = readMigration();
    expect(sql).toMatch(/insert into storage\.buckets/i);
    expect(sql).toMatch(/'avatars'/);
    expect(sql).toMatch(/image\/jpeg/);
    expect(sql).toMatch(/image\/png/);
    expect(sql).toMatch(/image\/webp/);
  });

  it("scopes avatar storage writes to the uploader's own folder (auth.uid() folder check)", () => {
    const sql = readMigration();
    expect(sql).toMatch(/storage\.foldername\(name\)/i);
    expect(sql).toMatch(/auth\.uid\(\)::text/i);
  });

  it("documents that follows/saves carry this migration's first DELETE policies", () => {
    const sql = readMigration();
    expect(sql).toMatch(/first delete policy/i);
  });

  it("does not drop or delete any existing rows -- this migration only adds schema", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/truncate/i);
    // "delete from" as a DML statement (not the "for delete" policy clause,
    // and not a plain word match on the DELETE grant docs above).
    expect(sql).not.toMatch(/^\s*delete from\s+public\./im);
  });
});
