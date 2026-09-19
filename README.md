# Zpots

A crowdsourced map of local spots in Zamboanga City — street food, hangouts, and hidden gems that don't show up well on Google Maps. Anyone can drop a pin with a photo and a short note. Other people confirm it's real by tapping **"I've been here."**

Browsing the map needs no account. Adding, confirming, or reporting a spot requires a free email/password account.

## How it works

1. **Browse the map** — pan and zoom around Zamboanga City on OpenStreetMap tiles, no account needed.
2. **Sign in or create an account** — email + password via Supabase Auth. Only required the moment you try to add, confirm, or report a spot.
3. **Add a spot** — tap "Add a spot," tap the location, attach a photo, name, and a short note. An optional, purely cosmetic nickname is shown on the pin.
4. **New pins show up immediately**, marked **Unconfirmed**.
5. **Confirm — I've been here** — once 2 different accounts confirm a spot, it flips to **Confirmed**.
6. **Report** — flag a pin as spam, wrong info, or closed. Reports are a signal, not a delete; nothing disappears automatically.

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

The database schema (tables, row-level security, and the photo storage bucket) lives in `supabase/migrations/0001_init.sql`, with required-login changes layered on in `supabase/migrations/0002_auth.sql` — paste both into your Supabase project's SQL Editor once, in order, before running the app against a fresh project. `0002_auth.sql` also requires three dashboard toggles set by hand (Authentication settings): confirm email off, minimum password length 8, anonymous sign-ins off — see `.claude/prds/auth-migration.md` section 5.2 for exactly where.

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
- [`.claude/prds/auth-migration.md`](./.claude/prds/auth-migration.md) — the required-login migration: session strategy, identity model, and the `0002_auth.sql` SQL

## Scope

This is a portfolio-scale MVP. Explicitly out of scope for now: live-location "ask for help nearby" notes, categories, search, and filters.
