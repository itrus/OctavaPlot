# OctavaPlot roadmap

OctavaPlot is a scientific figure editor: composable graphical layers, trustworthy calculations, and exact output. It is not a statistics suite. Calculations exist only to draw or annotate a chart.

The calculation rules, presets and acceptance fixtures are in [docs/calculation-contracts.md](docs/calculation-contracts.md). Where each part of the code is, is in the [README](README.md#structure).

## Decisions

- **Stack:** React, TypeScript and SVG (SVG is the authoritative output), with D3 scale, shape and array modules. No server, Rust or Python.
- **Units:** charts use `pt` and `px` (1 px = 0.75 pt). Layout pages are A4 and placed in mm. No cm or inches.
- **Export:** SVG and PNG are the authoritative outputs. PNG is made at a resolution chosen in Settings (96, 150, 300 or 600 dpi), which is also written into the file. PDF exists but holds a raster picture, not vector shapes.
- **Project model:** a project holds several data tables, graphs and Results sheets. The single-chart boundary of the old specification no longer applies.
- **Layers:** a graph has one data layer (its style and summary settings) and a list of *layers*, its parts (the bars, the error bars, the fit, a reference line, an annotation ...), derived from the graph and its table. What the user decides about a part is kept on the graph by the part's ID: hidden, kept out of the axis range, its own look, its place in the order. There is no `enabled` switch: hiding never changes a calculation, and taking observations out of one is exclusion.
- **Calculation interface:** calculations sit behind a small replaceable `CalculationEngine` interface (request in, result with diagnostics and provenance out). A synchronous local implementation comes first; a SciPy/Pyodide engine is an option only if a fit cannot be validated in TypeScript.
- **Out of scope:** ANOVA, mixed and generalized models, multiple-comparison workflows beyond labelled brackets, power analysis, report builders, model selection.

## Architecture rules

1. A preset composes layers, calculations, styles and axes. It is not a renderer.
2. The inspector holds no scientific logic. Controls edit validated state.
3. Preview, hit-testing and export derive from one scene. Any difference is explicit and tested.
4. A calculation result is keyed by its inputs (data version, exclusions, method, parameters, level, seed, algorithm version). A style or axis edit must not recompute it.
5. Hiding a layer never changes n, a denominator or a correction family, nor the axes. Keeping a layer out of the axis range changes the axes and nothing else.
6. Invalid edits keep the last valid state and show a local error. Failed fits never show uncertainty.
7. Imports point down the layers `util`, `stats`, `model`, `state`, `chart`, `ui`. Inside `chart`, `shared` knows no family, and a family uses `shared` (and `xy`, for survival and histogram, which are drawn on the XY model). `src/architecture.test.ts` checks this and that no folder holds more than 30 files.

## Where things stand

Checked against the exit criteria of each phase. "Not reviewed" means this pass did not look at it.

| Phase | Status |
|---|---|
| **P0 Correctness** | Audited on 27 October 2026 ([docs/AUDIT-P0.md](docs/AUDIT-P0.md)). The defects of [docs/BACKLOG.md](docs/BACKLOG.md) section 1 were worked through on 27 October 2026, each with a regression test; the one left open is broken-axis geometry outside column and grouped charts (OP-005). Of the 22 fixtures of section 15, about 10 pass with independent values, 3 are partly covered and 7 have no code (features not built). Gaps: reference values for nonlinear fit intervals, undo and save tests, axis breaks outside column and grouped charts. |
| **P1 Layers** | Met, with two decisions: no `enabled` switch (see Decisions), and one data layer per graph (a file with more is read with a note). Every family is drawn from layers, which can be hidden and reordered one by one. XY and survival charts also give each part a look of its own and a switch for the axis range; the other families do not. |
| **P2 Scene and export** | Mostly. The marks of every family are scene elements with stable ids, and the screen, the export and the editor's hit testing are made from them. PNG has an explicit resolution. Zoom-independence of sizes and the sameness of editor and export marks are tested for every family. Annotations and the bar labels of column and grouped charts (one hideable layer for each data set) are scene elements too (steps 1a, 1b), and so are the point labels of column charts and the editor's selection marks of column and XY charts (step 1c), and the legend of pie charts and the row and column labels of heat maps (step 1d). **Not yet:** glyph checks for page layouts, and rich text (sub- and superscripts as markup, P3). Font diagnostics and the export dialog are built (step 2). |
| **P3 Editing** | Audited on 27 October 2026 ([docs/AUDIT-P3.md](docs/AUDIT-P3.md)); the exit criterion is not met. Mostly built: grid input. Partly: numeric placement, resets, keyboard, small screens. Not built: property search, mixed-state multi-selection. |
| **P4 Chart families** | Started. In the gallery 11 graphs are still locked: `xy.bars`, `xy.vector`, `xy.bubble`, `xy.trajectory`, `xy.offset`, `curve.smooth`, `cat.nested`, `grp.scatterS`, `grp.paired`, `three.bars`, `three.dots`. Observation roles (subject) are not built, and five of those graphs wait for them. |
| **P5 Release** | Not started: there are no Playwright workflows and no visual fixtures. |

Also in place: a calculation cache keyed by identity (`src/stats/calcCache.ts`), PDF and layout export, linked graphs, a folder overview with thumbnails and multi-select (Navigator), and tags for tables and graphs.

The plan for the gaps is below. Dead code is checked with `npx knip`.

## Phases

| Phase | Focus | Exit criterion |
|---|---|---|
| **P0 Correctness** | Fit intervals and convergence, numerical conditioning, histogram bins, axis-break geometry, CSV and project import, save and undo, stable series colors, `exp_two_phase` identifiability, confidence-level changes recompute intervals | Every confirmed defect has a regression test. The fixtures of section 15 pass. |
| **P1 Layers** | First-class layers with data bindings, calculation references, stable object IDs, z-order, `visible`/`rangeContribution`, capability registry. Existing chart types move over through adapters. Removes the "only the first layer is drawn" limit. | One chart combines raw points, mean, error bars, fit, band and annotations. Each part is styled and hidden independently. Hiding the band keeps the fit. |
| **P2 Scene and export** | Scene compiler (validate, calculate, layout, transform, clip, compile) feeding preview and hit-testing. SVG with stable IDs. PNG at explicit pixel size or DPI. Font diagnostics. | Zoom never changes pt font or stroke size. Exported and displayed geometry come from the same scene. |
| **P3 Editing** | Property search, mixed-state multi-selection, three reset operations, numeric annotation and label placement (offsets stored relative to the point), keyboard navigation, grid input, small screens | A figure can be reproduced from numeric inputs without dragging. |
| **P4 Chart families** | Observation roles (subject, exclusion) first. Then numeric-X bars, spikes, vectors, bubbles, paired and trajectory, nested, forest, ROC, Q-Q, Bland-Altman, residual, more band types, comparison brackets. | A target catalogue of real figures is recreated without finishing in another editor. |
| **P5 Release** | Playwright workflows, visual fixtures, accessibility, project migrations, large-data benchmarks, example gallery, docs | Stable projects, reproducible exports, documented limits. |

Each phase ships on its own. A family moves to a new mechanism (layers, the scene) only after a record of its old output exists to compare with, and its tests pass.

## Testing

- **Reference fixtures:** independent values (SciPy, R, published examples), never a second call into the same implementation. Start with section 15 (Acceptance fixtures) of the calculation contracts.
- **Metamorphic:** translating X, rescaling units, reordering rows, changing style and hiding layers leave results unchanged. Stable ids are tested against restyling, resizing, saving and reordering the rows.
- **Geometry:** clipping, breaks, log transforms, band intersections.
- **Export fidelity:** SVG viewBox, text and stroke sizes, PNG pixel dimensions and resolution, golden exports of the legacy renderer (`src/chart/export/__snapshots__/`). A change of how a family is drawn is compared with its recorded old output before it is accepted.
- **Data integrity:** malformed CSV, ragged paste, missing values. No silent conversion or loss.
- **State:** undo and redo, failed save, migrations.
- **Architecture:** the layers, the shared parts and the folder sizes (`src/architecture.test.ts`).
- **Browser (Playwright):** keyboard grid, inspector, drag and select, dialog focus. Not built yet.
- **Visual:** one fixed fixture per catalogue preset, pinned font, tolerance 0.25 pt for placement. Not built yet.

## Performance targets (provisional, on a defined reference laptop)

Not measured yet.

| Workload | Target |
|---|---|
| Edit title, color or stroke | Visible within 50 ms |
| Select one point in 10k | Within 100 ms |
| Pan and zoom 100k points | 30+ fps |
| Open a project with 100k observations | Under 3 s |
| Export a normal figure | Under 2 s, UI not blocked |
| Style edit during a fit | Main thread not blocked (worker) |

Above about 100k points, clip to the viewport and simplify the preview only. Never downsample the data or the export silently.

## Output quality

- Sizes in pt and px independent of zoom; strokes, dashes, caps and symbols are physical quantities.
- SVG with metadata and stable identifiers; PNG with explicit dimensions and resolution (for example 1063 px wide is about 90 mm at 300 dpi; the app states the pixels and the dpi).
- Export inspection panel: output size, fonts and fallbacks, raster resolution, clipped objects, known limits. Built as a dialog behind the Export button (size in px, pt and mm, fonts requested, used and missing, raster size and the canvas limit, the warnings of the chart model, print-size warnings, known limits, a copyable JSON report). Clipped objects appear only as the models word them. Glyph checks are not built.
- Warnings for very thin strokes and unreadable text. Grayscale preview and color-vision check.
- Saved style presets for common single- and double-column widths, stated in pt.
- Rich text with Greek letters, sub- and superscripts. Missing glyphs are reported.

## Done so far

- Annotations, the bar labels of column and grouped charts (a layer for each data set), the point labels of column charts, the editor's selection marks, the pie legend and the heat map labels as scene elements with stable ids, drawn by one renderer for every family (steps 1a to 1e).
- The export dialog, font diagnostics and the P0 defect fixes listed in [docs/BACKLOG.md](docs/BACKLOG.md).
- Glyph checks in the export dialog; a numeric legend offset; fill down and right in the data grid; a row limit and tests for CSV import (27 October 2026).
- First-class layers and bindings: hide, order, range, own looks (XY and survival), one data layer.
- A shared calculation cache keyed by calculation identity.
- A scene shared by preview, export and hit testing for the marks of every family; stable ids on them.
- PNG at a chosen resolution.
- A capability registry (`src/model/graph/capabilities.ts`) that the inspector and the README table read.
- A folder overview of the pages, and the layout of the source with its architecture test.

## Plan

Sizes are estimates (S: half a day, M: one to two days, L: several days). P0 and P3 have not been audited, so their rows describe how the gaps are found, not what they are.

| # | Work | Why here |
|---|---|---|
| 1 | Labels, annotations and the editor's overlays into the scene | Closes the open P2 criterion. Gives the export panel a complete list of what is drawn. |
| 2 | Export panel and font diagnostics | Needs step 1: every text must be a scene element to check its font. |
| 3 (done) | P0 and P3 audits, read-only, in parallel | Correctness defects should be known early. Results: [docs/AUDIT-P0.md](docs/AUDIT-P0.md), [docs/AUDIT-P3.md](docs/AUDIT-P3.md); the gaps are in [docs/BACKLOG.md](docs/BACKLOG.md) section 4a. |
| 4 | P5 groundwork: Playwright workflows and visual fixtures | Protects the refactors of P3 and P4. Needs the font decision of step 2. |
| 5 | Fixes from the audits, then the P3 build items | |
| 6 | P4 families, starting with observation roles | |
| 7 | The rest of P5: migrations, benchmarks, gallery, docs | |

### 1. Labels, annotations and overlays into the scene (about L, five steps)

Each step compares the SVG of many setups before and after, as the earlier moves of families did.

| Step | Content | Size |
|---|---|---|
| 1a (done) | Annotations as scene elements. The live position during a drag is a parameter, because the scene must not depend on editor state. `whenSelected` is widened from a data set to an annotation or a point. | S |
| 1b (done) | Bar and value labels (column and grouped), as a layer for each data set so that they can be hidden. They are drawn above the clipped marks, whatever place the layer has in the order. | M |
| 1c (done) | Point labels (leader lines, text, hit targets) and the selection ring and frame, as editor-only scene elements. | M |
| 1d (done) | Pie and heat map chrome (background, titles, legend, axis labels) with the chrome builders that already exist. | M |
| 1e (done) | With all of that in the scene, the `*ChartSvg` components (five, not seven) became one renderer, `SceneChart`; each family builds a drawing (its sections in order) from its model. | S |

Step 1 is done (27 October 2026), with a zoom-independence test for every family. Its criterion was: done when no SVG component draws a mark itself, and labels and annotations have ids and hit targets from the scene.

### 2. Export panel and font diagnostics (about M, plus L for glyph checks; the panel, font diagnostics and glyph checks are built)

- **The panel** shows, for one graph: the size in px, pt and mm at the chosen resolution; the format and resolution, with the canvas limit check that now sits in the graph view; the fonts requested, used and missing; objects clipped outside the axes and rows that cannot be drawn (from the counts the models already keep); the known limits (PDF is a raster, fonts are not embedded in an SVG). It holds the choice of format and resolution and the Export button.
- **Fonts:** a pure module takes the availability check as a parameter, so tests can pass a fake. Availability uses `document.fonts.check` together with a width probe against the generic fonts, because `check` alone answers yes for any name.
- **Glyphs** (second part): once step 1 is done every text is a scene element, so Greek letters and sub- and superscripts can be checked and missing glyphs reported. Built (27 October 2026): `drawingTexts` lists every text of a drawing, `checkGlyphs` (`src/chart/export/glyphCheck.ts`) looks each character outside basic Latin up in the font in use, and the export dialog lists what is missing. The lookup in the browser is a width heuristic (`browserHasGlyph`) that has not been tried in a browser; a generic family cannot be checked; page layouts are not checked yet (their texts are not collected).
- **Thin strokes and small text:** these warnings need a target print width (open decision 1).
- **Tests:** a fake font checker, the report for fixture graphs, PNG pixels and resolution.

### 3. Audits (S to M each, no code changes)

- **P0:** for each item, which tests exist, which are missing, and which fixtures of section 15 (Acceptance fixtures) of the calculation contracts are implemented. The result is a table: defect, missing test, or fine.
- **P3:** property search, mixed-state multi-selection and small screens have no clear implementation yet; numeric annotation placement, grid input, the reset commands and the keyboard handling partly exist. The audit finds the gaps against the exit criterion (reproduce a figure from numeric inputs).

### Later phases

| Phase | Gaps | Size |
|---|---|---|
| **P3** | Property search (needs a registry of field labels), mixed state, the three reset levels made explicit, keyboard navigation, small screens (there are no media queries) | M each, L for search |
| **P4** | Observation roles first (a subject column; exclusion exists). Then the locked graphs: `cat.nested`, `grp.paired`, `three.bars`, `three.dots` and `xy.trajectory` need roles; `xy.bars`, `xy.bubble` and `xy.vector` need more columns for an XY series; `curve.smooth` needs reference fixtures; `grp.scatterS` is a layout; `xy.offset` needs offset traces with a scale bar. Forest, ROC, Q-Q, Bland-Altman and residual plots each need a calculation contract with fixtures first. | roles L, each graph M, each new family L |
| **P5** | Playwright workflows (none yet), visual fixtures with a pinned font, an explicit migration chain tested against old files, benchmarks against the performance table (not measured), fits in a worker, an example gallery, docs | M each, the worker L |

### Open decisions

1. **Target print width**, for the thin-stroke and small-text warnings: a setting on each graph (90 mm, 140 mm, 180 mm or custom) or one for the project. Decided: on the graph (`printWidthMm`, optional, 20 to 400 mm; warnings below 6 pt text and 0.25 pt lines, guideline values not checked against a journal).
2. **Fonts in exports:** only diagnose, or also embed the font or turn text into paths in the SVG. Embedding makes exports reproducible (a P5 goal) but makes files larger and raises licensing questions. Decided: diagnostics now, embedding decided later.
3. **Where the export panel lives:** a dialog behind the Export button, or a tab of the inspector. Decided: a dialog, since it is a one-time action.
4. **Observation roles** (P4): how a subject is declared in a table. To be designed before step 6.

## Size

The code base is about 39 kLoC in `src`: 167 source files and 105 test files (about 14 kLoC of tests). The planning assumption is 65-85 kLoC with tests, up to 100 kLoC for advanced plotting. It is a budget, not a goal. Consolidating duplicated chart-specific models should lower net growth.
