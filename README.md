<p align="center">
  <img src="public/logo.svg" alt="OctavaPlot logo" width="128" height="128">
</p>

<h1 align="center">OctavaPlot — prototype v0.1</h1>

<p align="center">
  <a href="https://itrus.github.io/OctavaPlot/"><img alt="Live demo" src="https://img.shields.io/badge/%E2%96%B6%20try%20it-live%20demo-2ea44f?style=for-the-badge"></a>
  <a href="https://www.buymeacoffee.com/itrus"><img height="28" src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=🎓&slug=itrus&button_colour=FFDD00&font_colour=000000&font_family=Arial&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" /></a>
</p>

<p align="center">
  <a href="https://github.com/itrus/OctavaPlot/actions/workflows/deploy.yml"><img alt="Test, build and deploy" src="https://github.com/itrus/OctavaPlot/actions/workflows/deploy.yml/badge.svg"></a>
</p>

<p align="center">
  <b>Tech:</b>
  <img alt="Node.js 24 | 26" src="https://img.shields.io/badge/node-24%20%7C%2026-339933?logo=nodedotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white">
  <img alt="D3" src="https://img.shields.io/badge/D3-7-f9a03c?logo=d3dotjs&logoColor=white">
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: GPL v3" src="https://img.shields.io/badge/license-GPLv3-blue"></a>
</p>

