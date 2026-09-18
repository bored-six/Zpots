# Zpots — Learnings

Rolling log of non-obvious discoveries. Newest first. Prune entries older than 60 days.

## [2026-09-18] - Environment

- System `git` is 2.15.0: no `git init -b`, no `git branch --show-current`. Set the default branch with `git symbolic-ref HEAD refs/heads/main` after `git init`.
- `create-next-app` rejects capitalized package names, so it cannot scaffold directly into a folder named `Zpots`. Scaffold into a lowercase temp dir, move the files over, then set `name` in `package.json` manually.
- `npx tsc --noEmit` fails on a fresh checkout until `npx next typegen` has run once — Next 16's `LayoutProps<"/">` comes from generated `.next/types`, which is gitignored. Run typegen before typechecking in CI.
- `next dev` rewrites an `AGENTS.md` agent-rules block on every run and generates a `CLAUDE.md` containing `@AGENTS.md`. Project rules were appended below that import line rather than replacing it, so the regeneration does not clobber them.

## [2026-09-18] - Testing

- Do not render real Leaflet in jsdom — it needs layout measurement and goes flaky. Mock `react-leaflet` with stand-ins that serialize props into `data-*` attributes and assert on the wiring instead.
