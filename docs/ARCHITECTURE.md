# Structure of the source

Repository: `src/` (the app and its unit tests), `e2e/` (browser tests and their configuration, `playwright.config.ts`), `docs/` (roadmap, backlog, specifications, the example `.oplot`, README assets), `public/` (static files such as the logo), `scripts/` (`loc-history.mjs`, which writes the git-ignored `docs/loc-history.csv`; `npm run loc`), `.github/` (workflows).

The source is in `src/`, in layers. A layer imports from its own folder and from the layers under it, never upward; `src/architecture.test.ts` checks this, and that no folder grows past 30 files. Tests sit next to the code they test.

| Folder | What is in it |
|---|---|
| `src/util/` | Download and file-name helpers; the date stamp of file names; rich text (`richText.ts`); date, time and duration columns (`timeColumn.ts`); a ZIP writer with CRC-32, no library (`zip.ts`) |
| `src/stats/` | The calculations, with no knowledge of charts: summaries, intervals and the descriptive statistics of the Results sheet (`summary.ts`), box, density, histogram and cumulative bins (`distribution.ts`), curve fits, their models and the worker protocol (`fit.ts`, `fitModels.ts`), the heat-map statistics (`matrix.ts`), special functions, the calculation cache, and the off-main-thread fits: the engine interface, the jobs and the pending state behind the screen (`fitService.ts`) and the worker (`fitWorker.ts`) |
| `src/model/` | The project as data. `types.ts`, `defaults.ts`, `ids.ts`, `units.ts`, `sanitize.ts` at the top, and `selection.ts`: what is selected (transient, not in the file) and the editing of several data sets, points or annotations together; then the folders below |
| `src/model/table/` | Rows and columns of a data table, how its columns group into series, which data sets a graph draws, exclusions, the factors of a grouped table (`factors.ts`) and the offset of offset traces (`offset.ts`) |
| `src/model/graph/` | What a graph is made of: chart types and their gallery, the style hierarchy, fills, looks, palettes and their colour-blind check (`palettes.ts`), layers (`layers/`: the parts of a graph that can be hidden, reordered or given a look of their own), capabilities of each type, a graph made like another and linked graphs (`chartLink.ts`), the summary settings and their wording (`summary.ts`), results written into texts (`resultTokens.ts`) |
| `src/model/options/` | The settings that belong to one family of charts or one part (columns, distributions, fits, heat maps and their gradients, histograms, pies, volcano plots, point labels, shapes) and the schema the file reader checks them against (`settingSchema.ts`) |
| `src/model/project/` | What a project holds besides tables and graphs: results (`analysis.ts`, `curveFit.ts`, and the shared `resultSheet.ts` contract), the saved chart settings checked on reading (`chartSchema.ts`), page layouts, folders, highlights and the order of the navigator |
| `src/state/` | The project in memory: commands, undo and redo, the .oplot file and the steps that bring an older file up to date (`migrate.ts`), the tables in the file (`tableCodec.ts`), autosave and recovery copies (`recovery/`), settings, what the inspector is asked to show. `contexts.ts` exposes separate subscriptions for the document, commands, history, selection, navigation, preferences, status, recovery and each viewport |
| `src/chart/` | Everything that draws a graph from the model (below) |
| `src/ui/` | The app: `views/` (data table, graph, results, layout and the folder overview), `dialogs/`, `navigator/`, `components/`, `data/` (reading cells and CSV, number format), `inspector/`, `export/` (the export pages and jobs), `diagnostics/` (the system, storage and speed figures of Help → Info) |
| `src/testing/` | Fixtures and checks used by tests only |


## `src/chart/`

Each family of chart has a folder with its model (the geometry, `*Model.ts`), its drawing (the marks and chrome that go in the scene, and the sections the one renderer writes, `*Drawing.ts`) and its tests. What the families share is in `shared/`; nothing there knows a family. `survival/` and `histogram/` are drawn on the XY chart's model, so they use `xy/`.

| Folder | What is in it |
|---|---|
| `xy/` | XY charts: `xyModel.ts`, `xyDrawing.ts`, curve fitting for drawing (`fitCurve.ts`) |
| `survival/` | Kaplan–Meier and cumulative-event curves |
| `column/` | Charts over the columns of a table: bars, dots, means, boxes, violins, floating bars, paired plots (`columnModel.ts`, `columnDrawing.ts`) |
| `grouped/` | Grouped and contingency charts (`groupedModel.ts`, `groupedDrawing.ts`) |
| `histogram/` | Histograms and cumulative distributions |
| `pie/` | Pies, doughnuts, slices and the 10 × 10 dot plot (`pieModel.ts`, `pieDrawing.ts`) |
| `heatmap/` | Heat maps and their colour scales (`heatmapModel.ts`, `heatDrawing.ts`, `heatColours.ts`) |
| `export/` | SVG, PNG and PDF export of a graph and of a page layout (the vector PDF: `svgPdf.ts` reads the SVG, `pdf.ts` writes the file); the master legend of a page (`masterLegend.ts`); the batch export of several graphs into one ZIP (`batchExport.ts`); the export report with its font and character checks (`exportReport.ts`); the golden exports (`__snapshots__/`) |
| `shared/axes/` | Value axes: domain and ticks (linear, log, reversed, minor, broken), axis binding, calendar ticks of dates and times (`timeAxis.ts`), extra ticks (`extraTicks.ts`) |
| `shared/scene/` | The scene of a chart (shapes in pt, in drawing order) from which the screen, the export and the editor's hit testing are made: `scene.ts`, `sceneElement.ts`, `SceneChart.tsx` (the one renderer of every family), the chrome (backgrounds, grids, axes, titles, legend), ids, reference lines, the writing of long lists of shapes in runs that React skips when unchanged (`sceneRuns.ts`), the simplified preview above 100 000 dots (`denseDots.ts`) |
| `shared/parts/` | Pieces that several families draw with: layout, text, symbols, fill patterns, error bars, bar labels, point labels, box and violin geometry, orientation, dot placement (`jitter.ts`), the reuse of unchanged dot lists (`stable.ts`) |
| `__tests__/` | Tests that cross families (draw order, the series of every family, the look settings) |
| `anyModel.tsx`, `tooltip.ts` | The two things that put the families together: the model of any chart, and its tooltips |

**Style precedence:** object override > group override > layer override > (group palette) > chart defaults. The chart's internal unit is the point (1 in = 72 pt = 25.4 mm); the SVG viewBox is in pt. Sizes in the inspector are true points: a 12 pt font is 12 pt tall in an export of the stated pixel size (96 px = 1 in, so 1 pt = 4/3 px).

## Notes on the colour palettes

Gephi's engine is generative, so it is a seeded port giving ten fixed colours (R gives other ones each run); iTerm is the Rose Pine scheme only (ggsci has 400+); D3 offers category10 and category20; IGV has 51 entries (49 of them different: ggsci repeats two). Black and White and Monochrome run from the darkest colour to the lightest, so the first data set is the strongest; a graph saved with either palette takes the colours in that order. The heat-map scales (27 gradients) are in `src/model/options/heatGradients.ts`.

The palettes are in `src/model/graph/palettes.ts`, the window in `src/ui/inspector/common/Picker.tsx` (shared with the heat-map gradients) and `src/ui/inspector/sections/PalettePicker.tsx`. The colour-blind note is measured by simulation (Machado et al., 2009), also in `palettes.ts`.
