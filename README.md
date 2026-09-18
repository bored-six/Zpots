# Zpots

A crowdsourced map of local spots in Zamboanga City — street food, hangouts, and hidden gems that don't show up well on Google Maps. Anyone can drop a pin with a photo and a short note. Other people confirm it's real by tapping **"I've been here."**

No accounts. No passwords. Just the map.

## How it works

1. **Browse the map** — pan and zoom around Zamboanga City on OpenStreetMap tiles.
2. **Add a spot** — tap "Add a spot," tap the location, attach a photo, name, and a short note. An optional nickname is the only identity involved.
3. **New pins show up immediately**, marked **Unconfirmed**.
4. **Confirm — I've been here** — once 2 different people confirm a spot, it flips to **Confirmed**.
5. **Report** — flag a pin as spam, wrong info, or closed. Reports are a signal, not a delete; nothing disappears automatically.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 + TypeScript + Tailwind | Fast to build, matches existing experience |
| Map | Leaflet + OpenStreetMap via react-leaflet | Free, no API key or billing setup |
| Backend + photos | Supabase (Postgres + Storage) | One free service covers data and files |
| Tests | Vitest + Testing Library + jsdom | Fast, ESM-native |
| Hosting | Vercel + Supabase | Both free tier |

## Running it locally

```bash
npm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The database schema (tables, row-level security, and the photo storage bucket) lives in `supabase/migrations/0001_init.sql` — paste it into your Supabase project's SQL Editor once, before running the app against a fresh project.

## Commands

```bash
npm run dev        # dev server
npm test           # run tests once
npm run test:watch # watch mode
npm run lint
npx tsc --noEmit
npm run build
```

## Project docs

- [`CLAUDE.md`](./CLAUDE.md) — scope, stack rationale, and workflow rules
- [`.claude/steering/`](./.claude/steering) — product rules and code conventions
- [`.claude/prds/add-pin-schema.md`](./.claude/prds/add-pin-schema.md) — the database schema design and its trade-offs

## Scope

This is a portfolio-scale MVP. Explicitly out of scope for now: live-location "ask for help nearby" notes, full accounts/login, categories, search, and filters.
