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
- **Decided 29 October 2026:**
  - **No example gallery of `.oplot` files.** The planned `docs/examples` (one project per gallery item) was built and then deleted on purpose, with its test; it is not to be recreated. The checked-in `docs/example.oplot` stays as the one example the file test reads.
  - **Postponed by decision** (not built, not forgotten; each still has its open fixture or item): dot apportionment, Q-Q, Bland-Altman and residual plots, ROC, forest plots, the exact binomial interval, Holm and BH adjustment, visual fixtures with a pinned font (`e2e` screenshots) and the fit-validation item (outside references for the fit models other than the two-phase one).
  - **The P4 families are not built:** forest, ROC, Q-Q, Bland-Altman and residual. P4 stands at its roles and the catalogue graphs, plus the additions listed in the table below.

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
| **P0 Correctness** | Audited on 27 October 2026 ([docs/AUDIT-P0.md](docs/AUDIT-P0.md)). The defects of [docs/BACKLOG.md](docs/BACKLOG.md) section 1 were worked through on 27 October 2026, each with a regression test. Broken-axis geometry is tested for the column, grouped, XY, histogram and survival families (OP-005; a survival or ECDF step whose time lies in a gap is cut at the gap, not drawn at its edge, since 28 October 2026). Of the 22 fixtures of section 15 as audited, about 10 passed with independent values, 3 were partly covered and 7 had no code. Since then the two-phase fit matches NIST's certified values (MGH17) including its standard errors, undo and save are tested (also in the browser), axis breaks are tested in the XY family (two defects fixed), and the fixtures were written as their features were built. **Now (29 October 2026): 16 of the 22 are tested** (the eleven that passed at the audit, which include the log endpoint geometry and composition with a zero total, and Tukey, survival ties, no-event survival, bubble area and nested weighting, which were partial or missing), and section 15 has eight more rows for dates, times and durations, all tested. **6 have no code and no test** (dot apportionment, ROC perfect, ROC complete tie, exact binomial, Holm, BH): postponed by decision. `exp_two_phase` ordering was not reproduced (AUDIT-P0 follow-up). Decided 28 October 2026: a composition with a zero total is not drawn and a warning names it. |
| **P1 Layers** | Met, with two decisions: no `enabled` switch (see Decisions), and one data layer per graph (a file with more is read with a note). Every family is drawn from layers, which can be hidden and reordered one by one. A look of its own per part and the switch for the axis range are given in the XY, survival, column, grouped and histogram families wherever a part has something to set (the capability table in the README says which, per type, and a test ties it to the layer rows). Pie charts and heat maps have none, on purpose: their parts have no setting of that kind and no axis. Not done: a look for the bodies (bars, boxes, violins), which keep the data set's fill. Tested in code, and the drawing of 100 setups is unchanged when nothing is set (hash record); the new controls in the column, grouped and histogram inspectors were not looked at in a browser. |
| **P2 Scene and export** | Mostly. The marks of every family are scene elements with stable ids, and the screen, the export and the editor's hit testing are made from them. PNG has an explicit resolution. Zoom-independence of sizes and the sameness of editor and export marks are tested for every family. Annotations and the bar labels of column and grouped charts (one hideable layer for each data set) are scene elements too (steps 1a, 1b), and so are the point labels of column charts and the editor's selection marks of column and XY charts (step 1c), and the legend of pie charts and the row and column labels of heat maps (step 1d). Rich text (sub- and superscripts, Greek names) is built for the text of a graph (28 October 2026), and, on 29 October 2026, for the title and panel labels of a layout page, with glyph checks per font for page layouts (unit-tested; not tried in a browser). A master legend for a page and batch export of the selected graphs to one ZIP are built the same way (29 October 2026, unit-tested; the ZIP was opened with Windows Expand-Archive; the PNG and PDF paths of the batch and the dialogs were not tried in a browser). **Not yet:** counts of clipped objects in the export report, and the alignment of plot axes between panels (P8-023, P8-024). Font diagnostics and the export dialog are built (step 2). |
| **P3 Editing** | Audited on 27 October 2026 ([docs/AUDIT-P3.md](docs/AUDIT-P3.md)); the exit criterion is not met. Mostly built: grid input. Keyboard is done for the chart, the Navigator and the grid, and several data sets can be selected and edited together with "Mixed" where they differ. Resets have three levels now (a setting, a data set, the graph). Property search is not wanted (decided 27 October 2026). Small screens are partly done (CSS for 900 px and 600 px, tried in Chrome at 375 and 768 px). The leftovers were built on 29 October 2026: annotations reached by the arrow keys, several annotations selected together (both tried in Chrome on a bar chart); several points selected together (tested, not tried in a browser); results written into texts and reference lines (P8-017; tried in Chrome for annotation text only); a point label dragged with its offset kept (P8-019, second part; column charts; only the offset arithmetic is tested, the drag was not seen). |
| **P4 Chart families** | Started. No graph of the gallery is locked any more (28 October 2026: `grp.scatterS` was opened as the chart option `groupedBy: 'series'`, `xy.offset` was opened as `xyOffset`, `xy.bars` was opened as the chart type `xyBars`, `xy.bubble` as `xyBubble` with a new XY table layout "Y and size", `xy.vector` as `xyVector` with the layout "Y, dX and dY", `cat.nested` was opened as the dot plot with its dots grouped by subject, `xy.trajectory` as the XY line chart with one line for each subject, `grp.paired` as grouped bars of replicates with the values of each subject joined across the series, `three.bars` and `three.dots` as grouped bars whose series are clustered by a factor; the planned `curve.smooth`, a spline or LOWESS curve through the points, was taken out of the gallery and the catalogue on 28 October 2026 and is not planned). Observation roles: the subject is built as data (28 October 2026: `Observation.subject`, a Subject… command in the data table, file format, equal-unit means and subject lines in `src/model/table/subjects.ts`); `cat.nested`, `xy.trajectory` and `grp.paired` read it so far; `three.bars` and `three.dots` use a second role, the factor of a series (28 October 2026: `Group.factor`, a Factor… command in the data table of a grouped table, `src/model/table/factors.ts`). **The new families are not built (decided 29 October 2026): forest, ROC, Q-Q, Bland-Altman, residual.** Additions built on 29 October 2026, each tested on the model and in the SVG export and not tried in a browser: comparison brackets on grouped bars and XY charts (P8-018; not on survival or histogram charts, stacked bars or lines), independent X error bars (P8-004), oblique reference lines with equal units, extra ticks and shaded regions (P8-011, P8-012), a right Y axis on seven XY chart types (P8-014), dates, times and durations for the X column of an XY table (P8-010) and heat map interval colours, marks and cell, group and colour bar settings (P8-021, P8-022). |
| **P5 Release** | Started: 22 Playwright tests (`e2e/`; 22 passed and 6 performance specs skipped when run on 29 October 2026 on the development server, before the later work of that day, and not re-run since), the performance table measured and partly re-measured on 29 October 2026 (two targets now met, others not; see below), and the nonlinear fits run in a Web Worker (28 October 2026: tested in-process, and tried in Chrome on one case, see "Fits in a worker"). **Migrations built** (29 October 2026): a version chain (empty, since version 1 is the only one written) and a shape chain for files of earlier builds, in `src/state/migrate.ts`, tested against three real old files (`src/state/fixtures`). **Accessibility sweep partly done:** a static audit of every `.tsx` and tests of the contrast of the CSS colours (muted text darkened, a stronger primary button, a focus ring that invalid and header inputs no longer lose); tried in Chrome on the start screen and the Settings dialog; not done: a screen reader, a walk of every dialog and inspector by keyboard, the contrast of the data colours, forced colours, zoom. **Not built, by decision:** visual fixtures with a pinned font, the example gallery. |

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
| **P5 Release** | Playwright workflows, visual fixtures (postponed by decision), accessibility, project migrations, large-data benchmarks, docs (the example gallery was dropped by decision) | Stable projects, reproducible exports, documented limits. |

