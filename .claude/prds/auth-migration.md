# PRD: Auth migration — required email/password login for add / confirm / report

**Ticket:** None (ad-hoc request, 2026-09-19)
**Parent:** `add-pin-schema.md` (this supersedes its identity model; its schema, triggers, and storage design otherwise stand)
**Status:** Planning
**Created:** 2026-09-19
**Last Updated:** 2026-09-19
**Author role:** Planner (spec only — no application code, no DB execution, no commit, no test-file edits)

---

## Goal

A visitor can still open `/` and browse every pin without an account, but the moment they try to add, confirm, or report a spot they are asked to sign in; after the human pastes one SQL script (§5) and flips three dashboard toggles (§5.5), the database itself refuses any write that does not carry a real Supabase Auth user id, and "one confirmation per person per spot" is enforced by a foreign key to `auth.users` instead of a random string in `localStorage`.

---

## Already decided by the user (not open for debate in this spec)

1. Login is **required** before adding, confirming, or reporting a spot.
2. Mechanism is **email + password via Supabase Auth** (already the project's backend).
3. Browsing/viewing the map stays **open to unauthenticated visitors** (orchestrator's assumption — confirmed sound below, A1).

## Assumptions (stated so nobody has to guess)

| # | Assumption | Basis / consequence |
|---|---|---|
| A1 | **Public browsing is architecturally sound.** `spots` SELECT stays granted to `anon`; nothing readable by `anon` becomes more sensitive under this migration. The one new publicly readable value is `spots.created_by` (a bare `auth.users` uuid, never an email) — see D4. No problem flagged. | The read path is already `select('*')` under `USING (true)`; gating reads would only add a login wall in front of a map of public places, which is the opposite of the product. |
| A2 | The app stays **100% client components** for auth purposes. No Server Component, Route Handler, or middleware needs to know who is signed in in this pass. | `page.tsx`, `settings/page.tsx`, `SpotMap.tsx`, `MapView.tsx` are all `'use client'`; `layout.tsx` renders no auth-dependent markup. |
| A3 | **Email confirmation is turned OFF** in the Supabase dashboard for this pass (§5.5, item 1). `signUp()` therefore returns a live session immediately and the user lands on the map signed in. | Supabase's built-in mailer is dev-grade and rate-limited to a handful of emails per hour; with no custom SMTP configured, a required-confirmation flow would lock out the 3rd person who signs up in an hour. Tradeoff accepted: anyone can register with an email they do not own. That is no worse than today's fully anonymous writes and is a normal portfolio-MVP posture. The UI still handles the "confirmation required" response correctly in case the human leaves the toggle on (§2.5). |
| A4 | **Password reset is deferred** to a later ticket (§2.6). | Same email-delivery constraint as A3, plus it needs a `/reset-password` route, `detectSessionInUrl: true`, and `PASSWORD_RECOVERY` event handling. Nothing in this pass blocks adding it later. |
| A5 | The **nickname moves to `auth.users.raw_user_meta_data.nickname`** (via `supabase.auth.updateUser({ data: { nickname } })`), not to a `profiles` table (D5). | Zero new schema; the nickname is still cosmetic and still snapshotted into `spots.nickname` at creation exactly as today. |
| A6 | Existing rows in `public.confirmations` (and any `public.reports` rows) are **development test data**, not real users. The migration deletes all `confirmations` rows (D2). `spots` rows are left alone. | Stated by the orchestrator. Anyone who "confirmed" a spot anonymously before this migration loses that vote — there is no account to attach it to. Said plainly; no fake continuity. |
| A7 | The Supabase project has **anonymous sign-ins disabled** (default). §5.5 item 4 asks the human to verify, and every write policy additionally checks the JWT's `is_anonymous` claim so an accidental enable cannot silently reopen anonymous writes. | Supabase's "anonymous sign-in" feature mints `authenticated`-role JWTs; a naive `TO authenticated` policy would accept them. |
| A8 | Supabase JS `2.116.0` (installed; verified `node_modules/@supabase/auth-js/package.json`). All method names used in §6 (`signUp`, `signInWithPassword`, `signOut`, `getSession`, `getUser`, `onAuthStateChange`, `updateUser`, `resetPasswordForEmail`) and error codes in §2.4 exist in that version's `GoTrueClient.d.ts` / `error-codes.d.ts`. `@supabase/ssr` is **not** installed and is not added (§1). | Verified by reading the installed type declarations. |
| A9 | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` remain the only credentials the app sees. No service-role key, no DB password, anywhere, ever. `.env.local` is not touched. | Hard constraint. Supabase Auth email/password needs nothing beyond the anon key. |

---

## Decision register (the architectural calls, one line each; details in the sections cited)

| ID | Decision | Section |
|---|---|---|
| D1 | Stay on plain `@supabase/supabase-js` client sessions (`persistSession: true`); no `@supabase/ssr`, no middleware. | §1 |
| D2 | `confirmations.confirmer_id` becomes `uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, default `auth.uid()`; existing rows deleted first. | §4.1, §5 |
| D3 | `local-identity.ts`, `confirmed-spots-storage.ts`, `nickname-storage.ts`, `local-data-reset.ts` are **deleted**, along with their four test files. "Which spots did I confirm" is now answered by the DB (own-rows SELECT policy on `confirmations`). | §4.2, §7 |
| D4 | Add `spots.created_by` and `reports.reported_by` as DB-default (`auth.uid()`) columns the client never sends; `reports` gets a unique `(spot_id, reported_by)`. | §4.4 |
| D5 | Nickname lives in `user_metadata`, defaults to blank (never derived from the email). | §4.3 |
| D6 | One `/login` page with a sign-in / create-account toggle; no separate `/signup` route. | §2.1 |
| D7 | Gated actions open an in-map "Sign in to …" prompt (not a hard redirect); the map and all pins stay visible when signed out. | §3 |
| D8 | Repo write functions call `requireUserId()` first and throw before any network/storage call when there is no session; the UI makes that path unreachable in practice, the throw is defense in depth. | §6 |
| D9 | `confirmSpot(spotId)` drops its `confirmerId` parameter. | §6.3 |
| D10 | Password reset deferred; email confirmation off. | A3, A4, §2.5–2.6 |

---

## Files to touch

| Path | New / Existing / Delete | What |
|---|---|---|
| `.claude/prds/auth-migration.md` | New (this file) | The spec + the SQL the human runs. **Only file this Planner writes.** |
| `supabase/migrations/0002_auth.sql` | New (builder) | Verbatim copy of §5 SQL, version-controlled next to `0001_init.sql`. Not executed by any agent. |
| `src/lib/auth.ts` | New | Session/identity helpers (§6.1). Pure module, no React. |
| `src/components/AuthProvider.tsx` | New | `'use client'` context provider + `useAuth()` hook (§6.2). |
| `src/components/SignInPrompt.tsx` | New | The small "Sign in to continue" card SpotMap shows for gated actions (§3.3). |
| `src/app/login/page.tsx` | New | Sign-in / create-account page (§2). |
| `src/components/icons/action-icons.tsx` | Existing | Add a custom `SignInIcon` SVG (compass-rose family; no icon pack). Designer may refine; builder must not import a third-party icon. |
| `src/lib/supabase.ts` | Existing | Auth options flip: `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false` (§1.3). |
| `src/lib/spots-repo.ts` | Existing | `confirmSpot` signature change, `requireUserId()` guards, new `fetchMyConfirmedSpotIds()` (§6.3). |
| `src/lib/validation.ts` | Existing | Add `MIN_PASSWORD_LENGTH = 8`, `isValidEmail(value)`, `validateCredentials(email, password)` (§2.3). |
| `src/app/layout.tsx` | Existing | Wrap `{children}` in `<AuthProvider>`. Nothing else. |
| `src/app/page.tsx` | Existing | Read `useAuth()`, drop local-identity/confirmed-spots imports, pass `authStatus` + `nickname` down (§3.1). |
| `src/components/MapView.tsx` | Existing | Forward the two new props (§3.2). |
| `src/components/SpotMap.tsx` | Existing | Gate FAB / Confirm / Report on `authStatus`; render `SignInPrompt` (§3.2). |
| `src/components/AddSpotForm.tsx` | Existing | Additive optional `defaultNickname?: string` prop used as the nickname field's initial value (§3.4). |
| `src/components/ClipboardShell.tsx` | Existing | Header shows a "Sign in" link when signed out (§3.5). Becomes `'use client'` (it is only ever rendered by client pages). |
| `src/app/settings/page.tsx` | Existing | Rewritten around the account: email, nickname (account-backed), confirmations count (DB-backed), sign out. "Clear my local data" removed (§2.7). |
| `src/lib/local-identity.ts`, `src/lib/confirmed-spots-storage.ts`, `src/lib/nickname-storage.ts`, `src/lib/local-data-reset.ts` | **Delete** | Replaced by real identity (D3). |
| `src/__tests__/local-identity.test.ts`, `confirmed-spots-storage.test.ts`, `nickname-storage.test.ts`, `local-data-reset.test.ts` | **Delete** (test-writing pass, not the builder) | They test modules that no longer exist (§7). |
| `.claude/steering/product.md`, `CLAUDE.md`, `README.md` | Existing | All three currently state "no accounts / no login". Must be updated in this pass or the docs lie to the next agent (§8.1). |
| `.claude/learnings.md` | Existing | Entries listed in §9. |

Not touched: `.env.local`, `.env.local.example` (no new vars), `src/lib/spots.ts`, `src/lib/map-config.ts`, `src/lib/pin-icon.ts`, `src/lib/uuid.ts` (still used for spot ids), `ConfirmButton.tsx`, `ReportButton.tsx` (gating happens in the caller), `supabase/migrations/0001_init.sql` (history; superseded lines are re-issued in `0002_auth.sql`).

---

## 1. Session strategy

### 1.1 Recommendation: stay client-only with `@supabase/supabase-js` (D1)

Keep the existing singleton client and let GoTrue do what it does by default: persist the session in `localStorage` under `sb-<project-ref>-auth-token`, refresh the JWT automatically, and broadcast changes via `onAuthStateChange` (which also fires across tabs through the `storage` event).

Why this is correct for *this* app, not just simpler:

| Requirement | Client-only (`supabase-js`) | `@supabase/ssr` + middleware |
|---|---|---|
| Gate add/confirm/report | Handler-level check in SpotMap against `useAuth().status`; DB enforces regardless (§5). | Same handler-level check is still needed — middleware cannot gate a button click inside a client-rendered map. |
| Survive reload | `persistSession: true` → `getSession()` rehydrates from `localStorage` on mount. | Cookie rehydrates; equivalent. |
| Anything server-side needs the user? | No (A2). `layout.tsx` is static chrome; `/` and `/settings` are client components; there are no Route Handlers or Server Actions. | This is the *only* thing `@supabase/ssr` buys, and nothing consumes it. |
| Cost | Flip two options in `supabase.ts`. | New dependency; replace `createClient` with `createBrowserClient`; add `middleware.ts` that refreshes tokens on every request; a `createServerClient` factory with a cookie adapter; the existing `getSupabaseClient` singleton contract (and `supabase.test.ts`) becomes wrong because SSR clients must be per-request. |
| Failure mode if skipped | None today. | N/A |

Rejected: `@supabase/ssr`. It solves "Server Components need the session", which is a problem this codebase does not have. Adding it would also mean the first thing every request does is a token-refresh round trip in middleware for pages that render identically signed in or out.

Re-evaluate the moment any of these appear: a Server Component that renders auth-dependent markup, a Route Handler that must act as the user, or SEO-relevant per-user content. None are in scope.

### 1.2 How the two things `@supabase/ssr` would have handled get done without it

**Redirect-back after sign-in.** `/login` accepts an optional `?next=<path>` query param. The only gated origin today is `/` (actions live inside the map), so in practice `next` is always `/` or absent. Rules the builder must follow:
- Accept `next` only if it is a same-origin relative path: starts with a single `/`, does not start with `//`, contains no scheme (`:` before the first `/`), no `\`. Anything else → treat as `/`. This is an open-redirect guard; test it.
- On successful sign-in or sign-up (with a live session), `router.replace(next)` — `replace`, not `push`, so Back does not return to the login form.
- Pending in-map state (armed placement, tapped location, an open Report form) is **not** preserved across the round trip. After returning to `/`, the user taps "Add a spot" again. Stated as an accepted limitation; do not build a "resume action" mechanism.

**"Already signed in" on `/login`.** The page reads `useAuth()`. While `status === 'loading'` it renders the form disabled (no flash of a usable form for a user who is about to be redirected). When `status === 'signed-in'` on mount (or becomes so, e.g. another tab signed in), it `router.replace(next)` immediately and renders nothing else. No middleware needed: the page is client-rendered anyway.

### 1.3 Exact `supabase.ts` change

`createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })`.

- `persistSession: true` — the whole point; default storage (`localStorage`) is correct. Do not pass a custom `storage`.
- `autoRefreshToken: true` — access tokens expire after 1 hour by default; without refresh a user gets a `401`/`42501` mid-session.
- `detectSessionInUrl: false` — stays off because nothing in this pass sends the user back with tokens in the URL (email confirmation off, password reset deferred). Flip to `true` in the reset-password ticket.
- `getSupabaseClient()` is still only called from event handlers / effects, never during render, so SSR prerendering of client components never constructs a client on the server. `supabase.test.ts` asserts nothing about these options and stays green; it does instantiate a real client under jsdom, which may now log a `navigator.locks` warning — a warning, not a failure (verify; if it *fails*, the fix is in the test file, not in `supabase.ts`).
- Module-level singleton stays: `onAuthStateChange` subscriptions must attach to the same instance the repo functions use.

### 1.4 Auth state lifecycle in the browser

1. `AuthProvider` mounts with `status: 'loading'` (identical on server and client — no hydration mismatch).
2. In an effect: `getSession()` → set `signed-in` (with `toAuthUser(session.user)`) or `signed-out`. Then subscribe with `onAuthStateChange`; on `SIGNED_IN` / `TOKEN_REFRESHED` / `USER_UPDATED` → `signed-in` with the fresh user; on `SIGNED_OUT` → `signed-out`. Unsubscribe on unmount.
3. Consumers only ever see the three-state `status` plus `user`; nobody outside `auth.ts`/`AuthProvider` touches `supabase.auth` directly.

`getSession()` (local, no network) is sufficient for UI state and for obtaining the uid the repo puts into a payload, because the database independently verifies that uid against the JWT on every write (§5). `getUser()` (network-validated) is not needed anywhere in this pass.

---

## 2. Routes and pages

### 2.1 One route: `/login` with a mode toggle (D6)

`src/app/login/page.tsx`, `'use client'`, wrapped in the existing `ClipboardShell` (non-fullBleed, same parchment card as Settings).

Why one page, not `/login` + `/signup`: both modes are the same two fields (email, password) hitting the same client with different verbs; the only differences are the submit label, one line of helper copy, and the error map. A second route doubles the test surface and the redirect-guard surface for zero UX gain. The mode is a piece of component state seeded from `?mode=signup` (anything else → `signin`), toggled by a text button under the form ("New here? Create an account" / "Already have an account? Sign in"). Toggling clears the error banner but keeps the typed email.

### 2.2 Page states (exhaustive)

| State | What renders | Transition |
|---|---|---|
| `auth.status === 'loading'` | Form fields and submit rendered `disabled`; no error. | → `redirecting` if signed in; → `idle` if signed out. |
| `redirecting` (already signed in) | Nothing but the shell (or a one-line "Taking you back…"). | `router.replace(next)` in an effect. |
| `idle` | Enabled form, mode toggle, no error. | Submit → `submitting`. |
| `submitting` | Submit button disabled and labelled "Signing in…" / "Creating account…"; fields disabled; a second submit is ignored (`if (isSubmitting) return`). | Success → redirect (or `confirm-email`); failure → `error`. |
| `error` | Enabled form with an inline error banner (same `AlertIcon` + cardinal text pattern as `AddSpotForm`'s `ErrorText`) above the fields. Fields keep their values, password field keeps its value too (do not clear it on a wrong-password error; the user usually fixes one character). | Any field change or mode toggle clears the banner. |
| `confirm-email` (only if the human left email confirmation ON — A3) | Replaces the form: "Check your inbox — we sent a confirmation link to `<email>`. Come back and sign in once you've confirmed." plus a "Back to sign in" toggle. | — |

Success for both modes: `router.replace(next)` per §1.2. Do **not** show a success toast; the redirect is the feedback.

### 2.3 Client-side validation before any network call

Added to `src/lib/validation.ts` (pure, unit-testable, mirrors what the server will reject anyway):

- `MIN_PASSWORD_LENGTH = 8`. Must match the dashboard "Minimum password length" (§5.5 item 2). Comment at the constant pointing there.
- `isValidEmail(value: string): boolean` — trimmed, non-empty, exactly one `@` with non-empty local and domain parts and at least one `.` in the domain. Deliberately loose; Supabase does the real check (`email_address_invalid`).
- `validateCredentials(email: string, password: string): { valid: true } | { valid: false; errors: { email?: string; password?: string } }` — same result shape as `validateNewSpot`. Email is trimmed and lower-cased before validation and before being sent (Supabase lower-cases anyway; doing it client-side avoids "User already registered" surprises for `Foo@x.com` vs `foo@x.com`). **Passwords are never trimmed or altered.**

Sign-in mode: only checks non-empty email/password (do not tell a signing-in user their existing password is "too short"). Sign-up mode: full check including `MIN_PASSWORD_LENGTH`.

### 2.4 Error mapping (`authErrorMessage(error, mode)` in `auth.ts`)

Keyed on `AuthError.code` first, then `status`, then a generic fallback. All codes verified present in the installed `@supabase/auth-js` `error-codes.d.ts`.

| `error.code` (or condition) | Copy shown | Notes |
|---|---|---|
| `invalid_credentials` | "Email or password is incorrect." | Same message for unknown email and wrong password — do not distinguish (enumeration). |
| `email_not_confirmed` | "Confirm your email first — check your inbox for the link." | Only reachable if confirmation was left on. |
| `user_already_exists`, `email_exists` | "That email already has an account. Sign in instead." | Render the mode toggle right under it. Only returned when email confirmation is OFF (A3). With it ON, Supabase returns an *obfuscated fake user* instead of an error — handled in §2.5. |
| `weak_password` | "Password must be at least 8 characters." (use `MIN_PASSWORD_LENGTH`), and if `error.reasons` is present and non-empty, append Supabase's own message. | `AuthWeakPasswordError.reasons: string[]`. |
| `validation_failed`, `email_address_invalid` | "Enter a valid email address." | |
| `email_address_not_authorized` | "Sign-ups from this email address aren't allowed right now." | Happens on free-tier projects using the default mailer when sending to non-team addresses *with confirmation on*. Another reason A3 turns confirmation off. |
| `signup_disabled` | "Sign-ups are closed right now." | |
| `over_request_rate_limit`, `over_email_send_rate_limit`, or `status === 429` | "Too many attempts. Wait a minute and try again." | Do not auto-retry. Disable the submit button for 30 s after this one (simple `setTimeout`; clear on unmount). |
| `TypeError` / network failure (no `status`) | "Couldn't reach the server. Check your connection and try again." | `fetch` rejection. |
| anything else | "Something went wrong. Please try again." + the raw `error.message` in a smaller line below it (portfolio app; surfacing the message beats hiding it). | |

### 2.5 Sign-up response handling (must handle both dashboard states)

After `signUp({ email, password })` resolves without `error`:

1. `data.session` non-null → signed in; redirect. (This is the expected path with confirmation OFF.)
2. `data.session === null` and `data.user` non-null → confirmation required → `confirm-email` state. This is also exactly what Supabase returns for an **already-registered email when confirmation is ON** (the "obfuscated user" — `data.user.identities` is an empty array in that case). The UI must not try to distinguish these; showing "check your inbox" for both is the anti-enumeration behavior Supabase intends. The builder may detect `identities?.length === 0` only to *log* it in dev, never to change copy.

`auth.ts`'s `signUp` normalizes this to `{ needsEmailConfirmation: boolean }` so the page never touches `data.user.identities`.

### 2.6 Sign-out and password reset

- **Sign-out** lives on `/settings` (a button in a "Account" section, §2.7). Calls `signOut()`; on resolve `router.replace('/')`. `signOut()` failures (network) are shown inline on the settings page; the local session is still cleared by GoTrue on `scope: 'local'` fallback — the builder should call `signOut({ scope: 'local' })` so a dead network never leaves a user stuck signed in on this device.
- **Password reset: deferred (D10).** Not on `/login`, not anywhere. The page shows no "Forgot password?" link — a link to a flow that does not exist is worse than none. Copy on the login page under the password field in sign-up mode: "Pick something you'll remember — password reset isn't available yet." What the later ticket needs, recorded so nobody rediscovers it: `resetPasswordForEmail(email, { redirectTo })`, a `/reset-password` route, `detectSessionInUrl: true`, handling the `PASSWORD_RECOVERY` event in `AuthProvider`, `updateUser({ password })`, the dashboard Redirect URL allow-list, and realistically a custom SMTP provider.

### 2.7 `/settings` rewrite (still `'use client'`, still `ClipboardShell`)

| State | Renders |
|---|---|
| `status === 'loading'` | Heading + a quiet "Loading your account…" line. Nothing interactive. |
| `signed-out` | Heading, one paragraph ("Sign in to set a nickname and see the spots you've confirmed."), a "Sign in" link to `/login?next=/settings`, the OpenStreetMap attribution, and the "Back home" link. **No redirect** — settings is not a gated action, it is just empty when signed out. |
| `signed-in` | Sections: **Account** (email shown read-only; "Sign out" button); **Nickname** (text input pre-filled from `user.nickname`, `maxLength={MAX_NICKNAME_LENGTH}`, save-on-blur exactly like today but calling `updateNickname(trimmed)`; inline saving/saved/error indicator; blur with an unchanged value is a no-op — no network call); **Your confirmations** ("You've confirmed N spots" from `fetchMyConfirmedSpotIds().size`, loaded in an effect after `signed-in`; on fetch failure show "—" not `0`); attribution; back link. |

Removed: the "Clear my local data" section and its `window.confirm` (there is no local data left to clear — D3). Removed: the copy "Zpots has no accounts -- everything here lives only on this device."

---

## 3. Gating mechanism

### 3.1 `page.tsx` — what it reads and passes down

- Calls `useAuth()` → `{ status, user }`.
- `confirmedSpotIds` state: starts as `new Set()`. Effect keyed on `status`/`user?.id`: when `signed-in`, `fetchMyConfirmedSpotIds()` → set; when `signed-out`, reset to empty (a sign-out must not leave the previous user's confirmed set on screen). After a successful `handleConfirmSpot`, add the id to the in-memory set (no refetch, no `localStorage`).
- `handleConfirmSpot(spotId)` calls `confirmSpot(spotId)` — one argument (D9). Remove the `getLocalConfirmerId` import.
- Passes to `MapView`: everything it does today plus `authStatus={status}` and `nickname={user?.nickname ?? ''}`.
- The initial `fetchSpots()` effect is unchanged and does **not** wait for auth — pins load for everyone immediately.

### 3.2 `MapView.tsx` / `SpotMap.tsx` — the gate

New props on both (MapView just forwards):
- `authStatus: AuthStatus` (`'loading' | 'signed-out' | 'signed-in'`). **Required** in the TS type. At runtime SpotMap treats `undefined` as `'signed-out'` (fail-closed) so the frozen static-render test `SpotMap.test.tsx`, which passes no such prop, still renders.
- `nickname?: string` → forwarded to `AddSpotForm` as `defaultNickname`.

New state in SpotMap: `gatedAction: 'add' | 'confirm' | 'report' | null` — non-null means the `SignInPrompt` overlay is open.

One private helper, used by all three entry points:

`function isGateOpen(): boolean` → `authStatus === 'signed-in'`.

| Entry point | Signed in | Signed out | Loading |
|---|---|---|---|
| FAB "Add a spot" click (`handleFabClick`) | Arms placement exactly as today. | Does **not** arm. Sets `gatedAction = 'add'`. | Treated as signed out (prompt opens). In practice `getSession()` resolves from `localStorage` in a few ms, long before a human can click; documented, not engineered around. |
| Map tap while armed | Opens the form as today. | Unreachable (never armed). | Unreachable. |
| `ConfirmButton` → `handleConfirm(spotId)` | Calls `onConfirmSpot` as today. | Sets `gatedAction = 'confirm'`; does not call `onConfirmSpot`. | Same as signed out. |
| `ReportButton` trigger | The report *form* opening is internal to `ReportButton` (frozen contract: trigger → form → `onReport`). Gate at `handleReport(...)`: signed in → `onReportSpot` as today. | `handleReport` sets `gatedAction = 'report'` and does not call `onReportSpot`; no "Reported — thanks" ack is shown. The user filled a two-field form for nothing — acceptable for MVP because the popup also shows a one-line hint (below). | Same as signed out. |
| Popup hint | none | Under the action row, small pewter text: "Sign in to confirm or report." (only when `authStatus !== 'signed-in'`). This is the cheap mitigation for the Report case above. | Same as signed out. |

The map itself, tiles, markers, popups, names, notes, status pills, and the FAB are all rendered regardless of auth (A1). Nothing is hidden when signed out; things are *intercepted*.

Sign-out while the add form is open (another tab): `authStatus` flips to `signed-out` → an effect closes placement mode and the form (`setIsPlacementArmed(false); setTappedLocation(null)`), same as Cancel. A submit that races this is caught by the repo throw (§6) and surfaces as the form's inline error.

### 3.3 `SignInPrompt` component

`src/components/SignInPrompt.tsx`, props: `{ action: 'add' | 'confirm' | 'report'; onDismiss: () => void }`. Rendered by SpotMap inside the same `OVERLAY_CLASS`/`CARD_CLASS` overlay the add form uses (z-index `1100`, above the FAB and banner), so it is visibly one system.

Copy by action — heading / body:
- `add`: "Sign in to add a spot" / "Pins are tied to an account so people can trust what's on the map."
- `confirm`: "Sign in to confirm" / "One confirmation per person — that's what makes Confirmed mean something."
- `report`: "Sign in to report" / "Reports are a signal for a human to look at, not an instant delete."

Controls: primary `Link` "Sign in" → `/login?next=/` (brass, same style as the FAB idle state); secondary `Link` "Create an account" → `/login?mode=signup&next=/`; tertiary text button "Not now" → `onDismiss`. `Escape` and clicking the dimmed backdrop also dismiss. Focus moves to the heading on open (`tabIndex={-1}` + `ref.focus()`), `role="dialog"` `aria-modal="true"` `aria-labelledby` the heading. Custom `SignInIcon` next to the heading; no emoji, no icon pack.

Why a prompt and not an immediate redirect (D7): the user is mid-gesture on a map; yanking them to a form with no explanation reads as a bug. The prompt says what and why in one sentence and offers the exit. It costs one 60-line component.

### 3.4 `AddSpotForm` — additive prop only

`defaultNickname?: string` → `useState(defaultNickname ?? '')` for the nickname field. Everything else (validation, `onSubmit` shape, labels) unchanged, so `AddSpotForm.test.tsx` stays green untouched. The form still lets the user edit/blank the nickname per pin; what they type is what goes into `spots.nickname` for that pin (snapshot, as today). Do not add an "update my account nickname" side effect here.

### 3.5 `ClipboardShell` header

Add a small text `Link` "Sign in" → `/login` left of the compass button when `useAuth().status === 'signed-out'`; render nothing extra when `loading` or `signed-in` (the compass already leads to settings, where sign-out lives). Same typographic treatment as the "Mindanao, charted by locals" eyebrow (uppercase tracked Work Sans), navy. `ClipboardShell` becomes `'use client'`; it has no server-only behavior and is only rendered from client pages, so this is a zero-cost boundary move. It must still render deterministically during SSR (`loading` → nothing extra), so no hydration mismatch.

---

## 4. Identity model — the core of the migration

### 4.1 `confirmations.confirmer_id` becomes `auth.uid()` (D2)

**Recommendation: yes.** Column becomes `uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`; the composite `PRIMARY KEY (spot_id, confirmer_id)` is kept unchanged. The INSERT policy adds `WITH CHECK (confirmer_id = auth.uid())`.

What this buys, concretely: today the uniqueness guarantee is "one vote per random string the browser chose", which any `localStorage.clear()` or a `curl` with a fresh string defeats. After: the value that must be unique is the `sub` claim of a JWT Supabase signed, and the policy makes it impossible to insert any other value. Two confirmations of one spot now really are two accounts. It also means an account deleted in the dashboard cascades its votes away and the existing `AFTER DELETE` trigger recounts (a spot can legitimately fall back to Unconfirmed).

Exact steps the SQL performs, in order (§5 has the code):
1. Guarded by "is the column still `text`?" so the block is idempotent and never runs against real data twice: `DELETE FROM public.confirmations` (not `TRUNCATE` — a per-row `DELETE` fires `confirmations_touch_spot`, which recounts every affected spot to its now-true value of 0 and flips its `status` back to `unconfirmed`; `TRUNCATE` skips row triggers and would leave `spots.confirmations` stale). Then drop the text-shape CHECK `confirmations_confirmer_id_shape` (it calls `char_length` and would make the type change fail), then `ALTER COLUMN confirmer_id TYPE uuid USING confirmer_id::uuid` on the now-empty table.
2. `SET DEFAULT auth.uid()` — belt and braces; the client still sends the value explicitly (§6.3) and the policy verifies it.
3. Add the FK to `auth.users(id) ON DELETE CASCADE` if not already present.

Why delete rather than migrate: the rows are random-string identities with no user to map to. There is nothing to migrate them *to*. Anyone who confirmed anonymously before today loses that vote; the spots those votes had flipped to Confirmed go back to Unconfirmed until two accounts confirm them. This is stated in `learnings.md` and the README, not hidden. (Only a handful of dev-test rows exist — A6.)

### 4.2 `getLocalConfirmerId()` / `local-identity.ts` — deleted, not kept as a fallback (D3)

Deleted outright, together with `confirmed-spots-storage.ts`, `nickname-storage.ts`, and `local-data-reset.ts`, and their tests.

Why no fallback: a fallback identity is exactly the spoofable path this migration exists to close. There is no code path left that can write without a session (§5 revokes it at the grant level), so a local id has nothing to be a fallback *for*. Keeping the module "just in case" would leave an import target that the next agent reaches for.

`confirmedByMe` (the `ConfirmButton` disabled state) is now served by the database: `authenticated` gets `SELECT` on `confirmations` with `USING (confirmer_id = auth.uid())` — each user can read only their own rows. `fetchMyConfirmedSpotIds()` (§6.3) is one `select('spot_id')` on load. This fixes a real bug in the local approach (confirm on the phone, laptop still shows an enabled button, tap → silent `23505` no-op) and removes a whole storage module. Flag F9 from the original spec ("would expose every confirmer id publicly") no longer applies because the policy scopes rows to the caller, and `anon` gets no SELECT at all.

Legacy `localStorage` keys `zpots:confirmer-id`, `zpots:confirmed-spots`, `zpots:nickname` are harmless if left behind, but `auth.ts` exports `purgeLegacyLocalData()` (three `removeItem` calls in a `try/catch`) which `AuthProvider` calls once on mount. The three literals live only there, with a comment naming the modules they came from.

### 4.3 Nickname → `user_metadata.nickname` (D5)

**Recommendation: `auth.updateUser({ data: { nickname } })`, read back as `user.user_metadata?.nickname`.** No `profiles` table.

| | `user_metadata` (chosen) | `public.profiles` table |
|---|---|---|
| Schema added | None. | Table, RLS (own-row select/update, public select of nickname), a trigger on `auth.users` insert to create the row, grants. |
| Who can write it | The user themself, any value (it is user-controlled by design). | Same, via policy. |
| Queryable / joinable | No. Cannot render "by X" from a live profile; cannot list a user's spots by nickname. | Yes. |
| Fits current product | Yes: the nickname is already a **snapshot copied into `spots.nickname` at creation**, and `product.md` says it is cosmetic and never a verified identity. Nothing reads it from anywhere but the user's own session. | Over-serves: nothing in the 5 MVP items needs a profile row. |
| Reversibility | Trivial: a later `profiles` migration can backfill from `raw_user_meta_data->>'nickname'` in one statement. | — |

Given the project's own rule (`CLAUDE.md`: "build these 5 things, nothing else"; global: "Don't overbuild"), `user_metadata` is the right call. The stated tradeoff you accept: changing your nickname later does not retro-edit old pins (already true today with `localStorage`), and there is no server-side length check on the metadata value itself — but `spots.nickname` still has its 40-char CHECK, and `updateNickname()` validates against `MAX_NICKNAME_LENGTH` before calling Supabase, so a hand-edited 500-char metadata value only ever produces a client-side validation error at pin time, never a DB error.

**Default nickname before the user sets one: blank** (`''`, rendered as an empty input; pins get `nickname: null`, so no "by …" byline). Not the email prefix: that would publish a fragment of the email on every pin the user ever adds, silently, which violates "never present a nickname as an identity" in spirit and is the kind of default people do not notice until it is on a map.

### 4.4 `spots.created_by` and `reports.reported_by` — add both, DB-populated only (D4)

The security question first: **does any policy need to know *which* authenticated user?** For `confirmations`, yes (4.1). For `spots` and `reports` inserts, no — `TO authenticated` + `is_real_user()` (§5) is sufficient to enforce "must be logged in"; nothing in scope lets a user edit or delete their own rows, so no ownership predicate is required.

So why add the columns at all: **accountability is the only thing "log in before you add/report" actually delivers to the human running this.** Without `created_by`, a moderator who receives a spam report has no way to find which account posted the spot; the login gate would then be pure friction with no payoff. That is a concrete, present-tense reason, not future-proofing.

The minimal shape that gets that without touching the client:
- `spots.created_by uuid NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL`.
- `reports.reported_by uuid NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL`.
- Neither column is in the INSERT column grant → the client **cannot** send them (a payload containing one fails `42501`), the default fills them, and the INSERT policies assert `created_by = auth.uid()` / `reported_by = auth.uid()` so they fail closed if someone later widens the grant.
- Nullable so pre-existing rows keep working and `ON DELETE SET NULL` keeps the content when an account is removed.
- **No repo payload changes** (§6 payload key lists are unchanged).
- `reports` additionally gets `UNIQUE (spot_id, reported_by)` → one report per account per spot. The repo treats `23505` on a report as "already reported, fine" (idempotent, resolves `void`). Rationale: it is the cheapest possible abuse brake and mirrors the confirmations model; the one behavior it removes (re-reporting the same spot with a different reason) is not a use case anyone asked for. If the human dislikes it, deleting one `CREATE UNIQUE INDEX` line and the `23505` branch restores the old behavior — called out so it is an easy reversal, not a buried decision.

What is publicly readable as a consequence: `spots.created_by` (a uuid) via the existing `select('*')`. It maps to nothing an anonymous visitor can resolve — `auth.users` is not readable — and is the same identifier a future `profiles` table would expose on purpose. Excluding it would require a column-level SELECT grant, which makes PostgREST's `select=*` fail `42501` and forces an explicit column list in `fetchSpots` for every future column: not worth it. `reports` is not readable by browser roles at all, so `reported_by` is private to the dashboard.

### 4.5 Privilege matrix (replaces §2.3 of the original spec)

| Table / resource | `anon` | `authenticated` |
|---|---|---|
| `public.spots` SELECT | all rows, all columns (`spots_select_all`, `USING true`) | same |
| `public.spots` INSERT | **no grant, no policy** | columns `id,name,note,lat,lng,nickname,photo_url,status,confirmations`; policy `WITH CHECK (is_real_user() AND status='unconfirmed' AND confirmations=0 AND created_by = auth.uid())` |
| `public.spots` UPDATE | **no grant, no policy** | columns `confirmations,status`; policy `USING (is_real_user()) WITH CHECK (<recomputed values>)` (unchanged logic from 0001) |
| `public.spots` DELETE | no | no |
| `public.confirmations` SELECT | no | own rows only: `USING (confirmer_id = auth.uid())` |
| `public.confirmations` INSERT | no | columns `spot_id,confirmer_id`; `WITH CHECK (is_real_user() AND confirmer_id = auth.uid())`; PK rejects duplicates `23505` |
| `public.confirmations` UPDATE/DELETE | no | no |
| `public.reports` SELECT | no | no |
| `public.reports` INSERT | no | columns `spot_id,reason,details`; `WITH CHECK (is_real_user() AND reported_by = auth.uid())`; unique index rejects a repeat `23505` |
| `public.reports` UPDATE/DELETE | no | no |
| `storage.objects` (bucket `spot-photos`) INSERT | **no policy** (dropped and recreated `TO authenticated`) | `WITH CHECK (is_real_user() AND bucket_id='spot-photos' AND name ~ '<uuid>.(jpg\|png\|webp\|gif)')` |
| `storage.objects` SELECT/UPDATE/DELETE | none (public bucket reads bypass RLS; listing blocked) | none |
| Functions `confirmation_threshold()`, `spot_confirmation_count(uuid)`, `is_real_user()` | EXECUTE | EXECUTE |

`is_real_user()` = `auth.uid() IS NOT NULL AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false)`. It exists so that Supabase's anonymous-sign-in feature (which issues `authenticated`-role JWTs) can never satisfy a write policy even if someone flips that toggle on (A7).

The service role is never referenced, granted, or narrowed. It keeps Supabase defaults and is not for any agent or app-side use.

---

## 5. The SQL — paste this whole block into Supabase Dashboard → SQL Editor → Run

Idempotent (safe to re-run). Runs as the dashboard's `postgres` role. Requires `0001_init.sql` to have been run already (it alters those tables). No secrets, keys, or passwords are involved. The builder copies this verbatim to `supabase/migrations/0002_auth.sql`.

```sql
-- ============================================================================
-- Zpots — schema v2: required login for writes
-- Run AFTER 0001_init.sql. Safe to re-run.
--
-- What changes:
--   * confirmations.confirmer_id: text (browser-random) -> uuid FK auth.users
--     Existing rows are dev-test data with no user to map to; they are deleted.
--   * spots.created_by / reports.reported_by: DB-filled from auth.uid(), never
--     sent by the client. reports gets one-report-per-user-per-spot.
--   * anon loses every INSERT/UPDATE grant and policy (keeps SELECT on spots).
--   * authenticated keeps the same column-level grants, now with policies keyed
--     on auth.uid(), plus SELECT of its OWN confirmations rows.
--   * storage insert policy re-issued TO authenticated only.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1. Helper: a real, non-anonymous signed-in user.
--    Supabase's optional "anonymous sign-ins" mint authenticated-role JWTs with
--    is_anonymous=true; this keeps them out of every write policy even if that
--    toggle is ever enabled by accident.
-- ----------------------------------------------------------------------------
create or replace function public.is_real_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

