# OctavaPlot roadmap

OctavaPlot is a scientific figure editor: composable graphical layers, trustworthy calculations, and exact output. It is not a statistics suite. Calculations exist only to draw or annotate a chart.

The calculation rules, presets and acceptance fixtures are in [docs/calculation-contracts.md](calculation-contracts.md). Where each part of the code is, is in the [README](../README.md#structure).

## Decisions

- **Stack:** React, TypeScript and SVG (SVG is the authoritative output), with D3 scale, shape and array modules. No server, Rust or Python.
- **Units:** charts use `pt` and `px` (1 px = 0.75 pt). Layout pages are A4 and placed in mm. No cm or inches.
- **Export:** SVG and PNG are the authoritative outputs. PNG is made at a resolution chosen in Settings (96, 150, 300 or 600 dpi), which is also written into the file. A PDF is vector (built 1 November 2026): it is written from the same SVG as the SVG export (`src/chart/export/svgPdf.ts`) as paths, clips and text, so it has no resolution and scales without loss; its text uses the standard fonts Helvetica, Times and Courier (and Symbol for Greek letters and signs), the nearest to the font of the graph, not embedded.
- **Project model:** a project holds several data tables, graphs and Results sheets. The single-chart boundary of the old specification no longer applies.
- **Layers:** a graph has one data layer (its style and summary settings) and a list of *layers*, its parts (the bars, the error bars, the fit, a reference line, an annotation ...), derived from the graph and its table. What the user decides about a part is kept on the graph by the part's ID: hidden, kept out of the axis range, its own look, its place in the order. There is no `enabled` switch: hiding never changes a calculation, and taking observations out of one is exclusion.
- **Calculation interface:** calculations sit behind a small replaceable `CalculationEngine` interface (request in, result with diagnostics and provenance out). A synchronous local implementation comes first; a SciPy/Pyodide engine is an option only if a fit cannot be validated in TypeScript.
- **Out of scope:** ANOVA, mixed and generalized models, multiple-comparison workflows beyond labelled brackets, power analysis, report builders, model selection.
- **Dropped by decision, 1 November 2026:** everything that was still open apart from three items, which were then built (see Remaining work). That includes the postponed statistics and families (dot apportionment as a graph, ROC, residual plots, Q-Q and Bland-Altman, the exact binomial interval, Holm and BH, fit validation against outside references for the models other than the two-phase one), the axis alignment of layout panels, a worker pool, a cancel button and the fits of the Results sheet in a worker, a look for the bodies of bars, boxes and violins, boxes and violins at numeric X, the new families of P4, and the open items of P3 and P5 (small screens in full, accessibility beyond what is done, results in more texts, further browser checks). They are not on any list; a later change of mind starts from BACKLOG.md.
- **Decided 29 October 2026:**
- **Settled:** the target print width is a setting of each graph (`printWidthMm`, 20 to 400 mm; warnings below 6 pt text and 0.25 pt lines, guideline values not checked against a journal); the export panel is a dialog behind the Export button; a subject is a free-text `subject` on each observation (the units differ between conditions of a nested design), and a factor is a text on the first column of a series; fonts in exports are diagnosed, not embedded: an SVG names the font, and a PDF uses the standard fonts nearest to it (decided 1 November 2026, when the vector PDF was built; a character none of them has is written as "?" and said in the status line).

## Architecture rules

1. A preset composes layers, calculations, styles and axes. It is not a renderer.
2. The inspector holds no scientific logic. Controls edit validated state.
3. Preview, hit-testing and export derive from one scene. Any difference is explicit and tested.
4. A calculation result is keyed by its inputs (data version, exclusions, method, parameters, level, seed, algorithm version). A style or axis edit must not recompute it.
5. Hiding a layer never changes n, a denominator or a correction family, nor the axes. Keeping a layer out of the axis range changes the axes and nothing else.
6. Invalid edits keep the last valid state and show a local error. Failed fits never show uncertainty.
7. Imports point down the layers `util`, `stats`, `model`, `state`, `chart`, `ui`. Inside `chart`, `shared` knows no family, and a family uses `shared` (and `xy`, for survival and histogram, which are drawn on the XY model). `src/architecture.test.ts` checks this and that no folder holds more than 30 files.

## Status

Phases P0 to P5 are built as far as BACKLOG.md records. For each item it says what was tested in code and what was tried in a browser; a line that does not say "tried in a browser" was not. Also in place: a calculation cache keyed by identity (`src/stats/calcCache.ts`), PDF and layout export, linked graphs, a folder overview with thumbnails and multi-select (Navigator), and tags for tables and graphs. Dead code is checked with `npx knip`.

## Remaining work

None. The three items that were wanted on 1 November 2026 are built (what was tested and what was tried in a browser is in BACKLOG.md, "Also on 1 November 2026"):

1. Comparison brackets that can be dragged (or moved by a number), and labels of several lines.
2. A size legend for bubbles, and legend keys that follow the look of their layer.
3. A vector PDF.

## Testing

- **Reference fixtures:** independent values (SciPy, R, published examples), never a second call into the same implementation. Start with section 15 (Acceptance fixtures) of the calculation contracts.
- **Metamorphic:** translating X, rescaling units, reordering rows, changing style and hiding layers leave results unchanged. Stable ids are tested against restyling, resizing, saving and reordering the rows.
- **Geometry:** clipping, breaks, log transforms, band intersections.
- **Export fidelity:** SVG viewBox, text and stroke sizes, PNG pixel dimensions and resolution, golden exports of the legacy renderer (`src/chart/export/__snapshots__/`). A change of how a family is drawn is compared with its recorded old output before it is accepted.
- **Data integrity:** malformed CSV, ragged paste, missing values. No silent conversion or loss.
- **State:** undo and redo, failed save, migrations (the version chain with injected steps, and three files written by earlier commits).
- **Architecture:** the layers, the shared parts and the folder sizes (`src/architecture.test.ts`).
- **Browser (Playwright):** `e2e/` (`npm run e2e`): 48 tests in the installed Google Chrome, each in a fresh profile (`brackets.spec.ts`, 1 November 2026: dragging a bracket and its Undo, a number that moves it, a label of several lines, the size legend and its switch, and a PDF that holds shapes and text and no picture). Built (27 October 2026): editing a cell and Undo, exclusion, Duplicate with its status message, saving and opening a project, the size and resolution of a PNG export, the keyboard of the grid, the chart, the Navigator, Fill series, the focus of the Export dialog, several data sets together (Mixed, reset), dragging an annotation, an annotation anchored to data, the legend offset and the narrow window; and (31 October 2026, `families.spec.ts`) every one of the 57 graphs of the gallery, built from the catalogue on its table type's sample data, opened in the browser: each draws with no page error and no number that is not one in its markup (a smoke test, not a comparison of the drawing). Also (`layouts.spec.ts`, 31 October 2026) the page layouts: every standard arrangement of both orientations, an array across and down, swapping and emptying a panel, turning the page, title, panel labels and scaling, the master legend, free placement (typed boxes, add and remove, a dragged box) and the SVG, PNG and PDF exports.

## Performance targets (provisional, on a defined reference laptop)

These are measurements for the record. A target that is not met is not planned work.

Measured on 27 October 2026 with `npm run perf` (`e2e/performance.spec.ts`, in the installed Google Chrome, on the production build): an 11th Gen Intel Core i7-1185G7 (8 threads), 16 GB, Windows 11. Two runs; where they differ, both are given. Re-measured in part on 29 October 2026 on the same machine and build type, after work on the column family; that machine was shared with other agents' runs, so the 29 October figures are ranges over 2 to 3 runs and should be read as such. Rows that were not re-measured say so. "Next frame" is the time until the browser has drawn the change; "observations" are values in the table (a graph of 100k observations draws 100k dots).

| Workload | Target | Measured |
|---|---|---|
| Edit title, color or stroke | Visible within 50 ms | 27 October: a normal graph: title 19 to 20 ms (met). 10 000 observations: 107 to 164 ms. 100 000 observations: title 2.3 to 2.5 s, stroke width 1.1 to 1.3 s (not met). **29 October** (column family only; XY, grouped, survival and histogram got no change): normal graph 18 ms (met). 10 000 observations 170 to 195 ms (not met; the 27 October figure was 107 to 164 ms, the perf run called this unchanged). **31 October, three runs on a quiet machine: 119 to 172 ms**, which overlaps both earlier ranges, so no regression is shown; the target is still not met). 100 000 observations: title until the drawing changes 0.14 to 0.19 s; the next frame after the first edit after opening 1.6 s (it waits for the browser's first raster); once settled 0.12 s; stroke width 0.10 s (before, on the same day: title 2.45 s, stroke 1.04 s). Not met at 50 ms |
| Select one point in 10k | Within 100 ms | 27 October: 25 to 32 ms until the drawing changes, but 246 to 297 ms until the next frame (not met). **29 October:** 27 to 45 ms to the next frame (before, on the same day: 182 ms) (met) |
| Pan and zoom 100k points | 30+ fps | Not measured, also on 29 October (there is no clipping of the preview to the viewport) |
| Open a project with 100k observations | Under 3 s | 27 October: the table shows after 1.4 s (met); the graph is drawn after 5.7 to 7.8 s (not met). **29 October:** the graph is drawn after 2.0 to 2.7 s (met; before, on the same day: 5.6 to 5.8 s). The measure is the presence of the drawing in the page, not painted pixels, so the time to the first painted frame is longer. The table time was not re-measured |
| Export a normal figure | Under 2 s, UI not blocked | 124 ms to the PNG (met); whether the UI stays responsive was not measured. Not re-measured on 29 October, and the export of 100 000 dots was not timed |
| Style edit during a fit | Main thread not blocked (worker) | **Built and measured once, 28 October 2026** (`e2e/fitWorker.spec.ts`, development server, same i7-1185G7): a two-phase fit of 300 points. On the main thread the longest gap between frames was 2121 ms (curve after 2.5 s). In the worker 65 to 133 ms (curve after 2.4 to 2.7 s), and a title edit made during the fit was drawn after 80 to 140 ms. One data set, one machine, the development build; the production build was not measured, nor a fit of 100 000 points |

The development server is slower (React in development mode): the same runs gave 10 s for the graph of 100 000 observations and 3.9 s for its title edit (27 October; not repeated).

What changed on 29 October 2026, so that a later change does not undo it (column family only; details in BACKLOG 3b):

- **Runs.** Lists of more than 256 scene elements are written to React as memoised fragments (`sceneRuns.ts`); the markup is byte-identical, and a run is skipped when its shapes are the same objects.
- **Stable dot lists.** The model keeps the previous list of dots for a data set when every dot is equal to the last one (`stable.ts`), so a title, font or text-colour edit gives React the same shapes. Equality is by value; a restyle, rescale or hide gives new shapes.
- **Simplified preview.** With 100 000 dots or more, the preview (the graph view only) draws consecutive opaque dots of one look as one path per 12 pt square (`denseDots.ts`). Squares of 48 pt made a title edit take 3 to 4.6 s, because a path as wide as the plot is painted whole. Dots with transparency are not merged. The export, thumbnails and layouts draw every dot, and a note says the preview is simplified.
- **Where the time goes.** A trace of a 10k-dot selection showed about 14 ms of painting on the main thread and about 350 ms of GPU raster, so the first frame after an open waits for raster. The model rebuild takes about 60 ms and the JavaScript commit about 140 to 180 ms for a title edit at 100k. Meeting 50 ms would need the model, or its layout and scale step, to be skipped when only chrome changes.

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

## Output quality

- Sizes in pt and px independent of zoom; strokes, dashes, caps and symbols are physical quantities.
- SVG with metadata and stable identifiers; PNG with explicit dimensions and resolution (for example 1063 px wide is about 90 mm at 300 dpi; the app states the pixels and the dpi).
- Export inspection panel: output size, fonts and fallbacks, raster resolution, clipped objects, known limits. Built as a dialog behind the Export button (size in px, pt and mm, fonts requested, used and missing, raster size and the canvas limit, the warnings of the chart model, print-size warnings, known limits, a copyable JSON report). Clipped objects appear only as the models word them. Glyph checks are in the dialog (see "Done so far"); page layouts are checked too since 29 October 2026 (one check for each font on the page, unit-tested, not tried in a browser).
- Rich text with Greek letters, sub- and superscripts, written as plain text with braces (`H_{2}O`, `m^{-2}`, `\mu`); missing glyphs are reported. Built 28 October 2026 for the text of a graph, and 29 October 2026 for the title and panel labels of a layout page.

## Done so far

- Annotations, the bar labels of column and grouped charts (a layer for each data set), the point labels of column charts, the editor's selection marks, the pie legend and the heat map labels as scene elements with stable ids, drawn by one renderer for every family (steps 1a to 1e).
- The export dialog, font diagnostics and the P0 defect fixes listed in [docs/BACKLOG.md](BACKLOG.md).
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

## Size

The code base is about 34.5 kLoC in `src` (242 `.ts` and `.tsx` source files with 34 491 lines, tests left out) and about 27.7 kLoC of tests (214 test files: 204 `*.test.ts(x)` files in `src` with 26 551 lines, and the 10 `.ts` files of `e2e/` with 1 154 lines: eight specs, the helpers and the Playwright configuration), counted on 1 November 2026 on the working tree, which holds changes that are not committed yet. `src/styles.css` (616 lines) is not in these counts; `scripts/loc-history.mjs`, which counts `.ts`, `.tsx`, `.css`, `.html` and `.rs` over the whole repository (the e2e files count as source there), gives its own figures per commit (`docs/loc-history.csv`). The planning assumption is 65-85 kLoC with tests, up to 100 kLoC for advanced plotting. It is a budget, not a goal. Consolidating duplicated chart-specific models should lower net growth.
