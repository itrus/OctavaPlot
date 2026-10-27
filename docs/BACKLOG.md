# OctavaPlot backlog

Companion to [ROADMAP.md](../ROADMAP.md). It does not change the roadmap's decisions, architecture rules or phases; every item below is filed under one of them. It merges two outside reviews, `OctavaPlot_Improvement_Plan.md` (IDs `OP-`, `DOC-`) and `OctavaPlot_Prism8_Plotting_Addendum.md` (IDs `P8-`), after checking them against the source of 27 October 2026.

Sizes are my estimates (S: half a day, M: one to two days, L: several days), as in the roadmap.

## How far to trust each item

| Tag | Meaning |
|---|---|
| **Confirmed** | A reader found the code that does it, in the current source, by reading (file:line given). Not run. |
| **Partly** | True for some code paths only; the narrower truth is stated. |
| **Not checked** | Taken from the review text, not looked at. Treat as a proposal. |

No defect below was reproduced by running code in this pass. The reviews say most were reproduced; that is not re-verified here.

## Progress, 27 October 2026

Done and tested (full suite 3254 tests, type-check and `knip` clean; the interface was not looked at in a browser): **A** OP-007, 008, 009, 011, 012, 013, 014, 016, 017, DOC-001, DOC-003. **B** OP-002, OP-010, OP-033 (OP-012 in A). **C** OP-003, OP-004, OP-006, OP-015, and OP-005 for column and grouped charts (a bar that spans a gap is still one rectangle, trimmed by the plot clip). **D** OP-001, OP-023, OP-024, OP-025 (stale analyses and extra data sets open with a note; damaged structure is refused), OP-029, OP-030; a project restored from the recovery copy now counts as not saved to a file. **E** P8-006 (Connect points in: Ascending X), P8-007 (labels inside bars), P8-015 (legend order and columns; legend-only text is not done), P8-020 (seven heat map statistics). Also: SD is now the default spread of a new Bar chart and Mean with error bars (a change from the earlier "no spread by default" note).