comment on function public.is_real_user() is
  'True only for a JWT with a sub claim and is_anonymous != true. Used by every write policy.';

grant execute on function public.is_real_user() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. confirmations.confirmer_id: text -> uuid referencing auth.users.
--    Guarded so it runs exactly once (only while the column is still text).
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'confirmations'
       and column_name  = 'confirmer_id'
       and data_type    = 'text'
  ) then
    -- Dev-test rows from the anonymous era. DELETE (not TRUNCATE) so the
    -- AFTER DELETE trigger confirmations_touch_spot recounts every affected
    -- spot back to 0 / 'unconfirmed'. TRUNCATE would skip row triggers and
    -- leave spots.confirmations stale.
    delete from public.confirmations;

    -- The text-shape CHECK calls char_length(); it must go before the type change.
    alter table public.confirmations
      drop constraint if exists confirmations_confirmer_id_shape;

    alter table public.confirmations
      alter column confirmer_id type uuid using confirmer_id::uuid;
  end if;
end
$$;

alter table public.confirmations
  alter column confirmer_id set default auth.uid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'confirmations_confirmer_id_fkey'
       and conrelid = 'public.confirmations'::regclass
  ) then
    alter table public.confirmations
      add constraint confirmations_confirmer_id_fkey
      foreign key (confirmer_id) references auth.users (id) on delete cascade;
  end if;
