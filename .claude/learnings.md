# Zpots — Learnings

Rolling log of non-obvious discoveries. Newest first. Prune entries older than 60 days.

## [2026-09-18] - Environment

- System `git` is 2.15.0: no `git init -b`, no `git branch --show-current`. Set the default branch with `git symbolic-ref HEAD refs/heads/main` after `git init`.
- `create-next-app` rejects capitalized package names, so it cannot scaffold directly into a folder named `Zpots`. Scaffold into a lowercase temp dir, move the files over, then set `name` in `package.json` manually.
- `npx tsc --noEmit` fails on a fresh checkout until `npx next typegen` has run once — Next 16's `LayoutProps<"/">` comes from generated `.next/types`, which is gitignored. Run typegen before typechecking in CI.
- `next dev` rewrites an `AGENTS.md` agent-rules block on every run and generates a `CLAUDE.md` containing `@AGENTS.md`. Project rules were appended below that import line rather than replacing it, so the regeneration does not clobber them.
- A CSS import inside a component loaded via `next/dynamic({ ssr: false })` lands in its own lazy-loaded chunk, which gets injected *after* the global stylesheet — so its rules win same-specificity ties even though it's imported "first" in source order. Fix: hoist the third-party CSS import (`leaflet/dist/leaflet.css`) into the root layout, above the `./globals.css` import, so load order is deterministic instead of dynamic-chunk-dependent.

## [2026-09-18] - Testing

- Do not render real Leaflet in jsdom — it needs layout measurement and goes flaky. Mock `react-leaflet` with stand-ins that serialize props into `data-*` attributes and assert on the wiring instead.
- `next/dynamic(..., { ssr: false })` cannot be called directly inside a Server Component (Next 16 throws "ssr: false is not allowed with next/dynamic in Server Components"). Needs a small `'use client'` wrapper (`src/components/MapView.tsx`) that owns the dynamic import; the page itself stays a server component.
- That `ssr: false` bailout shows up in the raw SSR HTML as a `BAILOUT_TO_CLIENT_SIDE_RENDERING` comment/stack trace embedded in the response. This is expected Next.js behavior for client-only components, not a real error — do not mistake it for a bug when curling the page directly.
- No browser-automation tool (computer-use, chrome MCP, puppeteer/playwright) was available in this session's toolset, only Bash/Read/Write/Edit. Verified the client bundle loads (200 on the chunk URL) and the dev server log stayed clean across requests as a substitute for an actual console check — flagged this gap explicitly rather than claiming a browser was opened.
