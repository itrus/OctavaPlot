# OctavaPlot roadmap

OctavaPlot is a scientific figure editor: composable graphical layers, trustworthy calculations, and exact output. It is not a statistics suite. Calculations exist only to draw or annotate a chart.

The calculation rules, presets and acceptance fixtures are in [docs/calculation-contracts.md](docs/calculation-contracts.md).

## Decisions

- **Stack:** React, TypeScript and SVG (SVG is the authoritative output), with D3 scale, shape and array modules. No server, Rust or Python.
- **Units:** charts use `pt` and `px` (1 px = 0.75 pt). Layout pages are A4 and placed in mm. No cm or inches.
- **Export:** SVG and PNG are the authoritative outputs. PDF exists but holds a raster picture, not vector shapes.
- **Project model:** a project holds several data tables, graphs and Results sheets. The single-chart boundary of the old specification no longer applies.
- **Calculation interface:** calculations sit behind a small replaceable `CalculationEngine` interface (request in, result with diagnostics and provenance out). A synchronous local implementation comes first; a SciPy/Pyodide engine is an option only if a fit cannot be validated in TypeScript.
- **Out of scope:** ANOVA, mixed and generalized models, multiple-comparison workflows beyond labelled brackets, power analysis, report builders, model selection.

## Architecture rules

1. A preset composes layers, calculations, styles and axes. It is not a renderer.
2. The inspector holds no scientific logic. Controls edit validated state.
3. Preview, hit-testing and export derive from one scene. Any difference is explicit and tested.
4. A calculation result is keyed by its inputs (data version, exclusions, method, parameters, level, seed, algorithm version). A style or axis edit must not recompute it.
5. Hiding a layer never changes n, a denominator or a correction family. Disabling does.
6. Invalid edits keep the last valid state and show a local error. Failed fits never show uncertainty.

Target layout, reached by extraction rather than a big move: `core/{data,figure,calculations,geometry,layout,scene,validation}`, `renderers/{svg,raster}`, `ui/*`, `state/*`, `presets/`.

## Current state

Partly in place (not verified against every exit criterion below): a layer specification (`src/model/layers.ts`), a calculation cache keyed by identity (`src/stats/calcCache.ts`), a scene shared by preview, export and tests for the XY-style families and chrome (`src/chart/scene.ts`), PDF and layout export, linked graphs. Dead code is checked with `npx knip`; the last pass removed three unused components and 24 unused exports.

## Phases

| Phase | Focus | Exit criterion |
|---|---|---|
| **P0 Correctness** | Fit intervals and convergence, numerical conditioning, histogram bins, axis-break geometry, CSV and project import, save and undo, stable series colors, `exp_two_phase` identifiability, confidence-level changes recompute intervals | Every confirmed defect has a regression test. The fixtures of section 22.1 pass. |
| **P1 Layers** | First-class layers with data bindings, calculation references, stable object IDs, z-order, `enabled`/`visible`/`rangeContribution`, capability registry. Existing chart types move over through adapters. Removes the "only the first layer is drawn" limit. | One chart combines raw points, mean, error bars, fit, band and annotations. Each part is styled and hidden independently. Hiding the band keeps the fit. |
| **P2 Scene and export** | Scene compiler (validate, calculate, layout, transform, clip, compile) feeding preview and hit-testing. SVG with stable IDs. PNG at explicit pixel size or DPI. Font diagnostics. | Zoom never changes pt font or stroke size. Exported and displayed geometry come from the same scene. |
| **P3 Editing** | Property search, mixed-state multi-selection, three reset operations, numeric annotation and label placement (offsets stored relative to the point), keyboard navigation, grid input, small screens | A figure can be reproduced from numeric inputs without dragging. |
| **P4 Chart families** | Observation roles (subject, exclusion) first. Then numeric-X bars, spikes, vectors, bubbles, paired and trajectory, nested, forest, ROC, Q-Q, Bland-Altman, residual, more band types, comparison brackets. | A target catalogue of real figures is recreated without finishing in another editor. |
| **P5 Release** | Playwright workflows, visual fixtures, accessibility, project migrations, large-data benchmarks, example gallery, docs | Stable projects, reproducible exports, documented limits. |

Each phase ships on its own. The first architectural change adds the layer specification and adapters. The second moves one representative chart end to end. Other families follow only after its tests pass.

## Testing

- **Reference fixtures:** independent values (SciPy, R, published examples), never a second call into the same implementation. Start with section 22.1 of the calculation contracts.
- **Metamorphic:** translating X, rescaling units, reordering rows, changing style and hiding layers leave results unchanged.
- **Geometry:** clipping, breaks, log transforms, band intersections.
- **Export fidelity:** SVG viewBox, text and stroke sizes, PNG pixel dimensions.
- **Data integrity:** malformed CSV, ragged paste, missing values. No silent conversion or loss.
- **State:** undo and redo, failed save, migrations.
- **Browser (Playwright):** keyboard grid, inspector, drag and select, dialog focus.
- **Visual:** one fixed fixture per catalogue preset, pinned font, tolerance 0.25 pt for placement.

## Performance targets (provisional, on a defined reference laptop)

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
- SVG with metadata and stable identifiers; PNG with explicit dimensions (for example 1063 px wide is about 90 mm at 300 dpi, but the app states pixels).
- Export inspection panel: output size, fonts and fallbacks, raster resolution, clipped objects, known limits.
- Warnings for very thin strokes and unreadable text. Grayscale preview and color-vision check.
- Saved style presets for common single- and double-column widths, stated in pt.
- Rich text with Greek letters, sub- and superscripts. Missing glyphs are reported.

## First work items

1. Fix confidence intervals and failed-fit uncertainty.
2. Fix pt/px sizing and export scaling.
3. Fix broken-axis and histogram geometry.
4. Harden project and CSV import and saving.
5. Introduce first-class layers and bindings.
6. Shared calculation cache keyed by calculation identity.
7. Canonical scene shared by preview and export.
8. Capability-driven inspector and explicit selection scope.

## Size

The code base is about 36 kLoC in `src` (about 12 kLoC of it tests, 82 test files). The planning assumption is 65-85 kLoC with tests, up to 100 kLoC for advanced plotting. It is a budget, not a goal. Consolidating duplicated chart-specific models should lower net growth.
