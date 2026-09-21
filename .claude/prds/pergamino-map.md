# PRD: Pergamino — a map Zpots draws itself

**Ticket:** None (ad-hoc request, 2026-09-20)
**Status:** Complete (live in the app)
**Created:** 2026-09-20
**Last Updated:** 2026-09-21 (labels reversal: tile-driven lettering replaces the curated-only
approach -- see "Labels reversal" Change Log entry at the end of this file. D2 below is
superseded; read it as history, not as the current design.)
**Supersedes (partially):** the raster-tile + CSS-tint decision in `.claude/prds/ciudad-latina-redesign.md`

---

## Summary

Replace the sepia-filtered OpenStreetMap raster photograph with a warm parchment chart that
Zpots renders itself from vector tiles: our road weights, our colours, our lettering. Leaflet
stays. Every existing map component (`SpotMap`, `MapInsetInner`, `PostFlow`, `CityMask`) stays.
The raster layer survives only as a degraded fallback when the vector archive cannot be read.

Ground (land, sea, coastline, roads, rivers, landuse, buildings, boundaries, named POIs) is
drawn by **protomaps-leaflet 5.1.0** from a Zamboanga-only **`.pmtiles`** archive.

**Lettering superseded (see "Labels reversal" in the Change Log):** this PRD originally shipped
with `labelRules: []` and a curated list of ~20 places as the map's *only* naming system (D2).
That discarded every name the archive actually carries — street names, real barangay names,
water names, POI names — and shipped a map that read as empty at most zooms. Naming now comes
primarily from the archive itself, via `buildLabelRules` (`BasemapLayer.tsx`) using
protomaps-leaflet's own label symbolizers and built-in collision handling, rendered in the same
three typefaces (Cinzel, Alegreya Sans, Alegreya italic) as canvas text. The curated list
(`src/data/zamboanga-places.ts`) survives only for two Spanish/Chavacano water names the archive
has no in-view equivalent for.

---

## Requirements

### Original requirements (user, approved against a published design preview)

The preview's palette and weights are the design intent. Retune only with a stated reason.

| Element | Colour | Weight |
|---|---|---|
| land | `#e9debf` | fill |
| sea | `#d6be92` | fill |
| coastline | `#8a7048` | 1.3 px |
| major road (motorway / trunk / primary + links) | `#9d7b46` | 2.4 px |
| arterial (secondary + link) | `#b5945f` | 1.7 px |
| street (tertiary / unclassified) | `#c5a87d` | 1.1 px |
| minor (residential / living_street / pedestrian) | `#d5c09a` | 0.65 px |
| river | `#a9b79e` | 1.2 px |

Lettering, all with a cream halo:

| Class | Font | Size | Tracking | Case | Colour | Placement |
|---|---|---|---|---|---|---|
| landmark | Cinzel 600 | 11 px | .15em | uppercase | ink `#2a2017` | 15 px **below** its point |
| barangay | Alegreya Sans 500 | 9.5 px | .2em | uppercase | stone-deep `#7a6448` | centred on its point |
| water | Alegreya italic | 14 px | .34em | as written | teal-deep at ~78% opacity | centred on its point |

Far fewer labels than OSM shows: roughly eight in a downtown view, not sixty.

### Discovered requirements

1. **The three lettering colours are already tokens.** `--color-ink` is exactly `#2a2017`,
   `--color-stone-deep` is exactly `#7a6448`, and the water teal is `--color-teal-deep`
   (`#165259`). Only the eight ground colours are new tokens. No new font needs loading —
   Cinzel 600, Alegreya Sans 500 and Alegreya italic are all already in `layout.tsx`.
2. **Alegreya is loaded at weights 500/600/700 only — not 400.** The water label is therefore
   Alegreya **italic 500**, not italic 400. Changing `layout.tsx` to add 400 would touch the
   frozen `fonts.test.tsx` contract and add a font-file variant for one label; not worth it.
3. **OSM attribution must survive.** It moves from `TILE_ATTRIBUTION` on a `TileLayer` to
   `BASEMAP_ATTRIBUTION` on the vector layer, and must still name OpenStreetMap and link to
   `https://www.openstreetmap.org/copyright`. Protomaps is credited alongside it.
4. **The failure path must be a working map, not an explanation of a blank one** (below).

---

## Design decisions (with reasons)

### D1 — protomaps-leaflet 5.1.0 is the right library. Verified, not assumed.

Checked by downloading the published tarball (`npm pack protomaps-leaflet@5.1.0`) and reading
its source, not its marketing page.

| Question | Answer | Evidence |
|---|---|---|
| Custom paint rules per layer? | Yes. `LeafletLayerOptions.paintRules: PaintRule[]`, `PaintRule = { dataLayer, symbolizer, filter?, minzoom?, maxzoom? }`, `Filter = (zoom, feature) => boolean`. | `src/painter.ts:9-17`, `src/frontends/leaflet.ts:53-62` |
| Polygon fill **and** stroke in one symbolizer (for the coastline)? | Yes. `PolygonSymbolizer` takes `fill`, `stroke`, `width` and calls `ctx.stroke()`. | `src/symbolizer.ts:70-140` |
| Labels in an arbitrary CSS family? | Yes — `fontFamily`/`fontWeight`/`fontSize`/`fontStyle` compose a canvas `ctx.font` string, plus `letterSpacing` (px), `textTransform: "uppercase"`, `stroke` + `width` for a halo, and `OffsetTextSymbolizer` + `placements: [TextPlacements.S]` for "below the point". A `tasks: Promise[]` option exists precisely so `document.fonts.load(...)` can gate the first paint. | `src/attribute.ts` (`FontAttr`, `TextAttr`), `src/symbolizer.ts:633-760, 929-948`, `src/frontends/leaflet.ts:27-40,160` |
| Leaflet 1.9? | Yes. It subclasses `L.GridLayer`; `@types/leaflet ^1.9.8` in its devDeps. | `src/frontends/leaflet.ts:66` |
| React 18/19? | Irrelevant — it is a Leaflet plugin with no React dependency at all. | `package.json` has no react dep |
| Bundle size? | Prebuilt browser bundle is 128 171 B raw / **37.7 kB gzipped**, including pmtiles, pbf and rbush. `@protomaps/basemaps` rides along (its `namedFlavor` is referenced in the constructor): +38 680 B raw / 7.0 kB gzipped. Call it **~45 kB gzipped**, and see D8 — it is lazy-loaded, so it costs zero on first paint. | measured with `gzip -c` |
| SSR safe? | The module body touches no `window`/`document`; `window.devicePixelRatio` and `document.createElement` are inside the constructor. Regardless, repo rule stands: it is only ever reached inside an `ssr: false` boundary, and D8 makes it a dynamic `import()` inside an effect. | `src/frontends/leaflet.ts:94,102` |

