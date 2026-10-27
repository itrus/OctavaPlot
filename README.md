<p align="center">
  <img src="public/logo.svg" alt="OctavaPlot logo" width="128" height="128">
</p>

<h1 align="center">OctavaPlot — prototype v0.1</h1>

<p align="center">
  <a href="https://itrus.github.io/OctavaPlot/"><img alt="Live demo" src="https://img.shields.io/badge/%E2%96%B6%20try%20it-live%20demo-2ea44f?style=for-the-badge"></a>
  <a href="https://www.buymeacoffee.com/itrus"><img height="28" src="docs/assets/buymeacoffee.svg" alt="Buy me a coffee"></a>
</p>

<p align="center">
  <a href="https://github.com/itrus/OctavaPlot/actions/workflows/deploy.yml"><img alt="Test, build and deploy" src="https://github.com/itrus/OctavaPlot/actions/workflows/deploy.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: GPL v3" src="https://img.shields.io/badge/license-GPLv3-blue"></a>
</p>

<p align="center">
  <b>Tech:</b>
  <img alt="Node.js 26" src="https://img.shields.io/badge/node-26-339933?logo=nodedotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white">
  <img alt="D3" src="https://img.shields.io/badge/D3-7-f9a03c?logo=d3dotjs&logoColor=white">
</p>

Local React + TypeScript + Vite + D3 app for editing data tables and the charts drawn from them: bar / scatter / mean±error charts from column tables, and XY scatter / line charts from XY tables. No backend; works offline after `npm install`.

<h3 align="center">▶ <a href="https://itrus.github.io/OctavaPlot/">Open OctavaPlot in your browser: itrus.github.io/OctavaPlot</a></h3>

Deployed from `main` by GitHub Actions. Data stays in your browser's `localStorage`, so do not enter patient-linked data.

## Project file (.oplot)

A project is saved as a `.oplot` file: UTF-8 JSON, not compressed, signed or encrypted, so it can be read and diffed with any text tool. The envelope is `{ "format": "octavaplot-project", "version": 1, "project": { ... } }`, with one version number; this app reads version 1 only. A file is refused, and the open project kept, when it is not named `*.oplot`, is over 64 MB, is not UTF-8 JSON, has another format or version, or holds a damaged project; a value of the wrong type is reset to its default and listed in the status bar. Lengths in `...Pt` keys are true points, the chart size is in px. Autosave in the browser stores the same text.

The full description (contents, units, what is checked, what is not stored, privacy) is in [docs/FILE_FORMAT.md](docs/FILE_FORMAT.md); a small example is [docs/example.oplot](docs/example.oplot).

## Run

Requires Node.js 26.

```bash
npm install
npm run dev      # development server
npm run build    # type-check (strict) + production build
npm test         # unit tests (vitest)
npm run perf     # timings of the performance table, taken in the browser on the production build (test-results/perf.json)
npm run e2e      # browser tests (Playwright, in the installed Google Chrome; starts its own dev server on port 5199)
npm run typecheck # type-check only (no unused locals or parameters allowed)
```

## Structure

Repository: `src/` (the app and its unit tests), `e2e/` (the browser tests), `docs/` (specifications, the example `.oplot`, README assets), `public/` (static files served by the app, such as the logo), `scripts/` (`loc-history.mjs`, which writes the git-ignored `docs/loc-history.csv`, and `logo.rs`), `.github/` (workflows).

The source is in `src/`, in layers. A layer imports from its own folder and from the layers under it, never upward; `src/architecture.test.ts` checks this, and that no folder grows past 30 files. Tests sit next to the code they test.

