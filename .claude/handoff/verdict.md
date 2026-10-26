# Reviewer Verdict — Fix round 1 (f282f4b)

VERDICT: APPROVED

## Verification (independent)
- `npm test` — 38 files / 469 tests, all passing.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.

## Blocking issues from prior review — both resolved
1. Status pill Bilingual for both states — `src/components/SpotMap.tsx:246-251` now renders
   `<Bilingual k="statusConfirmed" />` / `<Bilingual k="statusUnconfirmed" />` directly;
   `statusLabel()` deleted. `COPY.statusUnconfirmed` is no longer dead code.
2. Popup photo/count tests — `src/__tests__/SpotMap.popup.test.tsx` covers photoUrl-present
   (img + alt), photoUrl-absent (placeholder, no img), `onError` swap to placeholder, and
   0/1/2 confirmation-count singular/plural text. `src/components/SpotPhoto.tsx` holds the
   `hasErrored` state and renders the placeholder for both the missing-URL and onError cases.

## Spec-conformance checks
- No raw hex outside `src/components/icons/**` (recursive scan of `src/components`, `src/app`
  clean; `StoneArch`'s `#cdb693` and the vestigial `AzulejoBand` internals are inside the
  exempt icons directory and `AzulejoBand` itself now routes color through `var(--color-*)`
  anyway).
- All `aria-label`s remain English strings (`ConfirmButton.tsx:53`, `ReportButton.tsx:59,109`,
  `ClipboardShell.tsx:89`, `AddSpotForm.tsx:172`, `SpotMap.tsx:288`).
- The single authorized test change is exactly what was described:
  `src/__tests__/SpotMap.test.tsx` `getByText(/^confirmed$/i)` →
  `getAllByText(...).length >= 1`, with a comment explaining the now-legitimate double match.
  No other assertion in the diff was weakened; repo-wide grep confirms no other test still
  expects a singular match for that regex inside a popup.
- `AzulejoBand` (`src/components/icons/ornaments.tsx`) generates its pattern id via
  `` `zpots-azulejo-tile-${useId()}` ``, fixing the shared-id bug across multiple bands on one
  page; new `shell.test.tsx` case asserts two rendered bands produce two distinct pattern ids.
- `Flourish` is fully removed from `ornaments.tsx` (grep-confirmed zero references anywhere).
- No emojis found in `src/`.

## Notes (non-blocking, carried forward for the record)
- `Bilingual`'s new `tone`/`layout` props and their application to the FAB/ConfirmButton/
  ReportButton are a reasonable, test-covered extension (`Bilingual.test.tsx` asserts on the
  resulting classes, which is appropriate since the props are the contract).
- B4 (mobile header sizing) is intentionally unverified by automated tests per the spec —
  browser-only check, not a gate for this review.
- `PhotoPlaceholderIcon` uses `currentColor` + a `text-stone-deep` wrapper rather than a
  hardcoded stone-deep stroke — visually identical, disclosed deviation, no issue.