end
$$;

comment on table public.confirmations is
  'One row per (spot, auth user). PK makes a repeat confirmation a 23505 no-op. confirmer_id is auth.uid(), enforced by policy.';
comment on column public.confirmations.confirmer_id is
  'auth.users.id of the confirmer. Client sends it explicitly; policy requires it to equal auth.uid().';

-- ----------------------------------------------------------------------------
-- 3. Accountability columns. Filled by DEFAULT, never in any INSERT grant, so
--    the browser cannot set them; policies below assert they equal auth.uid().
-- ----------------------------------------------------------------------------
alter table public.spots
  add column if not exists created_by uuid
    default auth.uid()
    references auth.users (id) on delete set null;

alter table public.reports
  add column if not exists reported_by uuid
    default auth.uid()
    references auth.users (id) on delete set null;

comment on column public.spots.created_by is
  'auth.users.id of the account that added the pin. DB default; not client-settable. Publicly readable as a bare uuid.';
comment on column public.reports.reported_by is
  'auth.users.id of the reporter. DB default; not client-settable. Not readable by browser roles.';

-- One report per account per spot. NULLs (legacy rows) do not collide.
create unique index if not exists reports_one_per_user_per_spot
  on public.reports (spot_id, reported_by);

-- ----------------------------------------------------------------------------
-- 4. Privileges: anon reads spots and nothing else. authenticated writes with
--    the same column-level grants as before, plus reads its own confirmations.
-- ----------------------------------------------------------------------------
revoke all on table public.spots         from anon, authenticated;
revoke all on table public.confirmations from anon, authenticated;
revoke all on table public.reports       from anon, authenticated;