Each phase ships on its own. A family moves to a new mechanism (layers, the scene) only after a record of its old output exists to compare with, and its tests pass.

## Testing

- **Reference fixtures:** independent values (SciPy, R, published examples), never a second call into the same implementation. Start with section 15 (Acceptance fixtures) of the calculation contracts.
- **Metamorphic:** translating X, rescaling units, reordering rows, changing style and hiding layers leave results unchanged. Stable ids are tested against restyling, resizing, saving and reordering the rows.
- **Geometry:** clipping, breaks, log transforms, band intersections.
- **Export fidelity:** SVG viewBox, text and stroke sizes, PNG pixel dimensions and resolution, golden exports of the legacy renderer (`src/chart/export/__snapshots__/`). A change of how a family is drawn is compared with its recorded old output before it is accepted.
- **Data integrity:** malformed CSV, ragged paste, missing values. No silent conversion or loss.
- **State:** undo and redo, failed save, migrations (the version chain with injected steps, and three files written by earlier commits).
- **Architecture:** the layers, the shared parts and the folder sizes (`src/architecture.test.ts`).
- **Browser (Playwright):** `e2e/` (`npm run e2e`): 22 tests in the installed Google Chrome, each in a fresh profile. Built (27 October 2026): editing a cell and Undo, exclusion, Duplicate with its status message, saving and opening a project, the size and resolution of a PNG export, the keyboard of the grid, the chart, the Navigator, Fill series, the focus of the Export dialog, several data sets together (Mixed, reset), dragging an annotation, an annotation anchored to data, the legend offset and the narrow window. Not yet: a test for each chart family and for layouts, the other dialogs, and the CI job has not run on GitHub.
- **Visual:** one fixed fixture per catalogue preset, pinned font, tolerance 0.25 pt for placement. Not built; postponed by decision (29 October 2026). The recorded hashes of the drawing of 100 setups (`family-baseline.json`) and the golden exports stand in for them, and they did not change on 29 October 2026.

