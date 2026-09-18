# Code Structure and Conventions

## Layout

```
src/app/            Next.js App Router pages and layout
src/components/     React components (PascalCase files)
src/lib/            Pure modules: config, types, data helpers (kebab-case files)
src/__tests__/      Vitest specs, one file per module under test
```

## Rules

- **Pure logic goes in `src/lib/`**, not inside components. Anything with a branch or a rule (status thresholds, validation, formatting) belongs in a module that can be unit tested without a DOM.
- **Components stay thin** — props in, markup out. No data fetching mixed with rendering logic.
- Leaflet touches `window`, so any map component must be loaded with `next/dynamic` and `ssr: false`.
- Types are exported from the module that owns the concept (`Spot` lives in `src/lib/spots.ts`).
- Test files mirror the module path: `src/lib/spots.ts` -> `src/__tests__/spots.test.ts`.
- Import alias is `@/*` -> `src/*`. Use it instead of relative climbs.

## Naming

- Components: `PascalCase.tsx`, default export matching the filename.
- Lib modules: `kebab-case.ts`, named exports only.
- Constants: `SCREAMING_SNAKE_CASE`.
- Booleans read as predicates: `isConfirmed`, not `confirmed`.