| Folder | What is in it |
|---|---|
| `src/util/` | Download and file-name helpers; the date stamp of file names |
| `src/stats/` | The calculations, with no knowledge of charts: summaries and intervals (`summary.ts`), box and density (`distribution.ts`), curve fits (`fit.ts`), histogram and cumulative bins, matrices, special functions, the calculation cache |
| `src/model/` | The project as data. `types.ts`, `defaults.ts`, `ids.ts`, `units.ts` at the top, then: |
| `src/model/table/` | Rows and columns of a data table, how its columns group into series, which data sets a graph draws, exclusions |
| `src/model/graph/` | What a graph is made of: chart types and their gallery, the style hierarchy, fills, looks, palettes, layers (`layers.ts`: the parts of a graph that can be hidden, reordered, given a look of their own), capabilities of each type, linking and formatting graphs |
| `src/model/options/` | The settings that belong to one family of charts (columns, distributions, fits, heat maps, histograms, pies) |
| `src/model/project/` | What a project holds besides tables and graphs: results (`analysis.ts`, `curveFit.ts`), page layouts, the folders and the order of the navigator |
| `src/state/` | The project in memory: commands, undo and redo, the .oplot file, autosave, settings, what the inspector is asked to show |
| `src/chart/` | Everything that draws a graph from the model (below) |
| `src/ui/` | The app: `views/` (data table, graph, results, layout and the folder overview), `dialogs/`, `navigator/`, `components/`, `data/` (reading cells and CSV, number format), `inspector/` |
| `src/testing/` | Fixtures and checks used by tests only |

### `src/chart/`

Each family of chart has a folder with its model (the geometry), its marks and chrome (what goes in the scene), its drawing (the sections the one renderer writes, `*Drawing.ts`) and its tests. What the families share is in `shared/`; nothing there knows a family. `survival/` and `histogram/` are drawn on the XY chart's model, so they use `xy/`.

| Folder | What is in it |
|---|---|
| `xy/` | XY charts: `xyModel.ts`, `xyDrawing.ts`, curve fitting for drawing, the XY scene and chrome (`xyScene.ts`, `xyChrome.ts`) |
| `survival/` | Kaplan–Meier and cumulative-event curves |
| `column/` | Charts over the columns of a table: bars, dots, means, boxes, violins, floating bars, paired plots (`columnModel.ts`, `columnDrawing.ts`, `columnMarks.ts`, `columnChrome.ts`) |
| `grouped/` | Grouped and contingency charts (`groupedModel.ts`, `groupedDrawing.ts`, `groupedMarks.ts`) |
| `histogram/` | Histograms and cumulative distributions |
| `pie/` | Pies and doughnuts (`pieModel.ts`, `pieMarks.ts`, `pieDrawing.ts`) |
| `heatmap/` | Heat maps and their colour scales (`heatmapModel.ts`, `heatMarks.ts`, `heatDrawing.ts`) |
| `export/` | SVG, PNG and PDF export of a graph, and of a page layout; the golden exports (`__snapshots__/`) |
| `shared/axes/` | Value axes: domain and ticks (linear, log, reversed, minor, broken), axis binding |
| `shared/scene/` | The scene of a chart (shapes in pt, in drawing order) that the screen, the export and the editor's hit testing are made from: `scene.ts`, `sceneElement.ts`, `SceneChart.tsx` (the one renderer of every family), the chrome (backgrounds, grids, axes, titles, legend), ids, reference lines |
| `shared/parts/` | Pieces that several families draw with: layout, text, symbols, fill patterns, error bars, bar labels, point labels, box and violin geometry, orientation |
| `__tests__/` | Tests that cross families (draw order, the series of every family, the look settings) |
| `anyModel.tsx`, `tooltip.ts` | The two things that put the families together: the model of any chart, and its tooltips |

Style precedence: object override > group override > layer override > (group palette) > chart defaults. Chart internal unit is the point (1 in = 72 pt = 25.4 mm); the SVG viewBox is in pt. Sizes in the Inspector are true points: a 12 pt font is 12 pt tall in an export of the stated pixel size (96 px = 1 in, so 1 pt = 4/3 px).

## Table types and chart types

A table has a **type**, chosen when it is created (Navigator → New Data Table…); a graph is then made from a table and has a **chart type** that suits that table (Navigator → New Graph…). The two steps are separate dialogs, so a chart type can never be paired with the wrong kind of table.

