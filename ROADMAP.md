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
| **P0 Correctness** | Not reviewed. |
| **P1 Layers** | Met, with two decisions: no `enabled` switch (see Decisions), and one data layer per graph (a file with more is read with a note). Every family is drawn from layers, which can be hidden and reordered one by one. XY and survival charts also give each part a look of its own and a switch for the axis range; the other families do not. |
| **P2 Scene and export** | Mostly. The marks of every family are scene elements with stable ids, and the screen, the export and the editor's hit testing are made from them. PNG has an explicit resolution. Zoom-independence of sizes is tested for the XY drawing only. **Not yet:** bar and point labels, annotations and the editor's overlays are drawn outside the scene; so are the titles, legend and axis labels of pie and heat map; font diagnostics; the export inspection panel. |
| **P3 Editing** | Not reviewed. |
| **P4 Chart families** | Started. In the gallery 11 graphs are still locked: `xy.bars`, `xy.vector`, `xy.bubble`, `xy.trajectory`, `xy.offset`, `curve.smooth`, `cat.nested`, `grp.scatterS`, `grp.paired`, `three.bars`, `three.dots`. Observation roles (subject) are not built, and five of those graphs wait for them. |
| **P5 Release** | Not started: there are no Playwright workflows and no visual fixtures. |

Also in place: a calculation cache keyed by identity (`src/stats/calcCache.ts`), PDF and layout export, linked graphs, a folder overview with thumbnails and multi-select (Navigator), and tags for tables and graphs.

Dead code is checked with `npx knip`.

## Phases

| Phase | Focus | Exit criterion |
|---|---|---|
| **P0 Correctness** | Fit intervals and convergence, numerical conditioning, histogram bins, axis-break geometry, CSV and project import, save and undo, stable series colors, `exp_two_phase` identifiability, confidence-level changes recompute intervals | Every confirmed defect has a regression test. The fixtures of section 22.1 pass. |
| **P1 Layers** | First-class layers with data bindings, calculation references, stable object IDs, z-order, `visible`/`rangeContribution`, capability registry. Existing chart types move over through adapters. Removes the "only the first layer is drawn" limit. | One chart combines raw points, mean, error bars, fit, band and annotations. Each part is styled and hidden independently. Hiding the band keeps the fit. |
| **P2 Scene and export** | Scene compiler (validate, calculate, layout, transform, clip, compile) feeding preview and hit-testing. SVG with stable IDs. PNG at explicit pixel size or DPI. Font diagnostics. | Zoom never changes pt font or stroke size. Exported and displayed geometry come from the same scene. |
| **P3 Editing** | Property search, mixed-state multi-selection, three reset operations, numeric annotation and label placement (offsets stored relative to the point), keyboard navigation, grid input, small screens | A figure can be reproduced from numeric inputs without dragging. |
| **P4 Chart families** | Observation roles (subject, exclusion) first. Then numeric-X bars, spikes, vectors, bubbles, paired and trajectory, nested, forest, ROC, Q-Q, Bland-Altman, residual, more band types, comparison brackets. | A target catalogue of real figures is recreated without finishing in another editor. |
| **P5 Release** | Playwright workflows, visual fixtures, accessibility, project migrations, large-data benchmarks, example gallery, docs | Stable projects, reproducible exports, documented limits. |

Each phase ships on its own. A family moves to a new mechanism (layers, the scene) only after a record of its old output exists to compare with, and its tests pass.

## Testing

- **Reference fixtures:** independent values (SciPy, R, published examples), never a second call into the same implementation. Start with section 22.1 of the calculation contracts.
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
- Export inspection panel: output size, fonts and fallbacks, raster resolution, clipped objects, known limits. Not built yet.
- Warnings for very thin strokes and unreadable text. Grayscale preview and color-vision check.
- Saved style presets for common single- and double-column widths, stated in pt.
- Rich text with Greek letters, sub- and superscripts. Missing glyphs are reported.

## Work items

Done:

- First-class layers and bindings: hide, order, range, own looks (XY and survival), one data layer.
- A shared calculation cache keyed by calculation identity.
- A scene shared by preview, export and hit testing for the marks of every family; stable ids on them.
- PNG at a chosen resolution.
- A capability registry (`src/model/graph/capabilities.ts`) that the inspector and the README table read.

Next:

1. Bar labels, point labels and annotations into the scene; then the chrome of pie and heat map.
2. Font diagnostics and the export inspection panel.
3. Observation roles (subject), then the locked graphs that wait for them.
4. Confirm P0 and P3 against their exit criteria, which this pass did not do. The first work items of the earlier roadmap were: confidence intervals and failed-fit uncertainty; pt/px sizing and export scaling; broken-axis and histogram geometry; hardened project and CSV import and saving.

## Size

The code base is about 39 kLoC in `src`: 167 source files and 105 test files (about 14 kLoC of tests). The planning assumption is 65-85 kLoC with tests, up to 100 kLoC for advanced plotting. It is a budget, not a goal. Consolidating duplicated chart-specific models should lower net growth.
