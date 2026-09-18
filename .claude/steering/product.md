# Product Rules

## Core mechanic

- A spot starts **Unconfirmed** the moment it is created and shows up on the map immediately.
- It flips to **Confirmed** at **2 or more confirmations from distinct people**. The threshold lives in one place (`isConfirmed` in `src/lib/spots.ts`) — never inline the number `2`.
- "Distinct people" with no accounts means a best-effort browser-local identity. It is spoofable by design; that tradeoff is accepted for the MVP and should not be papered over as if it were real auth.

## Identity

- No accounts, no passwords, no login. A nickname is optional and purely cosmetic.
- Never present a nickname as a verified identity anywhere in the UI.

## Adding a spot

- Required: name, short note, location. Photo is required per the brief.
- The note is short-form. Enforce a sane max length so pin popups stay readable.

## Reporting

- Every spot carries a Report control with reasons: spam, wrong info, closed.
- Reporting is a signal, not an instant delete. Reported spots stay visible in the MVP; moderation is out of scope.

## Scope discipline

If a request is not one of the 5 MVP items in `CLAUDE.md`, it waits. Say so plainly instead of building it.