| Table type | Layout | Chart types |
|---|---|---|
| Column table | Each column is a group; the rows are its replicate values | Bar chart, Scatter dot plot, Mean with error bars, Floating bars, Box and whiskers, Violin plot, Before and after (these can also run horizontally); Histogram, Cumulative distribution |
| XY table | First column is X (numbers); every other column is a Y series | XY scatter, Line, Line with symbols |
| Grouped table | Each row is a category; each block of columns is a series (single values, replicates, or values already calculated) | Grouped bars, Stacked bars, Lines over categories, Heat map |
| Contingency table | Rows are groups of subjects, columns are outcomes, cells are counts | Side-by-side bars, Stacked bars, 100% stacked bars, Pie charts, Doughnut charts |
| Survival table | First column is the time; each other column is a group holding 1 (event) or 0 (censored) on the row of each subject | Survival curve (Kaplan-Meier), Cumulative events |

**New Data Table…** opens one dialog, modelled on a familiar "new table" wizard: the table format along the top (XY, Column, Grouped, Contingency or Survival), whether to start empty or with sample data (the default follows Settings → "New projects and tables start empty"), and, for XY tables, how the Y values are entered: a single value, N replicates in side-by-side subcolumns (the chart plots their centre with SD / SEM / CI / range error bars), or values already calculated elsewhere (Mean with SD, SEM, %CV, ± error or upper/lower limits, drawn as entered). A series with subcolumns is one block of columns under a shared series name; `src/model/table/tableLayout.ts` defines the layouts.

Survival curves use the product-limit estimate (events are counted before censoring at a tied time); censored subjects are marked on the curve. An optional pointwise confidence band uses the Greenwood standard error (log-log by default, or plain, at the level you choose), and an optional at-risk table lists the subjects still under observation at each tick of the time axis. Grouped bars of replicates can show the individual values over the bars. Contingency percentages are shares of each row's own total. Grouped and contingency charts treat a row with a title or any value as a category; empty rows are ignored.

XY charts follow spec §3.1 and §7: symbols and a path layer per series (the line joins the points in table order; Connect points in: Ascending X joins them by X instead, still breaking at a missing Y and changing nothing else), a numeric X axis with Auto/Manual limits, input-order paths that break at a missing value (never bridged, never zero), and the automatic range including zero only when the data starts near it. `src/model/graph/chartTypes.ts` is the catalogue; adding a chart type means adding it there, a preset in `defaults.ts`, and its drawing.

**New Graph…** shows a gallery per graph family (XY, Column, Grouped, Contingency, Survival), in tabs where a family has several kinds of graph (for example Column: Individual values, Box and violin, Mean/median & error), with a live preview drawn from the table's own data. The gallery has 56 entries: 45 can be made now (28 chart types, some offered as several presets) and 11 are planned presets of the catalogue in docs/calculation-contracts.md (bars at numeric X, vectors, bubbles, trajectories, offset traces, smooth curves, nested dots, separated and paired dots, three-way bars and dots; the IDs are listed in the ROADMAP). The counts are those of the catalogue at the time of writing, counted from `src/model/graph/chartGallery.ts`. The planned ones are shown locked with their thumbnail and their preset ID, so the whole range is visible. The catalogue is `src/model/graph/chartGallery.ts`; to make a planned graph available, give its entry a `type`.

## What each chart type can do

The table below is generated from the capability registry (`src/model/graph/capabilities.ts`) and checked against it by a test, so it cannot drift from the code: a control that a drawing does not honour is not offered.

<!-- capabilities:start -->
| Chart type | Horizontal | Reference lines | Right Y axis | Curve fit | Join by X | Survival options |
|---|---|---|---|---|---|---|
| Bar chart | yes | Y | yes | – | – | – |
| Scatter dot plot | yes | Y | yes | – | – | – |
| Mean with error bars | yes | Y | yes | – | – | – |
| Box and whiskers | yes | Y | – | – | – | – |
| Floating bars (min to max) | yes | Y | – | – | – | – |
| Before and after | yes | Y | – | – | – | – |
| Histogram | – | X and Y | – | – | – | – |
| Cumulative distribution | – | X and Y | – | – | – | – |
| Violin plot | yes | Y | – | – | – | – |
| XY scatter | – | X and Y | – | yes | yes | – |
| Line | – | X and Y | – | yes | yes | – |
| Line with symbols | – | X and Y | – | yes | yes | – |
| Spikes | – | X and Y | – | yes | – | – |
| Area under the curve | – | X and Y | – | yes | yes | – |
| Grouped bars | yes | Y | – | – | – | – |
| Stacked bars | yes | Y | – | – | – | – |
| Floating bars (min to max) | yes | Y | – | – | – | – |
| Grouped box and whiskers | yes | Y | – | – | – | – |
| Grouped violin | yes | Y | – | – | – | – |
| Heat map | – | – | – | – | – | – |
| Lines over categories | – | Y | – | – | – | – |
| Pie charts | – | – | – | – | – | – |
| Doughnut charts | – | – | – | – | – | – |
| Side-by-side bars | yes | Y | – | – | – | – |
| Stacked bars | yes | Y | – | – | – | – |
| 100% stacked bars | yes | Y | – | – | – | – |
| Survival curve | – | X and Y | – | – | – | yes |
| Cumulative events | – | X and Y | – | – | – | yes |
<!-- capabilities:end -->