**The one real trap:** `frontends/leaflet.ts:2` is `declare const L: any` — the library reads the
**global** `L` at `leafletLayer()` call time. Leaflet 1.9.4's package.json has `main:
dist/leaflet-src.js` and **no** `module`/`exports` field, so bundlers get the UMD build, which
does `window.L = exports` (`dist/leaflet-src.js:14509`). So the global happens to exist already.
That is an implicit dependency on a resolution detail, so `BasemapLayer` sets it explicitly:

```ts
if (typeof window !== "undefined" && !(window as Window & { L?: unknown }).L) {
  (window as Window & { L?: unknown }).L = L;
}
```

**Fallback if this library ever fails us** (not needed now, recorded so nobody re-derives it):
MapLibre GL JS with a hand-written style JSON reading the same `.pmtiles` via
`pmtiles.Protocol`. That costs ~200 kB gzipped, a second rendering engine alongside Leaflet, and
a rewrite of every map component and mock — which is exactly what this route avoids.

### D2 — SUPERSEDED 2026-09-21, see "Labels reversal" in the Change Log. Place names come from a **curated list in the repo**, not from the tiles.

Kept verbatim below as a record of the original reasoning and why each point turned out wrong or
incomplete in practice — not as the current design. `buildLabelRules` (`BasemapLayer.tsx`) is now
the primary naming system; `ZAMBOANGA_PLACES` is now a two-entry exception list.

Reasons, in order of weight (original, 2026-09-20):

1. **The label count requirement is a design requirement, not a rendering one.** "Eight downtown,
   not sixty" is guaranteed by construction if we ship exactly the twenty names we want, staged
   by zoom. Tile-driven labels would have to be fought down with filters that break the moment
   the archive is re-cut.
2. **Coverage is not guaranteed.** Zamboanga landmarks like Fort Pilar and Paseo del Mar live in
   the `pois` layer, which Protomaps only carries at high zoom and only where OSM has them; PH
   barangays are inconsistently tagged (`place=suburb` / `village` / `neighbourhood` /
   admin_level-10 boundary). A curated list cannot half-load.
3. **Testability.** Canvas text is invisible to jsdom. DOM labels are `divIcon` HTML we can
   assert on the same way `pin-icon.ts` is asserted today.
4. **Real CSS.** `text-transform`, `letter-spacing`, `text-shadow` halo, and `var(--font-*)`
   tokens work directly, with no canvas font-loading race (a webfont that has not finished
   loading when a canvas tile paints silently renders in the fallback family, forever, until
   that tile is invalidated).

Consequence (original, now reversed): `labelRules: []` is passed to protomaps-leaflet, so the
tiles contribute **zero** lettering. The vector archive draws ground only.

**Why this turned out wrong** (see "Labels reversal" Change Log entry for the full record):
point 1 assumed a curated list was the only way to guarantee density, but it guarantees the
*opposite* at every zoom the curated data doesn't happen to cover — "roughly eight downtown at
z14" said nothing about z11 or z12, which were often bare. Point 2's "coverage is not
guaranteed" was checked against assumption, not the actual archive: queried directly (pmtiles CLI
+ `@mapbox/vector-tile`), `pois` carries "Fort Pilar", "Paseo del Mar", "Zamboanga City Hall" and
360+ other named features in a single close tile, and `places` carries real barangay-equivalent
names (`kind: "macrohood"`, e.g. "Baliwasan", "Canelar", "Zone I") at `min_zoom: 11`. Point 3
(testability) is real but incomplete — `buildLabelRules` is tested the same way `buildPaintRules`
already was (a pure function against a fake protomaps module), canvas text doesn't have to be
literally rendered in jsdom to test the *rules* that produce it. Point 4 (webfont race) undersold
protomaps-leaflet's own answer to the exact problem it named: the `tasks: Promise[]` option
(documented in this PRD's own D1 table, row 3, written before D2 existed) is awaited before every
tile's label layout, not just the first — see `pergamino-fonts.ts`.

### D3 — Ground is canvas, lettering is DOM. Two layers, one map.

| | Drawn by | Leaflet pane | z-index |
|---|---|---|---|
| land / sea / coastline / roads / rivers | protomaps-leaflet canvas GridLayer | `tilePane` | 200 |
| city mask + outline | existing `CityMask` | `cityMask` | 350 |
| place labels | `L.divIcon` markers | **new `placeLabels`** | **450** |
| spot pins | existing markers | `markerPane` | 600 |
| popups | existing | `popupPane` | 700 |

450 sits above the cream city mask (so labels are legible over it) and below the pins (so a pin
is never hidden behind a word). Landmarks sitting 15 px below their point is the second half of
that: the pin silhouette occupies the space *above* its anchor, so pin and landmark label never
fight for the same pixels.

### D4 — Components take an explicit `map` prop. No new react-leaflet hooks.

`BasemapLayer` and `PlaceLabelsLayer` receive `map: LeafletMap | null` and call `useMap()`
**never**. Two reasons, both structural:

- Nine existing test files mock `react-leaflet`. Their `useMap()` stand-ins return small hand-
  written objects (`SpotMap.test.tsx:64-71` has `createPane/getPane/fitBounds/flyTo/setView` and
  nothing else). A new component calling `map.addLayer()` through `useMap()` would throw in all
  of them. Per `.claude/learnings.md`, the rule is to fix the mocks, not feature-detect — but
  here there is a design that needs neither.
- `SpotMap.tsx` **already** holds the live instance (`ref={setLeafletMap}`, state
  `leafletMap`). Passing it down is less machinery, not more.

In jsdom the `MapContainer` stand-ins are plain function components, so `ref` is a silent no-op
(documented in `.claude/learnings.md`) and `map` stays `null`. Both new components then do
nothing and render nothing. That is why **no existing react-leaflet mock has to change.**

This is not test-shaped code: "we have no live map, so we draw no map furniture" is the correct
behaviour in its own right, and `MapInsetInner` already refuses to render on a non-usable centre
for the same class of reason.

### D5 — The existing tint is kept, and re-scoped, not deleted.

`.leaflet-tile-pane { filter: sepia(...) }` in `globals.css:114-116` stays **byte-identical**.
It no longer applies to the normal path (there are no raster tiles to tint), but it is exactly
what makes the D6 raster fallback still look like Zpots instead of raw OSM blue. Its comment
changes to say so.

This is why `tile-tint-cascade.adversarial.test.ts` and `theme-tokens.test.ts:65-71` stay green
**unmodified**. Deleting the rule to "clean up" would have forced deleting four adversarial
assertions about cascade ordering that are still true and still protect a real (if now rarer)
code path. Keeping a rule alive for a documented degraded path is cheaper and more honest than
deleting coverage.

### D6 — Failure behaviour: fall back to the tinted raster map, and say so.

If the `.pmtiles` archive 404s, is served without range support, is not a PMTiles v3 file, or
the network fails, the user gets **the old map**, not a blank rectangle:

- `BasemapLayer` renders `<TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />` instead of
  the vector layer, which the kept `.leaflet-tile-pane` filter tints warm.
- `SpotMap` shows a small bilingual chip: `Mapa simple` / `Simplified map`.
- The 112 px deck inset and the `PostFlow` tap map fall back **silently** — a notice chip does
  not fit in 112 px and the tap map's job is picking a coordinate, not being pretty.
- `CityMask`, pins, popups and every interaction are unaffected in both modes.

Detection does not rely on protomaps-leaflet, which swallows tile errors with a bare
`console.error` (`src/frontends/leaflet.ts:150`) and emits no Leaflet event. We probe first
ourselves — see F3.

### D7 — The archive URL is an env var with a local default, so the hosting decision is reversible.

`BASEMAP_PMTILES_URL = process.env.NEXT_PUBLIC_BASEMAP_PMTILES_URL ?? "/basemap/zamboanga.pmtiles"`.
Moving the file between Supabase Storage, `public/`, or anything else later is a dashboard change,
not a code change.

### D8 — protomaps-leaflet is `await import()`ed inside the effect, not imported at module top.

It is ~45 kB gzipped that only matters once a live Leaflet map exists. Importing it lazily
means: it never lands in the initial route chunk, it is never evaluated during prerender, and it
is never even resolved in jsdom (where `map` is always `null`) — so no test file needs to stub it
except `BasemapLayer`'s own.

### D9 — `maxDataZoom: 15`, display zoom still 18.

The archive is cut to z15. protomaps-leaflet over-zooms vector geometry past its data zoom
(`view.ts:241`), so `MAX_ZOOM = 18` keeps working and lines stay crisp instead of going blurry —
a real improvement over raster that the `MAX_ZOOM` comment in `map-config.ts:21` should now
reflect. `MIN_ZOOM`, `MAX_BOUNDS`, `ZAMBOANGA_CENTER` and `DEFAULT_ZOOM` are **unchanged**.

---

## Checkpoint: where the `.pmtiles` file comes from and where it lives

**This needs the user's decision. Do not pick silently.**

### Source — verified

Protomaps publishes a daily planet build. Verified live on 2026-09-20:

- `https://build-metadata.protomaps.dev/builds.json` lists builds through
  `20260919.pmtiles`, **138 139 970 338 bytes** (~138 GB), schema `version: "4.15.2"`.
- `curl -r 0-127 https://build.protomaps.com/20260919.pmtiles` returns **`HTTP/2 206`**,
  `accept-ranges: bytes`, `content-range: bytes 0-127/138139970338`. Range requests work, so
  `pmtiles extract` can cut a city out of it over the network without downloading the planet.
- The first 8 bytes are `50 4d 54 69 6c 65 73 03` = `"PMTiles"` + spec version `3`. That is the
  magic number F3's probe checks.

### Tooling — checked on this machine

- `which pmtiles` → **not found**. `which tippecanoe` → not found.
- `brew info pmtiles` → **`pmtiles: stable 1.31.2 (bottled)`**, in homebrew-core, not installed.
  `brew install pmtiles` is a one-liner. Homebrew itself is present at `/opt/homebrew/bin/brew`.

### The cut

```sh
brew install pmtiles
pmtiles extract https://build.protomaps.com/20260919.pmtiles zamboanga.pmtiles \
  --bbox=121.75,6.78,122.58,7.48 \
  --minzoom=10 --maxzoom=15 --download-threads=4
```

`--bbox` is `minLon,minLat,maxLon,maxLat` and is exactly `ZAMBOANGA_CITY_BOUNDS` from
`src/lib/city-bounds.ts`. `--minzoom=10` because `MIN_ZOOM` is 12 and 10 gives headroom without
dragging in world-scale tiles; `--maxzoom=15` because D9 over-zooms from there.

