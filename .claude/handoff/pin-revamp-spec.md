# Spec: Grabado — the Zpots pin system (category glyphs, seal status, density sizing)

**Slug:** `grabado-pins`
**Created:** 2026-09-22
**Status:** Revision 1 implemented and APPROVED (commits d331dd3 … 3734944 on `feat/grabado-pins`).
**Revision 2, 2026-09-22 — OPEN, supersedes parts of revision 1.** Two user decisions: (1) no photo on
any pin, every pin is a category pin; (2) the 10 px punto is not a dot. **Build from §14 and gate on
§11 (revision 2).** Sections marked SUPERSEDED are kept for the implementation record only; §14.1 maps
each old section to its replacement. Revision 1's own 2026-09-22 re-audit note is §13.
**Author:** Planner. Tester writes the red tests first; Builder implements; Reviewer gates.
**Governing docs:** `CLAUDE.md`, `.claude/steering/structure.md`, `.claude/prds/social-spots.md`,
`.claude/prds/paseo-motion.md` (motion tokens, keyframe contract), `.claude/prds/famous-spots-seed.md`.
**Immediate consumer:** a standalone comparison HTML page. Section 9 is a paste-ready `<defs>`
block that draws every state with no React and no Next.js around it.

> **TEST-FIRST IS MANDATORY.** Every test file in section 10 is written and confirmed failing
> red before its implementation exists. Do not reshape an assertion to match what you built.

---

## 0. What this fixes, and where the brief was wrong

Two passes of category glyphs were rejected as "lame and boring": competent outline icons that
would sit unremarked in any app. The repo bans exactly that. This spec answers four problems: an
art style (not an icon set), a status expression with character, density-responsive sizing, and
legibility physics at 8 device pixels.

Where the brief is corrected rather than followed:

| Brief said | This spec says | Why |
|---|---|---|
| Recompute sizes on `zoomend`, `moveend`, data change | `zoomend` and data change only. **Never `moveend`.** | Pixel distance between two spots is invariant under pan. Recomputing on pan is pure thrash. |
| Plain pins are 22 px (`ICON_SIZE`) | Plain pins ride a five-step ladder 32 / 22 / 16 / 10 with a ceiling of 32; photo pins 44 / 32 then fall into the plain ladder. | "Size relative to how many pins are beside it" means a lone pin is allowed to be *bigger* than today, not only smaller. Default call with no size is still 22, so the frozen tests stay green. |
| Status = hollow stone-deep vs solid teal, and it is dull | Colours stay (frozen tests and Mi mapa legend copy depend on them). Character comes from a **seal ring** that only a confirmed spot earns, and a **stamp-press** moment replacing the halo draw-on. | The dullness was never the hue; it was that "confirmed" added nothing you could point at. |
| "Say what happens to `.zpots-pin-icon--just-confirmed`" | Selector kept (a CSS contract test requires it), body replaced: it now drives the seal press, not `paseo-mark-draw`. The string-splice hack in `pin-icon.ts` is deleted; the class is rendered by React. | The splice existed only because the component had no prop. |
| "Consider woodcut, lotería, papel picado, azulejo, vinta, capiz, santo, cartouche" | **Relief-cut stamp ("Grabado").** Named and defined in section 1. | It is the only style on or off that list whose physics *are* the legibility constraint: a relief print is one ink mass with the lights knifed out, and the knife-cuts vanish before the mass does. It is also period-correct for a pergamino map (woodcut cartouches, printed estampas). |
| `usePinIconCache` key space must stay bounded | Five tiers, two statuses, seven categories (six + none), photo yes/no, just-confirmed yes/no = 280 variants, one live entry per marker id. | Quantised, not continuous. |
| `social-spots.md`: "No clustering" | Kept. Argued in 5.8. | The ladder's floor (10 px dot) handles the only crowding a personal map plus 20 seeded spots produces. |

---

## 1. The art style: **Grabado**

**One sentence.** Every glyph is a printer's woodblock stamp: one solid ink mass, chiselled with
tapered knife-cuts, pressed onto the cream window of the compass rose.

**Why this and not the list.** Outline icons fail at 8 px because a 1.4 px stroke is a smudge.
A relief print is the inverse: the ink is the *mass*, and the drawing lives in the lights cut out
of it. Shrink it and the cuts close first, leaving the mass; enlarge it and the cuts open into
detail. That is exactly the degradation curve pins need, and it is what a 17th-century map's
cartouche, a Zamboanga church estampa, or a colonial sello actually looked like. Lotería and
papel picado are the same family (flat mass, knocked-out lights) but carry Mexican, not
Zamboangueño, associations; azulejo and vinta are already spent as ornament (`AzulejoBand`,
`VintaRule`, the Hoy ring) and would collide semantically.

### 1.1 Mechanical rules (a builder applies these; a seventh glyph obeys all of them)