## Box plots, violins, columns and axes

**Box and whiskers** draw the quartiles (type 6 rule), the median and whiskers from the raw values; the whiskers end at the minimum and maximum, at the Tukey fences (the most extreme values inside Q1 - k IQR and Q3 + k IQR) or at a percentile pair (10-90, 5-95, 2.5-97.5, 1-99). Dots can show the values outside the whiskers or all of them; with fewer than 4 values only the range and the median are drawn. **Violins** use a Gaussian kernel with bandwidth 0.9 min(SD, IQR/1.34) n^(-1/5) times 0.5, 1 or 2 (light, medium, heavy) or a bandwidth you set; the ends are cut at the smallest and largest value or follow the tails, and the widths are scaled to equal maximum width, equal area or sample size. Values that are all equal, or fewer than 3, have no density and are shown as dots with a notice. Code: `src/stats/distribution.ts`, `src/chart/shared/parts/distributionGeom.ts`.

**Direction.** A column chart (bars, dots, means, boxes, violins) can run horizontally: Layout → Direction, or the "Horizontal" graphs of the New Graph gallery. The chart is built vertically in a "virtual" plotting region and turned a quarter by one SVG matrix (`Orientation` in `src/chart/column/columnModel.ts`); symbols and text stay upright. The numbers then run along the bottom with the value axis (Y) settings, and the data set names down the left. Horizontal charts have no right axis and no point labels yet.