Also done: OP-018, 019 (already so in the working tree; tests added), 020, 021, 022, 026, 027 (focus movement not testable without a DOM), 028, 031, 035, 036 (uses Vite's parser: the installed TypeScript 7 has no JavaScript parser API), and OP-034 (export dialog with size, fonts, warnings, known limits and a JSON report; glyph checks and counts of clipped objects are not done). OP-032 is partly done: CSS for 900 px and 600 px, looked at in Chrome at 375 and 768 px (through an iframe, as the window could not be resized): no sideways page scroll, the side panels overlay, the Layouts settings stack under the page, and the top bar keeps the panel toggles, Save, Undo and Redo and Settings on screen (the rest scrolls). Still open: the inspector overlay is slightly clipped at the left edge at 375 px, the navigator overlay stays open after choosing an item, and the status text keeps old messages.

Not done from the lists: OP-032 (in full), and the P8 items not named above.

---

## 1. Defects (roadmap P0 Correctness)

These also answer roadmap step 3 for P0 ("which defects exist"). Each needs a regression test first (roadmap Testing).

### 1.1 Wrong numbers or wrong data on screen

| ID | Defect | Status and where | Size |
|---|---|---|---|
| OP-001 | Decimal comma: 1.234 is shown for editing as `1.234`, the parser takes the dot as thousands, an unchanged edit saves 1234 (and any other decimal, such as 1.5, is refused on an unchanged edit) | **Fixed 27 Oct 2026**: the separator of the setting is used to show, edit, copy and export; no thousands separator anywhere; CSV uses semicolons in comma mode; round-trip tests for edit, paste, copy and CSV. Not committed | done |
| OP-002 | A graph in a layout ignores exclusions, hidden and added series | **Fixed 27 Oct 2026**: one entry point `prepareChartInput` (`src/model/table/preparedChart.ts`) used by the graph view, thumbnails and layouts; an architecture test guards it. | done |
| OP-003 | On a log axis values of 0 or less are dropped before box, violin and floating-bar statistics, so the median changes (a warning counts them, the statistics still change) | Confirmed, `columnModel.ts:185`, `groupedModel.ts:186` | M |
| OP-004 | Nonlinear fit: stopping tests are absolute and parameters are scaled only by their start value, so tiny Y can report `converged` with a wrong rate | Confirmed by reading, `src/stats/fit.ts:326`; the exact 1e-9 case was not run | L |
| OP-005 | Broken axis, column charts: a mark inside the omitted range snaps to an edge, mean connector and paired lines are not split in data space | Partly: column only (`columnModel.ts:283`, `:505-535`). XY already splits in data space (`xyModel.ts:263`, `polylinesThroughBreaks`) and is the model to reuse | M |
| OP-006 | Descending ECDF: the auto Y range comes from the steps, not from the start level (1, 100 or n), so the first step can be clipped | Confirmed in logic, `histogramModel.ts:48`; whether axis rounding hides it was not read | S |
| OP-007 | Hyperbola fit drops X = 0 although the model is defined there | **Fixed 27 Oct 2026**: hyperbola keeps X = 0 (`nonNegativeX`); curve sampling honours it. | done |
| OP-008 | A supplied mean outside its supplied lower/upper limits is accepted as `ok` | **Fixed 27 Oct 2026**: a centre outside its limits makes the interval unavailable, with a notice. | done |
| OP-010 | A data set added from another table gets the base table's row titles | Confirmed, `chartTable.ts:80` | M |
| OP-011 | Added series change colour when an earlier added series is removed | **Fixed 27 Oct 2026**: added series keep a stored colour slot (`slot`, optional; old files open as before). | done |
| OP-014 | Automatic histogram edges are rounded to 15 digits, so closely spaced values can fall outside every bin | **Fixed 27 Oct 2026**: counting uses exact edges when rounding would lose a value. | done |
| OP-015 | Results SD squares raw deviations and underflows at about 1e-200; the chart SD scales first and does not | Confirmed, `descriptive.ts:62` vs `summary.ts:190` | S |
| OP-016 | Annotation label clean-up uses `/s+/g`, so the letter s is replaced by a space | **Fixed 27 Oct 2026**: whitespace regex corrected. | done |

### 1.2 Identity, export and files

| ID | Defect | Status and where | Size |
|---|---|---|---|
| OP-009 | Duplicating a graph keeps hidden-layer ids that contain the old chart id (`:atRisk`, `:titles`, `:pairLines`, others), so those layers reappear | **Fixed 27 Oct 2026**: a duplicated graph remaps layer ids that hold the old chart id. | done |
| OP-012 | Layout PNG does not get the dpi chunk that a single graph gets | **Fixed 27 Oct 2026**: layout PNG uses the same encoder as a single graph, with the dpi chunk. | done |
| OP-013 | Thumbnails inline many SVGs that all use `id="plot-clip"` | **Fixed 27 Oct 2026**: thumbnails get ids of their own; exports unchanged. | done |
| OP-017 | `vite.config.ts` runs only `*.test.ts`, so `*.test.tsx` (for example `controls.test.tsx`) never runs under `npm test` | **Fixed 27 Oct 2026**: test config includes `*.test.tsx`. | done |
| OP-025 | Import repair: a bad replicate layout silently becomes single values, duplicate analysis ids pass, only the first repair note is shown | Confirmed, `serialize.ts:58`, `:423`, `App.tsx:130` | M |
| OP-033 | The layout report leaves out the warnings of its panels | Confirmed, `layoutExport.tsx:43` | S |

### 1.3 Performance and resource safety

| ID | Defect | Status and where | Size |
|---|---|---|---|
| OP-018 | `prefixIds` runs three string passes per id over the whole SVG | Confirmed, `export.tsx:36`, `layoutExport.tsx:22` | M |
| OP-019 | Paired matching is rows x groups x points | Confirmed, `columnModel.ts:504` | S |
| OP-020 | Calc cache keys serialise the data; Results fits bypass the cache | Confirmed, `calcCache.ts:30`, `curveFit.ts:61` | M |
| OP-021 | Nothing stops two PNG exports at once | Confirmed, `GraphView.tsx:121`, `LayoutView.tsx:153` | S |
| OP-022 | Large paste uses `Math.max(0, ...rows)` and can overflow the stack | Partly: confirmed at `cellText.ts:221`. The huge-allocation case needs a project with zero groups and a large `rowCount`, so it is narrower than the review says | S |
| OP-023 | No flush of autosave on page exit | Partly: there is no `pagehide` or `beforeunload` handler. The review is wrong that there is no unsaved state: `hasUnsavedChanges` and `markSaved` exist and a failed write is retried every 15 s | S |
| OP-024 | Two tabs share one recovery key with no revision | Confirmed, `serialize.ts:490` | M |

### 1.4 Not adopted as written

- **OP-026** (inputs without labels, errors and names): partly. `useFieldAria` already gives aria-label, describedby and `aria-invalid`. Only a sweep for inputs that skip it is justified (not checked).
- **OP-032** (small screens): there is one `@media`, for reduced motion, and no width queries. This is roadmap P3 "small screens".
- **OP-015 and OP-001 "property tests"**: keep, but as tests of the fixed code, not as separate work.

---

## 2. Features, filed by roadmap phase

Status of "not built": confirmed by a grep or by reading the named file. "Not checked" items are proposals.

### P2 Scene and export (roadmap steps 1 and 2)

The roadmap's step 1 (labels, annotations, overlays into the scene) and step 2 (export panel, fonts) stay first. These items fit inside them.

| ID | Item | Status | Size | Fits |
|---|---|---|---|---|
| P8-003 | Warn when SD and SEM are mixed, or an error bar is hidden under its symbol; draft figure description from recorded meanings | Not checked | M | Step 2 panel, diagnostics |
| OP-034 | Export preflight: final text and stroke size after panel scaling, fonts, clipped objects | Already the roadmap's step 2 | M | Step 2 |
| P8-023 | Fix the inner plot size or the outer figure size; "reflow" versus "scale" as two operations | Not checked | M | Needs measured text (step 1) |
| P8-024 | Align the plot axes of layout panels, not their frames | Not checked | L | After P8-023 |
| P8-016 | A master legend object in a layout | Confirmed not built (`Layout` has no legend field, `types.ts:666`) | M | After OP-002 |
| P8-015 | Legend order independent of drawing order, rows/columns, legend-only text | Confirmed not built (`LegendConfig`, `types.ts:456`) | M | |
| P8-031 | Batch export of selected graphs from one project revision | Not checked | M | After OP-021, OP-012 |
| G2 | Optional reproducibility manifest beside an export | Proposal | M | Open decision 2 |
| G5 | Vector PDF | Proposal, later | L | Roadmap says PDF is raster |

### P3 Editing

| ID | Item | Status | Size |
|---|---|---|---|
| OP-027 | Arrow keys, Home/End and roving tab stop in inspector tabs and radios | Confirmed for tabs (`controls.tsx:351`); radios not inspected | S |
| OP-028 | Ctrl/Cmd+S saves the `.oplot` file | Confirmed not built (`App.tsx:73`) | S |
| OP-029 | Insert, delete and duplicate rows | Confirmed not built; only "Add 1000 rows" and clearing cells | M |
| OP-030 | CSV import preview with delimiter and decimal choice | Confirmed not built (`DataTableView.tsx:365`); related to OP-001 | M |
| OP-031 | CSV export: all rows, included rows, or with exclusion columns | Not checked | S |
| P8-026 | Apply chosen formatting groups to several existing graphs, with a series mapping preview and one undo step | Not checked | M |
| P8-017 | Labels and reference lines bound to a result (n, mean) that update when data change | Not checked | L |
| P8-019 | Scientific rich text (sub- and superscripts) and labels anchored to a point with a stored offset | Not checked; roadmap already lists rich text and relative offsets | L |
| OP-035 | Gallery shows creatable graphs by default, with a "Show planned" switch | Not checked | S |

### P4 Chart families

Roadmap order is kept: observation roles first, then graphs, then new families with a calculation contract first.

| ID | Item | Status | Size | Needs |
|---|---|---|---|---|
| P8-028 | Subject-aware nested and longitudinal plots (roles) | Roadmap open decision 4 | L | Decide how a subject is declared |
| P8-006 | Choose line order (table order or ascending X) and gap behaviour | Confirmed mismatch: the gallery text says "in X order", `xyModel.ts:271` draws in row order | S to fix the text now, M for the option | |
| P8-001 | Density-shaped and collision-aware dot placement | Confirmed: only deterministic uniform jitter (`jitter.ts`) | L | Contracts section 16 |
| P8-004 | Independent X error bars | Confirmed not built (`xyModel.ts:286` has one Y error path) | M | OP-008 |
| P8-002 | Error envelope from measured or supplied intervals | Not checked | M | Interval record, OP-005 |
| P8-005 | Boxes and violins at numeric X | Confirmed not built (`chartTypes.ts:62`) | M | OP-003 |
| P8-007 | Bar labels inside the end or at the base; n and value together | Confirmed: one position and one content only (`barLabels.ts:23`, `:35`) | M | Roadmap step 1b |
| P8-008 | Gap sizes and slots reserved for missing values | Not checked | M | |
| P8-009 | Stacked, side-by-side and overlapping bars mixed; two-level category labels | Not checked | L | |
| P8-010 | Date, time and duration columns and axes | Confirmed not built (`types.ts`; table folder not searched exhaustively) | L | OP-001, OP-030 |
| P8-011 | Extra ticks and shaded regions between two values | Not checked | M | OP-005 |
| P8-012 | Identity line and `a + bx` reference line, equal-unit scaling | Not checked | M | |
| P8-013 | Offset traces with a disclosed offset and explicit scale bar | Roadmap lists `xy.offset` | M | |
| P8-014 | Secondary Y axis on numeric XY | Confirmed not built (`capabilities.ts:29`) | M | |
| P8-018 | Comparison brackets bound to groups | Confirmed none (grep); roadmap lists it | L | Decide scope: supplied results only |
| P8-020 | Heat map of SD, SEM, % CV, geometric mean | Confirmed: mean and median only (`heatmapOptions.ts:18`) | M | OP-015 |
| P8-021 | Heat map colour ranges and distinct styles for missing, excluded, out-of-range | Confirmed no interval ranges (`types.ts:297`) | M | |
| P8-022 | Heat map cell size, group gaps, sparse labels, colour-bar controls | Not checked | M | |
| P8-029 | Typed five-number box and effect-interval (forest) inputs | Not checked | M | OP-008 |
| P8-030 | Interpolation, smoothing and fitted models as separate operations | Roadmap `curve.smooth` | M | Reference fixtures |
| P8-025 | Panel crops and zoomed insets of the same graph | Not checked | M | |
| P8-027 | Portable "recipes": role-mapped graph formats | Not checked | L | P8-026 |

Heat map colours, done today: the five palettes were replaced by the 16 ggsci gradients. P8-021 and P8-022 build on them.

### P5 Release

| ID | Item | Status |
|---|---|---|
| OP-036 | Architecture test reads imports with a regex that matches only single-quoted relative `from` and `import(` | Confirmed, `architecture.test.ts:26`. Use the TypeScript AST |
| P8-032 | Example projects that double as visual fixtures; one per catalogue preset | Matches roadmap "example gallery" and "visual fixtures" |
| | Playwright smoke: edit cell, exclude, compare graph and layout, duplicate, save and reopen, export PNG | Roadmap, not built |

### Documentation

| ID | Fix | Status |
|---|---|---|
| DOC-001 | README says 39 available, 24 chart types, 17 planned. Actual: 56 entries, 45 available, 11 locked, 28 chart types. Generate the numbers from the registry | Confirmed. The roadmap's 56 and 11 are right |
| DOC-003 | ROADMAP lines 48, 59, 140 (and test names "spec 22.1") say section 22.1. The acceptance fixtures are `## 15. Acceptance fixtures` in `docs/calculation-contracts.md` | Confirmed. The roadmap needs this one-word edit; I have not made it |
| DOC-002, 004, 005, 006 | Median CI wording, PNG options, survival layer claims, split README | Not checked |

---

## 3. Where to start

All options keep the roadmap order: step 1 and step 2 stay the main line. The options differ in what runs beside it.

| Option | Contents | Why | Size |
|---|---|---|---|
| **A. Quick safe fixes** (recommended first) | OP-017, OP-016, OP-012, OP-009, OP-011, OP-013, OP-007, OP-008, OP-014, DOC-001, DOC-003 | Each is small, each is confirmed, none needs a design decision. OP-017 first, so later tests are actually run | about 3 to 4 days in all |
| **B. Layout and data truth** | OP-002 (shared `prepareChartInput`), then OP-010, OP-033, OP-012 | Layouts and graphs then show the same data. This is the base for P8-016, P8-023, P8-024 | M to L |
| **C. Numerics** | OP-003, OP-005 (column), OP-004, OP-006, OP-015 | The scientific-integrity group. OP-004 is the largest and needs independent reference values (SciPy, R) | L |
| **D. Input safety** | OP-001 with OP-030 and OP-029; then OP-023, OP-024, OP-025 | Data-entry and recovery. OP-001 changes what the user types, so decide the comma-mode display format first | L |
| **E. New plotting** | P8-006 text fix now; P8-007 with step 1b; P8-015; P8-020 | Visible gains that sit on work already planned | M each |

My suggestion: A first, then B and C in parallel with roadmap step 1. D can wait for the P3 audit. New families (P8-001, 004, 005, 010, 018) wait for B and C, as the review also says.

## 4. Decisions needed from you

1. **OP-001 format in comma mode:** show `1,234` for editing (proposed), or keep `1.234` and change the parser. Either changes saved behaviour for existing users.
2. **OP-003 on a log axis:** keep negative values in the statistics and draw only what the axis can show (proposed), or keep the present filter and say so in the figure. The first changes numbers in existing figures.
3. **OP-002 scope:** one prepared-data entry for graph, layout, thumbnail and export (proposed), or a one-line fix in `drawLayout` now and the larger change later.
4. **P8-018 brackets:** supplied results only (proposed, matches "out of scope: multiple-comparison workflows"), or also calculated tests.
5. **Roadmap open decisions 1 to 4** are unchanged and still needed before steps 2 and 6.

## 5. Not adopted from the reviews

- Prism-style workarounds: repeated medians to fake a box, estimate and limits as three "replicates", a dummy graph for a legend, 1.99/2.00 range limits.
- Silent downsampling of exports, and any claim of Prism parity in packing, violins or splines.
- ANOVA, post-hoc and model-selection workflows (roadmap: out of scope).
- Replacing zero by a tiny value before a log axis.