## Performance targets (provisional, on a defined reference laptop)

Measured on 27 October 2026 with `npm run perf` (`e2e/performance.spec.ts`, in the installed Google Chrome, on the production build): an 11th Gen Intel Core i7-1185G7 (8 threads), 16 GB, Windows 11. Two runs; where they differ, both are given. Re-measured in part on 29 October 2026 on the same machine and build type, after work on the column family; that machine was shared with other agents' runs, so the 29 October figures are ranges over 2 to 3 runs and should be read as such. Rows that were not re-measured say so. "Next frame" is the time until the browser has drawn the change; "observations" are values in the table (a graph of 100k observations draws 100k dots).

| Workload | Target | Measured |
|---|---|---|
| Edit title, color or stroke | Visible within 50 ms | 27 October: a normal graph: title 19 to 20 ms (met). 10 000 observations: 107 to 164 ms. 100 000 observations: title 2.3 to 2.5 s, stroke width 1.1 to 1.3 s (not met). **29 October** (column family only; XY, grouped, survival and histogram got no change): normal graph 18 ms (met). 10 000 observations 170 to 195 ms (not met; the 27 October figure was 107 to 164 ms, the perf run called this unchanged, and the difference was not investigated). 100 000 observations: title until the drawing changes 0.14 to 0.19 s; the next frame after the first edit after opening 1.6 s (it waits for the browser's first raster); once settled 0.12 s; stroke width 0.10 s (before, on the same day: title 2.45 s, stroke 1.04 s). Not met at 50 ms |
| Select one point in 10k | Within 100 ms | 27 October: 25 to 32 ms until the drawing changes, but 246 to 297 ms until the next frame (not met). **29 October:** 27 to 45 ms to the next frame (before, on the same day: 182 ms) (met) |
| Pan and zoom 100k points | 30+ fps | Not measured, also on 29 October (there is no clipping of the preview to the viewport) |
| Open a project with 100k observations | Under 3 s | 27 October: the table shows after 1.4 s (met); the graph is drawn after 5.7 to 7.8 s (not met). **29 October:** the graph is drawn after 2.0 to 2.7 s (met; before, on the same day: 5.6 to 5.8 s). The measure is the presence of the drawing in the page, not painted pixels, so the time to the first painted frame is longer. The table time was not re-measured |
| Export a normal figure | Under 2 s, UI not blocked | 124 ms to the PNG (met); whether the UI stays responsive was not measured. Not re-measured on 29 October, and the export of 100 000 dots was not timed |
| Style edit during a fit | Main thread not blocked (worker) | **Built and measured once, 28 October 2026** (`e2e/fitWorker.spec.ts`, development server, same i7-1185G7): a two-phase fit of 300 points. On the main thread the longest gap between frames was 2121 ms (curve after 2.5 s). In the worker 65 to 133 ms (curve after 2.4 to 2.7 s), and a title edit made during the fit was drawn after 80 to 140 ms. One data set, one machine, the development build; the production build was not measured, nor a fit of 100 000 points |

The development server is slower (React in development mode): the same runs gave 10 s for the graph of 100 000 observations and 3.9 s for its title edit (27 October; not repeated).

What changed on 29 October 2026, so that a later change does not undo it (column family only; details in BACKLOG 4b):

- **Runs.** Lists of more than 256 scene elements are written to React as memoised fragments (`sceneRuns.ts`); the markup is byte-identical, and a run is skipped when its shapes are the same objects.
- **Stable dot lists.** The model keeps the previous list of dots for a data set when every dot is equal to the last one (`stable.ts`), so a title, font or text-colour edit gives React the same shapes. Equality is by value; a restyle, rescale or hide gives new shapes.
- **Simplified preview.** With 100 000 dots or more, the preview (the graph view only) draws consecutive opaque dots of one look as one path per 12 pt square (`denseDots.ts`). Squares of 48 pt made a title edit take 3 to 4.6 s, because a path as wide as the plot is painted whole. Dots with transparency are not merged. The export, thumbnails and layouts draw every dot, and a note says the preview is simplified.
- **Where the time goes.** A trace of a 10k-dot selection showed about 14 ms of painting on the main thread and about 350 ms of GPU raster, so the first frame after an open waits for raster. The model rebuild takes about 60 ms and the JavaScript commit about 140 to 180 ms for a title edit at 100k. Meeting 50 ms would need the model, or its layout and scale step, to be skipped when only chrome changes.
- **Not done:** clipping the preview to the viewport (pan and zoom not measured), the same treatment for XY, grouped, survival and histogram charts (a 100k-dot XY graph is as slow as before), a paint-complete measure in the perf spec, and transparent dots above 100 000 (they take the old path). A dense-preview hover and click were tried in a development-server Chrome (a tooltip and a spoken point); picking in the production build was not.

Above about 100k points, clip to the viewport and simplify the preview only. Never downsample the data or the export silently.

## Fits in a worker

Done 28 October 2026. The design, so the next change does not undo it:

- **The reference stays synchronous.** `fitCurve` (`src/stats/fit.ts`) is now `solveFit` (the numerical part; returns plain data, a `FitSolution`) followed by `fitFromSolution` (builds the curve and band functions, which cannot cross a worker boundary). The worker runs `solveFit`; the main thread runs `fitFromSolution`. A result is the same whichever thread solved it (tested bit for bit for every model, through a structured clone).
- **The seam** is `CalculationEngine` (`src/stats/fitEngine.ts`): request in, reply with outcome, diagnostics and provenance (algorithm version, engine, model, points, level, ms) out. Two implementations: the main thread, and `WorkerFitEngine` (one worker, one fit at a time; aborting a running fit ends the worker; any worker error makes the main thread calculate, as before).
- **Keyed by inputs.** The worker's result goes into the same calculation cache, under the same identity, as a synchronous one (rule 4). A style or axis edit asks, finds the result or finds the job already running, and starts nothing. The graph, the export and the Results sheet share it.
- **Pending state.** `FitRun.pending`, `FittedCurve.pending`, `XyModel.fitsPending`. While pending a series has no curve, band, numbers or reason (rule 6), the graph says "Fitting the curve…" and its Export button waits. A model waiting for a fit is not kept in the model cache.
- **Stale results.** A place that waits (a *slot*: one series of one graph) wants one identity at a time. Asking for another cancels the old job if nobody else wants it, and a result that still arrives for it is dropped, not kept.
- **Export** (`buildAnyModel` without `deferFits`) calculates the fit itself if it is not in the cache, so a file holds the final fit. The preview differs from it only by the pending fit (tested).
- **Threshold.** A fit is sent to the worker when its expected time on the main thread is over 8 ms (half a frame at 60 fps): milliseconds per point for each model, measured in node on the reference laptop (linear 0.001, exponentials, peak and hyperbola 0.007, four-parameter logistic 0.011, five-parameter 0.02, rounded up). The two-phase exponential is always sent: its time depends on the data more than on n (10 to 430 ms for 16 to 60 points; 0.7 s for 100 and 4.7 s for 1000 on one noisy set). The per-point costs are from node, not the browser.
- **Not done:** the Results sheet still fits on the main thread (it is a view the user asks for, and its CSV and copy must not hold a missing fit); no worker pool (several series wait in turn); no cancel button; the axis rescales when a pending curve arrives; a layout export is synchronous.

## Output quality

- Sizes in pt and px independent of zoom; strokes, dashes, caps and symbols are physical quantities.
- SVG with metadata and stable identifiers; PNG with explicit dimensions and resolution (for example 1063 px wide is about 90 mm at 300 dpi; the app states the pixels and the dpi).
- Export inspection panel: output size, fonts and fallbacks, raster resolution, clipped objects, known limits. Built as a dialog behind the Export button (size in px, pt and mm, fonts requested, used and missing, raster size and the canvas limit, the warnings of the chart model, print-size warnings, known limits, a copyable JSON report). Clipped objects appear only as the models word them. Glyph checks are in the dialog (see "Done so far"); page layouts are checked too since 29 October 2026 (one check for each font on the page, unit-tested, not tried in a browser).
- Warnings for very thin strokes and unreadable text. Grayscale preview and color-vision check.
- Saved style presets for common single- and double-column widths, stated in pt.
- Rich text with Greek letters, sub- and superscripts, written as plain text with braces (`H_{2}O`, `m^{-2}`, `\mu`); missing glyphs are reported. Built 28 October 2026 for the text of a graph, and 29 October 2026 for the title and panel labels of a layout page.

## Done so far

- Annotations, the bar labels of column and grouped charts (a layer for each data set), the point labels of column charts, the editor's selection marks, the pie legend and the heat map labels as scene elements with stable ids, drawn by one renderer for every family (steps 1a to 1e).
- The export dialog, font diagnostics and the P0 defect fixes listed in [docs/BACKLOG.md](docs/BACKLOG.md).
- Glyph checks in the export dialog; a numeric legend offset; fill down and right in the data grid; a row limit and tests for CSV import (27 October 2026).
- First-class layers and bindings: hide, order, range, own looks (XY, survival, column, grouped and histogram), one data layer.
- A shared calculation cache keyed by calculation identity.
- A scene shared by preview, export and hit testing for the marks of every family; stable ids on them.
- PNG at a chosen resolution.
- A capability registry (`src/model/graph/capabilities.ts`) that the inspector and the README table read.
- A folder overview of the pages, and the layout of the source with its architecture test.
- Roles on the data (28 October 2026): a subject on each observation and a factor on each series of a grouped table, set in the data table (Subject…, Factor…), kept in the file and in CSV; and every graph of the gallery can be made (nested dots, repeated measures, grouped before and after, three-way bars and dots, bars at numeric X, bubbles, vectors, offset traces, separated scatter; see BACKLOG section 2).
- Nonlinear fits in a Web Worker, with a pending state and results keyed by their inputs (see "Fits in a worker").
- 29 October 2026 (unit-tested; what was tried in a browser is said in BACKLOG, section 2 and 4a): a look at every item of the BACKLOG list in Chrome, with two defects fixed (a bracket label with a subscript touched its bar; a large bubble made a huge legend key); keyboard reach and multi-selection of annotations and points, results in texts, label drag; a master legend, rich text and glyph checks on layout pages, batch export to a ZIP; brackets on grouped and XY charts, X error bars, oblique lines, equal units, extra ticks, regions, a right Y axis on XY, dates on the XY X column, heat map ranges; the legend lists a series once when it has the same name and place in two factor clusters, and a dots-only grouped chart gets dot keys (capped at 20 pt); migrations; part of the accessibility sweep; faster large column graphs.

## Plan

Sizes are estimates (S: half a day, M: one to two days, L: several days). P0 and P3 were audited on 27 October 2026; the gaps they found are in [docs/BACKLOG.md](docs/BACKLOG.md) section 4a.

| # | Work | Why here |
|---|---|---|
| 1 (done) | Labels, annotations and the editor's overlays into the scene | Closes the open P2 criterion. Gives the export panel a complete list of what is drawn. |
| 2 (done) | Export panel and font diagnostics | Needs step 1: every text must be a scene element to check its font. |
| 3 (done) | P0 and P3 audits, read-only, in parallel | Correctness defects should be known early. Results: [docs/AUDIT-P0.md](docs/AUDIT-P0.md), [docs/AUDIT-P3.md](docs/AUDIT-P3.md); the gaps are in [docs/BACKLOG.md](docs/BACKLOG.md) section 4a. |
| 4 (Playwright done; visual fixtures postponed by decision) | P5 groundwork: Playwright workflows and visual fixtures | Protects the refactors of P3 and P4. Needs the font decision of step 2. |
| 5 (mostly done) | Fixes from the audits, then the P3 build items | The defects of the audits are fixed and most P3 items are built; what is left is in BACKLOG section 4a |
| 6 (graphs done) | P4 families, starting with observation roles | Roles and every graph of the catalogue are built (28 October 2026), and the P8 additions of 29 October 2026; the new families (forest, ROC, Q-Q, Bland-Altman, residual) are not built (decided 29 October 2026) |
| 7 (partly done) | The rest of P5: migrations (done, 29 October 2026), accessibility sweep (partly), benchmarks (partly re-measured), docs. The example gallery is dropped by decision | |

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
- **Glyphs** (second part): once step 1 is done every text is a scene element, so Greek letters and sub- and superscripts can be checked and missing glyphs reported. Built (27 October 2026): `drawingTexts` lists every text of a drawing, `checkGlyphs` (`src/chart/export/glyphCheck.ts`) looks each character outside basic Latin up in the font in use, and the export dialog lists what is missing. The lookup in the browser is a width heuristic (`browserHasGlyph`) that gave plausible answers in Chrome (Greek and superscript two found in Arial, a CJK character and an emoji not) but has not been checked against the fonts' real coverage; a generic family cannot be checked; page layouts are checked since 29 October 2026 (their texts are collected for each font, with the names of a master legend).
- **Thin strokes and small text:** these warnings need a target print width (open decision 1).
- **Tests:** a fake font checker, the report for fixture graphs, PNG pixels and resolution.

### 3. Audits (S to M each, no code changes)

- **P0:** for each item, which tests exist, which are missing, and which fixtures of section 15 (Acceptance fixtures) of the calculation contracts are implemented. The result is a table: defect, missing test, or fine.
- **P3:** property search, mixed-state multi-selection and small screens have no clear implementation yet; numeric annotation placement, grid input, the reset commands and the keyboard handling partly exist. The audit finds the gaps against the exit criterion (reproduce a figure from numeric inputs).

### Later phases

| Phase | Gaps | Size |
|---|---|---|
| **P3** | Mostly built since the audit: mixed state, the three reset levels, keyboard navigation, numeric anchors and legend offset. Property search is not wanted. Built on 29 October 2026: annotations by arrow keys, several points and annotations together, labels and reference lines bound to results, label drag (column charts). Left: small screens in full, labels bound to results in titles, axis titles and legends, dragging several annotations at once, a per-point label box on XY charts | M each |
| **P4** | Roles and the catalogue graphs are built (28 October 2026). Built on 29 October 2026 (tested, not tried in a browser): brackets on grouped bars and XY charts, X error bars, identity and a + bx lines with equal units, extra ticks and regions, a right Y axis on XY, dates on the XY X column, heat map ranges. **Not built, postponed by decision:** forest, ROC, Q-Q, Bland-Altman and residual plots (each would need a calculation contract with fixtures first). Left from BACKLOG section 2: dates on other columns and families, boxes and violins at numeric X, size legend of bubbles, and others | each new family L, each addition M |
| **P5** | Playwright workflows (22 built; one for each chart family and for layouts still to do), an explicit migration chain tested against old files (built, 29 October 2026), accessibility (partly), benchmarks against the performance table (partly re-measured, 29 October 2026), docs (fits in a worker: done, see "Fits in a worker"). Postponed or dropped by decision: visual fixtures with a pinned font, the example gallery | M each |

### Open decisions

1. **Target print width**, for the thin-stroke and small-text warnings: a setting on each graph (90 mm, 140 mm, 180 mm or custom) or one for the project. Decided: on the graph (`printWidthMm`, optional, 20 to 400 mm; warnings below 6 pt text and 0.25 pt lines, guideline values not checked against a journal).
2. **Fonts in exports:** only diagnose, or also embed the font or turn text into paths in the SVG. Embedding makes exports reproducible (a P5 goal) but makes files larger and raises licensing questions. Decided: diagnostics now, embedding decided later.
3. **Where the export panel lives:** a dialog behind the Export button, or a tab of the inspector. Decided: a dialog, since it is a one-time action.
4. **Observation roles** (P4): how a subject is declared in a table. Decided 28 October 2026: a free-text `subject` on each observation (not a table column, because the units differ between conditions in a nested design). Built as data, as a Subject… dialog in the grid and in CSV; three graphs read it (nested dots, repeated measures, grouped before and after), and three-way bars and dots read a second role, the factor of a series.

## Size

The code base is about 34 kLoC in `src` (240 `.ts` and `.tsx` source files with 34 247 lines, tests left out) and about 27 kLoC of tests (207 test files: 201 `*.test.ts(x)` files in `src` with 26 176 lines, and the 6 files of `e2e/` with 705 lines), counted on 29 October 2026 on the working tree, which holds changes that are not committed yet. `src/styles.css` is not in these counts; `scripts/loc-history.mjs`, which counts `.ts`, `.tsx`, `.css`, `.html` and `.rs` over the whole repository (the e2e files count as source there), gives its own figures per commit. The planning assumption is 65-85 kLoC with tests, up to 100 kLoC for advanced plotting. It is a budget, not a goal. Consolidating duplicated chart-specific models should lower net growth.