**Columns.** Layout → Columns sets the space between columns, before the first and after the last (percent of a column's width, Auto = the usual layout) and where bars begin. Data Sets on Graph orders the data sets of a column chart. Labels above the bars (Annotations tab) show the plotted value or the sample size with decimals, thousands separator, prefix and suffix. A bar can carry a second label inside it, at its end or at its base (so n can sit in the base and the value beyond the end); its colour is black or white by contrast with the bar as drawn (the pattern background for a patterned bar) unless one is chosen, and a bar too small for the text gets no inside label and a warning that names the group. Column and side-by-side grouped bars only.

**Axes.** Each numeric axis has a scale (linear, log 10, log 2, natural log; values of 0 or less are left out and counted), reverse, major and minor ticks (direction and length, 2 to 9 times the power on a base 10 log axis), minor gridlines and number format (automatic, decimal, scientific, decimals, thousands, prefix, suffix). The Frame section sets axis, plotting area and page colours (no page colour gives a transparent PNG), a box frame and the colour, thickness and pattern of the gridlines; Text sets font, text colour, bold, and the distances of titles and numbers from the axis. Survival curves and stacked or percentage bars keep a plain linear axis.

## More charts and axis settings

**Floating bars** run from the smallest to the largest value of a column, with a line at the mean or median (the summary setting). **Stacked bars** of a grouped table pile the series on each other, each as high as its own value; negative values pile downwards from the baseline; the parts have no error bars (an error of a part is not an error of the total). **Before and after** joins the values of each row across the columns; a row with a missing value breaks its line unless you choose to join across it, and no value is made up.

**Pie and doughnut charts** make one pie for each row of a contingency table, the parts being its columns. Labels (name, count, percent), start angle, direction, hole and totals are in the Style section. A row with a negative count, or counts that add up to zero, is not drawn and a notice says so. **Histograms** put the values of each column into bins (automatic: about log2(n) + 1 bins of a round width; or a width you set), as counts, fractions, percents or densities of all the values, optionally cumulative; several data sets share the same bins. **Cumulative distributions** step up at each different value (ties are one jump), at-or-below or above, as a fraction, percent or count. Code: `src/stats/histogram.ts`, `src/chart/histogram/histogramModel.ts`.

**Heat maps** colour the cells of a grouped table (the centre of replicates, or the entered value) by one of 16 continuous gradients from ggsci (GSEA, which is diverging; 11 Bootstrap 5 hues; 4 Material Design hues; stops joined in RGB, in `src/model/options/heatGradients.ts`; the list is grouped by origin) or by a Custom scale of two colours (low, high) or three (low, middle, high; with a middle colour the scale is diverging and uses the Centre value, as GSEA does). The inspector shows a preview strip and the colours of the scale at its ends, always editable; the check box Middle colour is on for a diverging scale; editing a gradient's colours turns it into Custom, starting from the colours on screen (a gradient with several stops loses its in-between shades; the two ends stay), with a colour bar. Files saved with the earlier scales open with the nearest new one (viridis and blue as Bootstrap blue, magma as Bootstrap purple, green-black-red as GSEA, grayscale as Bootstrap gray). The cell shows the mean, median, geometric mean, SD (n-1), SEM, %CV or the number of values of its replicates (SD and SEM need 2 values, the geometric mean needs all values above 0, %CV needs a mean that is not 0; a cell that cannot be calculated is drawn as missing and a warning says why); for a table of values already calculated the entered mean, SD, SEM, %CV or N is shown as entered and nothing is derived from it. The colour bar is titled with the statistic and the normalisation unless it is the plain mean. Each row or column can be normalised (z-score, min-max, or centred); a row without spread has no z-score and its cells are shown as missing. Code: `src/stats/matrix.ts`, `src/chart/heatmap/heatmapModel.ts`.

**Axis origin, breaks and scale bars.** Frame → Origin moves the axis lines to a value of the other axis (the numbers stay at the edge). An axis can have up to two **breaks**: a range of values left out, with a gap and a mark on the axis; what is drawn across the gap is cut off by the clip, never joined. Breaks are for linear, not reversed, axes (the left axis, and either axis of an XY chart). A hidden axis can have a **scale bar** instead: a bar one major interval long, with that interval written beside it. Code: `src/chart/shared/axes/axisScale.ts`.

## Fitted curves

A curve fit is an analysis in the Results section. On an XY table, **Fit curve…** (or New Analysis → Curve fit) adds one and opens it. Choose the model there: straight line, polynomial (degree 2 to 6), one- and two-phase exponential, Gaussian peak, hyperbola, and 4- and 5-parameter logistic. The sheet lists, for each Y series, the equation, the number of points and degrees of freedom, R squared, the sum of squares, Sy.x, and each parameter with its standard error and confidence limits; a fit that cannot be made says why under Notes. Every replicate is a point of the fit. The cells can be selected and copied like those of a data table.

A graph draws a curve fit by choosing it under Format graph → Fitted curve (or with **Make graph** in the Results): the curve, an optional confidence or prediction band at the level of the fit, the whole X axis, and the parameters written on the graph. Tables, graphs and analyses are renamed by double-clicking them in the navigator (or F2).

## More bars and survival options

Grouped and contingency bars (side by side, stacked, 100%) can run horizontally (Format graph → Direction). Grouped tables also draw floating bars: from the smallest to the largest replicate of each series in each category, with a line at the mean. Survival and cumulative-event curves can mark every event with a symbol and draw error bars of one Greenwood standard error at each event time.

## Symbols

Symbols come in circle, square, triangle (up and down), diamond, hexagon, star, circle with a dot, plus, cross and asterisk. The inside has its own opacity (Fill opacity: 1 solid, 0 hollow, in between see-through) while the border stays opaque, so hollow symbols are drawn with the border colour and thickness.

## Line patterns

Lines (XY, grouped, survival, cumulative distribution and fitted curves) and gridlines can be solid, long dashes, dashes, dots, dash-dot or dash-dot-dot. The dashes scale with the line width, so a thick dotted line keeps its look.

## Order of objects

The legend has its own order of entries (Legend: Top, Up, Down, Bottom, Reverse, Reset order) that never moves the marks, and a number of columns (1 to 6). 'Graph like another graph' copies the number of columns but not the order. The series of XY, grouped, contingency and survival graphs can be put in another order (Data Sets on Graph: first to last, Top / Up / Down / Bottom / Reverse); the last is drawn on top, and each series keeps its colour. Under Layout, "Lines and error bars go" chooses whether lines and error bars are drawn over the symbols and bars (On top), behind them (Underneath), or as the chart type usually does (Auto).

## Analyses (Results)

**Results → New Analysis…** adds an analysis of a column, XY or grouped table (counts and event flags have no descriptive statistics). **Descriptive statistics** gives, for every column (each sub-column on its own): the number of values, minimum, quartiles, median, maximum and range, the 10% and 90% percentiles, the exact confidence interval of the median with the coverage it actually reaches, mean, SD, SEM, the t interval of the mean, coefficient of variation, geometric mean, SD factor and interval, skewness, kurtosis and sum. The confidence level (90, 95 or 99%) is a setting of the analysis. Results are never stored: they are recalculated from the table each time, so they follow the data. A statistic that cannot be calculated (too few values, or a geometric mean of values that are not all positive) is left empty. Export CSV and Copy are on the toolbar; the code is in `src/stats/descriptive.ts`.

## Graph like another graph

**New Graph… → Like an existing graph** makes a graph of any table that takes its format from a graph you choose, with a live preview. For a table of the same type the new graph takes the chart type and its options, the size, fonts, colours, frame, grid, axis look, legend, and the style of each data set, matched by position (the third data set of the source styles the third of the new table). For a table of another type only the general format is taken (size, fonts, colours, frame, grid, axis look, legend). Never taken over: the data, the title and axis titles, axis ranges, breaks and scales, reference lines, annotations, hidden data sets, the fitted curve and the styles of single values. By default the new graph is **linked** to the one it was made like (🔗 in the navigator; **Unlink** on the graph's toolbar, or untick the box in the dialog). A linked graph follows later changes to the source's format in every detail it has not changed itself: if you set the font size, say, on the linked graph, that size stays its own; the other details keep following. Setting a detail back to what the source has makes it follow again. Nothing is recorded about what you changed: each setting is compared with the source's value before and after the edit, and the linked graph takes the new value only if it still had the old one. The change and what follows from it are one undo step. Data, titles, axis ranges, breaks and scales, reference lines, annotations, hidden data sets and the fitted curve are never inherited. Without the link the two graphs share nothing, so changing one does not change the other. The code is `src/model/graph/chartFormat.ts` (the copy) and `src/model/graph/chartLink.ts` (the following).

## Layouts

**Layouts → New Layout…** makes an A4 page (portrait or landscape) of graphs: a standard arrangement (one graph, a graph with an inset, two or three graphs side by side on a landscape page or one above the other on a portrait page, or 2 × 2) or an array of up to 6 × 6, with placeholders or filled with the graphs of the project. The graph in each panel is chosen in the settings beside the page; choosing one that is already on the page swaps the two. **Size of the graphs** keeps the sizes harmonised. The scaling factor of a graph is its size on the page / its size in Graphs. *Match the smallest* gives every graph the smallest factor that any panel needs, so every graph fits; *Match the largest* gives every graph the largest, so fonts and lines match but graphs that need more room are cut off (with a warning); *Fill each panel* lets each graph have its own factor; *Set to a percentage* sets one factor. Panels are lettered A B C, a b c, I II III or 1 2 3 (or not). The page has a margin, a space between panels, an optional title and a colour (or none). **Free placement** (Arrangement → Free placement) turns the panels into boxes that are dragged to move and by a corner to resize, or typed in mm; panels can be added (up to 12) and removed, and each graph is drawn centred in its box with its proportions kept. The **Export** button writes the page as SVG (vector), PNG or PDF, whichever is chosen in Settings → Export (PNG to begin with; the resolution of PDF and of the PNG of a layout is chosen there too: 150, 300 or 600 dpi, 600 by default), as shown, all from the same drawing as the preview (`src/chart/export/layoutExport.tsx`; the geometry is in `src/model/project/layout.ts`). The PDF is one A4 page holding the picture, written without a library (`src/chart/export/pdf.ts`), so its text and lines are pixels, not vector; use SVG for vector output. A transparent page is white in the PDF. Deleting a graph empties its panel. A single graph can be exported as PDF too: choose PDF as the export format in Settings (Export), and the Export button on the graph writes a one-page PDF the size of the graph, holding a picture at that resolution.

## Behaviour notes

- Empty cell = missing value (never zero). Non-numeric input is rejected with a message; a paste containing any non-numeric cell is rejected whole.
- Pasting beyond the table adds rows, and extra columns add new groups.
- n = 1: SD/SEM undefined, no error bar, warning shown. n = 0: no mean drawn.
- "All groups" edits clear conflicting per-group overrides of the same property.
- Switching graph type only changes the visibility presets (bars/symbols/lines/mean line); data, colours and axis settings are kept.
- Undo/redo covers data and formatting; Ctrl+Z / Ctrl+Y when not typing in a text field.
- Project save/open as `.oplot` files, autosave to `localStorage` (a failed autosave is shown in the status bar and retried; the copy found at start-up is kept as a backup), SVG export (vector, with a title, a description and ids that cannot collide with another export), PNG export at 1×, 2×, 3.125× (300 dpi), 4× or 6.25× (600 dpi) of the chart's size (Settings → Export). The Export button of a graph and of a layout opens a dialog with the size in px, pt and mm, the format and resolution (the same as Settings → Export), the fonts the drawing asks for and whether the browser has them (diagnosed only; fonts are not embedded), the warnings of the chart, and the known limits (PDF is a picture; an SVG does not carry its fonts); it can copy this as a JSON report. A graph can have a print width (Inspector → size: 90, 140, 180 mm or your own): the dialog then warns when text would print below 6 pt or a line below 0.25 pt (guideline values, not checked against a journal). Only one export runs at a time. Ctrl or Cmd+S saves the project.
- The decimal separator of Settings → Numbers in tables (point, comma or automatic) decides how numbers are read, shown, edited, copied and exported to CSV, so what is written reads back as the same number. There is no thousands separator: it is neither read nor written, so `1.234` is the decimal 1.234, never 1234, and `1.234,5` is refused. Point and comma are strict (the other character is refused); automatic reads either, writes points, and refuses `1,234` as ambiguous. In comma mode CSV files are semicolon-separated. A pasted block with rows of different lengths is padded with missing values.
- Tables, graphs and results can be duplicated and deleted from the navigator (deleting a table takes its graphs and results with it); both can be undone, and the panels can be resized by their edges.
- A curve fit gives no errors or bands when the fit did not converge; its parameter intervals and bands are at the confidence level chosen, and the Results are copied at full precision.

## Limitations

Reference lines are drawn on XY, survival, histogram, column and grouped charts (not on pie or heat maps) and cm units are not built; a graph has one data layer (a file with more is read with a note and only the first is kept); every chart is drawn from layers, which can be hidden and reordered one by one (own looks and the axis range switch are for XY and survival charts only); observations have no subject or exclusion roles yet; the default colours are those of the Science (AAAS) palette; values display as stored (typed `1.10` shows `1.1`).

## Evidence labels

D = stated in a public source (see `docs/calculation-contracts.md`). P = proposal made here because no source gives a value. U = unverified.

## Calculation settings

Summary settings (centre, spread, confidence level, small-sample policy, invalid-value policy) are calculation settings, stored in `summary` and `groupSummary`, not in the style hierarchy. Appearance (colour, cap, direction) stays in style.

- Centre: mean, geometric mean, median. Spread: none, SD (n-1), SEM, CI, range, IQR, GSD. Not every spread is allowed for every centre; a stored spread that is not allowed is not drawn and the Inspector shows the reason.
- Mean CI uses the t distribution with n-1 degrees of freedom. The default confidence level is 0.95 (P).
- Median CI is exact, from binomial order statistics, for n <= 20000 (`MEDIAN_CI_EXACT_MAX_N`). Its coverage is at least the requested level and is usually higher; for n = 5 and n = 6 the interval is the widest available (smallest to largest value) and its actual coverage is reported, not the nominal level. Above 20000 the interval is unavailable and a notice says so.
- Missing cells are never counted. Invalid values are left out or reject the data set, per the invalid-value policy. The "Hide summary when too few values" option maps to the reject policy for small samples (P).

## Project file versions

Saved files carry `version: 1`, the only version this app reads and writes (see [docs/FILE_FORMAT.md](docs/FILE_FORMAT.md)). Invalid stored values are reset to their defaults on load and listed in the status bar; excluded values, annotations and reference lines are checked field by field.

## Fill pattern

Bars can be solid, patterned or unfilled (the last only from a file). Patterns: horizontal, vertical, diagonal up, diagonal down, crosshatch, diagonal crosshatch, dots. In pattern mode the bar fill colour is ignored and the pattern background is used (P). Limits (P): spacing 1 to 50 pt, line width or dot diameter 0.1 to 5 pt, and the spacing is never below the mark width. At most 20000 marks (`MAX_PATTERN_MARKS`) are drawn per bar; beyond that a warning is shown. Opacity applies to the pattern and its background, not to the border. Legend keys use the same pattern.

## Right Y axis

Each data set can be plotted on the left or right Y axis (bar, scatter and mean charts). The right axis has its own range, ticks, title and gridlines (drawn dashed when the left grid is on). Right-axis margin and title sizes are proposals (P). Notices appear when an axis is empty, hidden, untitled, or when connectors across axes are skipped.

## Row titles and point labels

The data table has an optional Row title column (undoable, copy and paste aware). Labels can be drawn on each point from the row title or the value, with placement, collision handling (keep, hide, repel), a leader line (a boolean, P), colour, size and decimals. Labels that cannot be placed are listed in the Inspector. A point can override the data set label settings (Selected point box). Dragging labels is not implemented.

## License

Released under the [GNU General Public License v3.0](LICENSE).

## Compliance note

Row titles, data-set names and values are stored unencrypted in the browser (`localStorage` autosave) and in saved `.oplot` files. The Business Associate Agreements in place cover Google Workspace and Microsoft 365 only, not this app or the browser. Do not enter patient identifiers (not verified whether sample identifiers are acceptable). Autosave can be switched off in Settings.

## Not yet implemented

- Label sources other than row title and value.
- Dragging labels to custom positions.
- Chart description for informational notices.

## Manual verification checklist

Automated tests cover geometry and SVG text. Check by eye at device pixel ratio 1 and 2, with a tolerance of 0.25 pt (spec 22.3 L1529): bars, error bars, fill patterns, legend keys, right axis, point labels, SVG and PNG export. Only Edge 142 has been verified; Firefox and Safari are not verified.

## Colour palettes

The palettes are taken from the **ggsci** R package (Xiao N. *ggsci: Scientific Journal and Sci-Fi Themed Color Palettes for ggplot2*; <https://nanx.me/ggsci/>, <https://github.com/nanxstats/ggsci>; descriptions follow <https://nanx.me/ggsci/articles/ggsci.html>). Science (AAAS) is first and the default; then Nature (NPG), New England Journal of Medicine, The Lancet, JAMA, BMJ, Journal of Clinical Oncology, D3, Gephi, Observable, Primer, Atlassian, iTerm and IGV. The app's own earlier palettes (Vibrant, Pastel, Colorblind-friendly, Monochrome, Black and White) follow them, so saved charts still open.

Notes: Gephi's engine is generative, so it is a seeded port giving ten fixed colours (R gives other ones each run); iTerm is the Rose Pine scheme only (ggsci has 400+); D3 offers category10 and category20; IGV has 48 colours.

**Info** (toolbar button, beside Settings) shows the version, the credits and the source of the colour palettes. In the palette window (ⓘ beside Color palette) each palette says whether its first six colours stay apart for red-weak, green-weak and blue-weak vision; this is measured by simulation (Machado et al., 2009) in `src/model/graph/colorVision.ts`, not claimed from the palette's name.