**Size: unverified — I could not run it (no `pmtiles` binary here, and installing software on
the user's machine is not mine to decide).** Estimate for a 0.83° × 0.70° coastal city box at
z10–15: **roughly 8–40 MB**. The real number is the deliverable of task T2.3. **Guard rail: if
the cut exceeds 50 MB, re-cut at `--maxzoom=14` and set `BASEMAP_MAX_DATA_ZOOM = 14`** — one
constant, no other change.

### Hosting options

| | A. `public/basemap/zamboanga.pmtiles` (Vercel) | B. Supabase Storage public bucket `basemap` | C. Cloudflare R2 |
|---|---|---|---|
| Range requests | Yes — Vercel's CDN serves static assets with `accept-ranges` | **Unverified here** (see below); Supabase Storage proxies S3 and serves ranges for video seeking | Yes |
| CORS | None needed — same origin | Public objects send `access-control-allow-origin: *` | Needs configuring |
| Refresh the map | Requires a redeploy | Re-upload a file, no deploy | Re-upload |
| Cost on the git repo | **A 8–40 MB binary in git history forever** | Nothing | Nothing |
| New account / service | No | No — already in the stack | **Yes** |
| Free-tier ceiling | Vercel per-file/deployment size limits — **unverified** | 1 GB storage / 5 GB egress on the free tier; a session pulls a few hundred kB to a few MB | 10 GB |

**Why I could not verify B empirically:** the project's `spot-photos` bucket returned an empty
listing under the anon key, and the only `photo_url` rows in the dev database are the junk probe
pins pointing at the fake host `x.supabase.co` (see `.claude/learnings.md`). There was no real
object to range-request. **One command settles it after upload:**

```sh
curl -s -r 0-15 -o /dev/null -D - \
  "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/basemap/zamboanga.pmtiles" \
  | grep -i "HTTP/\|accept-ranges\|content-range"
# want: HTTP/2 206 + content-range: bytes 0-15/<size>
```

**Recommendation: B (Supabase Storage), with A as the fallback if that curl does not return 206.**
Reasons: the project already runs on Supabase for photos, the map can be re-cut and re-uploaded
without a deploy, and — the decisive one — an 8–40 MB binary committed to git is permanent even
if it is later deleted. D7 makes the choice cheap to reverse either way.

**One constraint that binds both options:** protomaps-leaflet decides a source is PMTiles by
`new URL(url).pathname.endsWith(".pmtiles")` (`src/view.ts:244`). The URL's **path** must end in
`.pmtiles`. A query string (`?v=2`) is fine; a URL that ends in `?download=zamboanga.pmtiles` is
not — it would be silently treated as a `{z}/{x}/{y}` template and render nothing.

---

## Architecture

```
MapContainer (react-leaflet, ssr:false via next/dynamic)
│  ref → leafletMap state (already exists in SpotMap.tsx)
│
├─ <BasemapLayer map={leafletMap} onModeChange={setBasemapMode} />
│     effect, only when map !== null:
│       Promise.all([ probeBasemapArchive(url), import("protomaps-leaflet") ])
│         ok          → leafletLayer({ url, paintRules, labelRules: [], backgroundColor,
│                                      maxDataZoom, attribution }).addTo(map)
│         unavailable → renders <TileLayer url={TILE_URL} …/>, calls onModeChange("raster")
│     cleanup: map.removeLayer(layer)
│
├─ <CityMask />                       (unchanged)
├─ <PlaceLabelsLayer map={leafletMap} /> (SpotMap only)
│     effect: createPane("placeLabels", z 450); on "zoomend" rebuild a LayerGroup of
│     non-interactive divIcon markers from visiblePlaceLabels(ZAMBOANGA_PLACES, zoom)
│
├─ <Marker> … spot pins                (unchanged)
└─ raster-fallback chip, when basemapMode === "raster"   (SpotMap only)
```

---

## Component inventory

| Component | Type | Path | Purpose | Status |
|---|---|---|---|---|
| `pergamino-palette.ts` | lib (new) | `src/lib/pergamino-palette.ts` | Token names, byte-identical fallback hexes, `readPergaminoPalette(root?)` | To build |
| `pergamino-style.ts` | lib (new) | `src/lib/pergamino-style.ts` | Pure, dependency-free: `roadClass()`, `PERGAMINO_WEIGHTS`, ordered `PERGAMINO_LAYERS` descriptors | To build |
| `basemap-source.ts` | lib (new) | `src/lib/basemap-source.ts` | `probeBasemapArchive(url, fetchImpl?)` → `"ok" \| "unavailable"`; never throws | To build |
| `places.ts` | lib (new) | `src/lib/places.ts` | `PlaceLabel` / `PlaceKind` types, `visiblePlaceLabels(places, zoom, bounds?)` | To build |
| `place-label-icon.ts` | lib (new) | `src/lib/place-label-icon.ts` | `createPlaceLabelIcon(place)` → `L.divIcon`, mirrors `pin-icon.ts` | To build |
| `zamboanga-places.ts` | data (new) | `src/data/zamboanga-places.ts` | The ~20 curated names | To build |
| `BasemapLayer.tsx` | component (new) | `src/components/BasemapLayer.tsx` | Adds the vector layer or the raster fallback | To build |
| `PlaceLabelsLayer.tsx` | component (new) | `src/components/PlaceLabelsLayer.tsx` | The `placeLabels` pane and its divIcon markers | To build |
| `map-config.ts` | lib | `src/lib/map-config.ts` | **+** `BASEMAP_PMTILES_URL`, `BASEMAP_MAX_DATA_ZOOM`, `BASEMAP_ATTRIBUTION`; `TILE_URL`/`TILE_ATTRIBUTION` **kept** for the fallback | To change |
| `globals.css` | style | `src/app/globals.css` | **+** 8 `@theme` ground tokens, `.zpots-place-label*` rules; tint comment re-scoped | To change |
| `copy.ts` | lib | `src/lib/copy.ts` | **+** `simpleMap`, `simpleMapWhy` | To change |
| `SpotMap.tsx` | component | `src/components/SpotMap.tsx` | Swap `TileLayer` → `BasemapLayer`; add `PlaceLabelsLayer` + fallback chip | To change |
| `MapInsetInner.tsx` | component | `src/components/MapInsetInner.tsx` | Swap `TileLayer` → `BasemapLayer`; add `ref={setMap}`; **no labels** | To change |
| `PostFlow.tsx` | component | `src/components/PostFlow.tsx` | Same swap on its tap map (line 307); **no labels** | To change |
| `.env.local.example` | config | `.env.local.example` | **+** `NEXT_PUBLIC_BASEMAP_PMTILES_URL=` | To change |
| `CityMask.tsx` | component | `src/components/CityMask.tsx` | **Untouched** | No change |

---

## Data model

### Ground style (`src/lib/pergamino-style.ts`) — pure, imports nothing

```ts
export type RoadClass = "major" | "arterial" | "street" | "minor";

export const PERGAMINO_WEIGHTS = {
  coastline: 1.3, major: 2.4, arterial: 1.7, street: 1.1, minor: 0.65, river: 1.2,
} as const;

export interface PergaminoLayer {
  id: string;                        // "earth" | "water-fill" | "road-major" | …
  dataLayer: string;                 // Protomaps tile layer: earth | water | roads | landuse | buildings | boundaries
  // Load-bearing, not documentation (see "Blob bug and depth fix" below):
  // buildPaintRules (BasemapLayer.tsx) turns this into a real filter
  // against the feature's own geomType, using the protomaps.GeomType enum
  // handed to it by its caller. Originally this field was consulted only
  // to pick a symbolizer class, which is what let LineStrings in the
  // "water" layer (rivers, straits) reach PolygonSymbolizer.draw and get
  // closed into filled blobs.
  geometry: "polygon" | "line";
  fillToken?: PergaminoTokenName;
  strokeToken?: PergaminoTokenName;
  widthPx?: number;
  dashPx?: readonly number[];        // LineSymbolizer's dash pattern, e.g. boundaries
  minZoom?: number;
  match?: (props: Record<string, unknown>) => boolean;
}

/** Draw order, first painted first (bottom) to last (top). */
export const PERGAMINO_LAYERS: readonly PergaminoLayer[];

export function roadClass(props: Record<string, unknown>): RoadClass | null;

export type LanduseGroup = "green" | "civic" | "works" | "cemetery" | "aeroway";
export function landuseGroup(props: Record<string, unknown>): LanduseGroup | null;
```

**Road mapping.** The user's palette is written in OSM terms; the Protomaps v4 schema normalises
them. Verified from `@protomaps/basemaps@5.7.2`: the `roads` layer carries `kind` ∈
{`highway`, `major_road`, `minor_road`, `other`, `path`, `rail`, `ferry`, `pedestrian`,
`aerodrome`-adjacent kinds} plus the boolean-ish flags `is_link`, `is_bridge`, `is_tunnel`, and
`kind_detail`. The style ships uses `kind_detail` values `service`, `pier`, `runway`, `taxiway`;
**the full `kind_detail` vocabulary for ordinary roads is not provable from the style alone** and
must be confirmed against the real extract (task T2.3).

| `kind` | `kind_detail` | → class |
|---|---|---|
| `highway` | any | `major` |
| `major_road` | `primary`, `primary_link` | `major` |
| `major_road` | anything else / absent | `arterial` |
| `minor_road` | `tertiary`, `tertiary_link`, `unclassified` | `street` |
| `minor_road` | `residential`, `living_street`, `pedestrian`, `service`, `track`, `alley` | `minor` |
| `minor_road` | anything else / absent | `street` |
| `pedestrian` | any | `minor` |
| `other`, `path`, `rail`, `ferry`, `aerialway`, `kind_detail` ∈ {`runway`,`taxiway`,`pier`} | — | `null` (not drawn) |

`is_link` never changes the class; a link inherits the class of its `kind`. **Unknown input is
never dropped silently** — an unrecognised `minor_road`/`major_road` falls to the middle weight
so a real road always appears.

Other ground rules:

| id | dataLayer | geometry | paint |
|---|---|---|---|
| `earth` | `earth` | polygon | fill land, stroke coast @ 1.3 px — the coastline *is* the earth polygon's edge in this schema; there is no separate coastline layer |
| `water-fill` | `water` | polygon | fill sea, no stroke |
| `water-line` | `water` | line, `kind ∈ {river, stream}` | stroke river @ 1.2 px, minZoom 13 |
| `landuse-green` / `-civic` / `-works` / `-cemetery` / `-aeroway` | `landuse` | polygon, grouped by `landuseGroup(kind)` | fill only, one token per group; an unrecognised `kind` matches none of the five and is not painted |
| `buildings` | `buildings` | polygon | fill + hairline stroke, minZoom 14 |
| `boundaries` | `boundaries` | line | thin dashed stroke, no `minZoom` |
| `road-*` | `roads` | line | per the table above |

Background colour of the map canvas is **sea**, not land: Zamboanga is coastal, and the `earth`
polygon paints land over it.

Draw order, bottom to top: `earth` → `water-fill` → `water-line` → the five `landuse-*` layers →
`buildings` → `boundaries` → `road-minor` → `road-street` → `road-arterial` → `road-major` — i.e.
landuse/buildings/boundaries sit below the roads and above the ground, in that order among
themselves (see "Blob bug and depth fix" below).

### Palette (`src/lib/pergamino-palette.ts`)

```ts
export const PERGAMINO_TOKEN_NAMES = [
  "--color-pergamino-land", "--color-pergamino-sea", "--color-pergamino-coast",
  "--color-pergamino-major", "--color-pergamino-arterial", "--color-pergamino-street",
  "--color-pergamino-minor", "--color-pergamino-river",
  // Depth (Blob bug and depth fix, below): landuse groups, buildings, boundaries.
  "--color-pergamino-green", "--color-pergamino-civic", "--color-pergamino-works",
  "--color-pergamino-cemetery", "--color-pergamino-aeroway", "--color-pergamino-building",
  "--color-pergamino-building-edge", "--color-pergamino-boundary",
] as const;

export type PergaminoTokenName = (typeof PERGAMINO_TOKEN_NAMES)[number];

/** Byte-identical to the @theme block in globals.css; a test proves it. */
export const PERGAMINO_FALLBACK_HEX: Record<PergaminoTokenName, string>;

/** Reads the live computed values; falls back per-token when empty (jsdom, no CSS). */
export function readPergaminoPalette(root?: HTMLElement): Record<PergaminoTokenName, string>;
```

The fallback map is the only place a ground hex is written in TypeScript. It lives in `src/lib`,
which `no-raw-hex.test.ts` does not scan (it walks `src/components` and `src/app` `.tsx` only) —
and a new test pins it to `globals.css` character-for-character, so the two cannot drift. Canvas
`fillStyle` cannot read a CSS custom property, so a resolved string is genuinely required; this
is the narrowest way to get one.

### Tokens added to `globals.css`

```css
/* "Pergamino" — the ground of the map Zpots draws itself. Ground colours only;
   map lettering reuses --color-ink / --color-stone-deep / --color-teal-deep. */
--color-pergamino-land:     #e9debf;
--color-pergamino-sea:      #d6be92;
--color-pergamino-coast:    #8a7048;
--color-pergamino-major:    #9d7b46;
--color-pergamino-arterial: #b5945f;
--color-pergamino-street:   #c5a87d;
--color-pergamino-minor:    #d5c09a;
--color-pergamino-river:    #a9b79e;

/* Depth (Blob bug and depth fix, below): landuse groups, buildings, boundaries. */
--color-pergamino-green:         #cbd0a8;
--color-pergamino-civic:         #e2d3c4;
--color-pergamino-works:         #dfd1ac;
--color-pergamino-cemetery:      #ccc9ac;
--color-pergamino-aeroway:       #e4d9c0;
--color-pergamino-building:      #dccaa3;
--color-pergamino-building-edge: #bfa574;
--color-pergamino-boundary:      #a58d64;
```

### Place labels (`src/lib/places.ts` + `src/data/zamboanga-places.ts`)

```ts
export type PlaceKind = "landmark" | "barangay" | "water";

export interface PlaceLabel {
  id: string;        // stable kebab slug, unique across the file
  name: string;      // as written; CSS applies the uppercase transform, never the data
  kind: PlaceKind;
  lat: number;
  lng: number;
  minZoom: number;   // first zoom it appears at
  maxZoom?: number;  // last zoom it appears at (water labels drop out when zoomed in)
}

export function visiblePlaceLabels(
  places: readonly PlaceLabel[],
  zoom: number,
  bounds?: readonly [[number, number], [number, number]],
): PlaceLabel[];
```

**Seed contents — SUPERSEDED 2026-09-21, see "Labels reversal" in the Change Log.** The 20-row
table below is kept as a historical record of D2's original scope. The live
`src/data/zamboanga-places.ts` now holds exactly the last two rows (`mar-de-basilan`,
`bahia-zamboanga`) — every `landmark` and `barangay` row duplicated a real name confirmed present
in the tile archive's own `places`/`pois` layers and was retired in favour of `buildLabelRules`
(below).

| id | name | kind | lat, lng | minZoom | maxZoom | Retired to |
|---|---|---|---|---|---|---|
| `fort-pilar` | Fort Pilar | landmark | 6.9028, 122.0817 | 13 | — | `pois` (`kind: "yes"`, `min_zoom: 15`) |
| `paseo-del-mar` | Paseo del Mar | landmark | 6.9040, 122.0780 | 14 | — | `pois` (`kind: "park"`, `min_zoom: 15`) |
| `plaza-pershing` | Plaza Pershing | landmark | 6.9114, 122.0763 | 14 | — | `pois`, close zoom |
| `city-hall` | City Hall | landmark | 6.9110, 122.0755 | 15 | — | `pois` ("Zamboanga City Hall", `kind: "townhall"`) |
| `pasonanca` | Pasonanca | landmark | 6.9440, 122.0660 | 12 | — | `pois`, close zoom |
| `rio-hondo` | Rio Hondo | landmark | 6.9010, 122.0900 | 14 | — | `pois` ("Rio Hondo Naval Station" etc.) |
| `isla-santa-cruz` | Isla Santa Cruz | landmark | 6.8830, 122.0620 | 12 | — | `pois` ("Santa Cruz Island Ferry Terminal") |
| `aeropuerto` | Aeropuerto | landmark | 6.9224, 122.0596 | 13 | — | `pois` ("Zamboanga International Airport") |
| `puerto` | Puerto | landmark | 6.9070, 122.0790 | 14 | — | `pois` ("Port of Zamboanga", `min_zoom: 13`) |
| `canelar` | Canelar | landmark | 6.9090, 122.0700 | 15 | — | `places` (`kind: "macrohood"`, `min_zoom: 11`) |
| `ateneo` | Ateneo | landmark | 6.9130, 122.0710 | 15 | — | `pois`, close zoom |
| `la-vieja-zamboanga` | Zamboanga | landmark | 6.9120, 122.0790 | 12 | 13 | `places` (`kind: "locality"`, "Zamboanga City", `min_zoom: 6` — already covers this zoom range) |
| `tetuan` | Tetuan | barangay | 6.9210, 122.0850 | 15 | — | `places` (`kind: "macrohood"`/`"neighbourhood"`) |
| `santa-maria` | Santa María | barangay | 6.9280, 122.0700 | 15 | — | `places` |
| `baliwasan` | Baliwasan | barangay | 6.9080, 122.0630 | 15 | — | `places` (`kind: "macrohood"`, confirmed present) |
| `guiwan` | Guiwan | barangay | 6.9330, 122.0900 | 15 | — | `places` |
| `putik` | Putik | barangay | 6.9390, 122.0840 | 15 | — | `places` |
| `tugbungan` | Tugbungan | barangay | 6.9350, 122.0590 | 15 | — | `places` |
| `mar-de-basilan` | Mar de Basilán | water | 6.8600, 122.0500 | 12 | 14 | **Kept.** No tile equivalent — `water` only carries ocean-scale names ("Sulu Sea") outside the city view. |
| `bahia-zamboanga` | Bahía de Zamboanga | water | 6.8930, 122.0700 | 13 | 15 | **Kept.** Same reason. |

"Confirmed present" above means queried directly against `public/basemap/zamboanga.pmtiles` with
the `pmtiles` CLI and `@mapbox/vector-tile` (not assumed from the schema alone) — see "Labels
reversal" in the Change Log for the method and the fuller set of names found this way.

### Tile-driven labels — `buildLabelRules` (`src/components/BasemapLayer.tsx`)

The primary naming system since the labels reversal. A pure function, tested the same way
`buildPaintRules` already is (`BasemapLayer.label-rules.test.ts`): given the lazily-imported
protomaps-leaflet module, a resolved font stack, and resolved label colours, it returns
protomaps-leaflet `LabelRule[]`.

| Tier | `dataLayer` | Filter | `minzoom` | Font | Fill |
|---|---|---|---|---|---|
| Settlement | `places` | `kind === "locality"` | — | Cinzel 600, uppercase | ink |
| District (macrohood) | `places` | `kind === "macrohood"` | 11 | Alegreya Sans 500, uppercase | stone-deep |
| District (neighbourhood) | `places` | `kind === "neighbourhood"` | 13 | Alegreya Sans 500, uppercase | stone-deep |
| Street (major/arterial) | `roads` | `roadClass(props)` is major/arterial | 12 | Alegreya Sans 500 | stone-deep |
| Street (minor) | `roads` | `roadClass(props)` is street/minor | 14 | Alegreya Sans 400 | stone-deep |
| Water (line) | `water` | `isWaterLine(props)`, Line geometry | 13 | Alegreya italic 500 | teal-deep |
| Water (point) | `water` | `kind` in ocean/bay/strait/fjord/sea/lake, Point geometry | — | Alegreya italic 500 | teal-deep |
| POI | `pois` | `poiHasName(props)`, Point geometry | 15 | Cinzel 600, uppercase | ink |

`roadClass`, `isWaterLine`, and `poiHasName` are the exact same functions `pergamino-style.ts`
already uses to *paint* the ground — a road/river/POI is labelled under the same classification
it was drawn under, not a second, independently-drifting one. `poiHasName` also gates the new
`pois` ground-dot paint layer (Step 3, see the Blob bug/depth Change Log entries above for the
pattern this follows).

Every symbolizer carries a cream halo (`stroke`/`width`) and uses protomaps-leaflet's built-in
text symbolizers (`CenteredTextSymbolizer`, `LineLabelSymbolizer`, `OffsetTextSymbolizer`), which
share one collision index (`labeler.ts`'s `Index`) — two labels from different tiers never
draw on top of each other, which the old DOM-only curated system had no mechanism for.

### The webfont race — `src/lib/pergamino-fonts.ts`

Canvas text does not wait for a webfont; `document.fonts.load(spec)` returns a promise that
resolves once the matching `@font-face` is actually loaded. `readPergaminoFontStack` resolves
`--font-wordmark`/`--font-display`/`--font-body` (globals.css's nested `@theme inline` vars) to
literal font-family stacks via a probe element + `getComputedStyle` (the same pattern
`readPergaminoPalette` uses for colour tokens, extended because these three are themselves
`var(...)`-nested and only a real `font-family` computed value — not a raw custom-property read —
resolves the chain). `buildFontLoadTasks` turns those into `document.fonts.load(...)` promises,
passed to protomaps-leaflet as its `tasks` option.

This isn't cosmetic: `frontends/leaflet.ts`'s `renderTile` does
`await Promise.all(this.tasks.map(reflect))` **before** `this.labelers.add(...)` (the layout
pass that measures text) — and it does this on *every* tile render, not just the first. A tile
painted before Cinzel/Alegreya finished loading therefore waits for `tasks` to resolve rather than
locking in a fallback face forever, which is the exact failure mode D1's own research (table row
3) flagged and D2 (superseded) underestimated.

Verification: jsdom does not implement the CSS Font Loading API at all (`document.fonts` is
`undefined`) and does not resolve `var(...)` in computed styles either — both confirmed directly
(`node -e` against a bare `jsdom` instance) before writing `pergamino-fonts.test.ts`, not assumed.
So the test suite exercises the fallback path (generic `serif`/`sans-serif`, matching `@theme
inline`'s own terminal fallback) and the `tasks`-construction contract (`document.fonts.load`
called once per font face `buildLabelRules` actually draws with, guarded to return `[]` rather
than throw when the API is missing). The race-avoidance *mechanism* itself — the library awaiting
`tasks` ahead of every tile's layout — is verified by reading `frontends/leaflet.ts` directly, not
by a browser test; no browser-automation tool was available in this session, same limitation
noted in the "Blob bug and depth fix" Change Log entry above.

### Label CSS (in `globals.css`)

```css
.zpots-place-label { background: none; border: 0; }      /* kill Leaflet's divIcon chrome */

.zpots-place-label span {
  position: absolute; left: 0; top: 0; transform: translateX(-50%);
  white-space: nowrap; pointer-events: none;
  text-shadow:
     0  1px 2px var(--color-cream),  0 -1px 2px var(--color-cream),
     1px 0   2px var(--color-cream), -1px 0  2px var(--color-cream);
}

.zpots-place-label--landmark span {
  font-family: var(--font-wordmark); font-weight: 600; font-size: 11px;
  letter-spacing: .15em; text-transform: uppercase; color: var(--color-ink);
}
.zpots-place-label--barangay span {
  font-family: var(--font-body); font-weight: 500; font-size: 9.5px;
  letter-spacing: .2em; text-transform: uppercase; color: var(--color-stone-deep);
}
.zpots-place-label--water span {
  font-family: var(--font-display); font-style: italic; font-weight: 500; font-size: 14px;
  letter-spacing: .34em; color: color-mix(in srgb, var(--color-teal-deep) 78%, transparent);
}
```

`createPlaceLabelIcon` returns `L.divIcon({ className: "zpots-place-label zpots-place-label--<kind>",
html: '<span aria-hidden="true">Name</span>', iconSize: [0, 0], iconAnchor: [0, offsetY] })`,
with `offsetY = -15` for `landmark` (Leaflet places the icon box so `iconAnchor` lands on the
point, so a negative Y pushes the box **down**) and `0` for `barangay` / `water`. Markers are
created with `{ interactive: false, keyboard: false }`.

---

## Test plan

**Test-first.** Every task writes its tests against the contract below and watches them fail red
before a line of implementation exists. No test may be reshaped after the fact to match what got
built; if a contract below turns out to be wrong, change the contract here first and say why.

### New: `src/__tests__/pergamino-tokens.test.ts` (node env)

1. `globals.css` declares each of the eight `--color-pergamino-*` tokens with exactly the hex in
   this PRD.
2. `PERGAMINO_FALLBACK_HEX` has exactly `PERGAMINO_TOKEN_NAMES` as its keys — no more, no fewer.
3. For every token, `PERGAMINO_FALLBACK_HEX[name]` string-equals the value parsed out of
   `globals.css`. (This is the anti-drift lock.)
4. Every `fillToken`/`strokeToken` referenced by `PERGAMINO_LAYERS` is a member of
   `PERGAMINO_TOKEN_NAMES`.
5. `globals.css` still contains the `.leaflet-tile-pane` sepia rule (the fallback depends on it).
6. `globals.css` declares `.zpots-place-label--landmark/--barangay/--water`, and each uses only
   `var(--…)` colours — the rule bodies contain no `#` hex literal.

### New: `src/__tests__/pergamino-style.test.ts` (node env)

7. `roadClass` returns the full table above, case by case, including `is_link: true` variants.
8. `roadClass({ kind: "minor_road", kind_detail: "something_new" })` → `"street"` (unknown never
   disappears).
9. `roadClass({})`, `roadClass({ kind: "rail" })`, `{ kind: "path" }`, `{ kind_detail: "runway" }`
   → `null`.
10. `roadClass` never throws on garbage: `{ kind: 42 }`, `{ kind: null }`, `{ kind: [] }`.
11. `PERGAMINO_WEIGHTS` equals the approved numbers exactly (1.3 / 2.4 / 1.7 / 1.1 / 0.65 / 1.2).
12. `PERGAMINO_LAYERS` ids are unique, and the order is earth → water → rivers → minor → street →
    arterial → major (thin roads under thick ones, everything over the ground).
13. Importing `@/lib/pergamino-style` pulls in no Leaflet and no protomaps module — assert the
    module's own source contains no `import` from `leaflet` or `protomaps-leaflet`.

### New: `src/__tests__/basemap-source.test.ts` (jsdom)

14. 206 + body starting `PMTiles\x03` → `"ok"`.
15. It sends exactly one request, with header `Range: bytes=0-16383`, and never reads more.
16. **200** + valid magic → `"unavailable"` (a server that ignores `Range` would force the whole
    archive down the wire; that is a failure, not a success).
17. 404 → `"unavailable"`. 403 → `"unavailable"`. 500 → `"unavailable"`.
18. 206 with an HTML error page body → `"unavailable"`.
19. 206 with a body shorter than 8 bytes → `"unavailable"`.
20. `fetch` rejects (network down / CORS) → `"unavailable"`, and it does **not** throw.
21. A URL whose pathname does not end in `.pmtiles` → `"unavailable"` **without any fetch at all**
    (guards the `view.ts:244` trap).
22. A request that never settles → `"unavailable"` after the 8 s timeout, with the request aborted.

### New: `src/__tests__/places.test.ts` (node env)

23. Every `id` in `ZAMBOANGA_PLACES` is unique.
24. Every place is inside `ZAMBOANGA_CITY_OUTLINE` (`isInsideCityOutline`) — except `kind: "water"`
    entries, which are asserted inside `ZAMBOANGA_CITY_BOUNDS` instead.
25. Every `minZoom` ≥ `MIN_ZOOM` (12) and ≤ `MAX_ZOOM`; `maxZoom`, when present, ≥ `minZoom`.
26. `visiblePlaceLabels(ZAMBOANGA_PLACES, 11)` → `[]` (below the app's own floor).
27. **The headline contract:** `visiblePlaceLabels(ZAMBOANGA_PLACES, 14, DOWNTOWN_BBOX).length` is
    ≥ 5 and ≤ 10 — "roughly eight downtown, not sixty", where `DOWNTOWN_BBOX` is
    `[[6.89, 122.06], [6.93, 122.10]]`.
28. No `barangay` label is visible below z15.
29. A place with `maxZoom: 14` is absent at z15 (water labels retire when you zoom in).
30. `bounds` filtering is inclusive on all four edges, and omitting `bounds` filters by zoom only.
31. `visiblePlaceLabels` does not mutate its input array and returns a new array each call.

### New: `src/__tests__/place-label-icon.test.ts` (jsdom)

32. `createPlaceLabelIcon` puts `zpots-place-label` **and** `zpots-place-label--<kind>` in the
    icon's `className`.
33. The generated HTML contains the place's `name` verbatim — **not** uppercased (the data stays
    mixed-case; CSS does the transform).
34. The HTML carries `aria-hidden="true"` so labels never reach the accessible tree.
35. `iconAnchor` is `[0, -15]` for a landmark and `[0, 0]` for barangay and water; `iconSize` is
    `[0, 0]`.
36. The generated HTML contains no `#` hex literal — colour comes from the class, not inline.
37. A name containing `<`, `&` or a quote is escaped, not injected raw.

### New: `src/__tests__/BasemapLayer.test.tsx` (jsdom)

Mocks `protomaps-leaflet` (`vi.mock`, since the component `await import()`s it) and passes a
hand-written fake map recording `addLayer`/`removeLayer`.

38. `map === null` → renders nothing, calls no `fetch`, never imports `protomaps-leaflet`.
39. Probe `"ok"` → `leafletLayer` called exactly once, with: `url` = `BASEMAP_PMTILES_URL`,
    `labelRules` = `[]`, `maxDataZoom` = `BASEMAP_MAX_DATA_ZOOM`, `attribution` =
    `BASEMAP_ATTRIBUTION`, `backgroundColor` = the resolved **sea** colour, and a `paintRules`
    array whose length equals `PERGAMINO_LAYERS.length`.
40. Probe `"ok"` → **no** `TileLayer` is rendered, and `onModeChange` is called with
    `"pergamino"` (or not called at all if that is the initial state — pick one and pin it).
41. Probe `"unavailable"` → a `TileLayer` **is** rendered with `TILE_URL` / `TILE_ATTRIBUTION`,
    `leafletLayer` is never called, and `onModeChange("raster")` fires exactly once.
42. Unmount before the probe resolves → `addLayer` is never called (or, if the layer was already
    added, `removeLayer` is called with the same instance). No "setState on an unmounted
    component" warning.
43. Unmount after the layer is added → `removeLayer` is called exactly once with that instance.
44. The `map` prop changing identity tears the old layer down before adding a new one — never two
    layers at once.
45. Mounting twice (React StrictMode double-invoke) leaves exactly one layer attached.
46. The component sets `window.L` when it is missing and leaves an existing `window.L` untouched.
47. `BASEMAP_ATTRIBUTION` contains `OpenStreetMap` and `https://www.openstreetmap.org/copyright`.

### New: `src/__tests__/PlaceLabelsLayer.test.tsx` (jsdom)

48. `map === null` → renders nothing, creates no pane, adds no layer.
49. With a fake map at zoom 14 → a pane named `placeLabels` is created with `zIndex` `"450"`, and
    the number of markers added equals `visiblePlaceLabels(ZAMBOANGA_PLACES, 14).length`.
50. `getPane` already returning a pane → `createPane` is not called again (idempotent, same
    contract as `CityMask`).
51. A `zoomend` event at a new zoom rebuilds the group; the count matches the new zoom's
    `visiblePlaceLabels`.
52. A `zoomend` at the **same** zoom does not rebuild (no churn on every pan).
53. Every marker is created with `interactive: false` and `keyboard: false`.
54. Unmount removes the layer group and calls `map.off("zoomend", …)` with the same handler it
    registered — no leak across the deck's remounts.

### Changed: `src/__tests__/SpotMap.test.tsx`

**This is the only existing test file whose assertions change.** It is a real, intentional
contract change — "the basemap is a raster tile layer" stops being true — not a coverage
deletion, and the replacement is strictly stronger than what it replaces.

| Line(s) | Now | Becomes |
|---|---|---|
| 29-40 | `TileLayer` stand-in in the `react-leaflet` mock | **Kept as-is.** Still needed: `BasemapLayer` renders a real `TileLayer` in the fallback path. |
| 80 | `import { …, TILE_URL, TILE_ATTRIBUTION } from "@/lib/map-config"` | **Unchanged** — both constants still exist and are still the fallback's contract. |
| 125-131 | `it("renders exactly one TileLayer using TILE_URL and TILE_ATTRIBUTION")` — asserts one `tile-layer`, its `data-url`, its `data-attribution` | Replaced by `it("renders exactly one BasemapLayer and no raster tile layer")`: add `vi.mock("@/components/BasemapLayer")` with a stand-in serialising props; assert exactly **one** `data-testid="basemap"`, **zero** `tile-layer`, and that its serialised props carry `BASEMAP_PMTILES_URL` and an `attribution` containing `OpenStreetMap`. |

Every other assertion in the file — centre, zoom, marker counts, popups — stays byte-identical.

### Changed: `src/__tests__/map-config.test.ts` — **no change**

Lines 9-10 and 58-70 keep asserting `TILE_URL`'s `{z}/{x}/{y}` placeholders, its http(s) shape and
`TILE_ATTRIBUTION` naming OpenStreetMap. All still true: they are the fallback's contract now.
New assertions go in a **new** file `src/__tests__/map-config.basemap.test.ts`:

55. `BASEMAP_PMTILES_URL` is a non-empty string whose URL pathname ends in `.pmtiles`
    (resolved against a dummy origin so a relative default passes).
56. `BASEMAP_MAX_DATA_ZOOM` is an integer in `[MIN_ZOOM, MAX_ZOOM]`.
57. `BASEMAP_ATTRIBUTION` names OpenStreetMap, links to the copyright page, and names Protomaps.
58. `TILE_URL` and `TILE_ATTRIBUTION` are still exported (the fallback would silently die
    otherwise).

### Changed: `src/__tests__/theme-tokens.test.ts` — **no change**

Line 65-71's `.leaflet-tile-pane` sepia assertion stays green because the rule stays (D5).

### Changed: `src/__tests__/tile-tint-cascade.adversarial.test.ts` — **no change**

All four assertions (lines 26, 39, 49, 60) stay green and stay meaningful: the cascade ordering
still decides whether the fallback map is tinted or raw OSM blue.

### Unchanged mocks, listed so nobody "helpfully" edits them

`MapInset.test.tsx:52`, `PostFlow.adversarial.test.tsx:41`, `PostFlow.test.tsx:58`,
`SpotMap.city.test.tsx:38`, `SpotMap.fitToCity.zero-size.test.tsx:38`,
`SpotMap.fitbounds.test.tsx:36`, `SpotMap.popup.test.tsx:19`,
`SpotMap.wiring.adversarial.test.tsx:43`, `SpotMap.wiring.test.tsx:46` all define a `TileLayer`
stand-in but **assert nothing about it** (verified by grep: the only `tile-layer` assertion in the
suite is `SpotMap.test.tsx:127`). They keep working untouched because D4 means `map` is `null` in
jsdom, so `BasemapLayer` renders nothing and `PlaceLabelsLayer` does nothing.

### New: `src/__tests__/SpotMap.pergamino.test.tsx` (jsdom)

59. `SpotMap` passes its live map instance to both `BasemapLayer` and `PlaceLabelsLayer` (assert
    via stand-ins that both receive the same `map` prop value).
60. `basemapMode === "raster"` → the bilingual chip renders, with the English accessible name
    `Simplified map` and the Chavacano `Mapa simple` visually (`aria-hidden`) — same
    `Bilingual` convention as everywhere else.
61. `basemapMode === "pergamino"` → no chip anywhere in the tree.
62. The chip never covers the popup: it renders outside `MapContainer`'s children.

### New: `src/__tests__/copy.pergamino.test.ts`

63. `COPY.simpleMap` and `COPY.simpleMapWhy` exist, both have non-empty `cv` and `en`, and
    `cv !== en` (the existing `copy.adversarial.test.ts` allowlist rule).

### Whole-suite gates (every wave)

64. `npm test` green — no test deleted, no assertion weakened beyond the single documented change
    in `SpotMap.test.tsx`.
65. `npx tsc --noEmit` clean apart from the **pre-existing** `TS2322` in
    `src/__tests__/spots-repo.test.ts` documented in `.claude/learnings.md`.
66. `npm run lint` clean apart from the pre-existing unused-import warning in the same file.
67. `npm run build` succeeds and every static route still prerenders — the real regression guard
    for "window is not defined", which is the failure mode this stack has hit twice.

### Test plan addendum — Labels reversal (post-launch)

New:
- `src/__tests__/pergamino-fonts.test.ts` (jsdom) — `readPergaminoFontStack` falls back correctly
  (jsdom never resolves `var(...)`, confirmed directly), leaves no stray DOM node,
  `pergaminoFontLoadSpecs` produces the three face descriptors, `buildFontLoadTasks` calls
  `document.fonts.load` once per spec and degrades to `[]` when the API is missing.
- `src/__tests__/BasemapLayer.label-rules.test.ts` (node env) — `buildLabelRules` against a fake
  protomaps module: one rule per tier, unique ids, "never bare between z11 and z15" (some rule's
  `minzoom` is at or below every zoom in that range), each tier's `filter` matches/rejects the
  right `kind`/`geomType`/`roadClass`/`poiHasName` combination, and every symbolizer's `font`
  contains the right resolved face and carries a cream halo (`stroke`/`width`).
- New cases in `src/__tests__/BasemapLayer.geometry-filter.test.tsx` — the `pois` paint rule
  rejects a Polygon feature, accepts a named Point feature, rejects an unnamed Point feature.
- New cases in `src/__tests__/pergamino-style.test.ts` — `poiHasName`'s never-throws/never-empty
  contract, the `pois` PERGAMINO_LAYERS entry (point geometry, `minZoom: 15`, sits after every
  road layer).
- New assertions in `src/__tests__/pergamino-tokens.test.ts` — `--color-pergamino-poi` declared
  and anti-drift-locked; `PERGAMINO_LABEL_FALLBACK_HEX`'s four values (`--color-ink`,
  `--color-stone-deep`, `--color-teal-deep`, `--color-cream`) anti-drift-locked against the
  existing "Ciudad Latina" theme block (not new tokens — the map's lettering reuses these).

Changed:
- `src/__tests__/BasemapLayer.test.tsx` — `options.labelRules` no longer asserted `toEqual([])`;
  now asserted as an array whose length matches `buildLabelRules`'s own output, plus a new
  assertion that `options.tasks` is present (`[]` in jsdom, per the font-race fallback above). The
  `vi.mock("protomaps-leaflet", ...)` factory gained `CircleSymbolizer`, `CenteredTextSymbolizer`,
  `LineLabelSymbolizer`, `OffsetTextSymbolizer`, `TextPlacements` — an unfaithful mock without
  them throws "is not a constructor" the moment `buildPaintRules`/`buildLabelRules` run, landing
  every "probe ok" test in the raster-fallback branch instead of failing loudly (this is exactly
  what happened before the mock was extended — five tests failed with the fallback silently
  swallowing the real error, not a clean assertion failure).
- `src/__tests__/BasemapLayer.container-attr.test.tsx` — same mock extension, no assertion
  changes (this file only checks the `data-basemap` attribute, not `labelRules`/`tasks`).
- `src/__tests__/places.test.ts` — the "roughly eight labels downtown" headline contract and the
  "no barangay below z15"/`la-vieja-zamboanga` tests are removed (they asserted on curated data
  that no longer exists); a new test locks `ZAMBOANGA_PLACES` to exactly the two water entries.
  Density/de-cluttering are now `buildLabelRules`' job, covered structurally by
  `BasemapLayer.label-rules.test.ts` since canvas text isn't jsdom-measurable — same limitation
  the original D2 point 3 named, now landing on the tile system instead of the curated one.
- `src/data/zamboanga-places.ts`, `src/lib/places.ts`, `src/components/PlaceLabelsLayer.tsx`,
  `globals.css` — doc comments only, explaining the reduced scope; no behavioural change to
  `visiblePlaceLabels`, `createPlaceLabelIcon`, or `PlaceLabelsLayer` itself.
  `place-label-icon.test.ts` and `PlaceLabelsLayer.test.tsx` needed no changes — both are generic
  over `kind`/derive expectations from the live `ZAMBOANGA_PLACES` array rather than hardcoding
  its former contents.

---

## Edge cases and failure modes

| # | Case | Required behaviour |
|---|---|---|
| E1 | Archive 404s / bucket deleted | Raster fallback + chip (D6). Never a blank rectangle. |
| E2 | Host ignores `Range`, answers `200` with the whole file | Treated as **unavailable**. Downloading 8–40 MB on a phone to draw one tile is worse than the fallback. |
| E3 | CORS blocked | `fetch` rejects → `"unavailable"` → fallback. |
| E4 | URL path does not end in `.pmtiles` | Caught by the probe **before** any network call; protomaps would otherwise silently treat it as a `{z}/{x}/{y}` template and draw nothing at all. |
| E5 | File is served but is not PMTiles v3 (wrong upload, HTML error page) | Magic-byte check → fallback. |
| E6 | Slow network, probe never settles | 8 s `AbortController` timeout → fallback. The map is usable either way. |
| E7 | Component unmounts mid-probe (deck swipe, route change) | No `addLayer` after unmount; no state set after unmount; if the layer was attached, it is removed. |
| E8 | React StrictMode double-invokes the effect | Exactly one layer attached, exactly one pane created. |
| E9 | Zero-size container at mount (the `fitToCity`/`fill` bug class in `.claude/learnings.md`) | GridLayer tolerates it; the existing `invalidateSize()` path in `MapInsetInner` is unchanged and still applies. |
| E10 | `window.L` missing because a bundler picked an ESM Leaflet build | `BasemapLayer` sets it before calling `leafletLayer()`; asserted by test 46. |
| E11 | Retina / `devicePixelRatio` 3 | Handled by the library (`tileSize = 256 * dpr`). Do not override `devicePixelRatio`. |
| E12 | A road arrives with an unrecognised `kind_detail` | Falls to the middle weight and is still drawn. A road never vanishes because of an unknown tag. |
| E13 | A label name contains `&`, `<` or a quote | Escaped in the divIcon HTML (test 37). |
| E14 | Two labels overlap at some zoom | **Superseded by the labels reversal.** Tile-driven labels (`buildLabelRules`) use protomaps-leaflet's own collision index (`labeler.ts`'s `Index`), which drops the losing label automatically -- this also fixed the waterfront pileup the curated DOM system couldn't (four landmark labels used to cluster there; all four were retired, see "Labels reversal"). The two remaining curated water labels don't share that index with the canvas labels (D3 unchanged), but at two entries, both positioned over open water away from the POI-dense downtown core, the practical collision risk is low; if it bites, adjust `minZoom`/coordinates in `zamboanga-places.ts`. |
| E15 | A label sits over a spot pin | Cannot hide it: labels are pane 450 (curated) or the tile canvas pane 200 (tile-driven), pins are 600, and landmark-family labels sit below/beside their point, never centred under a pin. |
| E16 | Labels in the accessible tree / tab order | `aria-hidden="true"` and `interactive: false, keyboard: false`. Map furniture is not content. |
| E17 | 112 px deck inset would be unreadable with labels | `PlaceLabelsLayer` is mounted by `SpotMap` only. Inset and `PostFlow` get ground + pin only. |
| E18 | Attribution hidden on the inset (`attributionControl={false}`, `MapInsetInner.tsx:164`) | Unchanged and acceptable: the full map at `/mapa` and the desktop column carry the control, and the inset's tap opens the full map. |
| E19 | Someone re-cuts the archive and the road property vocabulary shifts | `roadClass`'s unknown-input fallbacks (E12) keep the map drawing; the `kind_detail` confirmation in T2.3 is what keeps it *correct*. |
| E20 | Extract exceeds 50 MB | Re-cut at `--maxzoom=14`, set `BASEMAP_MAX_DATA_ZOOM = 14`. One constant. |
| E21 | Two coder agents in one working tree | Per `.claude/learnings.md`: their `git add`/`commit` calls race and merge tasks into one commit. Run parallel tasks in separate worktrees, or serialise the commits. |

---

## Out of scope

- The floating bottom navigation ("Isla") and folding the Mi mapa legend into a chip — a separate
  decision the user has not made. **Do not touch `AppNav.tsx` or `app/mapa/page.tsx`'s legend.**
- ~~Label collision avoidance, any use of protomaps-leaflet's `labelRules`, or labels derived
  from tile data.~~ **Now in scope** (see the "Labels reversal" Change Log entry) — this line
  described D2, which is superseded. `buildLabelRules` (`BasemapLayer.tsx`) is the primary naming
  system; it uses protomaps-leaflet's `labelRules` and its built-in label collision handling.
- Changing `MIN_ZOOM`, `MAX_ZOOM`, `DEFAULT_ZOOM`, `MAX_BOUNDS`, `ZAMBOANGA_CENTER`, the city
  outline, `CityMask`, pin icons, or popup markup.
- Any automated pipeline to refresh the `.pmtiles` archive on a schedule. It is cut by hand; note
  the build date in the PRD's change log when it is.
- Landcover, POI icons, contours, hillshade. **Buildings, landuse and boundaries are now in
  scope** (see the "Blob bug and depth fix" Change Log entry below) — this line originally
  excluded them, which is now wrong; ground, depth, and lettering only.
- Offline caching / service worker.
- MapLibre GL. Recorded as a fallback in D1; not built.

---

## Assumptions

1. The published design preview is the source of truth for colour and weight; the table in
   "Original requirements" transcribes it faithfully. If a builder finds a discrepancy, the
   preview wins and this PRD gets amended.
2. The ~12 preview place names are approximated by the 20-row table above. Coordinates are
   best-known values, not surveyed, and are checked only for "inside the city outline".
3. `kind_detail` on the `roads` layer carries the original OSM highway value for ordinary roads.
   Proven only for `service`/`pier`/`runway`/`taxiway` from the shipped style; T2.3 confirms the
   rest against the real extract and this PRD's mapping table is amended if it differs.
4. Supabase Storage answers `206` to a `Range` request. Not verifiable here (no object in the
   bucket); one curl at T4.1 settles it, and option A is the standing fallback.
5. The user installs `pmtiles` via Homebrew (T2.3). If they would rather not, the archive can be
   cut by anyone with the CLI and dropped in; nothing in the code depends on how it was made.

---

## Wave Execution Plan

Tasks inside a wave have no dependency on each other and touch disjoint files.

| Wave | Task | Type | Files | Depends on |
|---|---|---|---|---|
| 1 | **T1.1** Tokens + label CSS. Add the 8 `@theme` ground tokens and `.zpots-place-label*` rules; re-scope the `.leaflet-tile-pane` comment to "fallback only". Write `pergamino-tokens.test.ts` red first. | auto | `src/app/globals.css`, `src/lib/pergamino-palette.ts`, `src/__tests__/pergamino-tokens.test.ts` | — |
| 1 | **T1.2** Pure ground style: `roadClass`, `PERGAMINO_WEIGHTS`, `PERGAMINO_LAYERS`. Tests 7-13 red first. | auto | `src/lib/pergamino-style.ts`, `src/__tests__/pergamino-style.test.ts` | — |
| 1 | **T1.3** Curated places: types, `visiblePlaceLabels`, the data file, `createPlaceLabelIcon`. Tests 23-37 red first. | auto | `src/lib/places.ts`, `src/data/zamboanga-places.ts`, `src/lib/place-label-icon.ts`, `src/__tests__/places.test.ts`, `src/__tests__/place-label-icon.test.ts` | — |
| 1 | **T1.4** Archive probe. Tests 14-22 red first. | auto | `src/lib/basemap-source.ts`, `src/__tests__/basemap-source.test.ts` | — |
| 1 | **T1.5** Config + copy: `BASEMAP_*` constants, `simpleMap`/`simpleMapWhy`, `.env.local.example`. Tests 55-58, 63 red first. `TILE_URL`/`TILE_ATTRIBUTION` must survive. | auto | `src/lib/map-config.ts`, `src/lib/copy.ts`, `.env.local.example`, `src/__tests__/map-config.basemap.test.ts`, `src/__tests__/copy.pergamino.test.ts` | — |
| 1 | **T1.6** Decide where the `.pmtiles` archive is hosted: Supabase Storage (recommended) vs `public/` in the repo. Present the table in the Checkpoint section. | **checkpoint:decision** | — (decision only) | — |
| 2 | **T2.1** `BasemapLayer`: probe + lazy `import("protomaps-leaflet")`, paint-rule translation, raster fallback, `window.L` guard, teardown. Tests 38-47 red first. | auto | `src/components/BasemapLayer.tsx`, `src/__tests__/BasemapLayer.test.tsx` | T1.1, T1.2, T1.4, T1.5 |
| 2 | **T2.2** `PlaceLabelsLayer`: pane, zoom subscription, marker group, teardown. Tests 48-54 red first. | auto | `src/components/PlaceLabelsLayer.tsx`, `src/__tests__/PlaceLabelsLayer.test.tsx` | T1.3 |
| 2 | **T2.3** Cut the archive: `brew install pmtiles`, run the `pmtiles extract` in this PRD, **report the byte size**, and confirm the `roads` layer's real `kind`/`kind_detail` vocabulary (`pmtiles tile`/`pmtiles show`) against the mapping table. Amend the table here if it differs. If >50 MB, re-cut at `--maxzoom=14`. | **checkpoint:human-action** | `zamboanga.pmtiles` (not yet placed), this PRD's road table | T1.6 |
| 3 | **T3.1** Wire `SpotMap`: `TileLayer` → `<BasemapLayer map={leafletMap} onModeChange=…/>`, add `<PlaceLabelsLayer map={leafletMap} />`, add the raster chip. Rewrite `SpotMap.test.tsx:125-131` per the table above; write `SpotMap.pergamino.test.tsx` (59-62) red first. | auto | `src/components/SpotMap.tsx`, `src/__tests__/SpotMap.test.tsx`, `src/__tests__/SpotMap.pergamino.test.tsx` | T2.1, T2.2 |
| 3 | **T3.2** Wire the two small maps: `MapInsetInner` (add `ref={setMap}`, swap `TileLayer`, **no labels, no chip**) and `PostFlow` (same swap at line 307). Their existing tests must stay green untouched. | auto | `src/components/MapInsetInner.tsx`, `src/components/PostFlow.tsx` | T2.1 |
| 4 | **T4.1** Put the archive on the chosen host, set `NEXT_PUBLIC_BASEMAP_PMTILES_URL` locally and on Vercel, then verify with curl that the URL returns **206**, an `accept-ranges: bytes` header, `PMTiles\x03` as its first bytes, and a permissive CORS header. If it returns 200, switch to option A. | **checkpoint:human-action** | Supabase Storage bucket `basemap` **or** `public/basemap/zamboanga.pmtiles`, `.env.local`, Vercel env | T1.6, T2.3, T3.1, T3.2 |
| 5 | **T5.1** Look at it: `npm run dev`, check `/` (desktop two-column), `/mapa`, the deck inset and `/post` at 375 px and at desktop width. Confirm the parchment reads as the preview did, roughly eight labels downtown, landmark labels clear of the pins. Then `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. | **checkpoint:human-verify** | — | T4.1 |
| 6 | **T6.1** Capture what was learned (the `window.L` global, the `.pmtiles` pathname trap, the measured extract size, the real `kind_detail` vocabulary, whether Supabase answered 206) and flip this PRD's Status to Complete with the archive's build date. | auto | `.claude/learnings.md`, `.claude/prds/pergamino-map.md` | T5.1 |

**Commits:** one per task, `{type}({scope}): {description}`, with the `Co-Authored-By` line.
Suggested scopes: `feat(pergamino-task-1.1)` … `feat(pergamino-task-3.2)`. Per E21, do not run two
coder agents in the same working tree.

---

## Acceptance criteria

- [ ] The map at `/mapa` renders parchment land, deeper parchment sea, a drawn coastline, and four
      distinct road weights — no raster photograph, no CSS `filter` in play.
- [ ] The eight ground colours and six weights match the approved table exactly.
- [ ] Roughly eight labels in a downtown view (test 27 enforces 5-10 at z14); barangays only from
      z15; landmark labels sit 15 px below their point and are never covered by a pin.
- [ ] Landmark / barangay / water lettering matches the approved font, size, tracking, case and
      colour, with a cream halo.
- [ ] No raw hex in `src/components` or `src/app` `.tsx` (`no-raw-hex.test.ts` green); every
      ground colour is a `@theme` token; `PERGAMINO_FALLBACK_HEX` is pinned to `globals.css`.
- [ ] OpenStreetMap attribution appears on the full map in both pergamino and raster modes.
- [ ] Killing the archive URL produces the tinted raster map plus the `Simplified map` chip — never
      a blank rectangle, never a crash.
- [ ] Leaflet still loads only through `next/dynamic` with `ssr: false`; `npm run build`
      prerenders every static route.
- [ ] No real Leaflet is rendered in jsdom; no existing `react-leaflet` mock needed changing.
- [ ] `SpotMap.test.tsx:125-131` is the only existing assertion changed, and its replacement
      asserts more than it did.
- [ ] `tile-tint-cascade.adversarial.test.ts`, `theme-tokens.test.ts` and `map-config.test.ts`
      pass **unmodified**.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean apart from the two
      pre-existing issues in `src/__tests__/spots-repo.test.ts`.
- [ ] No emoji, no icon pack, no stock template anywhere in the diff.
- [ ] `AppNav.tsx` and the Mi mapa legend are untouched.

---

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-20 | PRD created | User approved the "Pergamino" drawn-map direction against a published design preview |


## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-09-20 | T3.3 added, not in the original plan: four fake Leaflet maps extended with `getPane`/`createPane`/`addLayer`/`removeLayer`/`getZoom`. | D4's claim that no existing react-leaflet mock needed changing was wrong for the suites that forward a live fake map through `ref`. 35 tests failed until the doubles were made faithful. |
| 2026-09-20 | T3.4 added after review rejected the change: `attach()` wrapped in try/catch with a shared raster fallback. | The archive probe never throws, but the awaited dynamic `import()` does. An unhandled rejection left the ground permanently blank, violating D6's own "never a blank rectangle" guarantee. |
| 2026-09-20 | T3.4 also wired `COPY.simpleMapWhy` into the fallback chip as its title and accessible description. | It was defined and asserted to exist but never rendered, i.e. a copy entry existing only to satisfy a test. |
| 2026-09-20 | T3.5 added: the catch logs the caught error, gated on still being mounted. | Review noted the catch would otherwise turn a genuine defect, such as a TypeError while building paint rules, into a silent downgrade discoverable only by eye. |
| 2026-09-20 | Deferred Wave 1 test 4 (token membership) backfilled into `pergamino-style.test.ts`. | T1.1 could not import a parallel task's not-yet-written module; the natural dependency direction is style importing the palette's token names. |

## Outcome so far

Waves 1 to 3 are implemented, reviewed and committed across twelve commits. Gates: 82 test files,
1070 tests passing, types clean, build clean, one pre-existing lint warning unrelated to this work.

The map is wired end to end but **nobody has seen the drawn version in the real app yet**, because
the `.pmtiles` archive is not hosted. Until it is, every map mount probes the configured URL, gets
a 404, and falls back to the tinted raster with the "Mapa simple" chip. That is the designed
degraded state and it is verified working in the live dev app, with our own Cinzel lettering
already drawing over the raster ground.

| 2026-09-20 | T3.6 added after live visual check: the tile-pane tint is now scoped to `[data-basemap="raster"]`, set by `BasemapLayer` on the map container. | `protomaps-leaflet` subclasses `L.GridLayer`, so the vector canvas rendered into the same pane and was being pushed through the raster fallback's sepia filter, washing out a palette chosen outright. Not caught by any test; found by looking at the real map. |
| 2026-09-20 | T4.1 resolved against the T1.6 decision: the 4.2MB archive is committed to `public/basemap/` rather than uploaded to Supabase Storage. | The decision assumed 8-40MB. At 4.2MB the plan's own fallback is the better trade, and the only credential on the machine is the public anon key, which cannot create a bucket or upload. The env var keeps the move reversible. |
| 2026-09-20 | T5.1 verified: desktop and 375px, both the full map and the card inset report `pergamino` mode with no fallback chip. | Checkpoint. |

## Blob bug and depth fix (post-launch)

| 2026-09-21 | `PergaminoLayer.geometry` made load-bearing: `buildPaintRules` now emits a real `filter` per rule, combining a geometry-type guard (against `protomaps.GeomType`, handed in via the same lazily-imported module) with the existing `layer.match(props)`. | `geometry` was documentation-only — it picked a symbolizer class and nothing else. protomaps-leaflet's painter has no geometry dispatch of its own: it hands every feature in a data layer to the symbolizer's `draw()`, and `PolygonSymbolizer.draw` always does `beginPath()` -> `fill()`, which canvas implicitly closes. Every LineString in the `water` layer (rivers, streams, straits, canals — measured at 60 per z13 tile in the real archive) was therefore being closed into a shape and filled as sea: the "blob" the user reported. The official Protomaps style guards `water`/`earth` with `["==", "$type", "Polygon"]`; this is that guard, restored. `layer.match` (pergamino-style.ts) only ever sees a feature's `props`, never its geometry, so this couldn't be expressed there — `pergamino-style.ts` stays free of any Leaflet/protomaps-leaflet import (test 13), and the fix lives in `BasemapLayer.tsx`, where the real `GeomType` enum is available. `PergaminoLayer` gained an optional `dashPx?: readonly number[]` field for `boundaries`' dashed stroke. Two existing faithful `vi.mock("protomaps-leaflet", ...)` doubles (`BasemapLayer.test.tsx`, `BasemapLayer.container-attr.test.tsx`) were extended with `GeomType: { Point: 1, Line: 2, Polygon: 3 }` to stay faithful, same pattern as the T3.3 mock-extension entry above. |
| 2026-09-21 | Nine layers now drawn instead of three: five `landuse-*` layers (grouped by `landuseGroup(kind)` into green/civic/works/cemetery/aeroway — an unrecognised `kind` matches none of the five and is not painted, never a catch-all), `buildings` (fill + hairline stroke, minZoom 14) and `boundaries` (thin dashed stroke), inserted into `PERGAMINO_LAYERS` below the roads and above earth/water, in that order (landuse -> buildings -> boundaries). Eight new `--color-pergamino-*` tokens added to `globals.css`, mirrored in `pergamino-palette.ts`'s `PERGAMINO_TOKEN_NAMES`/`PERGAMINO_FALLBACK_HEX`, and pinned by `pergamino-tokens.test.ts`. | The map only painted ground (earth/water/roads) and read as flat next to a real map — a single z15 tile over Zamboanga carries 382 buildings and 42 landuse polygons the map was simply not drawing. This also retires the "Out of scope" line that excluded buildings/landuse/boundaries; it is now wrong and has been struck through in that section, with a pointer back to this entry. |
| 2026-09-21 | Colour-distinction note, not a defect: `--color-pergamino-civic` (`#e2d3c4`) and `--color-pergamino-aeroway` (`#e4d9c0`) are close enough in the parchment family that they may be hard to tell apart at a glance on a small phone screen; both are deliberately warm/pale since hospitals, schools and airfields are all "institutional" ground in this style. Not retuned without a stated design reason, per the "Original requirements" rule at the top of this PRD — flagged for a human look at T5.1-style verification rather than silently adjusted. | Caught while choosing the eight new hex values; recorded so nobody re-derives the same close call. |

## Labels reversal (post-launch)

**D2 is superseded by this entry.** The user reported the drawn map was "nearly nameless" and
asked for everything to be traced, not a curated subset — `labelRules: []` (D2's whole
consequence) threw away every street name, barangay name, water name, and POI name the vector
tiles carry, leaving at most one or two curated names visible at most zooms over a city full of
named streets.

| 2026-09-21 | `buildLabelRules` (`src/components/BasemapLayer.tsx`) is now the map's primary naming system: eight `LabelRule` tiers reading `places`/`roads`/`water`/`pois` directly from the archive, using protomaps-leaflet's own `CenteredTextSymbolizer`/`LineLabelSymbolizer`/`OffsetTextSymbolizer` and its built-in label collision index, rendered in the same three typefaces (Cinzel/Alegreya Sans/Alegreya italic) the curated system used. `labelRules: []` is gone from `BasemapLayer.tsx`'s `leafletLayer({...})` call. `src/lib/pergamino-fonts.ts` is new: `readPergaminoFontStack` resolves the three `--font-*` custom properties to literal family stacks canvas can use (a probe-element + `getComputedStyle` read, extending `readPergaminoPalette`'s pattern because these three are themselves `var(...)`-nested, unlike the flat-hex ground tokens); `buildFontLoadTasks` turns those into `document.fonts.load(...)` promises passed to protomaps-leaflet's own `tasks` option — awaited before every tile's label layout (`frontends/leaflet.ts`'s `renderTile`, not just the first paint), which is the library's documented answer (D1's own table, written before D2 existed) to the exact webfont race D2 point 4 raised and then underused. | The tiles were never missing names — a 361-feature `pois` tile and real `places` barangay/quarter names (`kind: "macrohood"`/`"neighbourhood"`) were confirmed present by querying `public/basemap/zamboanga.pmtiles` directly with the `pmtiles` CLI and `@mapbox/vector-tile` before writing any code, not assumed from the schema. D2's "coverage is not guaranteed" turned out to be true of the curated list's own hand-picked ~20 names at any zoom they didn't happen to cover, and false of the archive, which had been unread. |
| 2026-09-21 | The `pois` ground layer (Step 3): `PergaminoLayer.geometry` gained a `"point"` variant (`protomaps.CircleSymbolizer`, `protomaps.GeomType.Point`) alongside the existing polygon/line handling from the blob-bug fix above — same geometry-guard mechanism, extended, not a parallel one. A small filled dot (`radiusPx: 1.4`, `minZoom: 15`) for every *named* POI (`poiHasName`, shared with the label rule for the same layer), drawn last in `PERGAMINO_LAYERS` so it always sits on top of the street it's next to. One new token, `--color-pergamino-poi` (`#6b4a2c`). | "Add the pois layer to the drawn ground if it earns its place at close zoom" — it does: 361 features in a single close tile is exactly the texture the Step 2 depth pass (buildings/landuse) was already adding for, and the label alone floating with no anchor point read as disconnected from the ground. |
| 2026-09-21 | `ZAMBOANGA_PLACES` (`src/data/zamboanga-places.ts`) cut from ~20 curated entries to exactly 2: `mar-de-basilan` and `bahia-zamboanga`. Every `landmark` entry (Fort Pilar, Paseo del Mar, City Hall, Pasonanca, Rio Hondo, Isla Santa Cruz, Aeropuerto, Puerto, Canelar, Ateneo, `la-vieja-zamboanga`) and every `barangay` entry (Tetuan, Santa María, Baliwasan, Guiwan, Putik, Tugbungan) duplicated a real name confirmed present in the archive's `places`/`pois` layers and is now drawn by `buildLabelRules` instead. The two water names are **kept**: the same archive query confirmed `water` carries no in-view named strait/bay — only ocean-scale names ("Sulu Sea", `min_zoom: 7`, positioned well outside the city view) — so there is no tile equivalent for the Spanish/Chavacano local water names Zamboangueños actually use. This is the "keep only where tiles have no equivalent, or want the Spanish/Chavacano form" branch of the decision the task set out, not "fold everything in" or "retire everything": folding would have meant inventing a `label-water-point` entry for "Mar de Basilán"/"Bahía de Zamboanga" the archive has no feature for at all, which isn't folding, it's re-curating under a different name. | The two label systems (DOM pane 450, canvas tile pane 200) don't share one collision index (D3, unchanged) — cutting the curated list to 2 entries is what keeps that from mattering in practice, not a new coordination mechanism between them. This also resolved the separate reported bug of labels piling up on the waterfront at phone width: the landmark cluster that used to collide there (Fort Pilar/Paseo del Mar/Puerto/Rio Hondo, all near the water) no longer exists as DOM markers — it's drawn by the tile system's own collision-managed labels instead. |
| 2026-09-21 | `PlaceKind`/`createPlaceLabelIcon`/`visiblePlaceLabels` (`src/lib/places.ts`, `src/lib/place-label-icon.ts`) and the `.zpots-place-label--landmark`/`--barangay` CSS classes are all left in place, unused by current data, rather than deleted or narrowed to `"water"` only. | These are generic, already-tested utilities (`place-label-icon.test.ts` exercises all three kinds directly) with no cost to keeping them — narrowing the type would be a second, unrequested API change bundled into this one, and the classes may be needed again for a future one-off Spanish/Chavacano exception the tiles will never carry (the same category `mar-de-basilan`/`bahia-zamboanga` are in). |
| 2026-09-21 | `src/__tests__/places.test.ts`'s "roughly eight labels downtown at z14" headline test and its "no barangay below z15"/`la-vieja-zamboanga` tests are deleted, not reworded — they asserted on curated data that no longer exists. Replaced with a test locking `ZAMBOANGA_PLACES` to exactly the two water entries. | Density and de-cluttering are now the tile system's job, and canvas text isn't jsdom-measurable (the same limitation D2 point 3 named) — `BasemapLayer.label-rules.test.ts`'s structural coverage (every zoom z11-15 has an active rule; each tier's filter matches/rejects the right feature shape) is this repo's equivalent for the new system, the same kind of test `buildPaintRules`' geometry-filter suite already used for ground painting. |

## Live-verification defects: the unnamed park and the mask leak (post-launch)

Two defects found by inspecting the running map (not from a new requirement), both diagnosed
before implementation and fixed test-first.

| 2026-09-21 | **The unnamed ~180km2 green shape is Pasonanca Natural Park.** New `label-poi-natural` tier in `buildLabelRules` (`BasemapLayer.tsx`), `minzoom: 11`, no `maxzoom` — reads named `pois` features whose `kind` is one of `NATURAL_POI_KINDS` (new export, `pergamino-style.ts`: `nature_reserve`, `park`, `protected_area`, `forest`, `wood`, `garden`), styled Alegreya italic in a new token, `--color-forest-deep` (`#3d5c2f`, added to the "Ciudad Latina" `@theme` block and to `PERGAMINO_LABEL_COLOR_NAMES`/`PERGAMINO_LABEL_FALLBACK_HEX`) — distinct from the water italic's `--color-teal-deep`. The existing `label-poi` rule (still `minzoom: 15`) now excludes natural kinds via `!isNaturalLandscapePoi(feature.props)`, so a feature is never labelled twice in two different styles as the view crosses z15. | The `landuse` layer that actually paints the two near-coincident polygons (`kind=forest` ~200km2, `kind=nature_reserve` ~182km2, both the "green" group, both `--color-pergamino-green`) declares only `["kind", "sort_rank"]` — no `name` field exists on those features, so they can never be labelled from their own attributes, at any zoom. The name exists only in `pois`: `kind=nature_reserve`, `name="Pasonanca Natural Park"`, at the polygon's centroid (7.0699, 122.0752). The general POI rule's `minzoom: 15` meant nothing drew that name at z11-13, the exact zooms the shape dominates the screen at phone width. Archive kinds were verified directly (a one-off Node script reading `public/basemap/zamboanga.pmtiles` with `pmtiles` + `@mapbox/vector-tile`, not guessed): `nature_reserve`, `park`, `protected_area`, `wood` and `garden` all occur as real `pois.kind` values; `forest` never occurs as a `pois` kind in this archive (only as a `landuse` kind) but is kept in `NATURAL_POI_KINDS` anyway, both because the bug report named it and because a future cut of the archive could carry a `pois` feature tagged that way. `wetland` was deliberately excluded even though it occurs as a kind: the only two named wetland pois in the archive are `"S1"`/`"S2"` — codes, not names worth putting on a landscape label. `garden_centre` (a shop, e.g. "Sunny Land Garden") is a different kind from `garden` and stays excluded. |
| 2026-09-21 | **Land outside Zamboanga City leaked through `CityMask`.** `.zpots-city-mask`'s `fill-opacity` raised from `0.92` to `1` in `globals.css`. `.zpots-city-outline`'s dashed stroke is unchanged — that's deliberately what keeps the city still reading as a drawn shape rather than a crude cutout now that the fill is solid. Pane order verified, not changed: `cityMask` (350, `CityMask.tsx`) sits above the tile pane (200, Leaflet's own default) and below `placeLabels` (450, `PlaceLabelsLayer.tsx`), so the mask hides tile labels/ground but never a Zpots pin or a Zpots-drawn label. New regression coverage: `CityMask.mask-opacity.test.ts` locks the opacity value and the pane ordering by reading source directly, the same pattern `theme-tokens.test.ts`/`pergamino-tokens.test.ts` already use for `globals.css`. | 8% transparency was enough for tile-drawn text outside the city to stay legible — of the archive's 256 named `places` features, 35 fall outside `ZAMBOANGA_CITY_OUTLINE`; one, "Poblacion" (the poblacion of Sibuco, Zamboanga del Norte, 11.8km outside the boundary), was already visible on screen. The mask's stated job is "nothing outside the city renders" — only a fully opaque fill actually satisfies that; any fractional value is a matter of degree, not a fix. **Judgment call flagged for visual check, not silently made:** raising opacity all the way to 1 was chosen over a high-but-not-1 value because the fix's own requirement is zero leak, and the coder cannot render the map to judge whether full opacity reads as a crude cutout — the dashed outline stroke was left untouched specifically as the mitigation for that risk (it's what a solid-fill map usually relies on to still look intentional at the edge, e.g. a vintage map's blank margin beyond a drawn frontier), but this still needs an actual look at the rendered map before being called done. |
