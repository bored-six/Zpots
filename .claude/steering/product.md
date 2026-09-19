# Product Rules

## Core mechanic

- A spot starts **Unconfirmed** the moment it is created and shows up on the map immediately.
- It flips to **Confirmed** at **2 or more confirmations from distinct people**. The threshold lives in one place (`isConfirmed` in `src/lib/spots.ts`) — never inline the number `2`.
- "Distinct people" is now backed by real Supabase Auth accounts (`confirmations.confirmer_id` is a foreign key to `auth.users`, enforced by a database policy) — not a browser-local id. One vote per account; creating multiple accounts is the remaining bypass, which is a normal, accepted limitation of email/password auth, not a design flaw to paper over.

## Identity

- Browsing/viewing the map is open to everyone, no account needed. Adding a spot, confirming, and reporting all require signing in (email + password via Supabase Auth — see `.claude/prds/auth-migration.md`).
- A nickname is optional and purely cosmetic, stored in the account's `user_metadata` and snapshotted onto each pin at creation time.
- Never present a nickname as a verified identity anywhere in the UI — it is cosmetic only, never proof of who added or confirmed a spot.

## Adding a spot

- Required: name, short note, location. Photo is required per the brief.
- The note is short-form. Enforce a sane max length so pin popups stay readable.

## Reporting

- Every spot carries a Report control with reasons: spam, wrong info, closed.
- Reporting is a signal, not an instant delete. Reported spots stay visible in the MVP; moderation is out of scope.

## Scope discipline

If a request is not one of the 5 MVP items in `CLAUDE.md`, it waits. Say so plainly instead of building it.