grant select on table public.spots to anon, authenticated;

grant insert (id, name, note, lat, lng, nickname, photo_url, status, confirmations)
  on table public.spots to authenticated;
grant update (confirmations, status)
  on table public.spots to authenticated;

grant select on table public.confirmations to authenticated;
grant insert (spot_id, confirmer_id)
  on table public.confirmations to authenticated;

grant insert (spot_id, reason, details)
  on table public.reports to authenticated;

-- No DELETE anywhere. No UPDATE on confirmations/reports. No SELECT on reports.
-- created_by / reported_by are deliberately absent from every INSERT grant.

-- ----------------------------------------------------------------------------
-- 5. Row Level Security (already enabled by 0001; re-asserted for safety).
-- ----------------------------------------------------------------------------
alter table public.spots         enable row level security;
alter table public.confirmations enable row level security;
alter table public.reports       enable row level security;

-- spots: everyone reads everything (unchanged).
drop policy if exists spots_select_all on public.spots;
create policy spots_select_all on public.spots
  for select to anon, authenticated
  using (true);

-- spots: only a real signed-in user may add a pin; it must start Unconfirmed
-- with zero confirmations and be attributed to the caller.
drop policy if exists spots_insert_new_unconfirmed on public.spots;
create policy spots_insert_new_unconfirmed on public.spots
  for insert to authenticated
  with check (
    public.is_real_user()
    and status = 'unconfirmed'
    and confirmations = 0
    and created_by = auth.uid()
  );

