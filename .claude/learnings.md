# Zpots — Learnings

Rolling log of non-obvious discoveries. Newest first. Prune entries older than 60 days.

## [2026-09-18] - Environment

- System `git` is 2.15.0: no `git init -b`, no `git branch --show-current`. Set the default branch with `git symbolic-ref HEAD refs/heads/main` after `git init`.
- `create-next-app` rejects capitalized package names, so it cannot scaffold directly into a folder named `Zpots`. Scaffold into a lowercase temp dir, move the files over, then set `name` in `package.json` manually.
- `npx tsc --noEmit` fails on a fresh checkout until `npx next typegen` has run once — Next 16's `LayoutProps<"/">` comes from generated `.next/types`, which is gitignored. Run typegen before typechecking in CI.
- `next dev` rewrites an `AGENTS.md` agent-rules block on every run and generates a `CLAUDE.md` containing `@AGENTS.md`. Project rules were appended below that import line rather than replacing it, so the regeneration does not clobber them.
- A CSS import inside a component loaded via `next/dynamic({ ssr: false })` lands in its own lazy-loaded chunk, which gets injected *after* the global stylesheet — so its rules win same-specificity ties even though it's imported "first" in source order. Fix: hoist the third-party CSS import (`leaflet/dist/leaflet.css`) into the root layout, above the `./globals.css` import, so load order is deterministic instead of dynamic-chunk-dependent.

## [2026-09-18] - Add-pin backend (F1/F2/F11 in confirmation)

- F1 confirmed in practice: the frozen `confirmSpot` fake exposes only `from/select/eq/insert/update/single/then` (no `rpc`), so `confirmSpot` does the column-grant-guarded client UPDATE the spec describes rather than an RPC. Read-before-insert ordering matters: the fake's duplicate detector only flags a row as a repeat if it shares 2+ scalar values with an existing row in the *same* table, so the confirmations insert payload must be exactly `{ spot_id, confirmer_id }` (F11) — one extra constant key and two different confirmers of the same spot would falsely collide.
- F2 confirmed: `insert(payload)` in the fake resolves a plain `Promise` with no `.select()` chain available, so `createSpot` must await the bare insert and fall back to `toSpot({ ...payload, created_at: new Date().toISOString() })` when `data` is null. In the real supabase-js v2 client this branch is not dead in tests but *is* dead in production only once `Prefer: return=minimal` behavior is confirmed against a live project — worth re-checking once the schema is live.
- `getLocalConfirmerId` and spot-id generation share one `generateUuid()` helper (`src/lib/uuid.ts`) that tries `crypto.randomUUID()` first and falls back to `crypto.getRandomValues` — needed because Vitest/jsdom and insecure-origin phones both can lack `randomUUID`.
- TypeScript quirk (not fixed, flagged instead): `src/__tests__/spots-repo.test.ts` passes a `Spot`-typed object literal into `createFakeSupabase(seedRows: Record<string, Record<string, unknown>[]>)` in 4 places. Because `Spot` is a named interface without an index signature, TS raises `TS2322 Index signature for type 'string' is missing in type 'Spot'` there — confirmed via `git stash` that this error already existed on the original frozen commit before any implementation code was written, so it's pre-existing and not something a library-code change can fix. It blocks a fully clean `npx tsc --noEmit` and `npm run build` unless someone edits that test file (out of scope for this pass) or relaxes tsconfig's `include` to exclude test files (a separate, deliberate tradeoff not taken here).

## [2026-09-18] - Testing

- Do not render real Leaflet in jsdom — it needs layout measurement and goes flaky. Mock `react-leaflet` with stand-ins that serialize props into `data-*` attributes and assert on the wiring instead.
- `next/dynamic(..., { ssr: false })` cannot be called directly inside a Server Component (Next 16 throws "ssr: false is not allowed with next/dynamic in Server Components"). Needs a small `'use client'` wrapper (`src/components/MapView.tsx`) that owns the dynamic import; the page itself stays a server component.
- That `ssr: false` bailout shows up in the raw SSR HTML as a `BAILOUT_TO_CLIENT_SIDE_RENDERING` comment/stack trace embedded in the response. This is expected Next.js behavior for client-only components, not a real error — do not mistake it for a bug when curling the page directly.
- No browser-automation tool (computer-use, chrome MCP, puppeteer/playwright) was available in this session's toolset, only Bash/Read/Write/Edit. Verified the client bundle loads (200 on the chunk URL) and the dev server log stayed clean across requests as a substitute for an actual console check — flagged this gap explicitly rather than claiming a browser was opened.
