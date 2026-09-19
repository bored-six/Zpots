@AGENTS.md

# Zpots

Crowdsourced map of local spots in Zamboanga City — street food, hangouts, hidden gems that do not show up well on Google Maps. Anyone drops a pin with a photo and a short note; other people confirm it is real by tapping "I've been here."

> Note: the `CLAUDE.md` in the parent `Documents/` folder is a Salesforce orchestrator config and does NOT apply to this project. This file plus `.claude/steering/` govern Zpots.

## MVP scope — build these 5 things, nothing else

1. Map of Zamboanga City — pan and zoom
2. Add a pin — photo + short note + spot name; requires a signed-in account; optional cosmetic nickname
3. New pins appear immediately, marked **Unconfirmed**
4. **"Confirm — I've been here"** — 2 distinct confirmations flips it to **Confirmed**
5. **Report** button on each pin (spam / wrong info / closed)

Browsing the map needs no account — only adding, confirming, or reporting a spot requires signing in (email + password via Supabase Auth; see `.claude/prds/auth-migration.md`).

## Explicitly out of scope for v1

- "Ask for help nearby" live-location notes
- Categories, search, filters
- Anything not in the 5 items above

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 + TypeScript + Tailwind | Matches existing experience, fastest path |
| Map | Leaflet + OpenStreetMap via react-leaflet | Free, no API key or billing |
| Backend + photos | Supabase (Postgres + Storage) | One free service covers data and files |
| Tests | Vitest + Testing Library + jsdom | Fast, ESM-native, no Jest config tax |
| Hosting | Vercel + Supabase | Both free tier |

## Workflow rules

- **Test-first on anything substantial.** Tests get written against a stated contract before the implementation exists, and they must fail red first. Never reshape tests around code after the fact.
- **One commit per completed task**, format `{type}({scope}): {description}`, with a `Co-Authored-By` line.
- **No emojis. No generic AI look.** Custom SVG icons and deliberately chosen fonts only — no icon packs, no untouched templates.
- Capture non-obvious discoveries in `.claude/learnings.md` after each task.

## Commands

```
npm run dev        # dev server
npm test           # vitest run
npm run test:watch # vitest watch
npm run lint
npx tsc --noEmit
npm run build
```