Local React + TypeScript + Vite + D3 app for editing data tables and the charts drawn from them: bar / scatter / mean±error charts from column tables, and XY scatter / line charts from XY tables. No backend; works offline after `npm install`. Chart colour palettes are from the ggsci R package (Xiao N., https://nanx.me/ggsci/); see [Colour palettes](#colour-palettes).

<h3 align="center">▶ <a href="https://itrus.github.io/OctavaPlot/">Open OctavaPlot in your browser: itrus.github.io/OctavaPlot</a></h3>

Deployed from `main` by GitHub Actions. Data stays in your browser's `localStorage`, so do not enter patient-linked data.

## Run

Requires Node.js 24 or 26.

```bash
npm install
npm run dev      # development server
npm run build    # type-check (strict) + production build
npm test         # unit tests (vitest)
```

## Structure

| Path | Concern |
|---|---|
| `src/model/` | Typed project model, defaults, style hierarchy, unit helpers (pt/mm/px) |
| `src/stats/` | `summary.ts`: per-data-set centre, spread and interval; `special.ts`: gamma, beta and t functions and the exact median CI; independent of presentation |
| `src/chart/scales.ts` | Y-axis domain and ticks (left and right axes) |
| `src/chart/layout.ts` | Margins, titles, legend placement |
| `src/chart/model.ts` | Geometry construction for category charts (bars, error bars, points, lines) |
| `src/chart/ChartSvg.tsx` | Declarative SVG drawing of category charts |
| `src/chart/xyModel.ts`, `XyChartSvg.tsx` | Model and drawing of XY charts (numeric X axis, one series per Y column) |
| `src/model/chartTypes.ts` | Table types and chart types, and which go together |
| `src/chart/hatch.ts`, `labels.ts`, `axes.ts`, `errorGeometry.ts` | Fill pattern marks, point-label layout, axis binding, error-bar geometry |
| `src/chart/hitTest.ts` | Hit testing / selection helpers (editor only) |
| `src/chart/export.tsx` | SVG / PNG export (rendered without editor state) |
| `src/state/` | Commands, undo/redo history, JSON save/load, autosave |
| `src/ui/` | Navigator, data table, graph view, formatting inspector |

Style precedence: object override > group override > layer override > (group palette) > chart defaults. Chart internal unit is the point (1 in = 72 pt = 25.4 mm); the SVG viewBox is in pt.

## Table types and chart types

A table has a **type**, chosen when it is created (Navigator → New Data Table…); a graph is then made from a table and has a **chart type** that suits that table (Navigator → New Graph…). The two steps are separate dialogs, so a chart type can never be paired with the wrong kind of table.

| Table type | Layout | Chart types |
|---|---|---|
| Column table | Each column is a group; the rows are its replicate values | Bar chart, Scatter dot plot, Mean with error bars |
| XY table | First column is X (numbers); every other column is a Y series | XY scatter, Line, Line with symbols |
| Grouped table | Each row is a category; each block of columns is a series (single values, replicates, or values already calculated) | Grouped bars, Lines over categories |
| Contingency table | Rows are groups of subjects, columns are outcomes, cells are counts | Side-by-side bars, Stacked bars, 100% stacked bars |
| Survival table | First column is the time; each other column is a group holding 1 (event) or 0 (censored) on the row of each subject | Survival curve (Kaplan-Meier), Cumulative events |

**New Data Table…** opens one dialog, modelled on a familiar "new table" wizard: the table format along the top (XY, Column; Grouped, Contingency and Survival can be previewed but are planned), whether to start empty or with sample data (the default follows Settings → "New projects and tables start empty"), and, for XY tables, how the Y values are entered: a single value, N replicates in side-by-side subcolumns (the chart plots their centre with SD / SEM / CI / range error bars), or values already calculated elsewhere (Mean with SD, SEM, %CV, ± error or upper/lower limits, drawn as entered). A series with subcolumns is one block of columns under a shared series name; `src/model/tableLayout.ts` defines the layouts.

Survival curves use the product-limit estimate (events are counted before censoring at a tied time); censored subjects are marked on the curve. An optional pointwise confidence band uses the Greenwood standard error (log-log by default, or plain, at the level you choose), and an optional at-risk table lists the subjects still under observation at each tick of the time axis. Grouped bars of replicates can show the individual values over the bars. Contingency percentages are shares of each row's own total. Grouped and contingency charts treat a row with a title or any value as a category; empty rows are ignored.

XY charts follow spec §3.1 and §7: symbols and a path layer per series, a numeric X axis with Auto/Manual limits, input-order paths that break at a missing value (never bridged, never zero), and the automatic range including zero only when the data starts near it. `src/model/chartTypes.ts` is the catalogue; adding a chart type means adding it there, a preset in `defaults.ts`, and its drawing.

**New Graph…** shows a gallery per graph family (XY, Column, Grouped, Contingency, Survival), in tabs where a family has several kinds of graph (for example Column: Individual values, Box and violin, Mean/median & error), with a live preview drawn from the table's own data. Graphs that are not built yet (box and violin, heat maps, parts of a whole, bars at numeric X, fitted curves, and so on: the presets of specification section 3) are shown locked with their thumbnail and their specification preset ID, so the whole range is visible. The catalogue is `src/model/chartGallery.ts`; to make a planned graph available, give its entry a `type`.

## Analyses (Results)

**Results → New Analysis…** adds an analysis of a column, XY or grouped table (counts and event flags have no descriptive statistics). **Descriptive statistics** gives, for every column (each sub-column on its own): the number of values, minimum, quartiles, median, maximum and range, the 10% and 90% percentiles, the exact confidence interval of the median with the coverage it actually reaches, mean, SD, SEM, the t interval of the mean, coefficient of variation, geometric mean, SD factor and interval, skewness, kurtosis and sum. The confidence level (90, 95 or 99%) is a setting of the analysis. Results are never stored: they are recalculated from the table each time, so they follow the data. A statistic that cannot be calculated (too few values, or a geometric mean of values that are not all positive) is left empty. Export CSV and Copy are on the toolbar; the code is in `src/stats/descriptive.ts`.

## Behaviour notes

- Empty cell = missing value (never zero). Non-numeric input is rejected with a message; a paste containing any non-numeric cell is rejected whole.
- Pasting beyond the table adds rows, and extra columns add new groups.
- n = 1: SD/SEM undefined, no error bar, warning shown. n = 0: no mean drawn.
- "All groups" edits clear conflicting per-group overrides of the same property.
- Switching graph type only changes the visibility presets (bars/symbols/lines/mean line); data, colours and axis settings are kept.
- Undo/redo covers data and formatting; Ctrl+Z / Ctrl+Y when not typing in a text field.
- Project JSON save/open, autosave to `localStorage`, SVG export (vector), PNG export at 1–8×.

## Limitations

Linear axes only; tables and graphs can be added but not deleted or renamed; group colours default to grayscale; values display as stored (typed `1.10` shows `1.1`).

## UI layout (from reference screenshots)

The screenshots establish available controls and layout, not numeric defaults (spec §23), so chart defaults are unchanged.

- **Navigator:** Data Tables and Graphs sections with "New …" rows that open the table-type and chart-type dialogs; Info, Results and Layouts are locked placeholders.
- **Graph panel:** tabs Appearance / Data Sets on Graph / Annotations; Appearance has Style, Axes, Text, Dimensions and Legend sections. Clicking a chart element opens its settings. Style has a Data set (or Series) selector with `<` `>` stepping (Global = all).
- **Status bar:** status messages and the zoom slider with a Fit button (graphs and data tables).

## Evidence labels

D = stated in the specification (`scientific_plotting_specification.md`). P = proposal made here because the specification gives no value. U = unverified. Every P item is listed in the P-items table below.

## Calculation settings

Summary settings (centre, spread, confidence level, small-sample policy, invalid-value policy) are calculation settings, stored in `summary` and `groupSummary`, not in the style hierarchy. Appearance (colour, cap, direction) stays in style.

- Centre: mean, geometric mean, median. Spread: none, SD (n-1), SEM, CI, range, IQR, GSD. Not every spread is allowed for every centre; a stored spread that is not allowed is not drawn and the Inspector shows the reason.
- Mean CI uses the t distribution with n-1 degrees of freedom. The default confidence level is 0.95 (P).
- Median CI is exact, from binomial order statistics, for n <= 20000 (`MEDIAN_CI_EXACT_MAX_N`). Its coverage is at least the requested level and is usually higher; for n = 5 and n = 6 the interval is the widest available (smallest to largest value) and its actual coverage is reported, not the nominal level. Above 20000 the interval is unavailable and a notice says so.
- Missing cells are never counted. Invalid values are left out or reject the data set, per the invalid-value policy. The "Hide summary when too few values" option maps to the reject policy for small samples (P).

## Project file version 2

Saved files carry `version: 2` and hold the summary settings. Version 1 files open and are migrated: a legacy `errorType` of sd or sem becomes the spread of the summary, and the legacy field is dropped. Older builds refuse version 2 files. Invalid stored values are stripped on load and reported as notes.

## Fill pattern

Bars can be solid, patterned or unfilled (the last only from a file). Patterns: horizontal, vertical, diagonal up, diagonal down, crosshatch, diagonal crosshatch, dots. In pattern mode the bar fill colour is ignored and the pattern background is used (P). Limits (P): spacing 1 to 50 pt, line width or dot diameter 0.1 to 5 pt, and the spacing is never below the mark width. At most 20000 marks (`MAX_PATTERN_MARKS`) are drawn per bar; beyond that a warning is shown. Opacity applies to the pattern and its background, not to the border. Legend keys use the same pattern.

## Right Y axis

Each data set can be plotted on the left or right Y axis (bar, scatter and mean charts). The right axis has its own range, ticks, title and gridlines (drawn dashed when the left grid is on). Right-axis margin and title sizes are proposals (P). Notices appear when an axis is empty, hidden, untitled, or when connectors across axes are skipped.

## Row titles and point labels

The data table has an optional Row title column (undoable, copy and paste aware). Labels can be drawn on each point from the row title or the value, with placement, collision handling (keep, hide, repel), a leader line (a boolean, P), colour, size and decimals. Labels that cannot be placed are listed in the Inspector. A point can override the data set label settings (Selected point box). Dragging labels is not implemented.

## License

Released under the [GNU General Public License v3.0](LICENSE).
## Compliance note

Row titles, data-set names and values are stored unencrypted in the browser (`localStorage` autosave) and in saved JSON files. The Business Associate Agreements in place cover Google Workspace and Microsoft 365 only, not this app or the browser. Do not enter patient identifiers (not verified whether sample identifiers are acceptable). There is no autosave off-switch yet.

## Not yet implemented

- Label sources other than row title and value.
- Dragging labels to custom positions.
- Chart description for informational notices.
- Autosave off-switch.
- Reference-screenshot controls that are placeholders: Info, Results and Layouts rows in the Navigator.

## Known deviations from the specification

| Item | Spec | Here |
|---|---|---|
| Y tick label gap | 1.75 pt (L1373) | 3 pt |
| Legend key size | 25.2 pt (L1376) | 18 pt |
| Axis stroke | 2.1 pt (L1377) | see code constants |
| Error bars shown by default | 9.2 L664 | default on with spread none |
| Hidden error bars in auto-range | 6.1 L355 | excluded |
| Informational chart description | 21.5 L1463 (MUST) | not built, requirement not met |
| Pattern line on the clip edge | full width | half width visible |
| Spread not allowed for the centre | not offered | shown as a disabled option (22.2 L1500) |

## P-items

| Item | Proposal |
|---|---|
| Reject policy | "Hide summary" maps to small-sample policy reject |
| Fill limits | spacing 1 to 50 pt, width 0.1 to 5 pt |
| Pattern colour source | pattern uses the background, not the bar fill colour |
| Label leader | boolean on or off, no style options |
| Label sources | row title and value only |
| Right-axis sizes | margins and title sizes |
| Confidence level | default 0.95 |

## Manual verification checklist

Automated tests cover geometry and SVG text. Check by eye at device pixel ratio 1 and 2, with a tolerance of 0.25 pt (spec 22.3 L1529): bars, error bars, fill patterns, legend keys, right axis, point labels, SVG and PNG export. Only Edge 142 has been verified; Firefox and Safari are not verified.

## Colour palettes

The palettes are taken from the **ggsci** R package (Xiao N. *ggsci: Scientific Journal and Sci-Fi Themed Color Palettes for ggplot2*; <https://nanx.me/ggsci/>, <https://github.com/nanxstats/ggsci>; descriptions follow <https://nanx.me/ggsci/articles/ggsci.html>). Science (AAAS) is first and the default; then Nature (NPG), New England Journal of Medicine, The Lancet, JAMA, BMJ, Journal of Clinical Oncology, D3, Gephi, Observable, Primer, Atlassian, iTerm and IGV. The app's own earlier palettes (Vibrant, Pastel, Colorblind-friendly, Monochrome, Black and White) follow them, so saved charts still open.

Notes: Gephi's engine is generative, so it is a seeded port giving ten fixed colours (R gives other ones each run); iTerm is the Rose Pine scheme only (ggsci has 400+); D3 offers category10 and category20; IGV has 48 colours.

**Info** (toolbar button, beside Settings) shows the version, the credits and the source of the colour palettes. In the palette window (ⓘ beside Color palette) each palette says whether its first six colours stay apart for red-weak, green-weak and blue-weak vision; this is measured by simulation (Machado et al., 2009) in `src/model/colorVision.ts`, not claimed from the palette's name.