| # | Rule | Exact constraint |
|---|---|---|
| R1 | **One mass.** | Exactly one connected positive region per glyph. Subpaths may overlap but the union must be connected. Abutting subpaths overlap by ≥ 0.4 units so no antialiasing seam appears. |
| R2 | **Cuts are the only detail.** | Detail is cream shapes drawn *over* the mass, never strokes. A cut is a **tapered wedge**: a triangle (or a lens made of two circular arcs) whose wide end is 1.2–2.0 units and whose far end is a point. Uniform-width cuts are forbidden. 1–3 cuts per glyph. A cut never splits the mass into two regions and never touches the mass edge (≥ 0.15 units of ink remains on every side). |
| R3 | **Chiselled corners.** | Every corner of the mass is a sharp vertex. Curves are circular arcs only (`A` commands or `<circle>`); no `rx`, no cubic or quadratic Béziers. |
| R4 | **Silhouette symmetric, light asymmetric.** | The mass is bilaterally symmetric about x = 16 (for every vertex (x, y) there is a vertex (32 − x, y) within 0.01). Cuts are exempt: they all sit on the **upper-left** faces of the mass, i.e. light comes from the upper-left, so a glyph is never mirror-symmetric once cut. |
| R5 | **Safe circle.** | Every vertex and every arc endpoint satisfies (x − 16)² + (y − 16)² ≤ 7.2² = 51.84. Every arc's outermost point also satisfies it. |
| R6 | **Weight.** | Ink covers 25–55 % of the safe disc (area π · 7.2²) after cuts. Bounding box of the mass ≥ 10 units on its longer axis. Bounding-box centre within ±1.5 units of (16, 16) on both axes. |
| R7 | **Ink is ink.** | Mass fill is always `--color-ink` (#2a2017). Cuts are always `--color-cream` (#f6eedc). Never status colour, never `currentColor`. |
| R8 | **No outline, no shadow, no gradient, no opacity.** | Mass and cuts are flat `fill` only. |
| R9 | **One object.** | One thing per glyph. No scenes, no figures or faces, no text or numerals. |
| R10 | **Distinct by silhouette.** | The 8 × 8 coverage map of the mass over the safe square (see 3.7) must be at L1 distance ≥ 9.0 from every existing glyph. Interior detail does not count. |

**Never done:** stroked drawing, rounded rectangles, drop shadows, more than one object, a cut that
severs the mass, colour inside a glyph, glyph size that varies by category.

### 1.2 Drawing a seventh glyph (procedure)

1. Pick one object with a silhouette not yet in the set. The current six occupy: tall column,
   bar-on-legs, wedge, low band, disc, top-wide bucket. Left open: tall-narrow-with-a-hole (e.g. a
   bell), an X or cross, a crescent.
2. Draw the mass as straight segments and circular arcs inside the r = 7.2 circle, symmetric.
3. Add 1–3 tapered cuts on the upper-left faces.
4. Run the geometry test (section 10, `pin-glyphs.geometry.test.ts`) and the 8 px audit script
   (3.7). Reject if any pair is < 9.0.

---

## 2. Category set (decided, not revisited)

| id (code) | Label (UI) | Verb | Object drawn |
|---|---|---|---|
| `come` | Comé | eat | satti skewer: three chunks on a pointed stick |
| `senta` | Sentá | sit and stay | monobloc stool: slab seat on two legs |
| `camina` | Caminá | move your legs | ridge: one peak with foothills |
| `agua` | Agua | water | wave band: three crests on a flat base |
| `mira` | Mirá | look | sun: disc with twelve chiselled rays |
| `compra` | Comprá | buy | bayong: woven basket, arched handle |

Ids are ASCII (no accents); labels carry the accents. Type lives in `src/lib/spots.ts` (7.1).

---

## 3. The six glyphs — exact geometry

All coordinates are in the shared `0 0 32 32` viewBox. The window is the circle centre (16, 16)
r = 8.5; the glyph safe circle is r = 7.2 (leaves 0.6 clear of the confirmed seal band's inner
edge at r = 7.8 and 0.65 clear of the unconfirmed ring's inner edge at r = 7.85).

Each glyph is exactly two `<path>` elements inside `<g data-glyph="{id}">`: the **mass**
(`fill="#2a2017"`) then the **cuts** (`fill="#f6eedc"`). No other attributes. Subpaths are all
wound clockwise on screen so `fill-rule` (default `nonzero`) unions overlapping subpaths.

### 3.1 Comé — satti skewer

```svg
<g data-glyph="come">
  <path fill="#2a2017" d="M16,9 L16.9,10.4 L16.9,22.6 L15.1,22.6 L15.1,10.4 Z M12.8,10.4 H19.2 V13.4 H12.8 Z M12.4,14.4 H19.6 V17.4 H12.4 Z M12.8,18.4 H19.2 V21.4 H12.8 Z"/>
  <path fill="#f6eedc" d="M13.4,11 H17.8 L13.4,12.4 Z M13,15 H18.2 L13,16.4 Z M13.4,19 H17.8 L13.4,20.4 Z"/>
</g>
```
Mass: stick 1.8 wide, pointed top at (16, 9), square foot at y = 22.6; chunks 6.4 / 7.2 / 6.4 wide,
3.0 tall, 1.0 apart. Bbox 7.2 × 13.6, centre (16, 15.8). Ink 34.9 %. Safe-circle extreme: (16, 9)
→ r = 7.000.

### 3.2 Sentá — monobloc stool

```svg
<g data-glyph="senta">
  <path fill="#2a2017" d="M10.6,12.6 H21.4 L22.2,15.6 H9.8 Z M11,15.2 H13.4 V21 H11 Z M18.6,15.2 H21 V21 H18.6 Z"/>
  <path fill="#f6eedc" d="M11.2,13.3 H17.6 L11.2,14.7 Z M11.5,16.4 H12.7 L11.9,20.2 Z"/>
</g>
```
Mass: seat is a trapezoid 3.0 thick (10.8 wide on top, 12.4 at the lip); legs 2.4 wide, overlap
the seat by 0.4 (R1), feet at y = 21. The hollow under the seat (5.2 × 5.4 units) is the
signature and survives at 8 px as a notch. Bbox 12.4 × 8.4, centre (16, 16.8). Ink 33.0 %.

**Working, tightest fit #1.** Foot corner (11, 21): dx = 5.0, dy = 5.0 → 25 + 25 = 50.00 ≤ 51.84
→ r = 7.071. Mirror (21, 21) identical. A foot at y = 21.2 would be r = 7.21 and fail; that is why
the legs stop at 21.0.

### 3.3 Caminá — ridge

```svg
<g data-glyph="camina">
  <path fill="#2a2017" d="M10.6,20.4 L13.4,15 L14.6,16.4 L16,9.2 L17.4,16.4 L18.6,15 L21.4,20.4 Z"/>
  <path fill="#f6eedc" d="M15.7,12 L14.6,19.2 H15.7 Z M13,16.6 L12.2,19 H13.2 Z"/>
</g>
```
Mass: main peak apex (16, 9.2), two foothill shoulders at y = 15.0, base 10.8 wide at y = 20.4.
Deliberately tall and narrow-based (10.8 × 11.2) so it is a wedge, not a bar — a 12-wide flat-based
version scored too close to Agua (3.7), and a 10-wide version fell under R6's 25 % ink floor
(22.4 %); this is the audited middle. Bbox 10.8 × 11.2, centre (16, 14.8). Ink 26.1 %. Base
corner (10.6, 20.4): dx 5.4, dy 4.4 → 29.16 + 19.36 = 48.52 → r = 6.966. Cut check: at y = 12 the
peak's left edge is x = 15.46, so the cut apex (15.7, 12) has 0.24 of ink to its left; at y = 19.2
the mass's left edge is x = 11.22, so the cut foot (14.6, 19.2) is well inside.

### 3.4 Agua — wave band

```svg
<g data-glyph="agua">
  <path fill="#2a2017" d="M9.8,19.6 V15.8 A2.07,2.07 0 0 1 13.93,15.8 A2.07,2.07 0 0 1 18.07,15.8 A2.07,2.07 0 0 1 22.2,15.8 V19.6 Z"/>
  <path fill="#f6eedc" d="M10.6,17.2 H19.6 L10.6,18.5 Z M10.9,15.5 L12.5,14.3 L11.9,15.9 Z"/>
</g>
```
Mass: three semicircular crests (r 2.07, chord 4.13, crest tops at y = 13.73) on a flat band whose
base is y = 19.6. Sweep flag 1 on all three arcs (verified: first crest midpoint (11.87, 13.75),
above the baseline). Bbox 12.4 × 5.87, centre (16, 16.66). Ink 36.1 %. The small second cut's
far point (12.5, 14.3) is 1.63 from crest 1's centre (r 2.07), leaving 0.44 of ink — a version at
(12.7, 14.1) left 0.18 and failed R2's 0.15 margin under sampling; that is why it is where it is.

**Working, tightest fit #2.** Base corner (22.2, 19.6): dx = 6.2, dy = 3.6 → 38.44 + 12.96 = 51.40
≤ 51.84 → r = 7.169, 0.031 to spare. Mirror (9.8, 19.6) identical. Widening the band to 9.6–22.4
gives 40.96 + 12.96 = 53.92 and fails; deepening the base to 19.8 gives 38.44 + 14.44 = 52.88 and
fails. The band is as wide and as deep as the window allows.

### 3.5 Mirá — sun

```svg
<g data-glyph="mira">
  <path fill="#2a2017" d="M20.2,16 A4.2,4.2 0 1 1 11.8,16 A4.2,4.2 0 1 1 20.2,16 Z M20.08,16.43 L22.38,17.71 L19.75,17.67 Z M19.32,18.41 L20.67,20.67 L18.41,19.32 Z M17.67,19.75 L17.71,22.38 L16.43,20.08 Z M15.57,20.08 L14.29,22.38 L14.33,19.75 Z M13.59,19.32 L11.33,20.67 L12.68,18.41 Z M12.25,17.67 L9.62,17.71 L11.92,16.43 Z M11.92,15.57 L9.62,14.29 L12.25,14.33 Z M12.68,13.59 L11.33,11.33 L13.59,12.68 Z M14.33,12.25 L14.29,9.62 L15.57,11.92 Z M16.43,11.92 L17.71,9.62 L17.67,12.25 Z M18.41,12.68 L20.67,11.33 L19.32,13.59 Z M19.75,14.33 L22.38,14.29 L20.08,15.57 Z"/>
  <path fill="#f6eedc" d="M12.55,15.4 A3.5,3.5 0 0 1 15.4,12.55 A2.8,2.8 0 0 1 12.55,15.4 Z"/>
</g>
```
Mass: disc r = 4.2; twelve rays at 15° + 30°·k (offset so no ray lies on a compass axis), each a
triangle with base corners at r = 4.1 (inside the disc, so it merges) at ±9°, apex at r = 6.6. The
cut is a crescent lens on the upper-left of the disc: outer arc r 3.5 about (16, 16), inner arc
r 2.8 bowing toward the centre; verified midpoints (13.52, 13.52) and (14.58, 14.58), lens width
1.5. Bbox 12.76 × 12.76, centre (16, 16). Ink 42.3 %. Extreme: every ray apex r = 6.6 (6.605 after
2-dp rounding of the coordinates).

Twelve rays, not eight: eight pointed rays inside a four-pointed rose reads as a rose-in-a-rose
at 44 px. Twelve short rays read as a serrated corona.

### 3.6 Comprá — bayong basket

```svg
<g data-glyph="compra">
  <path fill="#2a2017" d="M10.2,13.2 H21.8 L20,20.6 H12 Z M11.8,13.6 V13.2 A4.2,4.2 0 0 1 20.2,13.2 V13.6 H18.6 V13.2 A2.6,2.6 0 0 0 13.4,13.2 V13.6 Z"/>
  <path fill="#f6eedc" d="M11,14.4 H18.8 L11,15.7 Z M11.9,17.2 H17.6 L12.1,18.5 Z M12.6,19.2 H15.4 L12.8,20 Z"/>
</g>
```
Mass: inverted trapezoid body (11.6 wide at the rim, 8 at the foot, base y = 20.6); handle is an
arch 1.6 thick (outer r 4.2, inner r 2.6, centre (16, 13.2)), apex (16, 9), overlapping the rim by
0.4. Outer arc sweep 1 (midpoint (16, 9)); inner arc sweep 0 (midpoint (16, 10.6)). Bbox 11.6 ×
11.6, centre (16, 14.8). Ink 48.7 %. Extreme: handle apex (16, 9) → r = 7.000.

### 3.7 Silhouette audit at 8 px

Method (reproducible; the tester's audit script does exactly this): rasterise the mass minus cuts
over the safe square x, y ∈ [8.8, 23.2] into an 8 × 8 grid (one cell = 1.8 units = one device
pixel of the glyph at the 22 px tier), 36 samples per cell, coverage 0–1 per cell.
*(Revision 2 correction, §14.3: this cell is one CSS pixel at an ~18 px pin, not at the 22 px tier. Numbers unchanged.)* Pairwise L1
distance of the 64-vector. Higher is more distinct.

Coverage maps (`#` ≥ 0.5, `:` ≥ 0.15, `.` below), generated from the final path strings:

```
come              senta             camina            agua              mira              compra
. . . : : . . .   . . . . . . . .   . . . . . . . .   . . . . . . . .   . . . . . . . .   . . : # # : . .
. . : : # # . .   . . . . . . . .   . . . : : . . .   . . . . . . . .   . : . # # . : .   . . # . . # . .
. . : # # : . .   . # : # # # # .   . . . : : . . .   . . . . . . . .   . . # # # # . .   . # # # # # # .
. . # # # # . .   : # # # # # # :   . . : : # : . .   : # # # # # # :   . # # # # # # .   . : # # # # # .
. . # # # # . .   . : : . . # # .   . . # # # # . .   # # # # # # # #   . # # # # # # .   . # # # # # # .
. . : # # # . .   . # # . . # # .   . : # # # # # .   # # # # # # # #   . . # # # # . .   . : # # # # : .
. . # # # # . .   . # : . . : # .   . : # # # # : .   . . . . . . . .   . : . # # . : .   . : : # # # : .
. . . : : . . .   . . . . . . . .   . . . . . . . .   . . . . . . . .   . . . . . . . .   . . . . . . . .
```

Pairwise L1 (final geometry, all fifteen pairs):

| pair | L1 | | pair | L1 |
|---|---|---|---|---|
| **Comé / Caminá** | **11.4** | | Comé / Comprá | 14.3 |
| Mirá / Comprá | 11.7 | | Sentá / Comprá | 15.1 |
| Comé / Mirá | 13.0 | | Agua / Comprá | 15.4 |
| Agua / Mirá | 13.2 | | Sentá / Caminá | 16.3 |
| Caminá / Mirá | 13.3 | | Sentá / Mirá | 17.0 |
| Caminá / Comprá | 13.7 | | Comé / Sentá | 20.1 |
| Sentá / Agua | 13.7 | | Comé / Agua | 20.6 |
| Caminá / Agua | 14.1 | | | |

Every pair clears R10's floor of 9.0.

**What separates the closest pair.** Both are vertical. Comé is a *column*: constant 4 px width
from row 1 to row 6, flat-ended, centroid row 3.56. Caminá is a *wedge*: 1 px at the top, 6 px at
the base, centroid row 4.38 — the most bottom-heavy glyph in the set. At 8 px the eye reads "post"
versus "mountain" from the taper alone. Rejected alternatives, by number: a flat-based 12-wide
ridge scored 10.5 against Agua (a bar with a bump); a plain triangle with no foothills scored 9.4
against Comé; a 10-wide ridge scored 11.5 but only 22.4 % ink. The audit, not taste, chose this
ridge.

Second-closest, Mirá / Comprá: a round blob versus a square block with a bump on top. The handle
(row 0–1, cols 2–5) is what separates them at 8 px, which is why the handle is 1.6 thick and not
thinner.

---

## 4. The chassis — every state

### 4.1 Shared geometry (unchanged, verbatim from `pin-icons.tsx`)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.5 / §14.7: `ROSE`/`TAIL` stand; the photo paragraph, `PETALS` and `PHOTO_HALO` are deleted.**


```
ROSE = "M16,2 L19.5,13 L16,16 L12.5,13 Z M30,16 L19,19.5 L16,16 L19,12.5 Z M16,30 L12.5,19 L16,16 L19.5,19 Z M2,16 L13,12.5 L16,16 L13,19.5 Z"
TAIL = "M13.5,22 L16,30 L18.5,22 Z"
```
Anchor point is the tail tip (16, 30). Nav `SpotsIcon` is untouched.

**Photo mode only** uses the rose clipped to outside the window, because in photo mode there is
no cream disc to hide the kite bases and a filled kite would paint over the photo. Each kite
becomes a petal: the tip, the two edges down to where they cross the r = 8.5 circle, and that
circle's arc between them. The crossing on the N kite's left edge solves
(16 − 3.5t, 2 + 11t) at r = 8.5: 133.25t² − 308t + 123.75 = 0 → t = 0.51777 → (14.19, 7.70)
(r = 8.4999). The other seven points are its 90° rotations. The tail is omitted in photo mode: at
y = 22 the S kite's half-width is 3.5 · 8 / 11 = 2.545 ≥ the tail's 2.5, so the S petal already
covers it.

```
PETALS = "M16,2 L17.81,7.7 A8.5,8.5 0 0 0 14.19,7.7 Z M30,16 L24.3,17.81 A8.5,8.5 0 0 0 24.3,14.19 Z M16,30 L14.19,24.3 A8.5,8.5 0 0 0 17.81,24.3 Z M2,16 L7.7,14.19 A8.5,8.5 0 0 0 7.7,17.81 Z"
PHOTO_HALO = "M14.19,7.7 L16,2 L17.81,7.7 M24.3,14.19 L30,16 L24.3,17.81 M17.81,24.3 L16,30 L14.19,24.3 M7.7,17.81 L2,16 L7.7,14.19"
```
All four arcs are sweep-flag 0 (verified midpoints (15.85, 7.51), (24.49, 15.85), (16.15, 24.49),
(7.51, 16.15) — on the outer side). `PHOTO_HALO` is the petals' two straight edges only, open
(no arc), so the cream halo stroke never crosses the photo.

### 4.2 Three rose states × two statuses

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.4 (two rose states; no photo row). Kept for the record; do not build from this.**


| Rose state | When | What is in the centre |
|---|---|---|
| **Closed** | no category and no photo, or tier ≥ 3 | kites meet at the centre; small centre mark (as today) |
| **Open** | category present, tier ≤ 2 | cream window r 8.5 with the ink glyph |
| **Photo** | photo present, tier ≤ 1 | transparent window r 8.5, photo behind |

Status is carried by the chassis only:

| | Unconfirmed ("lápiz" — pencilled) | Confirmed ("sellao" — sealed) |
|---|---|---|
| Kites + tail (closed, open) | fill `#f6eedc` @ 0.85, stroke `#7a6448` 2.0 | fill + stroke `#1f6f78`, stroke 1.0 |
| Petals, no tail (photo) | `PETALS` with the same fill/stroke as above | `PETALS` with the same fill/stroke as above |
| Centre mark (closed) | `<circle r=1.6 fill=none stroke=#7a6448 stroke-width=1.4>` | `<circle r=2 fill=#f6eedc>` |
| Window ring (open) | `<circle r=8.5 fill=#f6eedc stroke=#7a6448 stroke-width=1.2>` | `<circle r=8.5 fill=#f6eedc>` (ring supplied by the seal) |
| Window ring (photo) | `<circle r=8.5 fill=none stroke=#7a6448 stroke-width=1.6>` | none (ring supplied by the seal) |
| **Seal** | absent | present, all three rose states |
| CSS drop shadow | none | `.zpots-pin-icon--confirmed svg` (unchanged) |

Category and status never share a channel: category is the ink silhouette inside the window;
status is the chassis around it. Reading one never costs the other.

### 4.3 The seal (confirmed only)

A confirmed spot earns a **seal ring**: a band through the rose with twelve chiselled teeth — the
crimped edge of a wax sello, the circle a real compass rose has through its points. On the axes
the band merges into the kites; on the diagonals it shows over the parchment. Teeth sit at
15° + 30°·k so none touches a kite (kite half-angle at r = 9.5 is 8.6°; teeth span 9°–21°).

```svg
<g class="zpots-seal" data-part="seal">
  <circle cx="16" cy="16" r="8.5" fill="none" stroke="#1f6f78" stroke-width="1.4"/>
  <path fill="#1f6f78" d="M24.89,17.41 L26.24,18.74 L24.4,19.23 Z M22.99,21.66 L23.5,23.5 L21.66,22.99 Z M19.23,24.4 L18.74,26.24 L17.41,24.89 Z M14.59,24.89 L13.26,26.24 L12.77,24.4 Z M10.34,22.99 L8.5,23.5 L9.01,21.66 Z M7.6,19.23 L5.76,18.74 L7.11,17.41 Z M7.11,14.59 L5.76,13.26 L7.6,12.77 Z M9.01,10.34 L8.5,8.5 L10.34,9.01 Z M12.77,7.6 L13.26,5.76 L14.59,7.11 Z M17.41,7.11 L18.74,5.76 L19.23,7.6 Z M21.66,9.01 L23.5,8.5 L22.99,10.34 Z M24.4,12.77 L26.24,13.26 L24.89,14.59 Z"/>
</g>
```
Band covers r 7.8–9.2. Teeth: base corners at r = 9.0 (inside the band, so no seam), ±6°, apex at
r = 10.6 (1.6 tall: 2.2 px at 44, 1.6 px at 32, 1.1 px at 22 where it reads as a rough edge, which
is the intent). No halo under the seal: on the axes it lies on teal, on the diagonals on parchment
or on the rose's own cream halo, all with adequate contrast.

### 4.4 Layer order inside the `<svg>` (fixed; tests depend on it)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.7: items 1–6 stand, every 'Photo mode' clause is struck.**


1. Halo: `<path d="{ROSE} {TAIL}" fill="none" stroke="#f6eedc" stroke-opacity="0.95" stroke-width="3.2" stroke-linejoin="round"/>` — **always the first `<path>`**. Photo mode: `d="{PHOTO_HALO}"`, same attributes.
2. Rose: `<path d="{ROSE}" …status styling…/>`. Photo mode: `d="{PETALS}"`.
3. Tail: `<path d="{TAIL}" …status styling…/>`. Photo mode: **omitted**.
4. Centre: one of — centre mark (closed) / window circle then `<g data-glyph>` (open) / window ring or nothing (photo).
5. Seal `<g class="zpots-seal[ zpots-pin-icon--just-confirmed]" data-part="seal">` — confirmed only. Attribute order exactly: `class` then `data-part`.
6. Pulse: `<circle cx="16" cy="16" r="9.5" fill="none" stroke="#1f6f78" stroke-width="1.4" class="zpots-seal-pulse"/>` — only when `justConfirmed && status === "confirmed"`.

### 4.5 Punto (tier 4, 10 px)

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.5 (punto azulejo, tier 3). Kept for the record; do not build from this.**


The rose does not survive at 10 px; it drops to a dot. Own geometry, anchored at its centre.

```svg
<!-- unconfirmed -->
<svg viewBox="0 0 32 32" width="10" height="10"><circle cx="16" cy="16" r="11" fill="#f6eedc"/><circle cx="16" cy="16" r="8" fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="2.4"/></svg>
<!-- confirmed -->
<svg viewBox="0 0 32 32" width="10" height="10"><circle cx="16" cy="16" r="11" fill="#f6eedc"/><circle cx="16" cy="16" r="8" fill="#1f6f78"/></svg>
```
`iconAnchor [5, 5]`, `popupAnchor [0, -6]`, className adds `zpots-pin-icon--punto`. No glyph, no
seal, no photo. `justConfirmed` is a no-op on a punto.

### 4.6 Sizes and anchors

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.4. Kept for the record; do not build from this.**


`iconAnchor = [size / 2, Math.round(size * 30 / 32)]`, `popupAnchor = [0, -Math.floor(size * 28 / 32)]`
(the `floor` reproduces today's 44 px value of −38; `round` would give −39). Photo hole diameter
`= Math.round(size * 17 / 32)`, offset `(size − hole) / 2`.

| tier | size | iconAnchor | popupAnchor | window px | glyph safe px | photo hole | what renders |
|---|---|---|---|---|---|---|---|
| 0 | 44 | [22, 41] | [0, −38] | 23.4 | 19.8 | 23 | photo pins only: photo in frame |
| 1 | 32 | [16, 30] | [0, −28] | 17.0 | 14.4 | 17 | photo pins: photo; plain pins: glyph |
| 2 | 22 | [11, 21] | [0, −19] | 11.7 | 9.9 | — | glyph (photo dropped) |
| 3 | 16 | [8, 15] | [0, −14] | 8.5 | 7.2 | — | closed rose, category ignored |
| 4 | 10 | [5, 5] | [0, −6] | — | — | — | punto |

Tier 2 drops the photo because an 11.7 px photo is a smear, and a smear tells the user less than
the category glyph does. This is a deliberate deviation from "every pin is the spot's photo"
(`CLAUDE.md` item 2) that applies only under crowding; record it in `social-spots.md`'s change log.

### 4.7 The confirming transition — "sello"

The moment two people have said *Ya anda yo aqui* is the stamp landing.

1. Icon rebuilds with `status: "confirmed", justConfirmed: true`. Rose is solid teal immediately (no
   fill animation — it is the thing being stamped, it does not move).
2. The seal `<g>` carries `zpots-pin-icon--just-confirmed`: **press** — scales from 1.8 to 1.0 while
   fading 0 → 1, `var(--dur-base)` (320 ms), `var(--ease-settle)`.
3. The pulse circle: after the press lands (delay `var(--dur-base)`), the existing `paseo-ring-pulse`
   (scale 0.8 → 1.5, opacity 0.9 → 0) over `var(--dur-slow)` (640 ms), `var(--ease-paseo)`. Ink
   spreading from the stamp.
4. The halo draw-on is gone. `stroke-dasharray`/`stroke-dashoffset` leave
   `.zpots-pin-icon--just-confirmed`. `@keyframes paseo-mark-draw` stays (`.paseo-mark` uses it; the
   CSS contract test requires it); update the comment above it that names the pin class.

CSS (exact, added to `globals.css` next to the existing `.zpots-pin-icon--just-confirmed` rule):

```css
.zpots-pin-icon--punto svg {
  transform-origin: 50% 50%;
}

.zpots-seal {
  transform-box: view-box;
  transform-origin: 50% 50%;
}

/* Replaces the halo draw-on: the seal is pressed onto the pin. */
.zpots-pin-icon--just-confirmed {
  animation: zpots-seal-press var(--dur-base) var(--ease-settle) both;
}

.zpots-seal-pulse {
  transform-box: view-box;
  transform-origin: 50% 50%;
  opacity: 0;
  animation: paseo-ring-pulse var(--dur-slow) var(--ease-paseo) var(--dur-base) forwards;
}

@keyframes zpots-seal-press {
  from {
    transform: scale(1.8);
    opacity: 0;
  }
  55% {
    opacity: 1;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
```
`forwards` (not `both`) on the pulse so it is invisible during its 320 ms delay. The global
`prefers-reduced-motion` kill switch already covers both: the seal simply appears.
`zpots-seal-press` is a keyframe name, not a custom property; the `--zpots-` ban is untouched.

**One-shot guarantee.** `SpotMap` today keeps an id in `justConfirmedIds` for the life of the
component. Once tier is part of the cache key, a zoom after confirming would rebuild the icon with
`justConfirmed: true` and replay the press. Fix: `SpotMap` removes the id after
`JUST_CONFIRMED_TTL_MS = 1200` (press 320 + delay 320 + pulse 640 = 1280 ms; 1200 is inside the
pulse's invisible tail — the end frame of every animation equals the static confirmed render, so
the rebuild is invisible). Timers are cleared on unmount. A zoom inside that 1.2 s window replays
once; accepted. `MapInsetInner` is single-pin and untouched.

---

## 5. Density-responsive sizing

### 5.1 Module: `src/lib/pin-density.ts` (new, pure, no Leaflet, no DOM)

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.3. Kept for the record; do not build from this.**


```ts
export const PIN_TIER_SIZES = [44, 32, 22, 16, 10] as const;
export type PinTier = 0 | 1 | 2 | 3 | 4;
export const PHOTO_CEILING_TIER: PinTier = 0;
export const PLAIN_CEILING_TIER: PinTier = 1;
export const PHOTO_LAST_TIER: PinTier = 1;   // tiers > 1 drop the photo
export const GLYPH_LAST_TIER: PinTier = 2;   // tiers > 2 drop the glyph (closed rose)
export const PUNTO_TIER: PinTier = 4;
export const DENSITY_SEARCH_PX = 44;         // = PIN_TIER_SIZES[0]

export interface DensityPoint { key: string; lat: number; lng: number; wantsPhoto: boolean }

/** Web-Mercator pixel coordinates at `zoom`, 256-px tiles: identical to Leaflet's
 *  L.CRS.EPSG3857 `project` + `scale`. lat clamped to ±85.0511287798. */
export function projectPx(lat: number, lng: number, zoom: number): { x: number; y: number };

/** Nearest-neighbour distance per key, exact within `searchPx`; Infinity when nothing is
 *  within it. Grid-bucketed with cell = searchPx, so 3×3 cells contain every candidate. O(n). */
export function nearestNeighbourPx(points: readonly { key: string; x: number; y: number }[], searchPx: number): Map<string, number>;

/** Largest tier ≤ ceiling whose size ≤ d; PUNTO_TIER if none. d = Infinity → ceiling. */
export function tierForDistance(nearestPx: number, ceiling: PinTier): PinTier;

/** Composes the three. Points with non-finite lat/lng get no entry and never throw. */
export function computePinTiers(points: readonly DensityPoint[], zoom: number): Map<string, PinTier>;
```

Projection formula (so the tester can pin it independently of Leaflet):
`s = 256 · 2^zoom; x = (lng + 180) / 360 · s; y = (1 − ln(tan φ + sec φ) / π) / 2 · s`, φ in
radians. Checks: `projectPx(0, 0, 0) = (128, 128)`; `projectPx(6.9214, 122.079, 14) =
(3519475.439, 2016314.997)` to 3 dp.

### 5.2 Why nearest-neighbour, not neighbour count or zoom alone

Two pins of size s whose anchors are d px apart do not overlap iff d ≥ 0.875·s (the rose spans
28 of 32 units on both axes and sits above the anchor on both pins). `s ≤ d` therefore guarantees
no overlap with margin. The rule is symmetric: both members of a tight pair see the same d and
shrink together, so a cluster never has one big pin sitting on small ones. A neighbour *count*
cannot say this; zoom alone cannot tell a lone pin from a downtown pile.

### 5.3 Tier mapping (exact)

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.3. Kept for the record; do not build from this.**


```
fits(size, d) := size <= d
tier(d, ceiling) := first t in [ceiling .. 4] with fits(PIN_TIER_SIZES[t], d), else 4
```
Worked values at Zamboanga latitude (9.485 m/px at z14):

| pair | z12 | z14 | z16 |
|---|---|---|---|
| A (6.9214, 122.079) – B (6.9231, 122.079), 189 m | 4.99 px → tier 4 | 19.95 px → tier 3 | 79.81 px → ceiling |
| A – C (6.9214, 122.0805), 166 m | 4.37 → 4 | 17.48 → 3 | 69.91 → ceiling |

### 5.4 Ceilings and what each tier draws

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.3 (no ceilings, no `wantsPhoto`) and §14.2 A5. Kept for the record; do not build from this.**


| kind | ceiling | hasPhoto & tier ≤ 1 | tier 2 | tier 3 | tier 4 |
|---|---|---|---|---|---|
| photo pin (`wantsPhoto`) | 0 | photo frame | glyph or closed | closed | punto |
| plain pin | 1 | — | glyph or closed | closed | punto |

`wantsPhoto` is `source !== "saved" && source !== "been" && !!photoUrl`. Those two sources are the
ones Mi mapa renders as *status* pins by rule (social-spots.md: `been` = solid, `saved` = hollow);
every other source with a photo is the photo. Written as a denylist on purpose: it compiles against
today's `MapSource`, needs no literal for a member that does not exist yet, and a future `"famoso"`
source starts showing its photo the moment `MapSource` gains it, with no edit here. Write-mode
`spots` never want a photo. `iconForMapSpot` uses the same predicate (one function, two callers).

### 5.5 When it recomputes

- `zoomend` on the Leaflet map (subscribe once `leafletMap` exists; read `getZoom()` immediately on
  subscribe; unsubscribe on cleanup). Fallback zoom when the map is null: `DEFAULT_ZOOM`.
- Any render where the rendered spot set changes (`spots`, `mapSpots`, `sourceFilter`). The
  computation runs in render (it is O(n) and pure); the icon cache prevents DOM churn.
- **Never** on `move`/`moveend`/`zoom` (mid-animation). During a pinch Leaflet CSS-scales the marker
  pane; sizes snap on `zoomend`. Default `zoomSnap` (1) means integer zooms.

### 5.6 Thrash

None by construction: tier is a deterministic function of (zoom, spot set). Same inputs, same
icons, same references. A size change is an icon rebuild (`innerHTML` rewrite), so the hover
`transition` does not tween it — a snap, accepted.

### 5.7 Cache key and bounds

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.4 (112 variants; `mapSpots` key drops `photoUrl`). Kept for the record; do not build from this.**


`spots` layer: `` `${status}:${justConfirmed}:${category ?? "-"}:${tier}` ``
`mapSpots` layer: `` `${source}:${photoUrl ?? ""}:${status}:${category ?? "-"}:${tier}:${justConfirmed}` ``
Density keys must be unique across the two layers (`spot:${id}` / `map:${id}`), since one id can
appear in both. Key space: 5 × 2 × 7 × 2 × 2 = 280 variants; one live entry per marker id.

### 5.8 Below the floor, and why clustering stays out

> **AMENDED by revision 2 (2026-09-22) — read together with §14.3: 'tier 4' reads 'tier 3'; argument unchanged.**


At tier 4 two puntos overlap whenever d < 10 px (≈ 380 m at z12, 95 m at z14). Two overlapping
10 px dots still read as "spots here"; a tap opens the topmost popup; one zoom level resolves
them. `social-spots.md`'s "No clustering" stands: the personal map plus the 20 seeded famous
spots is a few dozen markers, and the only genuine pile is downtown (Plaza Pershing / City Hall,
190 m) which the ladder handles from z14 up and shows as two dots below. Revisit only if an
all-spots map (out of scope) ever ships.

---

## 6. Colours

Every colour used, by token. No new token is needed.

| use | token | hex | where the hex may appear |
|---|---|---|---|
| glyph mass | `--color-ink` | `#2a2017` | `pin-icons.tsx` (icons dir is exempt from the raw-hex test); `pin-icon.ts` (new, allowed) |
| glyph cuts, halo, windows, unconfirmed kite fill, punto halo | `--color-cream` | `#f6eedc` | `pin-icons.tsx`, `pin-icon.ts` (already there) |
| unconfirmed strokes | `--color-stone-deep` | `#7a6448` | `pin-icon.ts` (`PIN_COLOR.unconfirmed`), `pin-icons.tsx` |
| confirmed fill/stroke, seal, pulse | `--color-teal` | `#1f6f78` | `pin-icon.ts` (`PIN_COLOR.confirmed`), `pin-icons.tsx` |

`structure.md`'s sentence "the only two hex values allowed in `src/lib/pin-icon.ts`" becomes four:
stone-deep, teal, ink, cream. `theme-tokens.test.ts` pins all four hexes already. Terracotta and
cardinal are not used on pins (terracotta is the confirm *button*; the seal is teal so that Mi
mapa's "been = teal" legend copy stays true).

---

## 7. Files to touch

### 7.1 `src/lib/spots.ts` (existing) — type only

```ts
export const SPOT_CATEGORIES = ["come", "senta", "camina", "agua", "mira", "compra"] as const;
export type SpotCategory = (typeof SPOT_CATEGORIES)[number];
export function isSpotCategory(value: unknown): value is SpotCategory;
export interface Spot { …; category?: SpotCategory; }
```
No DB column, no `toSpot` mapping, no post-flow step in this spec (see Out of scope). Until that
lands `category` is `undefined` at runtime and every live pin is a closed rose — the comparison
artifact and tests exercise the open rose.

### 7.2 `src/lib/pin-density.ts` (new) — section 5.1 verbatim.

### 7.3 `src/lib/pin-icon.ts` (existing)

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.7. Kept for the record; do not build from this.**


```ts
export type PinStatus = "unconfirmed" | "confirmed";
export type PinSize = 32 | 22 | 16 | 10;
export type PhotoPinSize = 44 | 32;

export interface CreatePinIconOptions {
  justConfirmed?: boolean;
  category?: SpotCategory;
  /** Default 22. Any value not in PinSize throws RangeError. */
  size?: PinSize;
}
export function createPinIcon(status: PinStatus, options?: CreatePinIconOptions): L.DivIcon;

export interface CreatePhotoPinIconOptions {
  justConfirmed?: boolean;
  /** Default 44. 44 or 32 render the photo; anything else throws RangeError. */
  size?: PhotoPinSize;
}
// No `category` here: a photo pin never renders a glyph (A2), so the field would be dead.
// When the tier drops the photo, SpotMap calls createPinIcon, which is where category goes.
export function createPhotoPinIcon(photoUrl: string, status: PinStatus, options?: CreatePhotoPinIconOptions): L.DivIcon;
```
Behaviour:
- `size` 32/22: open rose with glyph when `category` is set, else closed. `size` 16: closed rose,
  `category` ignored. `size` 10: punto (section 4.5), `category` and `justConfirmed` ignored.
- className: `zpots-pin-icon zpots-pin-icon--${status} zpots-pin-icon--tier-${tier}` plus
  `zpots-pin-icon--punto` at 10, plus `zpots-pin-icon--photo` for photo pins. `--confirmed` and
  `--unconfirmed` stay mutually exclusive whole words.
- Anchors per 4.6. `iconSize = [size, size]`.
- Delete the `markup.replace("<path ", …)` splice. `justConfirmed` is passed as a prop to the
  component, which renders the class on the seal `<g>` and the pulse circle.
- `createPhotoPinIcon` keeps the wrap-span/img/frame structure; hole diameter and offset from 4.6;
  the frame is `PinChassis` in photo mode. It adds `zpots-pin-icon--tier-${tier}` and the status
  class (today's photo pin carries no status class — it gains one).
- A `Spot.category` value that fails `isSpotCategory` is treated as `undefined`.
- Exports unchanged in name: `createPinIcon`, `createPhotoPinIcon` (the just-confirmed wiring tests
  mock exactly these two; adding exports to this module would break those mocks — put anything new
  in `pin-density.ts`).

### 7.4 `src/components/icons/pin-icons.tsx` (existing)

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.7. Kept for the record; do not build from this.**


```ts
export interface PinChassisProps extends SVGProps<SVGSVGElement> {
  size?: number;                       // default 22
  status: "unconfirmed" | "confirmed";
  mode: "closed" | "open" | "photo";
  category?: SpotCategory;             // used only when mode === "open"
  justConfirmed?: boolean;
}
export function PinChassis(props: PinChassisProps): JSX.Element;
export function PuntoPin({ size = 10, status }): JSX.Element;
export const PIN_GLYPH_PATHS: Record<SpotCategory, { mass: string; cuts: string }>;  // section 3 strings, verbatim
export function PinGlyph({ category }): JSX.Element;   // <g data-glyph> with the two paths

// Kept for the frozen adversarial test (bare render, default size 22, no console.error):
export function UnconfirmedPin(props: PinIconProps)  // = <PinChassis status="unconfirmed" mode="closed" .../>
export function ConfirmedPin(props: PinIconProps)    // = <PinChassis status="confirmed" mode="closed" .../>
export function PhotoPinFrame(props: PinIconProps & { status?: PinStatus })  // = mode "photo", default status "confirmed"
```
Photo mode draws `PHOTO_HALO` + `PETALS` (4.1) and no tail; closed/open modes draw
`ROSE`/`TAIL` as today.
Colours inside this file are literal hex per section 6 (`currentColor` is no longer used for the
rose; `style.color` from callers is ignored). Layer order per 4.4. The glyph `<g>` has exactly
one attribute, `data-glyph`.

### 7.5 `src/components/SpotMap.tsx` (existing)

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.7 and §14.13. Kept for the record; do not build from this.**


- `const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)`; effect on `[leafletMap]`: set from
  `leafletMap.getZoom()`, subscribe `zoomend`, unsubscribe on cleanup (same shape as the existing
  `setMaxBounds` and click effects). Call `getZoom()` directly. **No `typeof map.getZoom ===
  "function"` guard**: a test double that lacks a method every real `L.Map` has is fixed in the
  double, never defended against in production (learnings.md 2026-09-20, "Extend an unfaithful test
  double"). The one double that lacks it is `SpotMap.pergamino.test.tsx`; see 10.10.
- Every `createPinIcon` call on both layers passes the full options bag
  `{ justConfirmed, category, size }` with all three keys present (`category` may be `undefined`).
  One shape, always, so a mock can assert on it with `expect.objectContaining` and the cache key and
  the call are built from the same three inputs. `createPhotoPinIcon` receives `{ justConfirmed, size }`.
- Build `DensityPoint[]` from `effectiveSpots` (`key: spot:${id}`, `wantsPhoto: false`) and
  `visibleMapSpots` (`key: map:${id}`, `wantsPhoto` per 5.4); `const tiers = computePinTiers(points, zoom)`
  in render. Missing entry → the kind's ceiling.
- `getSpotIcon` key and factory per 5.7 / 7.3; `iconForMapSpot` gains `tier`, `category`,
  `justConfirmed` (from `justConfirmedIds`) and picks `createPhotoPinIcon` only when
  `wantsPhoto && tier <= PHOTO_LAST_TIER`, otherwise `createPinIcon` with `size = PIN_TIER_SIZES[tier]`.
  `wantsPhoto` per 5.4: `spot.source !== "saved" && spot.source !== "been" && Boolean(spot.photoUrl)`,
  typed on `MapSource`, no widening to `string`, no `"famoso"` literal.
- `handleConfirm`: after adding the id, `setTimeout` removal after `JUST_CONFIRMED_TTL_MS` (1200);
  timer ids in a ref, all cleared on unmount.
- Everything else in the file (popups, gates, banners, fitBounds) untouched.

### 7.6 `src/app/globals.css` (existing)

Section 4.7 CSS. Remove `stroke-dasharray`/`stroke-dashoffset`/`paseo-mark-draw` from
`.zpots-pin-icon--just-confirmed`. Edit the comment above `@keyframes paseo-mark-draw` so it no
longer claims the pin class shares it. Do not nest anything inside `.vinta-rule`,
`.leaflet-container`, `.leaflet-tile-pane`, or the reduced-motion block.

### 7.7 Docs

> **SUPERSEDED — revision 2 (2026-09-22). Replaced by §14.9. Kept for the record; do not build from this.**


- `.claude/steering/structure.md` "Silhouette" bullet: four allowed hexes; mention the ladder.
- `.claude/prds/social-spots.md` change log: tier-2 photo drop; density ladder.

### Out of scope — do not touch

> **AMENDED by revision 2 (2026-09-22) — read together with §14.8.**


- The `category` database column, `toSpot` mapping, RLS, the post-flow category step, any
  category filter or legend. (Separate spec. Category is a read cue on the pin, not a query.)
- `MapInsetInner.tsx`, `PostFlow.tsx`, `nav-icons.tsx` (`SpotsIcon`), `MapInset.tsx`.
- Popup content, `SpotPhoto`, the photo `<img>` failure fallback.
- Any change to `--color-*` tokens; any new token.
- Clustering.
- The Hoy ring, `VintaRule`, `AzulejoBand`.

---

## 8. Edge cases (the builder handles every one)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.8: E3 and E15 struck, E4 changed, E19–E26 added.**


| # | Case | Required behaviour |
|---|---|---|
| E1 | `spot.category` is a string not in `SPOT_CATEGORIES` (future DB drift) | treated as `undefined`; closed rose; no throw |
| E2 | `size` not in the ladder (e.g. 24) | `RangeError` from `createPinIcon` / `createPhotoPinIcon` |
| E3 | Photo pin asked for size 22/16/10 | not a `PhotoPinSize`: `RangeError`. The caller (SpotMap) must switch to `createPinIcon` itself; the factory never silently drops the photo |
| E4 | `category` with `size` 16 or 10 | ignored, no `data-glyph` in markup |
| E5 | `justConfirmed` with `status: "unconfirmed"` or size 10 | no-op: no `zpots-pin-icon--just-confirmed`, no `zpots-seal-pulse` in markup |
| E6 | Same id in `spots` and `mapSpots` | separate density keys and separate caches (already two caches) |
| E7 | Two spots at identical coordinates | d = 0 → both tier 4; both render; no throw |
| E8 | Single spot on the map | d = ∞ → ceiling tier |
| E9 | Non-finite lat/lng | already filtered by `hasFiniteCoords`; `computePinTiers` additionally skips them without throwing |
| E10 | `leafletMap` null (test doubles, first render) | zoom = `DEFAULT_ZOOM`; sizes still computed |
| E11 | Fractional zoom from `getZoom()` | used as-is in the projection; no rounding |
| E12 | `sourceFilter` hides a source | hidden spots excluded from density (they are not rendered) |
| E13 | Zoom within 1.2 s of confirming | press replays once; accepted and documented |
| E14 | `prefers-reduced-motion` | seal and pulse appear statically (global kill switch) |
| E15 | Confirm on a photo pin (Mi mapa) | `createPhotoPinIcon` receives `justConfirmed`; seal presses over the photo frame |
| E16 | Unmount mid-TTL | timers cleared; no state update after unmount |
| E17 | More than ~800 markers | still O(n); no fallback path needed; document only |
| E18 | Popup open when tier changes | Leaflet keeps the popup; `popupAnchor` updates with the new icon |

---

## 9. Standalone SVG for the comparison artifact

> **AMENDED by revision 2 (2026-09-22) — read together with §14.7 'Section 9 artifact': photo symbols deleted, punto symbols replaced by §14.5.**


Paste into `<svg width="0" height="0" style="position:absolute"><defs>…</defs></svg>` and draw with
`<svg viewBox="0 0 32 32" width="22" height="22"><use href="#…"/></svg>`. Hex values are the
tokens in section 6.

```svg
<g id="geo-rose"><path d="M16,2 L19.5,13 L16,16 L12.5,13 Z M30,16 L19,19.5 L16,16 L19,12.5 Z M16,30 L12.5,19 L16,16 L19.5,19 Z M2,16 L13,12.5 L16,16 L13,19.5 Z"/></g>
<g id="geo-tail"><path d="M13.5,22 L16,30 L18.5,22 Z"/></g>
<g id="geo-halo"><path d="M16,2 L19.5,13 L16,16 L12.5,13 Z M30,16 L19,19.5 L16,16 L19,12.5 Z M16,30 L12.5,19 L16,16 L19.5,19 Z M2,16 L13,12.5 L16,16 L13,19.5 Z M13.5,22 L16,30 L18.5,22 Z" fill="none" stroke="#f6eedc" stroke-opacity="0.95" stroke-width="3.2" stroke-linejoin="round"/></g>
<g id="geo-seal">
  <circle cx="16" cy="16" r="8.5" fill="none" stroke="#1f6f78" stroke-width="1.4"/>
  <path fill="#1f6f78" d="M24.89,17.41 L26.24,18.74 L24.4,19.23 Z M22.99,21.66 L23.5,23.5 L21.66,22.99 Z M19.23,24.4 L18.74,26.24 L17.41,24.89 Z M14.59,24.89 L13.26,26.24 L12.77,24.4 Z M10.34,22.99 L8.5,23.5 L9.01,21.66 Z M7.6,19.23 L5.76,18.74 L7.11,17.41 Z M7.11,14.59 L5.76,13.26 L7.6,12.77 Z M9.01,10.34 L8.5,8.5 L10.34,9.01 Z M12.77,7.6 L13.26,5.76 L14.59,7.11 Z M17.41,7.11 L18.74,5.76 L19.23,7.6 Z M21.66,9.01 L23.5,8.5 L22.99,10.34 Z M24.4,12.77 L26.24,13.26 L24.89,14.59 Z"/>
</g>

<!-- glyphs: section 3, verbatim -->
<g id="gl-come"><path fill="#2a2017" d="M16,9 L16.9,10.4 L16.9,22.6 L15.1,22.6 L15.1,10.4 Z M12.8,10.4 H19.2 V13.4 H12.8 Z M12.4,14.4 H19.6 V17.4 H12.4 Z M12.8,18.4 H19.2 V21.4 H12.8 Z"/><path fill="#f6eedc" d="M13.4,11 H17.8 L13.4,12.4 Z M13,15 H18.2 L13,16.4 Z M13.4,19 H17.8 L13.4,20.4 Z"/></g>
<g id="gl-senta"><path fill="#2a2017" d="M10.6,12.6 H21.4 L22.2,15.6 H9.8 Z M11,15.2 H13.4 V21 H11 Z M18.6,15.2 H21 V21 H18.6 Z"/><path fill="#f6eedc" d="M11.2,13.3 H17.6 L11.2,14.7 Z M11.5,16.4 H12.7 L11.9,20.2 Z"/></g>
<g id="gl-camina"><path fill="#2a2017" d="M10.6,20.4 L13.4,15 L14.6,16.4 L16,9.2 L17.4,16.4 L18.6,15 L21.4,20.4 Z"/><path fill="#f6eedc" d="M15.7,12 L14.6,19.2 H15.7 Z M13,16.6 L12.2,19 H13.2 Z"/></g>
<g id="gl-agua"><path fill="#2a2017" d="M9.8,19.6 V15.8 A2.07,2.07 0 0 1 13.93,15.8 A2.07,2.07 0 0 1 18.07,15.8 A2.07,2.07 0 0 1 22.2,15.8 V19.6 Z"/><path fill="#f6eedc" d="M10.6,17.2 H19.6 L10.6,18.5 Z M10.9,15.5 L12.5,14.3 L11.9,15.9 Z"/></g>
<g id="gl-mira"><path fill="#2a2017" d="M20.2,16 A4.2,4.2 0 1 1 11.8,16 A4.2,4.2 0 1 1 20.2,16 Z M20.08,16.43 L22.38,17.71 L19.75,17.67 Z M19.32,18.41 L20.67,20.67 L18.41,19.32 Z M17.67,19.75 L17.71,22.38 L16.43,20.08 Z M15.57,20.08 L14.29,22.38 L14.33,19.75 Z M13.59,19.32 L11.33,20.67 L12.68,18.41 Z M12.25,17.67 L9.62,17.71 L11.92,16.43 Z M11.92,15.57 L9.62,14.29 L12.25,14.33 Z M12.68,13.59 L11.33,11.33 L13.59,12.68 Z M14.33,12.25 L14.29,9.62 L15.57,11.92 Z M16.43,11.92 L17.71,9.62 L17.67,12.25 Z M18.41,12.68 L20.67,11.33 L19.32,13.59 Z M19.75,14.33 L22.38,14.29 L20.08,15.57 Z"/><path fill="#f6eedc" d="M12.55,15.4 A3.5,3.5 0 0 1 15.4,12.55 A2.8,2.8 0 0 1 12.55,15.4 Z"/></g>
<g id="gl-compra"><path fill="#2a2017" d="M10.2,13.2 H21.8 L20,20.6 H12 Z M11.8,13.6 V13.2 A4.2,4.2 0 0 1 20.2,13.2 V13.6 H18.6 V13.2 A2.6,2.6 0 0 0 13.4,13.2 V13.6 Z"/><path fill="#f6eedc" d="M11,14.4 H18.8 L11,15.7 Z M11.9,17.2 H17.6 L12.1,18.5 Z M12.6,19.2 H15.4 L12.8,20 Z"/></g>

<!-- chassis: closed -->
<symbol id="pin-closed-unconfirmed" viewBox="0 0 32 32">
  <use href="#geo-halo"/>
  <use href="#geo-rose" fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="2" stroke-linejoin="round"/>
  <use href="#geo-tail" fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="16" cy="16" r="1.6" fill="none" stroke="#7a6448" stroke-width="1.4"/>
</symbol>
<symbol id="pin-closed-confirmed" viewBox="0 0 32 32">
  <use href="#geo-halo"/>
  <use href="#geo-rose" fill="#1f6f78" stroke="#1f6f78" stroke-width="1" stroke-linejoin="round"/>
  <use href="#geo-tail" fill="#1f6f78" stroke="#1f6f78" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="16" cy="16" r="2" fill="#f6eedc"/>
  <use href="#geo-seal"/>
</symbol>

<!-- chassis: open (glyph). Draw as: <use href="#pin-open-unconfirmed"/><use href="#gl-come"/> -->
<symbol id="pin-open-unconfirmed" viewBox="0 0 32 32">
  <use href="#geo-halo"/>
  <use href="#geo-rose" fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="2" stroke-linejoin="round"/>
  <use href="#geo-tail" fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="16" cy="16" r="8.5" fill="#f6eedc" stroke="#7a6448" stroke-width="1.2"/>
</symbol>
<symbol id="pin-open-confirmed" viewBox="0 0 32 32">
  <use href="#geo-halo"/>
  <use href="#geo-rose" fill="#1f6f78" stroke="#1f6f78" stroke-width="1" stroke-linejoin="round"/>
  <use href="#geo-tail" fill="#1f6f78" stroke="#1f6f78" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="16" cy="16" r="8.5" fill="#f6eedc"/>
  <!-- glyph goes here, then the seal on top: -->
</symbol>
<!-- For open-confirmed the artifact must draw: pin-open-confirmed, then gl-*, then geo-seal (seal above glyph). -->

<!-- chassis: photo frame (photo circle sits *behind* this, clipped to r 8.5 → hole = round(size*17/32) px) -->
<g id="geo-petals"><path d="M16,2 L17.81,7.7 A8.5,8.5 0 0 0 14.19,7.7 Z M30,16 L24.3,17.81 A8.5,8.5 0 0 0 24.3,14.19 Z M16,30 L14.19,24.3 A8.5,8.5 0 0 0 17.81,24.3 Z M2,16 L7.7,14.19 A8.5,8.5 0 0 0 7.7,17.81 Z"/></g>
<g id="geo-photo-halo"><path d="M14.19,7.7 L16,2 L17.81,7.7 M24.3,14.19 L30,16 L24.3,17.81 M17.81,24.3 L16,30 L14.19,24.3 M7.7,17.81 L2,16 L7.7,14.19" fill="none" stroke="#f6eedc" stroke-opacity="0.95" stroke-width="3.2" stroke-linejoin="round"/></g>
<symbol id="pin-photo-unconfirmed" viewBox="0 0 32 32">
  <use href="#geo-photo-halo"/>
  <use href="#geo-petals" fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="16" cy="16" r="8.5" fill="none" stroke="#7a6448" stroke-width="1.6"/>
</symbol>
<symbol id="pin-photo-confirmed" viewBox="0 0 32 32">
  <use href="#geo-photo-halo"/>
  <use href="#geo-petals" fill="#1f6f78" stroke="#1f6f78" stroke-width="1" stroke-linejoin="round"/>
  <use href="#geo-seal"/>
</symbol>
<!-- Photo mode never draws the full rose or the tail: the kite bases and the tail top lie inside r 8.5
     and would paint over the photo. The petals stop exactly at the window edge; the ring/seal hides the seam. -->

<!-- punto -->
<symbol id="punto-unconfirmed" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="#f6eedc"/><circle cx="16" cy="16" r="8" fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="2.4"/></symbol>
<symbol id="punto-confirmed" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="#f6eedc"/><circle cx="16" cy="16" r="8" fill="#1f6f78"/></symbol>
```

Transition demo for the artifact: wrap `#geo-seal` in `<g class="zpots-seal zpots-pin-icon--just-confirmed">`,
add `<circle cx="16" cy="16" r="9.5" fill="none" stroke="#1f6f78" stroke-width="1.4" class="zpots-seal-pulse"/>`
after it, include the section 4.7 CSS with `--dur-base: 320ms; --dur-slow: 640ms;
--ease-paseo: cubic-bezier(0.22,0.61,0.36,1); --ease-settle: cubic-bezier(0.16,1,0.3,1)`.

The artifact should show, on the parchment ground: (a) the six glyphs × sizes 32 / 22 / 16 / 10 ×
both statuses; (b) photo pins at 44 and 32, both statuses; (c) the press on a button; (d) three
pairs of pins at 50 / 30 / 18 px separation to show the ladder choosing 32 / 22 / 16.

---

## 10. Tests — written first, red first

Test files mirror module paths per `structure.md`. All assertions below are the contract; the
builder may not change them.

### 10.1 `src/__tests__/pin-density.test.ts` (NEW, `@vitest-environment node`)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.10 row `pin-density.test.ts`.**


- `projectPx(0, 0, 0)` → `{ x: 128, y: 128 }`.
- `projectPx(6.9214, 122.079, 14)` → x ≈ 3519475.439, y ≈ 2016314.997 (`toBeCloseTo`, 2 dp).
- `projectPx(90, 0, 1)` does not return NaN/Infinity (clamp).
- `nearestNeighbourPx`: two points 20 px apart → both get 20 (symmetric, `toBeCloseTo`); a third
  point 100 px away with `searchPx = 44` → Infinity; an empty array → empty Map; a lone point → Infinity.
- Grid correctness: 300 seeded-pseudo-random points in a 400 × 400 box, compare against brute force
  for every key (exact within 44, Infinity otherwise).
- `tierForDistance(Infinity, 0)` → 0; `(Infinity, 1)` → 1; `(31.9, 1)` → 2; `(22, 1)` → 2; `(21.9, 1)` → 3;
  `(16, 1)` → 3; `(15.9, 1)` → 4; `(5, 1)` → 4; `(44, 0)` → 0; `(43.9, 0)` → 1.
- `computePinTiers` fixtures A/B/C (5.3): at z14 A and B both → 3 (plain), at z16 → ceiling per
  `wantsPhoto` (0 or 1), at z12 → 4.
- A point with `lat: NaN` produces no entry and does not throw; the other points are unaffected.
- Determinism: two calls with the same input produce equal maps.
- `PIN_TIER_SIZES` is strictly descending and `PIN_TIER_SIZES[0] === DENSITY_SEARCH_PX`.

### 10.2 `src/__tests__/pin-glyphs.geometry.test.ts` (NEW, node)

For each of the six `PIN_GLYPH_PATHS` entries:
- Parse every numeric pair following `M`, `L`, and the endpoints of `H`/`V`/`A` in `mass` and
  `cuts` (absolute commands only; the test fails on any relative or curve command `C`/`Q`/`S`/`T`).
- Every point: `(x − 16)² + (y − 16)² ≤ 51.84` (R5).
- Mass vertices: for each (x, y) there exists (32 − x ± 0.01, y ± 0.01) (R4).
- `mass` contains no `rx`, no `stroke`; the `PinGlyph` markup has exactly two `<path>` children,
  first `fill="#2a2017"`, second `fill="#f6eedc"`, on a `<g data-glyph="{id}">` with no other attributes.
- All six `mass` strings are pairwise different.
- `SPOT_CATEGORIES` has exactly the six ids in order `come, senta, camina, agua, mira, compra`
  and `isSpotCategory("noche")` is false.

### 10.3 `src/__tests__/pin-icon.size.test.ts` (NEW)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.10 row `pin-icon.size.test.ts`.**


- `createPinIcon("confirmed")` (no options) → iconSize `[22,22]`, iconAnchor `[11,21]`, popupAnchor
  `[0,-19]` (unchanged contract, duplicated here on purpose).
- size 32 → `[32,32]`, `[16,30]`, `[0,-28]`; size 16 → `[16,16]`, `[8,15]`, `[0,-14]`; size 10 →
  `[10,10]`, `[5,5]`, `[0,-6]`.
- className contains `zpots-pin-icon--tier-1` for 32, `--tier-2` for 22, `--tier-3` for 16,
  `--tier-4` and `--punto` for 10; never `--punto` above 10.
- size 24 → throws `RangeError`.
- size 16 with `category: "come"` → html has no `data-glyph`; size 10 → no `data-glyph`, no `data-part="seal"`.
- `createPhotoPinIcon(url, "confirmed")` → `[44,44]`, `[22,41]`, `[0,-38]`, hole `width:23px`;
  size 32 → `[32,32]`, `[16,30]`, `[0,-28]`, hole `width:17px`; size 22 → throws `RangeError`.
- Photo pin className contains `zpots-pin-icon--photo`, `zpots-pin-icon--confirmed`, `--tier-0`.
- Photo pin html contains `A8.5,8.5 0 0 0` exactly four times, contains `M14.19,7.7 L16,2 L17.81,7.7`,
  and does **not** contain `M13.5,22` (no tail) or `L12.5,13` (no full kite).

### 10.4 `src/__tests__/pin-icon.category.test.ts` (NEW)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.10 row `pin-icon.category.test.ts`.**


- `createPinIcon("unconfirmed", { category: "agua" })` html contains `data-glyph="agua"`, a
  `<circle` with `r="8.5"`, `fill="#2a2017"`, `stroke="#7a6448"`.
- Same with `"confirmed"`: contains `data-glyph`, `data-part="seal"`, `#1f6f78`, and `#2a2017`.
- No category, unconfirmed: html contains no `data-glyph` and no `r="8.5"`; keeps the centre mark
  `r="1.6"`. No category, confirmed: no `data-glyph`, exactly one `r="8.5"` (the seal band,
  `fill="none"`), keeps the centre mark `r="2"` with `fill="#f6eedc"`.
- Six categories produce six different `html` strings; glyph markup for `"come"` is byte-identical
  between the unconfirmed and confirmed icons (category is status-independent).
- The first `<path` in every html is the cream halo (`stroke="#f6eedc"`).
- `createPinIcon("confirmed", { category: "not-a-category" as never })` → no `data-glyph`.

### 10.5 `src/__tests__/pin-icon.seal.test.ts` (NEW)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.10 row `pin-icon.seal.test.ts`.**


- Confirmed html contains `data-part="seal"`; unconfirmed does not.
- The seal circle is `r="8.5"` `stroke="#1f6f78"` `stroke-width="1.4"`; the teeth path starts
  `M24.89,17.41`.
- `justConfirmed: true` + confirmed → html matches
  `/<g class="zpots-seal zpots-pin-icon--just-confirmed" data-part="seal">/` and contains
  `class="zpots-seal-pulse"`; the pulse circle is `r="9.5"`.
- Not flagged → matches `/<g class="zpots-seal" data-part="seal">/` and has no `zpots-seal-pulse`.
- Unconfirmed + flag → neither class anywhere. Size 10 + flag → neither.
- Photo pin confirmed + flag → contains `zpots-pin-icon--just-confirmed`.
- `html` contains no `stroke-dasharray`.

### 10.6 `src/__tests__/pin-icon.just-confirmed.test.ts` (EXISTING — one assertion changes)

Test "with the flag, confirmed markup gets the class on the first (halo) path": rename to "with
the flag, confirmed markup gets the class on the seal group" and replace the regex with
`/<g class="zpots-seal zpots-pin-icon--just-confirmed" data-part="seal">/`. Add: html does **not**
match `/<path[^>]*class="zpots-pin-icon--just-confirmed"/`. All other tests in the file unchanged.

### 10.6b `src/__tests__/SpotMap.just-confirmed.test.tsx` (EXISTING — two assertions widened, one test added)

**The conflict.** Lines 91 and 105 assert `toHaveBeenCalledWith("unconfirmed", { justConfirmed: false })`
and `(…, { justConfirmed: true })`. `toHaveBeenCalledWith` is an exact `toEqual` match. Section 7.5
makes every call carry `{ justConfirmed, category, size }`, and the fixture is one lone spot, so the
real call is `("unconfirmed", { justConfirmed: false, category: undefined, size: 32 })`. Both fail.
The original 10.9 row claimed this file stays green; that claim was wrong.

**Ruling: change the test, not the implementation.** The exact-object form was incidental: when the
test was written the options bag had one key, and `{ justConfirmed: false }` was simply the whole
bag. The test's stated intent (its `describe` and both `it` names) is the `false → true` transition
on the spot's own pin after confirm resolves. The call contract changed in this spec, in 7.5, before
a line of implementation existed; the test update therefore originates from the spec, which is the
opposite of reshaping a test around code after the fact. The builder was right to stop and escalate
instead of editing it.

Why not change the implementation instead: the only implementation that keeps the exact match is one
that omits `size` when it is "the default" — but a lone pin's size is 32, not 22, so the key would
still appear unless the plain ceiling were lowered to 22 to make the test pass. That is design by
test, and it also produces two option shapes for one call site, which the cache key would then have
to special-case. Rejected.

Exact changes:
- Line 91 → `expect(createPinIconSpy).toHaveBeenCalledWith("unconfirmed", expect.objectContaining({ justConfirmed: false, size: 32 }));`
- Line 105 → `expect(createPinIconSpy).toHaveBeenCalledWith("unconfirmed", expect.objectContaining({ justConfirmed: true, size: 32 }));`
- New test, "threads the density size on every call and never changes it on confirm": render the lone
  spot, click confirm, `await waitFor` the `onConfirmSpot` call, then assert
  `createPinIconSpy.mock.calls.every(([, options]) => options.size === 32)` is true (lone pin →
  plain ceiling → 32, unchanged by confirming) and
  `createPinIconSpy.mock.calls.every(([, options]) => typeof options.justConfirmed === "boolean")`
  is true (the key is always present, never dropped to `undefined`).
- The "keeps the spot's own pin icon reference stable" test is untouched; it already passes.

Net effect: the file loses one incidental strictness (the bag has no other keys) and gains two
contracts it never pinned before (size threaded, lone pin is 32, size invariant across confirm). It is
stronger after the change than before.

`MapInsetInner.just-confirmed.test.tsx` keeps its exact matches. `MapInsetInner` is out of scope and
its call is still `createPinIcon(status, { justConfirmed })`; widening that file would be a loosening
with nothing gained.

### 10.7 `src/__tests__/pin-seal-css.test.ts` (NEW, node, same text-parsing helpers as `paseo-motion-css.test.ts`)

- `@keyframes zpots-seal-press {` exists; its body contains `scale(1.8)` and `scale(1)`.
- `.zpots-pin-icon--just-confirmed` rule body contains `zpots-seal-press` and `var(--ease-settle)` and
  does **not** contain `stroke-dasharray` or `paseo-mark-draw`.
- `.zpots-seal-pulse` body contains `paseo-ring-pulse`, `forwards`, `opacity: 0`, `transform-box: view-box`.
- `.zpots-seal` body contains `transform-box: view-box`.
- `.zpots-pin-icon--punto svg` body contains `transform-origin: 50% 50%`.
- No `--zpots-` custom property in the file (re-asserted).

### 10.8 `src/__tests__/SpotMap.density.test.tsx` (NEW)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.10 row `SpotMap.density.test.tsx` and §14.13.**


Mocks: `@/lib/pin-icon` with spies recording `(status, options)` and `(url, status, options)`;
react-leaflet stand-in per `SpotMap.just-confirmed.test.tsx` with `fakeMap.getZoom` backed by a
mutable `let zoom = 14` and `on(event, fn)` capturing the `zoomend` handler.

- Spots A and B (5.3), `spots` prop: both `createPinIcon` calls receive `size: 16`.
- Set `zoom = 16`, invoke the captured `zoomend` handler inside `act`: both receive `size: 32`.
- A alone: `size: 32`.
- `mapSpots` `[mine A with photoUrl, saved B]` at z14: `createPinIcon` for both with `size: 16`
  and `createPhotoPinIcon` never called; at z16: `createPhotoPinIcon(url, …, { size: 44 })` for A
  and `createPinIcon(…, { size: 32 })` for B.
- `sourceFilter` hiding `saved` at z14: A becomes `size: 44` (B no longer counts).
- Icon reference stability: re-render with a new unrelated prop (e.g. `nickname`) → the `icon` prop
  captured by `Marker` is the same object; invoking `zoomend` with the *same* zoom → same object.
- `category` on a spot is forwarded: `createPinIcon` receives `category: "mira"`.
- After `onConfirmSpot` resolves, `justConfirmed: true` is passed; advance fake timers 1200 ms →
  a further call with `justConfirmed: false`; unmount before 1200 ms → no state-update warning.
  (Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`; `waitFor` and real timers do not mix.)

### 10.9 Existing tests at risk — re-audited by opening and running each file (2026-09-22)

> **AMENDED by revision 2 (2026-09-22) — read together with §14.10 (revision-2 audit).**


The first version of this table was reasoned about, not checked, and two rows were wrong. This
version was produced by opening every file and running the whole set
(`npx vitest run src/__tests__/SpotMap src/__tests__/pin- src/__tests__/MapInsetInner
src/__tests__/paseo-motion-css src/__tests__/theme-tokens src/__tests__/pergamino-tokens
src/__tests__/no-raw-hex src/__tests__/mapa-page`): 29 files, 268 tests pass, 2 fail, both in
`SpotMap.just-confirmed.test.tsx`, both the exact-match assertions covered by 10.6b.

| file | fake map / mock shape (verified) | result | action |
|---|---|---|---|
| `pin-icon.test.ts` (frozen) | none | green | none |
| `pin-icon.adversarial.test.tsx` (frozen) | none | green | none |
| `pin-icon.just-confirmed.test.ts` | none | green | rewritten per 10.6, already landed in 405502e |
| `SpotMap.just-confirmed.test.tsx` | forwards `fakeMap` with `on/off/getZoom() → 14`; mocks `@/lib/pin-icon` | **2 fail** (`:91`, `:105`) | **10.6b** |
| `MapInsetInner.just-confirmed.test.tsx` | mocks `@/lib/pin-icon`; exact `{ justConfirmed }` matches | green | none — `MapInsetInner` untouched, call shape unchanged; do not widen |
| `SpotMap.density.test.tsx` (new) | `fakeMap` with mutable `getZoom`, captured `zoomend` | green | none |
| `SpotMap.pergamino.test.tsx` | `fakeMap = { setMaxBounds, on, off }` cast `as unknown as LeafletMap` — **no `getZoom`** | green only because the builder added a `readZoom()` guard in `SpotMap.tsx` | **10.10**: add `getZoom: () => 14` to this fake; delete the guard |
| `SpotMap.wiring.test.tsx` | `on/off/setMaxBounds/getPane/createPane/addLayer/removeLayer/getZoom/getContainer` | green | none |
| `SpotMap.wiring.adversarial.test.tsx` | same shape as wiring | green | none |
| `SpotMap.fitbounds.test.tsx` | `fakeMap` with `on/off`, `getZoom: vi.fn(() => 14)` | green | none |
| `SpotMap.fitToCity.zero-size.test.tsx` | `fakeMap` with `on/off`, `getZoom: vi.fn(() => 14)` | green | none |
| `SpotMap.mapSpots-gating.test.tsx` | `useImperativeHandle(ref, () => null)` → `leafletMap` null → `DEFAULT_ZOOM` | green | none |
| `SpotMap.popup.test.tsx` | ref → null, as above | green | none |
| `SpotMap.city.test.tsx` | no ref forwarded → `leafletMap` null; real `createPinIcon` | green | none |
| `SpotMap.test.tsx` (frozen) | no ref forwarded; real `createPinIcon` | green | none |
| `SpotMap.city.real-leaflet.test.ts` | real Leaflet, does not render `SpotMap` | green | none |
| `mapa-page.test.tsx` | `vi.mock("@/components/SpotMap")` — never renders the real map | green | none (omitted from the first table; listed now for completeness) |
| `PostFlow.*.test.tsx`, `MapInsetInner.*.test.tsx` (others) | `createPinIcon("unconfirmed")` / `(status, { justConfirmed })`, default size 22 closed rose | green | none |
| `paseo-motion-css.test.ts` | text parse of `globals.css` | green | none — selector and seven keyframes present |
| `theme-tokens.test.ts`, `pergamino-tokens.test.ts` | text parse | green | none — nothing nested in the three regex-parsed rules |
| `no-raw-hex.test.ts` | walks `src/components`, `src/app` | green | none — hexes only in `icons/**` and `src/lib` |

### 10.10 `SpotMap.pergamino.test.tsx` fake and the `readZoom()` guard — ruling

The builder made `SpotMap.tsx` tolerate a map without `getZoom` (`typeof map.getZoom === "function"
? map.getZoom() : DEFAULT_ZOOM`). That is the exact anti-pattern `learnings.md` (2026-09-20) records
from the Pergamino work: *"Extend an unfaithful test double, do not defend against it in production
… Adding `typeof map.getPane === "function"` guards to components would have been test-driven
damage: production branches for a state that cannot occur."* A real `L.Map` always has `getZoom`.

Required changes:
- `src/__tests__/SpotMap.pergamino.test.tsx`: add `getZoom: () => 14,` to the `fakeMap` literal
  (it is already cast `as unknown as LeafletMap`, so no typing work). One line.
- `src/components/SpotMap.tsx`: delete `readZoom` and its doc comment; the effect calls
  `map.getZoom()` directly, as 7.5 now states.
- Acceptance criterion added under Density: no `typeof … getZoom` anywhere in `src/components`.

## 11. Acceptance criteria — revision 2 (the Reviewer uses this verbatim)

Checks the §14 contract. The revision-1 checklist is kept below as §11-old for the record and is
**not** the gate any more.

### Process
- [ ] Every test change in §14.10 was committed red (failing against the rev-1 implementation) before the implementation commit that makes it green.
- [ ] No assertion in §14.10 was weakened or reshaped to fit what was built; the frozen files (`pin-icon.test.ts`, `pin-icon.adversarial.test.tsx`, `SpotMap.test.tsx`) are byte-identical to HEAD `3734944`.
- [ ] One commit per task in §14.12; `Co-Authored-By` line present.
- [ ] The builder started from whichever of HEAD / the in-flight `spots`-layer removal (§14.13) had landed, and neither resurrected nor re-deleted that layer.

### No photo on any pin
- [ ] `src/lib/pin-icon.ts` exports exactly `createPinIcon`, `CreatePinIconOptions`, `PinStatus`, `PinSize` and nothing named `createPhotoPinIcon`, `CreatePhotoPinIconOptions`, `PhotoPinSize`.
- [ ] `src/components/icons/pin-icons.tsx` contains no `PETALS`, `PHOTO_HALO`, `PhotoPinFrame`, and `PinChassisProps.mode` is `"closed" | "open"` only.
- [ ] `src/lib/pin-density.ts` exports no `PHOTO_CEILING_TIER`, `PLAIN_CEILING_TIER`, `PHOTO_LAST_TIER`; `DensityPoint` has no `wantsPhoto`; `tierForDistance` takes one argument.
- [ ] `SpotMap.tsx` contains no `isPhotoEligibleSource`, `wantsPhotoFor`, `createPhotoPinIcon`, `PhotoPinSize`; `spot.photoUrl` appears in `SpotMap.tsx` only inside the popup (`<SpotPhoto photoUrl=…>`), never in an icon factory or cache key.
- [ ] `grep -rn "createPhotoPinIcon\|PhotoPinFrame\|zpots-pin-icon--photo\|zpots-pin-icon-photo-wrap" src` returns nothing (tests included: the `vi.mock("@/lib/pin-icon")` factories no longer define `createPhotoPinIcon`).
- [ ] No `<img` in any `createPinIcon(...).options.html`.
- [ ] Photos still render on the deck card (`SpotCardView`), the map popup (`SpotPhoto`), the profile grid (`/u/[handle]`) and the post flow; `SpotPhoto.test.tsx`, `SpotMap.popup.test.tsx`, `SpotCardView.*.test.tsx` untouched and green. `photoUrl` stays on `Spot`/`MapSpot`; no migration touched.

### Ladder
- [ ] `PIN_TIER_SIZES` is exactly `[32, 22, 16, 10]`; `PinTier` is `0 | 1 | 2 | 3`; `GLYPH_LAST_TIER === 2`; `PUNTO_TIER === 3`; `DENSITY_SEARCH_PX === 32`.
- [ ] `tierForDistance`: `Infinity → 0`, `32 → 0`, `31.9 → 1`, `22 → 1`, `21.9 → 2`, `16 → 2`, `15.9 → 3`, `0 → 3`.
- [ ] `computePinTiers` fixtures A/B (§5.3): z14 → `2`, `2`; z16 → `0`, `0`; z12 → `3`, `3`.
- [ ] className carries `zpots-pin-icon--tier-0` at 32, `--tier-1` at 22, `--tier-2` at 16, `--tier-3` and `--punto` at 10; `--punto` never above 10.
- [ ] Anchors per §14.4: `[16,30]/[0,-28]`, `[11,21]/[0,-19]`, `[8,15]/[0,-14]`, `[5,5]/[0,-6]`; default size with no option is still 22.
- [ ] `createPinIcon` with `size: 44` (or any value outside the ladder) throws `RangeError`.
- [ ] Recompute only on `zoomend` and render; no `move`/`moveend`/`zoom` listener; `map.getZoom()` called directly, no `typeof … getZoom` guard in `src/components`.
- [ ] `tierFor` fallback is `0`; `mapSpots` cache key is `${source}:${status}:${category ?? "-"}:${tier}:${justConfirmed}` (no `photoUrl`).

### Glyph on every glyph-eligible tier
- [ ] `createPinIcon(status, { category, size })` renders `<g data-glyph="…">` at sizes 32, 22 **and 16**; never at 10.
- [ ] With `category: undefined` (or an invalid string) sizes 32/22/16 render the closed rose exactly as revision 1 (centre mark `r="1.6"` unconfirmed / `r="2"` confirmed, no `r="8.5"` window except the confirmed seal band).
- [ ] The six `PIN_GLYPH_PATHS` strings are byte-identical to §3; `pin-glyphs.geometry.test.ts` untouched and green.
- [ ] Glyph fill `#2a2017`, cuts `#f6eedc`, never `currentColor`; glyph markup byte-identical across statuses and sizes.

### Punto azulejo
- [ ] Size-10 markup is exactly §14.5: an `<svg viewBox="0 0 32 32" width="10" height="10">` containing exactly two `<path>` elements and no `<circle>`: halo `d="M16,1 L31,16 L16,31 L1,16 Z" fill="#f6eedc"`, then body `d="M16,4 L28,16 L16,28 L4,16 Z"` with `fill="#1f6f78"` (confirmed) or `fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="3"` (unconfirmed).
- [ ] Punto carries no `data-glyph`, no `data-part="seal"`, no `zpots-seal-pulse`, no `zpots-pin-icon--just-confirmed`, regardless of options.
- [ ] `.zpots-pin-icon--punto svg { transform-origin: 50% 50% }` still present; no other CSS change in this revision (`pin-seal-css.test.ts` untouched and green).

### Seal and transition (unchanged contract, re-verified at the new tiers)
- [ ] Confirmed icons at 32/22/16 carry the seal (`data-part="seal"`, teeth path starting `M24.89,17.41`); unconfirmed never.
- [ ] `justConfirmed` + confirmed at 32/22/16 renders `<g class="zpots-seal zpots-pin-icon--just-confirmed" data-part="seal">` and the `r="9.5"` pulse; `JUST_CONFIRMED_TTL_MS === 1200`; timers cleared on unmount.

### Mi mapa source rule
- [ ] `mine`/`preview` (and any future source) → `createPinIcon(spot.status, { justConfirmed, category, size })`; `been` → status `"confirmed"`; `saved` → status `"unconfirmed"`; every call carries the three keys `{ justConfirmed, category, size }`.
- [ ] `SpotMap.density.test.tsx` mapSpots cases: z14 `mine`+`saved` 189 m apart → both `size: 16`; z16 → both `size: 32` with their own categories forwarded; `sourceFilter` hiding `saved` → `mine` alone at `size: 32`.

### Docs
- [ ] `CLAUDE.md` item 2 reworded per §14.9 (photo → category stamp; broken `paseo-social.md` reference fixed). The "clusters stack" → density-ladder half of that edit is applied **only if the user confirmed it** (§14.9 flags it as a second locked-decision change).
- [ ] `.claude/steering/structure.md` Silhouette bullet replaced with §14.9's text.
- [ ] `.claude/prds/social-spots.md`: Mi mapa "Pin by source" sentence and the inset "one photo pin" sentence corrected; change-log row added.
- [ ] `.claude/prds/famous-spots-seed.md`: one note at each of the three "44px photo pin" mentions (lines ~35, ~239, ~784 at HEAD).
- [ ] `.claude/learnings.md` gains the §14.11 entry.
- [ ] Nothing in §14.8 "Out of scope" was touched: no DB column, no `MapInsetInner.tsx`/`PostFlow.tsx` pin-call change, no `--color-*` token change, no clustering.

### Cross-cutting
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.

## 11-old. Acceptance criteria — revision 1 (SUPERSEDED by §11 above; kept for the record)


### Process
- [ ] Every test file in 10.1–10.8 was committed red before its implementation commit.
- [ ] No assertion in section 10 was weakened or reshaped.
- [ ] One commit per task; `Co-Authored-By` line present.

### Style
- [ ] Every glyph's `mass` obeys R1–R9 by inspection and R4/R5 by `pin-glyphs.geometry.test.ts`.
- [ ] The six path strings in `PIN_GLYPH_PATHS` are byte-identical to section 3.
- [ ] Glyph fill is `#2a2017`, cuts `#f6eedc`, in every state and size; never `currentColor`.
- [ ] No stroke, `rx`, gradient, opacity, or shadow inside any `<g data-glyph>`.

### Chassis
- [ ] Layer order per 4.4; halo is the first `<path>` in every non-punto icon.
- [ ] Confirmed icons carry the seal (`data-part="seal"`, teeth path starting `M24.89,17.41`) in
      closed, open, and photo modes; unconfirmed icons never do.
- [ ] Open unconfirmed window ring is `stroke="#7a6448" stroke-width="1.2"`; photo unconfirmed ring `1.6`.
- [ ] Photo mode draws `PHOTO_HALO` + `PETALS` and no tail; nothing painted inside r < 8.5 except the photo.
- [ ] Punto markup matches 4.5 exactly; anchors `[5,5]` / `[0,-6]`.
- [ ] `createPinIcon` no longer string-replaces markup.

### Transition
- [ ] `.zpots-pin-icon--just-confirmed` drives `zpots-seal-press`, not `paseo-mark-draw`; no dasharray.
- [ ] `zpots-seal-pulse` circle only in markup when flagged; `forwards` with `var(--dur-base)` delay.
- [ ] `JUST_CONFIRMED_TTL_MS = 1200`; timers cleared on unmount.
- [ ] Reduced motion: no new rules outside the existing kill switch.

### Density
- [ ] `pin-density.ts` has no import from `leaflet`, `react`, or `@/components`.
- [ ] Recompute only on `zoomend` and render; no `moveend`/`move`/`zoom` listener anywhere in `SpotMap.tsx`.
- [ ] `SpotMap.tsx` calls `map.getZoom()` directly; no `typeof … getZoom` guard in `src/components`; `SpotMap.pergamino.test.tsx`'s fake has `getZoom`.
- [ ] Every `createPinIcon` call in `SpotMap.tsx` passes `{ justConfirmed, category, size }`; `createPhotoPinIcon` calls pass `{ justConfirmed, size }` and `CreatePhotoPinIconOptions` has no `category` field.
- [ ] `wantsPhoto` is the `saved`/`been` denylist typed on `MapSource`; no `"famoso"` literal and no widening to `string` in `SpotMap.tsx`.
- [ ] `SpotMap.just-confirmed.test.tsx` matches 10.6b exactly: two `expect.objectContaining` assertions carrying `size: 32`, plus the new every-call test.
- [ ] Ladder is exactly `[44, 32, 22, 16, 10]`; photo ceiling 0; plain ceiling 1; photo dropped above tier 1; glyph dropped above tier 2.
- [ ] Cache keys include tier and category (5.7); density keys are layer-prefixed.
- [ ] Anchors follow 4.6 for every size (`round` for icon y, `floor` for popup y).

### Cross-cutting
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.
- [ ] `structure.md` and `social-spots.md` updated per 7.7.
- [ ] Nothing in "Out of scope" was touched.
- [ ] `.claude/learnings.md` gets one entry: the audit-chosen ridge (taste lost to the L1 number) and
      the `moveend` non-trigger.

---

## 12. Assumptions

- **A1.** The rose geometry is the brand mark and is not redrawn. Character comes from what the
  rose carries (glyph, seal, ladder), not from a new silhouette.
- **A2 (SUPERSEDED by §14.2 — there are no photo pins).** Photo pins do not carry a category glyph at tiers 0–1. A corner badge was the rejected
  "confetti" option; the photo is the richer signal, and the glyph returns at tier 2.
- **A3.** `MapInsetInner`'s single pin stays at 22 px, closed rose, until a category reaches it
  (separate change: pass `size: 32, category`).
- **A4.** `been`/`saved` colouring on Mi mapa stays source-driven (existing rule); the seal follows
  the same rule (`been` → sealed).
- **A5 (SUPERSEDED by §14.2 — the denylist no longer decides photo eligibility; source decides status only).** `MapSource` is `"mine" | "saved" | "been" | "preview"` today; `"famoso"` from
  `famous-spots-seed.md` has not landed, so comparing against it is a `tsc` error and pre-wiring it
  behind a `string` widening is dead code that hides a branch from whoever adds the member. The
  photo rule is therefore the denylist in 5.4 (`saved`/`been` are status pins, everything else with a
  photo is a photo pin), which needs no knowledge of `"famoso"` at all.

---

## 13. Revision note — 2026-09-22 re-audit

Triggered by the builder's escalation after implementation went green except for
`SpotMap.just-confirmed.test.tsx`. What changed in this file and why:

| where | before | after | why |
|---|---|---|---|
| 10.9 | reasoned table; claimed `SpotMap.just-confirmed` stays green and that every `SpotMap.*` fake has `getZoom` | rebuilt by opening every file and running the set (29 files, 2 failures, both expected) | two rows were wrong; the table now records evidence, not belief |
| 10.6b (new) | — | `toHaveBeenCalledWith` exact matches at `:91`/`:105` become `expect.objectContaining` carrying `size: 32`; one new every-call test | the options bag legitimately grew per 7.5; the change originates in the spec; the file ends stronger |
| 10.10 (new) | — | pergamino fake gains `getZoom`; `readZoom()` guard deleted from `SpotMap.tsx` | repo rule from learnings.md: fix the double, never guard production against it |
| 5.4, 7.5, A5 | `wantsPhoto` allowlist including `"famoso"`; builder widened `source` to `string` to compile | denylist `source !== "saved" && source !== "been"`, typed on `MapSource` | no dead literal, no widening, and `"famoso"` works the day it lands |
| 7.3 | `CreatePhotoPinIconOptions.category` | removed | never rendered (A2); a dead field is a leftover, not parity |
| 11 | — | five acceptance boxes added | so the Reviewer checks the four rulings above verbatim |

Builder's two questions, answered: the `string` widening is **replaced** by the denylist; the photo
`category` field is a **leftover, delete it**.

---

## 14. Revision 2 — 2026-09-22: no photo on any pin; the punto is an azulejo

**Trigger.** Two user decisions after the branch was approved and green:

1. *"Remove the photo design and just use the category."* Every pin is a category pin.
2. *"A dot isn't creative. Have some inspiration from a Latin culture or design."* The tier-4
   punto may not be a circle.

**Where this spec was wrong, and why the user is right.** A2 said a photo pin never carries a
glyph. `wantsPhoto` made every `mine`/`preview`/future-`famoso` spot with a photo a photo pin.
So on the pins the map is mostly made of, category was invisible at the two largest tiers and
then *appeared* when crowding dropped the photo at tier 2. A cue that exists only under crowding
is worse than no cue: it flickers in and out on zoom, and the user cannot learn what it means.
The comparison board had a north-east badge for exactly this; revision 1 dropped the badge
without replacing it and I did not notice. The badge would have been a second channel that dies
at 32 px anyway. Removing photos from pins is the cleaner fix: the glyph is now the content of
every pin, at every glyph-eligible size, and the deck card (which already shows the photo at
full width) keeps the photo where it is legible.

**Do I think either decision is wrong?** No. Decision 1 costs one thing worth naming: Mi mapa
loses its most personal image (your own photo on your own pin), and until the `category` column
ships the pins it gains are closed roses (§14.6). That is a sequencing cost, not a design flaw.
Decision 2 is a correction of my own rule: R3 allows arcs only where a real curve exists, and a
dot is nothing but an arc; the punto was always off-style. It also collided with the basemap:
`BasemapLayer` draws `pois` ground points with `protomaps.CircleSymbolizer` (a small circle), so
a round punto could be mistaken for a base-map POI. A lozenge cannot.

**Photos are not leaving the app.** Only pins lose them. `photoUrl` stays on `Spot`/`MapSpot`,
the `spot-photos` bucket and its policies stay, and photos keep rendering in: the Paseo deck card
(`SpotCardView`), the map popup (`SpotPhoto` inside `SpotMap`'s `<Popup>`), the profile grid
(`/u/[handle]`), and the post flow's capture step. `SpotPhoto.test.tsx`, `SpotMap.popup.test.tsx`
and `SpotCardView.*.test.tsx` are untouched. Anyone who deletes beyond the list in §14.7 has
over-deleted.

### 14.1 What each revision-1 section becomes

| rev-1 section | fate | replaced by |
|---|---|---|
| 0 table rows "Plain pins ride a five-step ladder…", "`usePinIconCache` … 280 variants" | superseded | §14.3, §14.4 |
| 1, 1.1, 1.2, 2, 3.1–3.6 (style, rules, categories, glyph geometry) | **unchanged** | — |
| 3.7 audit method | corrected label (§14.3); numbers unchanged | §14.3 |
| 4.1 `ROSE`/`TAIL` | unchanged; the photo paragraph, `PETALS`, `PHOTO_HALO` deleted | §14.5 |
| 4.2 three rose states | superseded: two states (closed, open) | §14.4 |
| 4.3 seal | unchanged | — |
| 4.4 layer order | unchanged minus the photo-mode clauses | §14.5 |
| 4.5 punto | superseded | §14.5 |
| 4.6 sizes and anchors | superseded | §14.4 |
| 4.7 transition | unchanged | — |
| 5.1 module API | superseded | §14.3 |
| 5.2 nearest-neighbour rationale | unchanged | — |
| 5.3 tier mapping | superseded | §14.3 |
| 5.4 ceilings | superseded (no ceilings) | §14.3 |
| 5.5, 5.6 triggers, thrash | unchanged | — |
| 5.7 cache key | superseded | §14.4 |
| 5.8 below the floor | unchanged except "tier 4" reads "tier 3" | — |
| 6 colours | unchanged | — |
| 7.1, 7.2, 7.6 | unchanged (7.2 now points at §14.3) | — |
| 7.3, 7.4, 7.5, 7.7 | superseded | §14.7, §14.9 |
| Out of scope | amended | §14.8 |
| 8 edge cases | amended | §14.8 |
| 9 artifact | amended | §14.5 (punto symbols), §14.7 (delete photo symbols) |
| 10.1, 10.3, 10.4, 10.5, 10.8 | amended | §14.10 |
| 10.2, 10.6, 10.6b, 10.7, 10.10 | unchanged | — |
| 10.9 risk table | re-audited | §14.10 |
| 11 | replaced (now §11; old is §11-old) | §11 |
| 12 A2, A5 | superseded (both were about photo pins) | §14.2 |
| 12 A1, A3, A4 | unchanged | — |
| 13 | historical, unchanged | — |

### 14.2 Assumptions added or replaced

- **A2 (replaced).** There are no photo pins. Category is the only content a pin carries; status
  is the only thing the chassis carries. No badge, no second channel.
- **A5 (replaced).** The `saved`/`been` denylist no longer decides photo eligibility (nothing is
  photo-eligible). The Mi mapa source rule is now purely about *status*: `been` → `"confirmed"`,
  `saved` → `"unconfirmed"`, every other source (`mine`, `preview`, a future `famoso`) → the
  spot's own `status`. Still written so that a new `MapSource` member needs no edit here.
- **A6 (new).** Every pin is a category pin *by contract*; a pin whose `category` is `undefined`
  renders the closed rose, and that is the state that ships first (§14.6).
- **A7 (new).** The ladder's top is 32 px. Reasoning in §14.3. If, on seeing the all-glyph map,
  the user wants bigger lone pins, the change is prepending `44` to `PIN_TIER_SIZES` and re-running
  the §14.10 tables; it is not re-adding photos.

### 14.3 The ladder, re-derived

The rev-1 ladder `[44, 32, 22, 16, 10]` had one rationale per rung: 44 gave a photo room, 32 was
the photo's last stand, 22 was "photo gone, glyph survives", 16 dropped the glyph, 10 dropped the
rose. With no photo, three of those rationales are gone. What the ladder now has to do:

1. Guarantee no overlap: a pin of size *s* never overlaps a neighbour at distance *d* when *s ≤ d* (5.2, unchanged).
2. Put the glyph on every rung where a Grabado mass genuinely survives.
3. Degrade to a non-glyph mark only below that, and to nothing smaller than 10 px.
4. Keep the frozen default (22, no option) inside the ladder.
5. Keep tiers few and clearly different in size.

**Does 44 earn a rung? No.** At 32 px one viewBox unit is one CSS pixel: the glyph's safe disc is
14.4 px, cuts are 1.2–2.0 px at their wide end — the mass and its lights both read, and on a
DPR-2/3 phone they are 2–6 device pixels. 44 buys 19.8 px of glyph and 1.6–2.75 px cuts, i.e. the
same drawing, larger. It also costs: a 44 px marker covers 417 m of ground at z14 (9.485 m/px),
so at the default zoom almost every pin outside downtown would be 44 and the map would read as
markers with a map behind them; the hover scale (1.18) would push lone pins to 52 px on desktop;
and 44→10 is a 4.4× range that looks like two marker systems. 32→10 (3.2×) is enough. The user
saw and approved glyphs at 32 in the artifact. The rev-1 statement that plain pins cap at 32 stands.

**How far down does the glyph survive? To 16 px, not below.** Re-run of the §3.7 audit at the
grid each rung actually gets (script: rasterise mass minus cuts over the safe square
x, y ∈ [8.8, 23.2], 36 samples per cell, coverage 0–1, pairwise L1 of the vector):

> **Correction to §3.7's label.** The 8 × 8 grid there was described as "one cell = one device
> pixel of the glyph at the 22 px tier". It is not: at 22 px the safe square is 9.9 px, so 1.8
> units is 1.24 px. The 8 × 8 grid models an ~18 px pin. The ranking and every number in §3.7 are
> unchanged; only the label was wrong. The 7 × 7 grid below is the 16 px tier.

7 × 7 grid (cell 2.06 units = one CSS pixel of glyph at a 15.6 px pin; `#` ≥ 0.5, `:` ≥ 0.15):

```
come            senta           camina          agua            mira            compra
. . : # : . .   . . . . . . .   . . . . . . .   . . . . . . .   . . . . . . .   . . # # # . .
. . : # # . .   . : : : : : .   . . . # . . .   . . . . . . .   . : : # # : .   . : # . # : .
. . # # # . .   : # # # # # :   . . . # . . .   . : : # : # .   . : : # # # .   : # # # # # :
. : : # # : .   : # : : : # :   . . # # # . .   # # # # # # #   . # # # # # .   . # # # # # .
. . # # # . .   . # : . : # .   . : # # # # .   : : # # # # #   . # # # # # .   . : # # # # .
. . # # # . .   . # : . : # .   . # # # # # .   . : : : : : .   . : # # # : .   . : : # # : .
. . : # : . .   . . . . . . .   . . . . . . .   . . . . . . .   . . . . . . .   . . . . . . .
solid cells:  15      11              14              14              18              21
```

Every identifying feature is still there at 7 px of glyph: Comé's constant-width column, Sentá's
seat-on-legs with the hollow under it, Caminá's 1-cell peak widening to a 5-cell base, Agua's
full-width band, Mirá's near-disc, Comprá's block with the handle notch on top. Closest pair
Mirá/Comprá 6.92 (0.141 per cell against R10's floor of 9.0/64 = 0.141 per cell — it clears by a
hair, and the handle row is what clears it; that is why the handle is 1.6 thick).

Below that it is over: at 6 × 6 (≈13 px pin) Comé's column is one cell wide; at 5 × 5 (≈11 px pin)
Sentá has 4 solid cells, Mirá and Comprá are both 3 × 3 blobs (L1 3.81), and nothing is nameable;
at 4 × 4 (≈9 px) every glyph is a 2 × 2 or 2 × 3 block. So the glyph range widens from tiers
32/22 to **32/22/16**, and no glyph tier can exist between 16 and 10. The punto stays a non-glyph
mark, and it is a mark chosen for that (§14.5).

**Does 16 still earn a rung, or does the ladder get shorter?** It stays. 22→10 would send every
pair with 10 ≤ d < 22 px straight to puntos: at z14 that is 95–209 m, i.e. the Plaza Pershing /
City Hall pair (190 m) — the one real downtown pile, at the default zoom — would lose its category
precisely where category matters most. With 16 in the ladder that pair renders as two 16 px glyph
pins at z14 (19.95 px apart), which the audit above says is legible.

**Result: four tiers.**

```ts
export const PIN_TIER_SIZES = [32, 22, 16, 10] as const;
export type PinTier = 0 | 1 | 2 | 3;
export const GLYPH_LAST_TIER: PinTier = 2;   // tiers > 2 have no glyph
export const PUNTO_TIER: PinTier = 3;
export const DENSITY_SEARCH_PX = 32;         // = PIN_TIER_SIZES[0]

export interface DensityPoint { key: string; lat: number; lng: number }   // no wantsPhoto

export function projectPx(lat: number, lng: number, zoom: number): { x: number; y: number };   // unchanged
export function nearestNeighbourPx(points: readonly { key: string; x: number; y: number }[], searchPx: number): Map<string, number>;   // unchanged
/** Smallest index t with PIN_TIER_SIZES[t] <= d; PUNTO_TIER if none. d = Infinity → 0. */
export function tierForDistance(nearestPx: number): PinTier;   // ceiling parameter removed: there is one ceiling and it is index 0
export function computePinTiers(points: readonly DensityPoint[], zoom: number): Map<string, PinTier>;
```

Delete `PHOTO_CEILING_TIER`, `PLAIN_CEILING_TIER`, `PHOTO_LAST_TIER`. Do not keep a `ceiling`
parameter "for later": a parameter with one caller and one value is dead code.

Tier mapping (exact): `tier(d) := first t in [0..3] with PIN_TIER_SIZES[t] <= d, else 3`.

| d | tier | size |
|---|---|---|
| ∞, 32 | 0 | 32 |
| 31.9, 22 | 1 | 22 |
| 21.9, 16 | 2 | 16 |
| 15.9, 5, 0 | 3 | 10 |

Worked values (5.3 fixtures, Zamboanga, 9.485 m/px at z14): A–B 189 m → z12 4.99 px → tier 3;
z14 19.95 px → tier 2 (16 px glyph, was 16 px closed rose); z16 79.8 px → tier 0.

### 14.4 The chassis: two rose states, four sizes

| Rose state | When | Centre |
|---|---|---|
| **Closed** | `category` undefined or invalid, tiers 0–2 | kites meet at the centre; centre mark as rev-1 4.2 |
| **Open** | `category` valid, tiers 0–2 | cream window r 8.5 with the ink glyph |
| **Punto** | tier 3 | §14.5, own geometry |

Status styling, seal, layer order: rev-1 4.2–4.4 minus every "photo" row/clause. There is no
`PETALS`, no `PHOTO_HALO`, no photo window ring, no transparent window.

| tier | size | iconAnchor | popupAnchor | window px | glyph safe px | renders |
|---|---|---|---|---|---|---|
| 0 | 32 | [16, 30] | [0, −28] | 17.0 | 14.4 | glyph, or closed if no category |
| 1 | 22 | [11, 21] | [0, −19] | 11.7 | 9.9 | glyph, or closed |
| 2 | 16 | [8, 15] | [0, −14] | 8.5 | 7.2 | glyph, or closed |
| 3 | 10 | [5, 5] | [0, −6] | — | — | punto azulejo |

Anchor formula unchanged (`round` for icon y, `floor` for popup y); punto anchors are the fixed
override. Default with no `size` is still 22 (the frozen `pin-icon.test.ts` contract).

At 16 px the unconfirmed window ring (1.2 units = 0.6 CSS px) and the seal teeth (0.8 px) are
sub-pixel at DPR 1 and render as a soft edge; on phones (DPR 2–3) they are 1.2–2.4 device px.
Accepted: the same was already true of the rev-1 closed rose's seal at 16, and the ring/seal are
status, which colour carries regardless.

Cache key space: 4 tiers × 2 statuses × 7 categories (six + none) × 2 justConfirmed = **112**
variants, one live entry per marker id. `mapSpots` key drops `photoUrl`:
`` `${source}:${status}:${category ?? "-"}:${tier}:${justConfirmed}` ``.

### 14.5 The punto azulejo (tier 3, 10 px)

**The choice.** A lozenge — a diamond with its four points on the cardinal axes.

**Why it is the rose shrunk and not a different object.** The rose is four kites meeting at the
centre; its convex hull is the diamond with tips at (16, 2), (30, 16), (16, 30), (2, 16). Grabado's
own physics say what happens to a stamp as it shrinks: the lights close first and the mass remains.
The lights in the rose are the four concavities between the kites. Close them and what is left is
the hull — the lozenge. So the punto is not a substitute for the rose; it is the rose at the end
of its own degradation curve, which is the same argument this spec made for the glyphs in §1.

**Why it is also Latin, and already ours.** The lozenge is the azulejo/Talavera lattice cell, and
this product already draws it: `AzulejoBand` (`icons/ornaments.tsx`) is a diamond lattice with a
teal or terracotta square at each centre, on the header, the card divider and the settings page.
Revision 1 rejected azulejo *for the glyphs* because a glyph must be an object, not an ornament.
That objection does not apply to a mark whose whole job is "there is a spot here": an ornament
unit is exactly right for a point that carries no object. Rejected alternatives: the vinta
triangle (a sail is not the rose family, and at 10 px a triangle points somewhere, which a
centre-anchored mark must not); a cross (reads as church or hospital); a papel picado snip (no
room); a four-point star with thin rays (that *is* the rose, and it is the shape the audit says
does not survive at 10 px — its waists are what vanish).

**Geometry** (viewBox `0 0 32 32`, rendered at 10 × 10; 1 unit = 0.3125 px):

```svg
<!-- unconfirmed -->
<svg viewBox="0 0 32 32" width="10" height="10" aria-hidden="true" focusable="false"><path d="M16,1 L31,16 L16,31 L1,16 Z" fill="#f6eedc"/><path d="M16,4 L28,16 L16,28 L4,16 Z" fill="#f6eedc" fill-opacity="0.85" stroke="#7a6448" stroke-width="3"/></svg>
<!-- confirmed -->
<svg viewBox="0 0 32 32" width="10" height="10" aria-hidden="true" focusable="false"><path d="M16,1 L31,16 L16,31 L1,16 Z" fill="#f6eedc"/><path d="M16,4 L28,16 L16,28 L4,16 Z" fill="#1f6f78"/></svg>
```

- Halo: diamond, tips at r = 15 (30 units = 9.4 px tip to tip), cream. Replaces the r = 11 halo disc.
- Body: diamond, tips at r = 12 (24 units = 7.5 px tip to tip; area 288 units², vs the old dot's
  201 — slightly heavier on purpose, because a diamond's perceived size is its edge-to-edge width,
  5.3 px, not its tip-to-tip).
- Unconfirmed: cream 0.85 fill + stone-deep stroke 3.0 units (0.94 CSS px, so a full pixel at
  DPR 1; the old dot's 2.4 was a 0.75 px smudge). Default miter join: the stroked tip reaches
  r = 12 + 1.5·√2 = 14.12 < 15, inside the halo. Interior cream diamond r = 9.88 (3.1 px across).
- Confirmed: solid teal. No centre square (the azulejo's 2 × 2 unit centre would be 0.6 px).
- Same colours, same roles as the rose: cream halo, stone-deep = lápiz, teal = sellao. Passes R3
  (four chiselled vertices, no arcs) and R8 (flat fills, one opacity that is the existing
  unconfirmed convention).
- Exactly two `<path>` elements, halo first; no `<circle>` anywhere in the punto. `PuntoPin`
  keeps its name and props; the className keeps `zpots-pin-icon--punto` (the mark is still a
  point; "azulejo" is what the point is made of). Anchors `[5, 5]` / `[0, −6]`; centre-anchored,
  so `.zpots-pin-icon--punto svg { transform-origin: 50% 50% }` stays and no CSS changes.

**What the punto still says, and what it cannot.**

- Keeps: presence, exact location, **status** (teal solid vs cream-and-stone hollow — the same
  colour channel the rose uses, so the legend copy "been = teal" stays true at every size).
- Loses: **category** — the 4 × 4 audit grid (≈9 px pin) reduces every glyph to a 2 × 2 or 2 × 3
  block; the closest pair scores 2.19. There is no honest way to carry six categories in a mark
  whose body is 5 px across, and a coloured-by-category punto would break R7 and put category
  and status on one channel. Loses the **seal** (teeth would be 0.5 px) and the **tail** (the
  anchor is the centre). State this in the legend copy if a legend ever describes the punto;
  none does today.

### 14.6 The state that ships first: no category column

`Spot.category` is type-only (7.1). No migration adds the column, `toSpot` does not map it, the
post flow does not ask for it. So at runtime **every live pin has `category === undefined`** and
renders the closed rose at tiers 0–2 and the punto at tier 3. Concretely, the day this revision
lands:

- Mi mapa's `mine` pins go from 44 px photo pins to 32 px (at the ceiling) closed roses in the
  spot's status. `been` stays a sealed teal rose; `saved` a hollow stone-deep rose; `preview`
  (and later `famoso`) go from photo pins to closed roses.
- The Paseo card inset is unchanged (it was already a 22 px closed rose, A3).
- Not one glyph is visible anywhere in the shipped app until a category reaches a spot.

That is plainer than the approved branch, and the user should see it stated rather than discover
it. Two consequences:

1. **The `category` column + post-flow step is no longer "a separate spec someday"; it is the
   immediate next spec.** Until it lands, Decision 1 removes something from the map and adds
   nothing visible. This revision does not pull that work in (it is a migration, RLS, `toSpot`,
   a post-flow UI step, and a content pass over the seeded rows — a different size of change with
   its own tests), but it names the dependency.
2. **Optional, recommended, cheap: give the 17 preview spots a category now.** They are client
   constants (`src/lib/preview-spots.ts`), `Spot.category?: SpotCategory` already exists, so this
   is a type-checked field on 17 literals with no DB change, and it makes the glyphs visible on
   the signed-out Mi mapa and the empty-state deck on day one. The assignments are content
   decisions and the user may overrule any of them:

   | preview id | category | | preview id | category |
   |---|---|---|---|---|
   | fort-pilar | mira | | climaco-freedom-park | senta |
   | paseo-del-mar | senta | | bolong-beach | agua |
   | pasonanca-park | camina | | lantawan-grassland | camina |
   | santa-cruz-island | agua | | la-vista-del-mar | mira |
   | plaza-pershing | senta | | grand-masjid-barbara | mira |
   | merloquet-falls | agua | | once-islas | agua |
   | metropolitan-cathedral | mira | | manicahan-beach | agua |
   | taluksangay-mosque | mira | | canelar-barter-trade-center | compra |
   | zamboanga-city-hall | mira | | | |

   No preview spot is `come`; that is honest (none of the 17 is primarily a place to eat) and
   the first `come` glyph will be a real user's. **Coordination note:** `preview-spots.ts` was
   being edited in the working tree while this revision was written (§14.13); land this after
   that change, as its own commit, and only if the user confirms the table. It is not required
   by either decision and the acceptance criteria do not depend on it.

### 14.7 Files: what is undone, what is added

**`src/lib/pin-density.ts`** — §14.3 verbatim. Undo: ladder, `PinTier`, the three photo/plain
ceiling constants, `DensityPoint.wantsPhoto`, `tierForDistance`'s second parameter. Keep:
`projectPx`, `nearestNeighbourPx`, `computePinTiers` (signature unchanged), the `moveend` rule.

**`src/lib/pin-icon.ts`** — Delete: `createPhotoPinIcon`, `CreatePhotoPinIconOptions`,
`PhotoPinSize`, `PHOTO_SIZES`, `DEFAULT_PHOTO_SIZE`, `photoHole`, `escapeHtmlAttribute` (its only
caller was the photo `<img>`), `CLOSED_ONLY_SIZE` (16 now renders the glyph). Keep:
`createPinIcon`, `CreatePinIconOptions`, `PinStatus`, `PinSize = 32 | 22 | 16 | 10`,
`PLAIN_SIZES`, `DEFAULT_PLAIN_SIZE = 22`, `PUNTO_SIZE`, `tierForSize` (now indexes the 4-rung
ladder), `anchorsForSize`, `PUNTO_ANCHORS`, `validCategory`. Behaviour: `category` is honoured at
32/22/16 and ignored only at 10. The module's export list shrinks to exactly `createPinIcon`,
`CreatePinIconOptions`, `PinStatus`, `PinSize` — the `vi.mock("@/lib/pin-icon")` factories that
still define `createPhotoPinIcon` must drop it (§14.10) so no test refers to a deleted export.

**`src/components/icons/pin-icons.tsx`** — Delete: `PETALS`, `PHOTO_HALO`, `PhotoPinFrame`, the
`"photo"` member of `PinChassisProps.mode`, every `isPhoto` branch (halo `d`, petals path, tail
omission, photo window ring). `PuntoPin` gets §14.5's two paths. Keep: `ROSE`, `TAIL`,
`SEAL_TEETH`, `STATUS_COLOR`, `PIN_GLYPH_PATHS`, `PinGlyph`, `PinChassis` (closed/open),
`UnconfirmedPin`, `ConfirmedPin` (the frozen adversarial test renders them bare at 22). Layer order
4.4 items 1–6 apply verbatim, photo clauses struck.

**`src/components/SpotMap.tsx`** — Delete: `isPhotoEligibleSource`, `wantsPhotoFor`, the
`createPhotoPinIcon`/`PhotoPinSize` imports, the `PHOTO_CEILING_TIER`/`PHOTO_LAST_TIER`/
`PLAIN_CEILING_TIER` imports, `wantsPhoto` from the `DensityPoint` literals, `photoUrl` from the
`mapSpots` cache key. `tierFor(tiers, key)` falls back to `0`. `iconForMapSpot` becomes one call:

```
status = source === "been" ? "confirmed" : source === "saved" ? "unconfirmed" : spot.status
createPinIcon(status, { justConfirmed, category: spot.category, size: PIN_TIER_SIZES[tier] })
```

with all three option keys always present (7.5's one-shape rule). `spot.photoUrl` remains in
exactly one place in the file: the popup's `<SpotPhoto photoUrl={spot.photoUrl} …/>`. If the
`spots` write layer still exists when the builder starts (§14.13), `iconForSpot` gets the same
treatment (it already calls `createPinIcon`; only the density literal loses `wantsPhoto`).

**`src/components/MapInsetInner.tsx`, `src/components/PostFlow.tsx`** — untouched. Both call
`createPinIcon` with no `size` (22, closed rose) and never called the photo factory. Checked.

**`src/app/globals.css`** — untouched. The photo wrap used inline styles; nothing to remove.
`.zpots-pin-icon--punto svg` stays.

**`src/lib/spots.ts`** — untouched (`photoUrl` stays; `category` stays type-only).

**Section 9 artifact** — delete `#geo-petals`, `#geo-photo-halo`, `#pin-photo-*`; replace
`#punto-*` with §14.5's two symbols; show (a) six glyphs × 32/22/16 × both statuses, (b) closed
rose × 32/22/16 × both statuses (the shipping state), (c) punto × both statuses, (d) the press on
a button, (e) pairs at 40 / 25 / 20 / 12 px separation choosing 32 / 22 / 16 / 10.

### 14.8 Edge cases and out-of-scope (amended)

Struck from §8: E3 (photo pin asked for a plain size), E15 (confirm on a photo pin). Changed:
E4 → "`category` with `size` 10 is ignored; at 16 it renders". Added:

| # | Case | Required behaviour |
|---|---|---|
| E19 | `MapSpot` with `photoUrl` set | icon factory ignores it; the popup still shows the photo via `SpotPhoto` |
| E20 | `MapSpot` with `photoUrl` and no `category` | closed rose at the tier's size — the state every live pin is in at first ship (§14.6) |
| E21 | `been` source with `category` | `createPinIcon("confirmed", { category, … })`: sealed rose with glyph |
| E22 | `saved` source whose real `status` is `"confirmed"` | still `"unconfirmed"` (source rule wins over status, unchanged) |
| E23 | `size: 44` passed to `createPinIcon` | `RangeError` — 44 is no longer in the ladder |
| E24 | Punto with `justConfirmed`, `category`, or both | both ignored; markup is exactly §14.5 |
| E25 | Two glyph pins at exactly 16 px apart | both tier 2 (16 ≤ 16); rose spans 0.875·16 = 14 px, no overlap |
| E26 | Window ring / seal at 16 px on DPR 1 | sub-pixel, rendered antialiased; accepted (§14.4) |

Out of scope (unchanged unless listed): the `category` DB column, `toSpot`, RLS, the post-flow
category step (now the *next* spec, §14.6); `MapInsetInner.tsx`, `PostFlow.tsx`, `MapInset.tsx`,
`nav-icons.tsx`; popup content, `SpotPhoto`, the deck card, the profile grid, storage buckets and
policies; `--color-*` tokens; clustering; the Hoy ring, `VintaRule`, `AzulejoBand` (the punto
borrows the lozenge's *shape*, it does not import or alter the component).

### 14.9 Docs: locked decisions being changed

**`CLAUDE.md` item 2 — a locked product decision is reversed by the user.** Current text:
"On the full map every pin is the spot's photo inside the compass-rose frame, clusters stack."
Replace with: "On the full map every pin is the spot's category stamp (a Grabado glyph) inside
the compass-rose frame; photos stay on the cards and popups. Crowded pins step down a size ladder
to a small azulejo punto instead of clustering." Two changes are folded in there and both are
flagged: (a) photo → category is Decision 1; (b) "clusters stack" → ladder is a **pre-existing
contradiction** (`social-spots.md` has said "No clustering" since 2026-09-20 and revision 1 §5.8
argued for it) that revision 1 failed to flag. Apply (b) only if the user confirms; otherwise
leave "clusters stack" and record the contradiction in learnings. Same edit: the `CLAUDE.md`
reference to `.claude/prds/paseo-social.md` points at a file that does not exist — the PRD is
`.claude/prds/social-spots.md` ("PRD created, replacing the Paseo draft"). Fix the path.

**`.claude/steering/structure.md` "Silhouette" bullet** — replace with:

> Pins are the same compass-rose mark, density-responsive on a four-tier ladder
> `[32, 22, 16, 10]` px (`PIN_TIER_SIZES` in `src/lib/pin-density.ts`), chosen per pin from
> nearest-neighbour pixel distance on `zoomend` and data change (never `moveend`); 22 is the
> default when no size is given. **No pin ever shows a photo** — photos live on the deck card and
> in the popup. Tiers 0–2 (32/22/16) show the spot's Grabado category glyph (one ink mass, cream
> knife-cuts) in the rose's cream window; a spot without a category shows the closed rose. Tier 3
> (10 px) is the punto azulejo, a cream-haloed lozenge — the rose's hull with its lights closed —
> that carries status by colour and nothing else. Confirmed pins earn the seal ring. Four hex
> values are allowed in `src/lib/pin-icon.ts`: `#7a6448` (stone-deep, unconfirmed), `#1f6f78`
> (teal, confirmed), `#2a2017` (ink, glyph mass), `#f6eedc` (cream, cuts/windows/halo) — all
> equal to the matching tokens.

**`.claude/prds/social-spots.md`** — Mi mapa section: replace "Pin by source: `mine` = 44px
photo pin in a teal compass frame; `been` = solid teal compass pin; `saved` = hollow stone-deep
compass pin" with "Pin by source: every pin is a Grabado category pin (closed rose until the spot
has a category). `mine`/`preview`/`famoso` take the spot's own status; `been` = sealed teal;
`saved` = hollow stone-deep. Photos are in the popup, never on the pin." Spots-deck section:
"one photo pin for this spot" → "one pin for this spot" (the inset never drew a photo pin; this
was doc drift). Change log row: "2026-09-22 | No photo on any pin; every pin is a category pin;
ladder `[32, 22, 16, 10]`; punto is an azulejo lozenge | User decision: category was invisible on
photo pins and flickered in under crowding; a dot is off-style and collides with basemap POI dots
(`pin-revamp-spec.md` §14)". The 2026-09-22 tier-2 row stays as history.

**`.claude/prds/famous-spots-seed.md`** (unbuilt plan) — at each of the three "44px photo pin"
mentions (HEAD lines ~35, ~239, ~784) add one bracketed note: "[2026-09-22: photo pins removed;
`famoso` reuses `preview` styling, which is now the Grabado category pin — `pin-revamp-spec.md`
§14]". Its `CLAUDE.md`-"needs no change" line at ~35 is now wrong; say so in the same note.

**`.claude/learnings.md`** — §14.11.

### 14.10 Tests: which die, which change, which are frozen

**No frozen test asserts photo-pin behaviour.** I opened each: `pin-icon.test.ts` (default 22
anchors, status classes, hexes, `fill-opacity="0.85"`, no `stroke="white"`), `pin-icon.adversarial.test.tsx`
(bare `UnconfirmedPin`/`ConfirmedPin` at 22, `style.color` accepted, class exclusivity) and
`SpotMap.test.tsx` (static render, real `createPinIcon`). All three stay byte-identical and must
stay green. Every photo-pin assertion in the repo was written red-first from *this spec's*
revision 1 (10.3/10.4/10.5/10.8) or is a mock key, so changing them here is the spec changing its
own contract before the implementation exists — the same standing 10.6b established.

Each changed assertion must be committed red against the rev-1 implementation before the
implementation commit (they will be: size 16 has no `data-glyph` today, the punto is circles,
tiers are numbered off the 5-rung ladder, `createPhotoPinIcon` exists).

| file | action | exact changes |
|---|---|---|
| `pin-density.test.ts` | change | Drop `PHOTO_CEILING_TIER`/`PLAIN_CEILING_TIER` imports and `wantsPhoto` from fixtures. `tierForDistance` table → §14.3 (`[Infinity, 0]`, `[32, 0]`, `[31.9, 1]`, `[22, 1]`, `[21.9, 2]`, `[16, 2]`, `[15.9, 3]`, `[0, 3]`), single argument. `computePinTiers`: z14 A/B → `2`; the two z16 tests collapse into one → `0`; z12 → `PUNTO_TIER` (3). The `searchPx = 44` literals in the `nearestNeighbourPx` tests may stay (the function is generic) or become 32; `PIN_TIER_SIZES[0] === DENSITY_SEARCH_PX` stays and now pins 32. Add: `PIN_TIER_SIZES` has length 4 and `PIN_TIER_SIZES[PUNTO_TIER] === 10`. |
| `pin-icon.size.test.ts` | change | Default → `--tier-1`; 32 → `--tier-0`; 16 → `--tier-2` **and** `toContain("data-glyph")` with `category: "come"` (assertion flips); 10 → `--tier-3` + `--punto`, no glyph, no seal. `size: 44 as never` → `RangeError` (add). Delete the entire `createPhotoPinIcon` describe. |
| `pin-icon.category.test.ts` | change | Remove the `createPhotoPinIcon` import. Replace "window ring stroke-width is the one numeric distinction between open and photo" with: open unconfirmed at 32/22/16 all contain `stroke-width="1.2"` and `r="8.5"`; size 16 + `category: "agua"` html contains `data-glyph="agua"`. Add: glyph markup for `"come"` is byte-identical across sizes 32/22/16 (`<g data-glyph="come">…</g>` substring equality) — size never touches the glyph. |
| `pin-icon.seal.test.ts` | change | Delete the two photo-pin tests. Add: size 16 confirmed + `justConfirmed` → `<g class="zpots-seal zpots-pin-icon--just-confirmed" data-part="seal">`. Punto no-op test unchanged. |
| `pin-icon.punto.test.ts` | **new** | For both statuses at `size: 10`: html has exactly two `<path` and zero `<circle`; first path `d="M16,1 L31,16 L16,31 L1,16 Z"` with `fill="#f6eedc"`; second path `d="M16,4 L28,16 L16,28 L4,16 Z"`; confirmed second path has `fill="#1f6f78"` and no `stroke`; unconfirmed has `fill-opacity="0.85"`, `stroke="#7a6448"`, `stroke-width="3"`. Parse both `d` strings: four vertices each, every vertex has a mirror across x = 16 and across y = 16, tips lie on the axes (x = 16 or y = 16). Options `{ category: "mira", justConfirmed: true }` change nothing (byte-identical html to the bare call). `import * as pinIcon from "@/lib/pin-icon"; expect(Object.keys(pinIcon).sort()).toEqual(["createPinIcon"])` (types are erased; this pins the runtime export list). No `createPinIcon(...).options.html` contains `<img` for any size × status × category. |
| `SpotMap.density.test.tsx` | change | Mock factory drops `createPhotoPinIcon`; remove `createPhotoPinIconSpy`. Test 4 ("mine-with-photo + saved at z14"): keep fixtures, assert both `createPinIcon` sizes `16`, and additionally that no call's options carry a `photoUrl` key. Test 5 (z16): give `mine` `category: "come"` and `saved` `category: "agua"`; assert `("unconfirmed", objectContaining({ size: 32, category: "come" }))` and `("unconfirmed", objectContaining({ size: 32, category: "agua" }))`. Test 6 (`sourceFilter`): `mine` alone → `objectContaining({ size: 32 })` via `createPinIcon` (was 44 via the photo factory). Add: `been` source → first argument `"confirmed"`; `saved` with `status: "confirmed"` → first argument `"unconfirmed"` (E22). `spots`-prop tests: see §14.13. |
| `SpotMap.just-confirmed.test.tsx` | change (mock only) | Drop the `createPhotoPinIcon` key from the `vi.mock` factory. Assertions unchanged (lone pin, `size: 32`). |
| `pin-glyphs.geometry.test.ts`, `pin-icon.just-confirmed.test.ts`, `pin-seal-css.test.ts`, `MapInsetInner.just-confirmed.test.tsx`, `SpotMap.pergamino.test.tsx`, `paseo-motion-css.test.ts`, `theme-tokens.test.ts`, `no-raw-hex.test.ts`, `mapa-page.test.tsx` | none | Checked: none references a photo pin, a tier number, or the punto's geometry. |
| `SpotPhoto.test.tsx`, `SpotMap.popup.test.tsx`, `SpotCardView.*.test.tsx` | none — must stay green | These are the photo-stays-in-the-app guard. |

Baseline at HEAD `3734944`: the pin/map subset (32 files, 281 tests) is green. After the red
commit, exactly the rows marked "change"/"new" above are red; nothing else.

### 14.11 Learnings entry (one, appended)

**A cue that only appears under crowding is worse than no cue.** Category was designed as the
photo's fallback (tier 2) and so was invisible on the pins users actually see, then flickered in
on zoom. Rule: a semantic cue on a marker is either present at the marker's *largest* size or it
is not a cue. **The 8 × 8 audit grid was mislabelled** as "the 22 px tier"; it models an 18 px pin.
Always derive the grid from the safe-square pixel size (`14.4 × size / 32`), not from memory.
**A round punto collided with the basemap's `pois` circle dots** (`CircleSymbolizer`); marker
silhouettes must be checked against the ground layer's own point symbols, not only against each
other.

### 14.12 Tasks (one commit each)

| # | task | scope |
|---|---|---|
| R-1 | Red tests: every "change"/"new" row of §14.10 | `test(grabado-r2): …` — must fail against HEAD |
| R-2 | `pin-density.ts` per §14.3 | |
| R-3 | `pin-icons.tsx` (delete photo mode, punto azulejo) + `pin-icon.ts` (delete photo factory, glyph at 16) | |
| R-4 | `SpotMap.tsx` per §14.7 | on top of §14.13's landed state |
| R-5 | Docs per §14.9 (`CLAUDE.md` item 2 half (b) only if confirmed) + learnings §14.11 | |
| R-6 | Section 9 artifact update (the comparison HTML page) | |
| R-7 (optional) | Preview-spot categories per §14.6, after user confirmation and after the in-flight `preview-spots.ts` change lands | |

### 14.13 Collision: an unrelated change is in flight in the working tree

While this revision was written, the working tree (uncommitted, not this spec's work) was
removing the write-mode `spots` layer from `SpotMap.tsx`: `AddSpotForm.tsx`, `MapView.tsx`,
`SpotMap.wiring*.test.tsx`, `AddSpotForm.test.tsx` deleted; `spots`/`onCreateSpot`/`nickname`
props, `iconForSpot`, `spotDensityKey`, placement state gone; `SpotMap.just-confirmed.test.tsx`
and `SpotMap.density.test.tsx` already ported to `mapSpots` fixtures (`source: "mine"`, no
`photoUrl`, so they go through `createPinIcon(spot.status, …)` — every size assertion in §14.10
holds for them unchanged: A/B → 16 at z14, 32 at z16, lone → 32). `MapInsetInner.tsx` and
`preview-spots.ts` were also being edited.

Rules for the builder:
- Start from whichever state has landed. Everything §14.7 touches in `SpotMap.tsx`
  (`iconForMapSpot`, `densityPoints`, `tierFor`, `wantsPhotoFor`, `isPhotoEligibleSource`, imports,
  the `mapSpots` marker loop) exists identically in HEAD and in the in-flight version.
- Do not resurrect the `spots` layer and do not re-delete it; that is the other change's call.
- `SpotMap.density.test.tsx` / `SpotMap.just-confirmed.test.tsx`: the `spots` → `mapSpots` port
  belongs to the other change; §14.10's edits to those two files (mock key removal, tests 4–6,
  the two new source-rule tests) are this spec's and apply on top of whichever fixture shape has
  landed. If this revision lands first, leave the `spots` fixtures alone.
- Do not touch `MapInsetInner.tsx` or `preview-spots.ts` in R-1…R-6 for any reason.