-- spots: the recompute-only UPDATE (column grants + BEFORE trigger + this
-- WITH CHECK; see 0001 section 2.2) is now limited to signed-in users.
drop policy if exists spots_update_recompute_only on public.spots;
create policy spots_update_recompute_only on public.spots
  for update to authenticated
  using (public.is_real_user())
  with check (
    confirmations = public.spot_confirmation_count(id)
    and status = case
                   when confirmations >= public.confirmation_threshold() then 'confirmed'
                   else 'unconfirmed'
                 end
  );

-- confirmations: a user may read only their own rows (feeds "you confirmed
-- this spot" in the UI) and may insert only as themself.
drop policy if exists confirmations_insert_any on public.confirmations;
drop policy if exists confirmations_insert_own on public.confirmations;
create policy confirmations_insert_own on public.confirmations
  for insert to authenticated
  with check (public.is_real_user() and confirmer_id = auth.uid());

drop policy if exists confirmations_select_own on public.confirmations;
create policy confirmations_select_own on public.confirmations
  for select to authenticated
  using (confirmer_id = auth.uid());

-- reports: insert-only, attributed to the caller.
drop policy if exists reports_insert_any on public.reports;
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (public.is_real_user() and reported_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. Storage: uploads now require a real signed-in user. Bucket settings and
--    the uuid-name rule are unchanged from 0001.
-- ----------------------------------------------------------------------------
drop policy if exists spot_photos_insert_uuid_named_images on storage.objects;
create policy spot_photos_insert_uuid_named_images on storage.objects
  for insert to authenticated
  with check (
    public.is_real_user()
    and bucket_id = 'spot-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$'
  );

-- ----------------------------------------------------------------------------
-- 7. Make PostgREST pick up the new grants/columns immediately.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- OPTIONAL, run separately if wanted: remove the leftover anonymous-era test
-- spot noted in learnings.md. Cascades to its reports. Its photo object in the
-- bucket must be deleted by hand in Dashboard -> Storage.
-- ----------------------------------------------------------------------------
-- delete from public.spots where name = 'zzz-integration-test-delete-me';
```

### 5.1 Verification (run separately, after the script; read-only unless noted)

```sql
-- Column types and defaults
select table_name, column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (('confirmations','confirmer_id'),('spots','created_by'),('reports','reported_by'))
 order by 1,2;
-- expect: uuid / uuid / uuid, each with column_default = auth.uid()

-- Policies: expect exactly these 6 public rows + 1 storage row
select schemaname, tablename, policyname, cmd, roles
  from pg_policies
 where (schemaname = 'public' and tablename in ('spots','confirmations','reports'))
    or (schemaname = 'storage' and policyname = 'spot_photos_insert_uuid_named_images')
 order by 1,2,3;
-- spots: spots_select_all {anon,authenticated} | spots_insert_new_unconfirmed {authenticated} | spots_update_recompute_only {authenticated}
-- confirmations: confirmations_insert_own {authenticated} | confirmations_select_own {authenticated}
-- reports: reports_insert_own {authenticated}
-- storage: spot_photos_insert_uuid_named_images {authenticated}

-- Grants: anon must have ONLY select on spots
select grantee, table_name, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public' and grantee in ('anon','authenticated')
   and table_name in ('spots','confirmations','reports')
 order by 1,2,3,4;
-- anon rows: only (spots, SELECT, <every column>). No INSERT/UPDATE rows for anon at all.
-- authenticated: no row with column_name created_by or reported_by under INSERT.

-- All confirmations are gone and spots were recounted
select count(*) from public.confirmations;                              -- 0
select count(*) from public.spots where confirmations <> 0 or status <> 'unconfirmed';  -- 0

-- Simulate anon (everything rolls back)
begin;
set local role anon;
select count(*) from public.spots;                                       -- OK
-- each of these must FAIL with 42501:
-- insert into public.spots (id,name,note,lat,lng,photo_url,status,confirmations) values (gen_random_uuid(),'x','x',0,0,'https://a.supabase.co/storage/v1/object/public/spot-photos/00000000-0000-4000-8000-000000000000.jpg','unconfirmed',0);
-- insert into public.confirmations (spot_id, confirmer_id) values (gen_random_uuid(), gen_random_uuid());
-- insert into public.reports (spot_id, reason) values (gen_random_uuid(), 'spam');
-- select * from public.confirmations;
rollback;
```

Simulating `authenticated` from the SQL editor requires a real `auth.users` row (the FK). Do it **through the app** instead, after the builder finishes: create an account via `/login`, add a pin, confirm it from two different accounts, confirm it a third time from one of them (should be a no-op), report it twice from one account (second is a no-op). Then in the editor: `select id, created_by, confirmations, status from public.spots order by created_at desc limit 3;` and `select * from public.reports order by created_at desc limit 3;` — `created_by`/`reported_by` must be populated with the accounts' uuids (visible under Authentication → Users). This doubles as the check that a policy `WITH CHECK` may reference `reported_by` even though `authenticated` has no SELECT grant on `reports` (Postgres does not apply column privileges to policy expressions; if this ever errors with `42501` on the reports insert, the fix is `grant select (reported_by) on public.reports to authenticated`, not dropping the check).

### 5.2 Not SQL — the human does these in the Supabase dashboard

Nothing below is assumed done. Each is a checkbox in §10.

| # | Where | Setting | Value | Why |
|---|---|---|---|---|
| 1 | Authentication → Providers → Email | **Confirm email** | **OFF** | A3. The default mailer is rate-limited to a few emails per hour and, on free-tier projects, may only deliver to team-member addresses; with it ON, real sign-ups stall. `signUp()` then returns a session immediately. If left ON, the UI's `confirm-email` state (§2.5) handles it, but expect delivery failures. |
| 2 | Authentication → Providers → Email (password section) / Sign In & Providers | **Minimum password length** | **8** | Must equal `MIN_PASSWORD_LENGTH` in `validation.ts`. Leave "required characters" at the default (none) — the client copy promises only a length. |
| 3 | Authentication → Providers → Email | **Enable Email provider** | ON (default) | Sanity check. |
| 4 | Authentication → Sign In & Providers (or Providers → Anonymous) | **Allow anonymous sign-ins** | **OFF** (default) | A7. `is_real_user()` defends against it anyway; keep both. |
| 5 | Authentication → URL Configuration | **Site URL** | The deployed Vercel URL (or `http://localhost:3000` while local) | Only matters for emailed links (none in this pass) but Supabase warns if unset. Add `http://localhost:3000/**` to Redirect URLs for the later reset-password ticket. |
| 6 | Authentication → Rate Limits | (read only) | Note the defaults | The UI maps `429`/`over_request_rate_limit` to a friendly message and backs off 30 s. No change needed; know the numbers before demoing sign-up to a room. |
| 7 | Authentication → Users | (verify after first sign-up) | New user appears | Confirms the provider works end-to-end before testing pins. |

Nothing in this table touches keys, secrets, or the service role.

---

## 6. Repo-layer contract (signatures and behavior; no implementations)

Conventions carried over from the original spec: obtain the client via `getSupabaseClient()` **at call time** (tests mock that module); reject with `Error(message, { cause })`; no custom error class hierarchy. One addition: the auth-required failure is identified by a marker on `cause` so UI code can branch on it without string-matching messages.

### 6.1 `src/lib/auth.ts` (new; pure module, no React)

```ts
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

/** The only shape the rest of the app ever sees. Never leak supabase's `User`. */
export interface AuthUser {
  id: string;             // auth.users.id — what confirmer_id / created_by hold
  email: string | null;   // display only (settings page)
  nickname: string;       // user_metadata.nickname, '' when unset/invalid
}

export const AUTH_REQUIRED_CODE = 'auth_required' as const;
export const AUTH_REQUIRED_MESSAGE = 'Sign in to continue.';

/** Maps a supabase User → AuthUser. nickname: trimmed string ≤ MAX_NICKNAME_LENGTH, else ''. */
export function toAuthUser(user: import('@supabase/supabase-js').User): AuthUser;

/** Local session read (no network). null when signed out. */
export async function getSession(): Promise<import('@supabase/supabase-js').Session | null>;

/** Convenience: toAuthUser(session.user) or null. */
export async function getCurrentUser(): Promise<AuthUser | null>;

/**
 * The uid for a write. Throws Error(AUTH_REQUIRED_MESSAGE, { cause: { code: AUTH_REQUIRED_CODE } })
 * when there is no session. Every repo write calls this FIRST, before any storage/network call.
 */
export async function requireUserId(): Promise<string>;

/** true iff `error` is the throw above (checks cause.code === AUTH_REQUIRED_CODE). */
export function isAuthRequiredError(error: unknown): boolean;

/** Rejects with the raw supabase AuthError (page maps it via authErrorMessage). */
export async function signUp(email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
export async function signIn(email: string, password: string): Promise<void>;
/** Always clears the local session even if the network call fails ({ scope: 'local' } fallback). */
export async function signOut(): Promise<void>;

/** Wraps onAuthStateChange; callback gets the mapped user or null. Returns unsubscribe. */
export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void;

/** Validates against MAX_NICKNAME_LENGTH (throws on >), trims, calls auth.updateUser({ data: { nickname } }). '' clears it. */
export async function updateNickname(nickname: string): Promise<AuthUser>;

/** §2.4 table. mode affects only the user_already_exists copy. Never returns ''. */
export function authErrorMessage(error: unknown, mode: 'signin' | 'signup'): string;

/** Removes zpots:confirmer-id, zpots:confirmed-spots, zpots:nickname. Never throws. */
export function purgeLegacyLocalData(): void;
```

Rules:
- `signIn`/`signUp` trim + lower-case the email, never touch the password.
- `signUp` returns `needsEmailConfirmation: data.session === null` (covers both the real confirmation case and the obfuscated-existing-user case — §2.5).
- `subscribeToAuth` must map `SIGNED_OUT` → `null` and every other event with a session → `toAuthUser(session.user)`; events with `session === null` other than `INITIAL_SESSION` → `null`.
- `toAuthUser` is where an over-long or non-string metadata nickname is normalized to `''` — nowhere else.
- No function in this module reads `localStorage` directly except `purgeLegacyLocalData` (GoTrue owns the session storage).

### 6.2 `src/components/AuthProvider.tsx` (new; `'use client'`)

```ts
export interface AuthContextValue { status: AuthStatus; user: AuthUser | null; signOut: () => Promise<void>; }
export default function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element;
export function useAuth(): AuthContextValue;   // throws if used outside the provider
```

- Initial state `{ status: 'loading', user: null }` on both server and client.
- Effect on mount: `purgeLegacyLocalData()`; `getSession()` → set state; then `subscribeToAuth(...)` → set state on every change; cleanup unsubscribes. Guard against the effect's async resolution landing after unmount (`isMounted` flag, same pattern as `page.tsx`'s fetch).
- Mounted once in `layout.tsx` around `{children}`. `layout.tsx` stays a server component; a client provider as a child is the standard pattern.

### 6.3 `src/lib/spots-repo.ts` — per function

**`fetchSpots(): Promise<Spot[]>`** — unchanged. Works signed in or out. `toSpot` ignores `created_by` (not added to `Spot`; nothing renders it).

**`createSpot(input: NewSpotInput): Promise<Spot>`** — signature unchanged.
1. `validateNewSpot(input)`; invalid → throw (unchanged).
2. **New step:** `await requireUserId()` — throws before `getSupabaseClient()` is even called when signed out. This is what prevents an orphaned photo upload from a signed-out submit; without it the upload would 403 at the bucket anyway, but the order matters for the "never touches storage when signed out" test.
3. Upload → public URL → insert with **exactly the same nine payload keys as before** (`id,name,note,lat,lng,nickname,photo_url,status,confirmations`). Do **not** add `created_by`; the DB fills it and the grant would reject it.
4. Error mapping (new): a Postgres `42501` or PostgREST `401` on the insert/upload (expired session that autoRefresh could not save) → rethrow as `Error('Your session expired. Sign in again to add this spot.', { cause })`. Everything else unchanged.

**`confirmSpot(spotId: string): Promise<Spot>`** — **signature change (D9): the `confirmerId` parameter is removed.** Passing a second argument is a TS error.
1. `const userId = await requireUserId()` — first, before any query.
2. Read the spot (`select('*').eq('id', spotId).single()`) — unchanged.
3. Insert `{ spot_id: spotId, confirmer_id: userId }` — still exactly two keys. The policy checks `confirmer_id = auth.uid()`; sending it explicitly (rather than relying on the DB default) keeps the payload self-describing and keeps the test fake's two-shared-values duplicate detection meaningful if a later test pass keeps that fake.
4. `23505` → duplicate → return current row without the update (unchanged). `42501` here means either "not signed in" or "confirmer_id != auth.uid()" — rethrow as the session-expired message above; it is never a duplicate.
5. Optimistic recompute + guarded `update({ confirmations, status })` — unchanged (F1 from the original spec still stands: switching to an RPC and revoking UPDATE is still the cleaner long-term design and still out of scope here).

**`reportSpot(spotId: string, reason: string, details?: string): Promise<void>`** — signature unchanged.
1. `isValidReportReason` check before anything (unchanged; the "no `from` call for a bad reason" test also implies no `requireUserId` call before validation — keep validation first, then `requireUserId`, then the client).
2. `await requireUserId()`.
3. Insert exactly `{ spot_id, reason, details }` (unchanged; no `reported_by`).
4. **New:** `error.code === '23505'` (unique `(spot_id, reported_by)`) → resolve `void` — already reported, idempotent. `42501` → session-expired rethrow. Other errors → throw (unchanged).

**`fetchMyConfirmedSpotIds(): Promise<Set<string>>`** — new.
1. `const user = await getCurrentUser()`; if `null` → resolve `new Set()` **without** calling `getSupabaseClient()` (signed-out visitors must not generate a query that would 401).
2. `client.from('confirmations').select('spot_id')` — awaited directly, nothing chained. RLS scopes rows to the caller; do not add `.eq('confirmer_id', user.id)` (redundant, and it would put a uid in a URL the browser logs).
3. `error` → throw; else `new Set(rows.map(r => r.spot_id))`.

What "called with no session" means after this: every write throws the `auth_required` error synchronously-early (before any network), and `SpotMap` never calls the write handlers when `authStatus !== 'signed-in'` (§3.2), so in the running app this throw is reachable only through a race (session lost between click and call, e.g. sign-out in another tab). It is defense in depth, not the primary gate — but it is the *only* gate a unit test can see, so it is specified precisely.

### 6.4 Constants that must stay in sync (adds one row to the original §5.7 table)

| Fact | TS | Server side |
|---|---|---|
| Minimum password length | `MIN_PASSWORD_LENGTH = 8` (`validation.ts`) | Dashboard → Auth → minimum password length = 8 (§5.2 #2) — **not** SQL |
| Nickname max | `MAX_NICKNAME_LENGTH = 40` (unchanged) | `spots_nickname_len` CHECK (unchanged) + `updateNickname()` client check |

---

## 7. What breaks and what stays — every test file, itemized

Legend: **Valid** = passes unmodified and still tests a real contract. **Extend** = keep the file, add/adjust a small amount. **Replace** = the contract it encodes no longer exists; a later test-writing pass rewrites it (tests red first, per project rules). **Delete** = the module under test is gone.

| File | Verdict | Why / what specifically |
|---|---|---|
| `spots-repo.test.ts` | **Extend + partially Replace** | The whole file mocks only `@/lib/supabase`; once the repo imports `@/lib/auth`, every write test needs `vi.mock('@/lib/auth', ...)` with `requireUserId` → `'user-uuid'` and `getCurrentUser` → a fake user, or `requireUserId` will call the (mock) client's missing `.auth` and blow up. The `fetchSpots` describe stays valid as-is. The `createSpot` describe stays valid once the auth mock exists; **add**: "signed out → rejects and never calls `storage.from`". The `confirmSpot` describe tests `confirmSpot('spot-1', 'confirmer-a')` — that signature is gone (D9); **replace** the four tests with ones that vary the mocked `requireUserId` return value instead of the second argument (the `createFakeSupabase` fake can be reused verbatim: two different uids share only `spot_id`, the same uid twice shares both → `23505`). The `reportSpot` describe stays valid; **add**: `23505` resolves, signed-out rejects before `from`. **Add** a `fetchMyConfirmedSpotIds` describe: signed out → empty set, no client call; signed in → set of `spot_id`s; error → rejects. |
| `local-identity.test.ts` | **Delete** | Module deleted (D3). |
| `confirmed-spots-storage.test.ts` | **Delete** | Module deleted (D3). |
| `nickname-storage.test.ts` | **Delete** | Module deleted (D5). |
| `local-data-reset.test.ts` | **Delete** | Module deleted (D3). |
| `page.test.tsx` | **Replace** | Mocks `@/lib/local-identity` and `@/lib/confirmed-spots-storage` (both gone — `vi.mock` of a non-existent path still errors on import from `page.tsx`? No: `page.tsx` no longer imports them, so the stale mocks are merely dead, but) the assertion `confirmSpot` called with `("spot-1", "confirmer-abc123")` is false under D9, and `Home` now requires an `AuthProvider` (or a mocked `useAuth`). New file must: mock `@/components/AuthProvider`'s `useAuth` to return each of the three statuses; assert `fetchSpots` runs regardless of status; assert `fetchMyConfirmedSpotIds` runs only when signed in and its result reaches `MapView`; assert `confirmSpot` is called with exactly one arg; assert `authStatus` and `nickname` props reach `MapView`; assert the confirmed-id set is emptied on sign-out. |
| `settings-page.test.tsx` | **Replace** | Mocks `nickname-storage`, `confirmed-spots-storage`, `local-data-reset` (all gone); asserts a "clear local data" button and `window.confirm` (both removed). New file: three auth states render as §2.7; nickname blur → `updateNickname('Ate Joy')` (keep the save-on-blur model); unchanged blur → no call; sign out → `signOut` then navigation to `/`; confirmations count from mocked `fetchMyConfirmedSpotIds`; back-home link and OSM credit assertions carry over verbatim. |
| `SpotMap.test.tsx` | **Valid** | Static rendering only, never clicks a gated control. Its `MapContainer` mock ignores unknown props. `authStatus` is absent → fail-closed default → still renders markers/popups. The learnings note about this mock's `{ MapContainer, TileLayer, Marker, Popup }`-only exports still applies: `SpotMap` must not import any other `react-leaflet` name. |
| `SpotMap.wiring.test.tsx` | **Extend** | `baseProps()` gains `authStatus: 'signed-in' as const` (one line) and every existing assertion holds. **Add** a `"SpotMap -- auth gating"` describe: signed-out FAB click shows the prompt and does not arm / does not show "Tap the map"; signed-out Confirm click opens the prompt and `onConfirmSpot` is not called; signed-out Report submit opens the prompt and `onReportSpot` is not called and no "Reported" ack; prompt's "Sign in" link href is `/login?next=/`; "Not now" closes it; `loading` behaves like signed-out; `defaultNickname` reaches the form's nickname input. |
| `SpotMap.mindanao.test.tsx`, `SpotMap.mindanao.real-leaflet.test.ts` | **Valid** | Bounds/zoom only; no gated interaction. |
| `AddSpotForm.test.tsx` | **Valid + optional Extend** | `defaultNickname` is optional; all current tests omit it. Add one test: `defaultNickname="Kuya Ben"` pre-fills the nickname input and the submitted input carries it. |
| `ConfirmButton.test.tsx` | **Valid** | Component untouched. Gating lives in the caller. |
| `ReportButton.test.tsx` | **Valid** | Component untouched. |
| `validation.test.ts` | **Extend** | Add describes for `MIN_PASSWORD_LENGTH === 8`, `isValidEmail` (accept `a@b.co`, `A@B.CO` after lower-casing in `validateCredentials`; reject `''`, `a`, `a@`, `@b.co`, `a@b`, `a b@c.co`), and `validateCredentials` in both modes (sign-in does not enforce length; sign-up does; both report all errors at once; password with surrounding spaces is passed through untrimmed). |
| `supabase.test.ts` | **Valid + optional Extend** | Asserts truthiness, singleton, env throws — all unchanged. Optional: spy on `createClient` and assert `auth.persistSession === true`. Watch for a jsdom `navigator.locks` warning (§1.3). |
| `spots.test.ts`, `map-config.test.ts`, `map-config.mindanao.test.ts`, `smoke.test.tsx` | **Valid** | Untouched modules. |
| **New** `auth.test.ts` | — | Mock `@/lib/supabase` with a fake `auth` object. Cover: `toAuthUser` nickname normalization (missing, non-string, over-length → `''`); `requireUserId` throws the marked error with no session and `isAuthRequiredError` recognizes it; `signUp` → `needsEmailConfirmation` true/false; `signIn` lower-cases/trims the email and leaves the password byte-identical; `signOut` still resolves and calls the local-scope fallback when the network call rejects; `subscribeToAuth` maps `SIGNED_OUT` → `null` and returns a working unsubscribe; `updateNickname` throws on 41 chars without calling the client, trims, sends `{ data: { nickname } }`; `authErrorMessage` for every row of §2.4 including `status: 429` with no code and a bare `TypeError`; `purgeLegacyLocalData` removes exactly the three keys and never throws when storage is missing/throwing. |
| **New** `login-page.test.tsx` | — | Mock `next/navigation` (`useRouter`, `useSearchParams`) and `useAuth`. Cover: `?mode=signup` seeds the mode; toggle keeps the email and clears the error; loading → disabled form; signed-in on mount → `router.replace(next)` and no form; `next` guard (`/settings` accepted; `//evil.com`, `https://evil.com`, `/\evil` → `/`); sign-in success → `replace(next)`; wrong password → banner text from §2.4 and password value preserved; `user_already_exists` in sign-up mode → the sign-in toggle is rendered under the banner; `429` → banner + submit disabled; `needsEmailConfirmation` → the `confirm-email` state; double-click on submit → one `signIn` call; no "Forgot password" text anywhere. |
| **New** `AuthProvider.test.tsx` | — | `getSession` null → `signed-out`; session → `signed-in` with mapped user; `subscribeToAuth` callback flips state both ways; unsubscribe called on unmount; `purgeLegacyLocalData` called once; `useAuth` outside the provider throws. |
| **New** `SignInPrompt.test.tsx` | — | Copy per action; link hrefs; "Not now", `Escape`, backdrop click each call `onDismiss` exactly once; `role="dialog"` with an accessible name; heading receives focus on mount. |

Files whose *frozen* status the previous passes respected (`SpotMap.test.tsx`, `AddSpotForm.test.tsx`, `ConfirmButton.test.tsx`, `ReportButton.test.tsx`) remain untouched by this migration — that is a design constraint on the builder (fail-closed default prop, additive-only `AddSpotForm` prop, no changes to the two buttons), not luck.

---

## 8. Edge cases the builder and reviewer must account for

**Accounts and sign-up**
- **Email already registered.** Confirmation OFF (A3): Supabase returns `user_already_exists` → §2.4 copy + the sign-in toggle. Confirmation ON: Supabase returns a *fake* user with `identities: []` and no error → the page shows "check your inbox" for both real and duplicate sign-ups by design; do not try to tell them apart in copy.
- **"Anonymously created then abandoned" email.** There is no such thing: the anonymous era never collected emails. An address is either registered in Supabase Auth or it is not. Nothing to reconcile.
- **Double-submitting sign-up.** `isSubmitting` guard ignores the second click. If two requests still race (double-tap before React commits), the second gets `user_already_exists` — with confirmation OFF the first already produced a session and the redirect wins; the error banner must not be shown if `status` has already become `signed-in` (check before `setError`).
- **Email casing / whitespace.** `Foo@X.com ` → `foo@x.com` before send; the same person cannot end up with two accounts by capitalization.
- **Password with leading/trailing spaces.** Sent as typed. Never trimmed, never `maxLength`-capped in the input. Sign-in mode never enforces `MIN_PASSWORD_LENGTH` (an old account created under a lower dashboard minimum must still be able to sign in).
- **Weak password with confirmation OFF.** `weak_password` comes back before any user is created; nothing to clean up.
- **Browser password managers.** Inputs carry `autoComplete="email"`, `autoComplete="current-password"` (sign-in) / `"new-password"` (sign-up), `type="email"`, `type="password"`, real `<label htmlFor>`s. Sign-up and sign-in share one `<form>`; switching mode only changes the `autoComplete` value and button label.

**Sessions**
- **JWT expires mid-action** (default lifetime 1 h): `autoRefreshToken` refreshes ahead of expiry in a foreground tab. A tab backgrounded for hours may miss the refresh; the first write then returns `401`/`42501`. Repo maps it to the session-expired message (§6.3); GoTrue emits `SIGNED_OUT` if the refresh token is also dead (`refresh_token_not_found`, `session_expired`) → `AuthProvider` flips to `signed-out` → SpotMap closes the add form (§3.2) and the header shows "Sign in". The user's typed form input is lost in that case; acceptable, and the inline error says why.
- **Sign-out in another tab.** GoTrue propagates via the `storage` event → `SIGNED_OUT` in every tab → same flow as above. Sign-in in another tab → `SIGNED_IN` → gate opens everywhere, `page.tsx` effect fetches the confirmed set.
- **Account deleted in the dashboard while signed in.** The JWT stays valid until expiry; inserts then fail the FK (`23503` on `confirmations.confirmer_id` / `spots.created_by`). Surface as the generic error; on the next refresh GoTrue gets `user_not_found` and signs out. No special handling.
- **`/login` opened while already signed in** (bookmark, Back button) → immediate `replace(next)`; never shows a form to a signed-in user.
- **Offline.** Login: `TypeError` → connection copy. Map: `fetchSpots` error banner unchanged. `getSession()` still resolves from `localStorage`, so an offline-but-recently-signed-in user sees the gate open and then gets a network error on the write — correct.
- **Private/incognito or storage-blocked browsers.** `localStorage` unavailable → GoTrue falls back to in-memory storage: the user can sign in but is signed out on reload. No crash; nothing to do.
- **SSR / prerender.** `AuthProvider`'s initial `loading` state renders identically on server and client; `getSession()` is only called in an effect. `ClipboardShell` renders no auth-dependent markup during `loading`. No hydration mismatch.

**Rate limiting (Supabase free tier)**
- Sign-in/sign-up requests are rate-limited per IP by GoTrue; the built-in mailer is separately capped (single-digit emails per hour) — moot with confirmation OFF. The UI maps `429`/`over_*_rate_limit` to one message and disables submit for 30 s. Demoing sign-up from one Wi-Fi to a room of people can hit the per-IP limit; that is a known ceiling, not a bug.
- `updateNickname` is an auth endpoint call too; save-on-blur with the "unchanged value → no call" rule (§2.7) keeps it from hammering the limit.

**Identity model**
- **Pre-migration anonymous confirmations are gone.** The migration deletes them and recounts. A spot that was Confirmed yesterday can be Unconfirmed today. `learnings.md` and README say so.
- **Same human, two accounts** can confirm one spot twice. Accepted; this is what accounts can guarantee and no more. `product.md` wording changes from "spoofable by design" to "one vote per account; creating multiple accounts is the remaining bypass".
- **Nickname default is blank.** Pins carry `nickname: null` until the user types one (in settings or per pin). No email prefix, ever.
- **Nickname > 40 chars in `user_metadata`** (edited via devtools): `toAuthUser` normalizes to `''`; `updateNickname` refuses `> MAX_NICKNAME_LENGTH` client-side; `spots.nickname` CHECK is the DB backstop.
- **`created_by` is public.** A bare uuid. Documented in §4.4; nothing renders it.
- **Same account, same spot, second report** → `23505` → treated as success, no ack change (the "Reported — thanks" line already shows because `handleReport` only sets it after `onReportSpot` resolves — and it resolves).
- **Deleting a user cascades their confirmations** (recount may flip spots back) but **sets `created_by`/`reported_by` to NULL** (content survives). Intentional asymmetry: a vote is the person; a pin is the place.

**Gating / UI**
- **Report form filled while signed out.** `ReportButton`'s internal form opens regardless (frozen contract); submit hits the gate and shows the prompt; the typed details are lost when the popup closes. Mitigated by the popup hint line. Accepted.
- **FAB while `loading`** → prompt opens. Practically unreachable (session resolves in ms). If it ever shows for a signed-in user, they tap "Not now" and try again.
- **`?next=` abuse.** Only same-origin relative paths pass (§1.2). Tested.
- **Back button after login** → does not return to `/login` (`replace`).
- **Frozen `SpotMap.test.tsx` passes no `authStatus`** → runtime default `'signed-out'`; static assertions unaffected. Never default to `'signed-in'`.

**Storage**
- Upload succeeded, insert failed → orphan object (unchanged from v1). Now only possible for signed-in users, so the orphan is at least attributable via the bucket's `owner` column.
- Signed-out `createSpot` throws **before** the upload (§6.3 step 2) — no orphan from the gated path.

---

## 9. Out of scope (do not touch in this feature)

- OAuth / magic link / phone / anonymous sign-in providers.
- Password reset, change-password, change-email, delete-account flows (§2.6).
- Email confirmation being ON as a supported configuration (handled defensively, not designed for).
- A `profiles` table, public nicknames as identity, "spots by this user" views, avatars.
- Editing or deleting one's own spot; moderation UI; hiding reported spots; report review.
- Route-level protection / middleware / `@supabase/ssr` / Server Actions.
- Switching `confirmSpot` to an RPC and revoking UPDATE on `spots` (F1 from the original spec — still recommended, still separate).
- Realtime, pagination, categories, search, filters, CAPTCHA, custom SMTP.
- Any change to `Spot`, `CONFIRMATION_THRESHOLD`, `isConfirmed`, `ConfirmButton`, `ReportButton`, `map-config`, `pin-icon`, `uuid.ts`, `0001_init.sql`.
- Touching `.env.local`, adding any env var, referencing any credential beyond the two `NEXT_PUBLIC_*` values.

### 9.1 Docs that must change in this pass (they currently contradict the product)

| File | Current text | Required change |
|---|---|---|
| `CLAUDE.md` | MVP item 2 "no account, just an optional nickname"; out-of-scope "Accounts, login, passwords" | Item 2 → "requires a signed-in account; optional cosmetic nickname"; move "Accounts, login" out of the out-of-scope list; add "Browsing the map needs no account". |
| `.claude/steering/product.md` | "No accounts, no passwords, no login"; "best-effort browser-local identity … spoofable by design" | Identity section → email/password via Supabase Auth; browsing open; add/confirm/report gated; one vote per account; nickname still cosmetic and never shown as verified. |
| `README.md` | "No accounts. No passwords. Just the map."; step 2 "An optional nickname is the only identity involved."; schema paragraph names only `0001_init.sql`; scope paragraph lists "full accounts/login" as out of scope | Update all four; mention `0002_auth.sql` and the three dashboard toggles (§5.2 #1, #2, #4). |
| `.claude/learnings.md` | — | Entries: (a) why `DELETE` not `TRUNCATE` for the confirmations wipe (row triggers); (b) `signUp` returns an obfuscated user for duplicates only when confirmation is ON; (c) `is_anonymous` JWT claim and why `is_real_user()` exists; (d) policy `WITH CHECK` may reference columns the role cannot SELECT (confirm from the app test — §5.1); (e) `next` open-redirect guard; (f) pre-migration anonymous confirmations were discarded and spots recounted. |

---

## 10. Acceptance criteria (Reviewer uses verbatim)

**Schema script — `checkpoint:human-action`**
- [ ] §5 block, pasted as-is into the SQL Editor on the project that already ran `0001_init.sql`, completes in one execution with no error.
- [ ] Running it a second time also completes with no error (idempotent), and does **not** delete any `confirmations` rows the second time (the guarded block is skipped once the column is `uuid`).
- [ ] §5.1 column query shows `confirmations.confirmer_id`, `spots.created_by`, `reports.reported_by` all `uuid` with default `auth.uid()`.
- [ ] §5.1 policy query returns exactly 6 `public` rows and 1 `storage` row with the names and role arrays listed there; none of the write policies lists `anon`.
- [ ] §5.1 grants query shows `anon` with `SELECT` on `spots` only; `authenticated` has no `INSERT` privilege on `created_by` or `reported_by`.
- [ ] `select count(*) from public.confirmations` is 0 and every spot reads `confirmations = 0, status = 'unconfirmed'` immediately after the first run.
- [ ] Under `set local role anon`: `select` on `spots` succeeds; inserting into `spots`, `confirmations`, `reports`, and selecting from `confirmations` each fail with `42501`.
- [ ] Through the running app with two accounts: adding a pin populates `created_by`; two confirmations from two accounts flip the spot to `confirmed, 2`; a third confirmation from one of them is a no-op (UI shows "You confirmed this spot", DB count stays 2); reporting twice from one account leaves exactly one `reports` row with `reported_by` set.
- [ ] `supabase/migrations/0002_auth.sql` exists and is byte-identical to the §5 block.
- [ ] No line of the script, this document, or any committed file contains a service-role key, database password, connection string, or JWT. `.env.local` is unchanged (`git status` shows it untracked/unmodified; no new keys in `.env.local.example`).

**Dashboard — `checkpoint:human-action`**
- [ ] Confirm email is OFF, minimum password length is 8, anonymous sign-ins are OFF, Site URL is set (§5.2). The human states each explicitly; the reviewer does not assume.

**Session and auth layer (`npm test`, `npx tsc --noEmit`, `npm run lint`)**
- [ ] `package.json` has no `@supabase/ssr`; no `middleware.ts` exists; `createClient` is called with `persistSession: true, autoRefreshToken: true, detectSessionInUrl: false` and remains a singleton.
- [ ] `src/lib/auth.ts` exports exactly the names in §6.1 with those signatures; nothing outside `auth.ts`/`AuthProvider.tsx` references `supabase.auth`.
- [ ] `requireUserId()` rejects with an `Error` whose `cause.code === 'auth_required'` when `getSession()` yields null, and `isAuthRequiredError` returns true for it.
- [ ] `AuthProvider` starts in `loading`, resolves via `getSession()`, subscribes via `onAuthStateChange`, unsubscribes on unmount, calls `purgeLegacyLocalData()` once; `layout.tsx` wraps children in it; `useAuth()` throws outside it.
- [ ] Legacy keys `zpots:confirmer-id`, `zpots:confirmed-spots`, `zpots:nickname` are removed on first load and are not referenced anywhere except `purgeLegacyLocalData`.

**Repo layer**
- [ ] `confirmSpot` has arity 1; calling it with two arguments is a TypeScript error; its confirmations insert payload is exactly `{ spot_id, confirmer_id }` with `confirmer_id` from `requireUserId()`.
- [ ] `createSpot`, `confirmSpot`, `reportSpot` each call `requireUserId()` before `getSupabaseClient()`; a signed-out `createSpot` never calls `storage.from`; a signed-out `reportSpot` still validates the reason first (invalid reason → rejects before `requireUserId`).
- [ ] `createSpot` insert payload keys are unchanged (`id,name,note,lat,lng,nickname,photo_url,status,confirmations`); `reportSpot` keys are unchanged (`spot_id,reason,details`); neither sends `created_by`/`reported_by`.
- [ ] `reportSpot` resolves `void` on `error.code === '23505'`; `confirmSpot` still treats `23505` as duplicate/no-update; `42501` on any write surfaces as the session-expired message, never as a duplicate.
- [ ] `fetchMyConfirmedSpotIds` returns an empty `Set` with no client call when signed out, and a `Set` of `spot_id`s from `select('spot_id')` (nothing chained, no `.eq`) when signed in.
- [ ] `fetchSpots` is unchanged and runs for signed-out visitors.

**UI — gating**
- [ ] Signed out: the map, tiles, every marker, popup name/note/status, the FAB, Confirm and Report controls all render. Clicking the FAB does not arm placement and shows `SignInPrompt` (`action='add'`); clicking Confirm shows it (`'confirm'`) and does not call `onConfirmSpot`; submitting a Report shows it (`'report'`), does not call `onReportSpot`, and shows no "Reported" ack; popups show the "Sign in to confirm or report." hint.
- [ ] `loading` behaves exactly like signed out for all three actions.
- [ ] Signed in: every existing `SpotMap.wiring.test.tsx` behavior holds with `authStatus: 'signed-in'`; no hint line; no prompt.
- [ ] `SignInPrompt`: `role="dialog"`, `aria-modal`, labelled by the heading, heading focused on open; "Sign in" → `/login?next=/`; "Create an account" → `/login?mode=signup&next=/`; "Not now", `Escape`, and backdrop click each call `onDismiss` once; copy matches §3.3; uses the custom `SignInIcon` (no third-party icon import anywhere in `src/`).
- [ ] `authStatus` is a required prop type on `MapView` and `SpotMap`; runtime `undefined` behaves as `signed-out`; `SpotMap.test.tsx` passes unmodified.
- [ ] `AddSpotForm` accepts `defaultNickname`, pre-fills the nickname input, and `AddSpotForm.test.tsx` passes unmodified.
- [ ] `page.tsx` empties `confirmedSpotIds` on sign-out, fetches them on sign-in, adds the id locally after a successful confirm, and does not read `localStorage`.
- [ ] `ClipboardShell` shows a "Sign in" link to `/login` only when `signed-out`; SSR output for `loading` contains no such link; no hydration warning in the dev console on `/` and `/settings`.

**UI — `/login`**
- [ ] One route; `?mode=signup` seeds sign-up mode; the toggle preserves the typed email and clears the error.
- [ ] `loading` → disabled form; `signed-in` → `router.replace(next)` with no form rendered.
- [ ] `next` accepts only same-origin relative paths per §1.2 (`/settings` ok; `//x`, `https://x`, `/\x`, `javascript:` → `/`).
- [ ] Sign-up mode enforces `MIN_PASSWORD_LENGTH` and email shape client-side before any network call; sign-in mode enforces non-empty only; the password is never trimmed.
- [ ] Every row of the §2.4 table produces the stated copy (tested via `authErrorMessage`); `429` also disables submit for 30 s; wrong password preserves the typed password.
- [ ] `needsEmailConfirmation: true` renders the `confirm-email` state instead of redirecting.
- [ ] A double-click on submit produces exactly one `signIn`/`signUp` call.
- [ ] The words "forgot" and "reset" do not appear on the page; the sign-up helper line about reset not being available does.
- [ ] Inputs have correct `type`, `autoComplete`, and associated labels.

**UI — `/settings`**
- [ ] Three states per §2.7; signed-out shows a link to `/login?next=/settings` and does not redirect.
- [ ] Nickname blur with a changed value calls `updateNickname(trimmed)`; unchanged value → no call; over-length is impossible via `maxLength` and rejected by `updateNickname` regardless.
- [ ] "Sign out" calls `signOut()` then navigates to `/`; a rejected `signOut` still results in a signed-out UI.
- [ ] Confirmations count comes from `fetchMyConfirmedSpotIds`; fetch failure renders "—", not `0`.
- [ ] No "Clear my local data" control, no `window.confirm`, no "no accounts" copy remains.

**Tests and hygiene**
- [ ] The four deleted modules and their four test files are gone; `page.test.tsx` and `settings-page.test.tsx` are rewritten; `spots-repo.test.ts`, `SpotMap.wiring.test.tsx`, `validation.test.ts` are extended; new `auth.test.ts`, `login-page.test.tsx`, `AuthProvider.test.tsx`, `SignInPrompt.test.tsx` exist — and the new/changed tests were committed **red before** the implementation commit (git history shows the `test(...)` commit preceding the `feat(...)` commit).
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` are all clean.
- [ ] `CLAUDE.md`, `.claude/steering/product.md`, `README.md` no longer claim there are no accounts; `learnings.md` has the six entries from §9.1.
- [ ] No emoji anywhere in new UI or copy; new icon is a hand-drawn SVG in `action-icons.tsx`.

---

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-19 | Initial spec + SQL | Planner output for the required-login migration; supersedes the identity model in `add-pin-schema.md` |
