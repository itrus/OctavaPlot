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

Done and tested (full suite 3421 tests on 27 October 2026, after roadmap steps 1a to 1e, type-check and `knip` clean; the interface was not looked at in a browser): **A** OP-007, 008, 009, 011, 012, 013, 014, 016, 017, DOC-001, DOC-003. **B** OP-002, OP-010, OP-033 (OP-012 in A). **C** OP-003, OP-004, OP-006, OP-015, and OP-005 for column and grouped charts (a bar that spans a gap is still one rectangle, trimmed by the plot clip). **D** OP-001, OP-023, OP-024, OP-025 (stale analyses and extra data sets open with a note; damaged structure is refused), OP-029, OP-030; a project restored from the recovery copy now counts as not saved to a file. **E** P8-006 (Connect points in: Ascending X), P8-007 (labels inside bars), P8-015 (legend order and columns; legend-only text is not done), P8-020 (seven heat map statistics). Also: SD is now the default spread of a new Bar chart and Mean with error bars (a change from the earlier "no spread by default" note).

Also done: OP-018, 019 (already so in the working tree; tests added), 020, 021, 022, 026, 027 (focus movement not testable without a DOM), 028, 031, 035, 036 (uses Vite's parser: the installed TypeScript 7 has no JavaScript parser API), and OP-034 (export dialog with size, fonts, warnings, known limits and a JSON report; glyph checks and counts of clipped objects are not done). OP-032 is partly done: CSS for 900 px and 600 px, looked at in Chrome at 375 and 768 px (through an iframe, as the window could not be resized): no sideways page scroll, the side panels overlay, the Layouts settings stack under the page, and the top bar keeps the panel toggles, Save, Undo and Redo and Settings on screen (the rest scrolls). Still open: the inspector overlay is slightly clipped at the left edge at 375 px, the navigator overlay stays open after choosing an item, and the status text keeps old messages.

Also on 27 October 2026 (after roadmap steps 1 to 3): the glyph checks of P2 (see ROADMAP step 2), regression tests for `exp_two_phase` ordering, and OP-032: in the narrow layout the navigator now closes when an item is chosen (tried in Chrome on 27 October 2026 in an 800 px iframe: choosing a different item closes the navigator, choosing the open one leaves it). The two audits are in [AUDIT-P0.md](AUDIT-P0.md) and [AUDIT-P3.md](AUDIT-P3.md).

Not done from the lists: OP-032 (in full), and the P8 items not named above.

Looks per part and the axis-range switch beyond XY and survival (roadmap P1, 28 October 2026): **done and tested** for column (dots, error bars, mean lines, joins, paired-plot lines; range: error bars, dots, the body of a box, violin or floating bar), grouped (error bars, individual values, centre lines, the line and means of lines over categories; range: error bars, dots, box, violin and floating bodies) and histogram (steps and symbols of a cumulative distribution; range: the bars of a histogram, the steps of a cumulative one). Before the change the drawing of 100 setups was recorded (`src/chart/export/__snapshots__/family-baseline.json`, one hash per SVG) and it is unchanged. **Not done, on purpose:** pie and heat map (no part has a look to set, and neither has an axis); a look for bars, boxes and violins (they keep the fill settings of the data set); dashed joins in column and grouped charts (they are drawn solid, so no pattern is offered); the X range of a histogram (it is the bin grid, a calculation, and stays). Stacked bars and contingency charts are ranged by their totals and get no switch. **Not tried in a browser:** the Layers section of the column, grouped and histogram inspectors with the new controls (it is the XY section reused; only the code and the layer rows are tested).

---

## 1. Defects (roadmap P0 Correctness)

These also answer roadmap step 3 for P0 ("which defects exist"). Each needs a regression test first (roadmap Testing).

### 1.1 Wrong numbers or wrong data on screen

| ID | Defect | Status and where | Size |
|---|---|---|---|
| OP-001 | Decimal comma: 1.234 is shown for editing as `1.234`, the parser takes the dot as thousands, an unchanged edit saves 1234 (and any other decimal, such as 1.5, is refused on an unchanged edit) | **Fixed 27 Oct 2026**: the separator of the setting is used to show, edit, copy and export; no thousands separator anywhere; CSV uses semicolons in comma mode; round-trip tests for edit, paste, copy and CSV. Committed | done |
| OP-002 | A graph in a layout ignores exclusions, hidden and added series | **Fixed 27 Oct 2026**: one entry point `prepareChartInput` (`src/model/table/preparedChart.ts`) used by the graph view, thumbnails and layouts; an architecture test guards it. | done |
| OP-003 | On a log axis values of 0 or less are dropped before box, violin and floating-bar statistics, so the median changes (a warning counts them, the statistics still change) | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-004 | Nonlinear fit: stopping tests are absolute and parameters are scaled only by their start value, so tiny Y can report `converged` with a wrong rate | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-005 | Broken axis, column charts: a mark inside the omitted range snaps to an edge, mean connector and paired lines are not split in data space | **Partly fixed 27 Oct 2026**: column and grouped charts (a bar that spans a gap is still one rectangle, trimmed by the plot clip); other families not checked | M |
| OP-006 | Descending ECDF: the auto Y range comes from the steps, not from the start level (1, 100 or n), so the first step can be clipped | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-007 | Hyperbola fit drops X = 0 although the model is defined there | **Fixed 27 Oct 2026**: hyperbola keeps X = 0 (`nonNegativeX`); curve sampling honours it. | done |
| OP-008 | A supplied mean outside its supplied lower/upper limits is accepted as `ok` | **Fixed 27 Oct 2026**: a centre outside its limits makes the interval unavailable, with a notice. | done |
| OP-010 | A data set added from another table gets the base table's row titles | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-011 | Added series change colour when an earlier added series is removed | **Fixed 27 Oct 2026**: added series keep a stored colour slot (`slot`, optional; old files open as before). | done |
| OP-014 | Automatic histogram edges are rounded to 15 digits, so closely spaced values can fall outside every bin | **Fixed 27 Oct 2026**: counting uses exact edges when rounding would lose a value. | done |
| OP-015 | Results SD squares raw deviations and underflows at about 1e-200; the chart SD scales first and does not | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-016 | Annotation label clean-up uses `/s+/g`, so the letter s is replaced by a space | **Fixed 27 Oct 2026**: whitespace regex corrected. | done |

### 1.2 Identity, export and files

| ID | Defect | Status and where | Size |
|---|---|---|---|
| OP-009 | Duplicating a graph keeps hidden-layer ids that contain the old chart id (`:atRisk`, `:titles`, `:pairLines`, others), so those layers reappear | **Fixed 27 Oct 2026**: a duplicated graph remaps layer ids that hold the old chart id. | done |
| OP-012 | Layout PNG does not get the dpi chunk that a single graph gets | **Fixed 27 Oct 2026**: layout PNG uses the same encoder as a single graph, with the dpi chunk. | done |
| OP-013 | Thumbnails inline many SVGs that all use `id="plot-clip"` | **Fixed 27 Oct 2026**: thumbnails get ids of their own; exports unchanged. | done |
| OP-017 | `vite.config.ts` runs only `*.test.ts`, so `*.test.tsx` (for example `controls.test.tsx`) never runs under `npm test` | **Fixed 27 Oct 2026**: test config includes `*.test.tsx`. | done |
| OP-025 | Import repair: a bad replicate layout silently becomes single values, duplicate analysis ids pass, only the first repair note is shown | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-033 | The layout report leaves out the warnings of its panels | **Fixed 27 Oct 2026** (see Progress) | done |

### 1.3 Performance and resource safety

| ID | Defect | Status and where | Size |
|---|---|---|---|
| OP-018 | `prefixIds` runs three string passes per id over the whole SVG | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-019 | Paired matching is rows x groups x points | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-020 | Calc cache keys serialise the data; Results fits bypass the cache | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-021 | Nothing stops two PNG exports at once | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-022 | Large paste uses `Math.max(0, ...rows)` and can overflow the stack | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-023 | No flush of autosave on page exit | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-024 | Two tabs share one recovery key with no revision | **Fixed 27 Oct 2026** (see Progress) | done |

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
| OP-034 | Export preflight: final text and stroke size after panel scaling, fonts, clipped objects | **Mostly done 27 Oct 2026**: export dialog with size, fonts, warnings, known limits and a JSON report; glyph checks and counts of clipped objects not done | M | Step 2 |
| P8-023 | Fix the inner plot size or the outer figure size; "reflow" versus "scale" as two operations | Not checked | M | Needs measured text (step 1) |
| P8-024 | Align the plot axes of layout panels, not their frames | Not checked | L | After P8-023 |
| P8-016 | A master legend object in a layout | Confirmed not built (`Layout` has no legend field, `types.ts:666`) | M | After OP-002 |
| P8-015 | Legend order independent of drawing order, rows/columns, legend-only text | **Partly done 27 Oct 2026**: legend order and columns; legend-only text not done | M | |
| P8-031 | Batch export of selected graphs from one project revision | Not checked | M | After OP-021, OP-012 |
| G2 | Optional reproducibility manifest beside an export | Proposal | M | Open decision 2 |
| G5 | Vector PDF | Proposal, later | L | Roadmap says PDF is raster |

### P3 Editing

| ID | Item | Status | Size |
|---|---|---|---|
| OP-027 | Arrow keys, Home/End and roving tab stop in inspector tabs and radios | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-028 | Ctrl/Cmd+S saves the `.oplot` file | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-029 | Insert, delete and duplicate rows | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-030 | CSV import preview with delimiter and decimal choice | **Fixed 27 Oct 2026** (see Progress) | done |
| OP-031 | CSV export: all rows, included rows, or with exclusion columns | **Fixed 27 Oct 2026** (see Progress) | done |
| P8-026 | Apply chosen formatting groups to several existing graphs, with a series mapping preview and one undo step | Not checked | M |
| P8-017 | Labels and reference lines bound to a result (n, mean) that update when data change | Not checked | L |
| P8-019 | Scientific rich text (sub- and superscripts) and labels anchored to a point with a stored offset | **Rich text built 28 Oct 2026** (see below); the stored offset of a label is not built | L |
| OP-035 | Gallery shows creatable graphs by default, with a "Show planned" switch | **Fixed 27 Oct 2026**; **changed 28 Oct 2026**: the switch is gone and the gallery always shows every graph, the planned ones locked | done |

### P4 Chart families

Roadmap order is kept: observation roles first, then graphs, then new families with a calculation contract first.

| ID | Item | Status | Size | Needs |
|---|---|---|---|---|
| P8-028 | Subject-aware nested and longitudinal plots (roles) | Roadmap open decision 4 | L | **Roles built 28 Oct 2026** (free-text `subject` on each observation, Subject… in the grid, file format, `subjects.ts` with equal-unit means and subject lines; tested, not tried in a browser). **`cat.nested` opened 28 Oct 2026**: the dot plot with `jitter.bySubject` (a cluster of dots and a larger marker at the mean for each subject; the mean line and error bar are of the subjects, n = the subjects; values without a subject sit in the middle, are left out and counted in a warning); tested on the model, not tried in a browser. **`xy.trajectory` opened 28 Oct 2026**: `lineConnect: 'subject'` joins the points of each subject in ascending X, one line for each subject (a subject's own points are the line, so a missing value is joined across); points with no subject are not joined and counted in a warning; tested on the model, not tried in a browser. **`grp.paired` opened 28 Oct 2026**: grouped bars of replicates with `pairs.bySubject` (a layer 'Lines joining the subjects': inside each category, one line for each subject from the first series to the last at the mean of its replicates in each series; dots stay on the line of their series; `pairs.bridge` joins across a series with no value, otherwise the line breaks); tested on the model, not tried in a browser. **`three.bars` and `three.dots` opened 28 Oct 2026** with a second role, the factor of a series (`Group.factor` on the first column of a series; Factor… in a grouped table): inside each category the series that share a factor are drawn together with a wider gap between clusters, the factor is written under its cluster (a row the layout reserves under the category labels; not on horizontal charts), and a series keeps the colour of its place in its cluster; it applies to grouped bars, floating bars, box plots and violins (not stacked bars or lines); no factor set = the old drawing; tested on the model, not tried in a browser. Not done: the legend still lists every series (a series in the same place of two clusters has the same colour; hide or rename the duplicates), a bracket spanning the clusters of one category, a subject view of the grid |
| P8-006 | Choose line order (table order or ascending X) and gap behaviour | **Fixed 27 Oct 2026** (see Progress) | done |
| P8-001 | Density-shaped and collision-aware dot placement | Confirmed: only deterministic uniform jitter (`jitter.ts`) | L | Contracts section 16 |
| P8-004 | Independent X error bars | Confirmed not built (`xyModel.ts:286` has one Y error path) | M | OP-008 |
| P8-002 | Error envelope from measured or supplied intervals | Not checked | M | Interval record, OP-005 |
| P8-005 | Boxes and violins at numeric X | Confirmed not built (`chartTypes.ts:62`) | M | OP-003 |
| P8-007 | Bar labels inside the end or at the base; n and value together | **Fixed 27 Oct 2026** (see Progress) | done | Roadmap step 1b |
| P8-008 | Gap sizes and slots reserved for missing values | Not checked | M | |
| P8-009 | Stacked, side-by-side and overlapping bars mixed; two-level category labels | Not checked | L | |
| P8-010 | Date, time and duration columns and axes | Confirmed not built (`types.ts`; table folder not searched exhaustively) | L | OP-001, OP-030 |
| P8-011 | Extra ticks and shaded regions between two values | Not checked | M | OP-005 |
| P8-012 | Identity line and `a + bx` reference line, equal-unit scaling | Not checked | M | |
| P8-013 | Offset traces with a disclosed offset and explicit scale bar | **Done 28 Oct 2026** (`xy.offset`, see below) | M | |
| P8-014 | Secondary Y axis on numeric XY | Confirmed not built (`capabilities.ts:29`) | M | |
| P8-018 | Comparison brackets bound to groups | **Built 28 Oct 2026** for charts over columns, supplied results only (decided: the label is the owner's; nothing is calculated); see below | L | Grouped bars, XY and others are not covered |
| P8-020 | Heat map of SD, SEM, % CV, geometric mean | **Fixed 27 Oct 2026** (see Progress) | done | OP-015 |
| P8-021 | Heat map colour ranges and distinct styles for missing, excluded, out-of-range | Confirmed no interval ranges (`types.ts:297`) | M | |
| P8-022 | Heat map cell size, group gaps, sparse labels, colour-bar controls | Not checked | M | |
| P8-029 | Typed five-number box and effect-interval (forest) inputs | Not checked | M | OP-008 |
| P8-030 | Interpolation, smoothing and fitted models as separate operations | **Removed 28 Oct 2026**: not wanted; the `curve.smooth` graph and its smoothing contract left the catalogue | | |
| P8-025 | Panel crops and zoomed insets of the same graph | Not checked | M | |
| P8-027 | Portable "recipes": role-mapped graph formats | Not checked | L | P8-026 |

**`xy.bars` opened 28 Oct 2026** as the chart type `xyBars` (bars at numeric X): a bar at each X from the baseline (`bars.baseline`, default 0) to its Y; the room of an X is the smallest distance between two X values, the bars fill it less the space between bars (`bars.gapPct`, a percent of a bar's width, as for the columns), and several series stand side by side in it; the axes hold the bars (baseline and the outer edges); the bars are a layer that can be hidden; tested on the model, not tried in a browser. Not done: bar widths from a column (a width per bar), labels above the bars, bars on a log X axis that start at 0 (a bar edge at or below 0 has no place there), horizontal bars.

**`xy.bubble` opened 28 Oct 2026** as the chart type `xyBubble` with a new XY table layout `sized` (two columns for each series, Y and Size; chosen in New Table, XY): the area of a bubble follows its size (the diameter follows the square root), the largest bubble of the chart has the symbol size, one scale for all series; a point with no size, or a size of 0 or less, is not drawn and is counted in a warning; a bubble chart on a table with no size column draws every symbol at the symbol size and says how to make the table; tested on the model, not tried in a browser. Not done: bubbles coloured by a third column, a size legend (reference circles), room at the axis edges for the radius of the bubbles (a bubble at the edge is cut by the plot), changing the layout of an existing table (it is chosen when the table is made), CSV import of a sized table is untested.

**`xy.vector` opened 28 Oct 2026** as the chart type `xyVector` with a new XY table layout `vector` (three columns for each series: Y, dX and dY; chosen in New Table, XY): an arrow from (X, Y) to (X + dX, Y + dY), so an arrow from the origin is a row with X = 0 and Y = 0 and an arrow between two points has their difference as the steps; the shaft and an open two-stroke head are one path in the line layer (head 4 line widths long, at least 5 pt, at most half the shaft); the axes hold the ends of the arrows; an arrow with a missing step, no length (dX = dY = 0) or an end where a log axis or an omitted range has no place is not drawn and is counted in a warning; a vector chart on a table without dX and dY draws nothing and says how to make the table; tested on the model, not tried in a browser. Not done: filled heads, arrow length from two X, Y columns (a start and an end point instead of a step), a scale for the lengths (all arrows are in data units), arrows coloured by a column, changing the layout of an existing table.

**`xy.offset` opened 28 Oct 2026** as the chart type `xyOffset` (P8-013, offset traces with a disclosed offset and an explicit scale bar): trace i is lifted by i times `traceOffset` (blank = automatic: a little more than the largest range of a trace, two significant digits; any number is allowed, below 0 stacks downward); the chart is built from a shifted copy of the table (`src/model/table/offset.ts`), so error bars, fits, axis breaks and the axis range all agree and the table never changes; only places on the Y axis move (a single Y, every replicate, the centre and the limits of a summary; not an SD or a vector's steps); hiding a trace moves no other; the offset is written on the figure ("Traces offset by 10") and in the chart's warnings, so it is also in the export report; made from the gallery with the Y axis hidden and the existing scale bar on; tested on the model, not tried in a browser. Not done: a scale bar of a length chosen by the user (it is one major interval of the axis), values in the editor's tooltips and the fit parameters of an offset chart are the shifted ones, a reverse order of the traces, an offset in X (waterfall).

**`grp.scatterS` opened 28 Oct 2026** as the chart option `groupedBy: 'series'` on grouped bars (and floating bars, box plots and violins), which is the transpose of the usual layout: each series has its own group of columns, one column for each category, the groups one after another with the gap of factor clusters, the category names under every column and the name of the series in a row under its group (not on horizontal charts); a series keeps its own colour; factor clusters and the lines joining the subjects are not used while the columns are grouped by series (a warning says so); the gallery entry is dots only; stacked bars and lines are not affected; tested on the model, not tried in a browser. Not done: a legend that leaves out what the names under the groups already say, a different order of the series, a bracket over a group.

**Looked at in Chrome, 28 Oct 2026** (dev server, a 1280 × 551 window; the gallery previews and the data table, not every inspector control): the Subject… dialog and the cell marker, nested dots (created from the gallery, two subject clusters and the mean of the subjects), Bars at numeric X, Offset traces, the sized (bubble) table and Bubbles, the vector table and Vectors, Separated scatter, the Factor… dialog and Three-way bars; the project, with its subjects and factors, came back from the recovery copy after a reload. Three defects found and fixed: the offset note lay on a trace (it now has a row of its own under the X axis title), bubbles looked like ordinary dots (the gallery now makes them 36 pt at largest and 60% opaque), and in three-way bars with one series for each factor both series had the same colour and the names of the factors ran together (a cluster of one series keeps its series colour; names shrink to fit, to 60%). **Still not looked at:** `grp.paired`, `xy.trajectory`, `three.dots`, the inspector controls of the new options (Group dots by subject, Join the values of each subject, Group the columns by, Offset between traces, Largest bubble), the Layers sections of the column, grouped and histogram inspectors, keyboard use. The legend of a dots-only grouped chart still shows bar-style keys, and a large bubble makes a large legend key.

**CSV carries subjects and factors, 28 Oct 2026** (`src/ui/data/csv.ts`, `replaceTableData`): a column whose values name subjects is followed by a "<Group> subject" column, and the first column of a series with a factor by a "<Group> factor" column (the factor on every line; the import takes the first line that has one), in every export mode and after the exclusion columns; the import recognises these columns by their names right after the data column, so they are not read as data and not counted in the preview; a file with no such columns leaves the subjects empty and the factors the table has at that place (a file with factor columns replaces them). Also fixed: replacing a table's data used to drop the factors of its series. Limits: a real data column that is called "<previous column> subject" or "<previous column> factor" is read as the role column; the tab-separated paste into the grid carries no roles (only the file does); CSV import of sized and vector tables is still untested.

**Survival summary, 28 Oct 2026** (item 8: show the median survival; decided: in the Results only): a new analysis kind `survival` for survival tables, `src/ui/views/survivalSheet.ts`. One column for each group; rows: subjects, events, censored, median survival time or "Not reached", and entries left out. The chart and the sheet read the table through the same function (`readSurvivalSubjects`), so their counts and warnings agree (tested), and an excluded value is left out in both. No confidence interval: the contracts give no method for one (a Brookmeyer-Crowley interval could be added with a contract and fixtures). Tried in Chrome on the sample survival table (the dialog offers it first for a survival table, the sheet shows medians 11 and 25, and no confidence-level control). Not done: the median on the graph, the number at risk or the survival at a chosen time in the Results, a comparison of groups.

**Comparison brackets, 28 Oct 2026** (P8-018; decided: supplied results only): `Chart.brackets` (`Bracket`: `from`, `to` data set IDs, a typed `label`, colour, thickness, label size), Annotations tab → Comparison brackets, one hideable layer for each (`<id>:bracket`). The placement is pure (`bracketPlacement.ts`): a bracket stands above the highest value either data set asks the axis to show (a bar, an error bar end, a dot, a whisker), brackets that overlap are stacked (shorter first, so the longer stands higher, whatever the order they were added in), and the gap between lines is as long on the page as a label is tall (label size × 0.9 + 12 pt): the axis range gets the room of the stack and of the top label, with the step worked out in closed form from an estimate of the plot length (60% of the chart, the width for a horizontal chart), the range of the data (from 0 for bars) with a 10% margin for the rounding of the axis limits, and the number of levels; on a log axis the step is a factor. A hidden bracket still takes its room, so hiding moves nothing (rule 5). Drawn in front of the data, clipped to the plot, on horizontal charts with the label upright beside the bar. A bracket whose data set is missing or on the right axis, or whose data sets have no values, is not drawn and a notice says why. Tried in Chrome on a bar chart: it found that the lines of stacked brackets were too close for the label (fixed: first the step was measured against the range of the values, not the range the plot shows, which starts at 0 for bars). Not done: brackets on grouped bars (between series or categories), XY, survival and histogram charts; a bracket with a label of several lines or rich text (rich text is the next item); the range switch (keeping brackets out of the range); dragging a bracket; calculating a test, which stays out of scope. The estimate of the plot length can still be off on an unusual layout (a very long legend at the bottom, a large title), so the labels of stacked brackets may be closer than a label's height there.

**Rich text, 28 Oct 2026** (P8-019, first part; decided: figure text only, not the Results or CSV): subscripts, superscripts, Greek letters and a few symbols written as plain text, in every text of a graph that is drawn from the scene (titles, axis titles, tick and category names, legend, annotations, labels, brackets, reference lines). Syntax (`src/util/richText.ts`): `_{...}` and `^{...}` (the braces are required), `\name` for Greek and `\pm \times \deg \cdot \leq \geq \neq \approx \infty`, `{}` to end a name (`\mu{}m`), `\_ \^ \\ \{ \}` for the character itself. **Deviation from the proposal made to you:** the proposal was `H_2O` and `m^2` without braces, but that would silently turn names such as "Mouse_3" or "Run_2" into subscripts, so the braces are required; text without a backslash, "_{" or "^{" is never touched (tested for `Mouse_3`, `p_value`, `a^2`, `H_2O`, `10^-3`). Anything not understood is kept as typed (an unknown name, a brace that never closes). Written as tspans at 70% with a dy (`richSvg.ts`), in one place for the screen and every export (`SceneElements.tsx`); widths in the layout count the written text, scripts at their smaller size (`measureText`); the glyph check and the font report see the characters that are drawn (`sceneText.ts`). The recorded drawings of 100 setups and the golden exports are unchanged. Tried in Chrome (title with a subscript, a superscript and a Greek letter; a rotated Y axis title). Not done: nested scripts (`a_{b_{c}}` keeps its characters, in order), italic or bold runs, rich text on the page of a layout (panel letters, the page title), in the Results and CSV (by decision), in tooltips and in the lists of the inspector (they show what was typed), and a text-field help that checks the braces as you type.

Heat map colours, done today: the five palettes were replaced by the 16 ggsci gradients. P8-021 and P8-022 build on them.

### P5 Release

| ID | Item | Status |
|---|---|---|
| OP-036 | Architecture test reads imports with a regex that matches only single-quoted relative `from` and `import(` | **Fixed 27 Oct 2026** (see Progress) |
| P8-032 | Example projects that double as visual fixtures; one per catalogue preset | Matches roadmap "example gallery" and "visual fixtures" |
| | Performance measurements (`npm run perf`) | The performance table of the roadmap was never measured | **Measured 27 Oct 2026**: 6 measurements of the table in the browser, on the production build; results in the roadmap and section 4b |
| Playwright smoke: edit cell, exclude, compare graph and layout, duplicate, save and reopen, export PNG | **Built 27 Oct 2026** (e2e/, 22 tests, `npm run e2e`): all of these except the comparison of a graph with a layout; also keyboard, dialog focus, several data sets, annotations, legend and the narrow window. Not run on GitHub yet |

### Documentation

| ID | Fix | Status |
|---|---|---|
| DOC-001 | README says 39 available, 24 chart types, 17 planned. Actual: 56 entries, 45 available, 11 locked, 28 chart types. Generate the numbers from the registry | **Fixed 27 Oct 2026** (see Progress) |
| DOC-003 | ROADMAP lines 48, 59, 140 (and test names "spec 22.1") say section 22.1. The acceptance fixtures are `## 15. Acceptance fixtures` in `docs/calculation-contracts.md` | **Fixed 27 Oct 2026** (see Progress) |
| DOC-004 | The README gave the PNG options as 1×, 2×, 3.125×, 4× and 6.25×; the app offers 96, 150, 300 and 600 dpi | **Fixed 28 Oct 2026** |
| DOC-002, 005, 006 | Median CI wording, survival layer claims, split README | Not checked (DOC-006, splitting the README into several files, is not done) |

---

## 3. Where to start

Status 27 October 2026: options A to D and the P8 items of E (P8-006, 007, 015 in part, 020) are done; see Progress. The table is kept as the record of the choice.

All options keep the roadmap order: step 1 and step 2 stay the main line. The options differ in what runs beside it.

| Option | Contents | Why | Size |
|---|---|---|---|
| **A. Quick safe fixes** (recommended first) | OP-017, OP-016, OP-012, OP-009, OP-011, OP-013, OP-007, OP-008, OP-014, DOC-001, DOC-003 | Each is small, each is confirmed, none needs a design decision. OP-017 first, so later tests are actually run | about 3 to 4 days in all |
| **B. Layout and data truth** | OP-002 (shared `prepareChartInput`), then OP-010, OP-033, OP-012 | Layouts and graphs then show the same data. This is the base for P8-016, P8-023, P8-024 | M to L |
| **C. Numerics** | OP-003, OP-005 (column), OP-004, OP-006, OP-015 | The scientific-integrity group. OP-004 is the largest and needs independent reference values (SciPy, R) | L |
| **D. Input safety** | OP-001 with OP-030 and OP-029; then OP-023, OP-024, OP-025 | Data-entry and recovery. OP-001 changes what the user types, so decide the comma-mode display format first | L |
| **E. New plotting** | P8-006 text fix now; P8-007 with step 1b; P8-015; P8-020 | Visible gains that sit on work already planned | M each |

My suggestion: A first, then B and C in parallel with roadmap step 1. D can wait for the P3 audit. New families (P8-001, 004, 005, 010, 018) wait for B and C, as the review also says.

## 4. Decisions

Items 1 to 3 were decided and built on 27 October 2026 (OP-001, OP-003 and OP-002: see section 1); items 4 and 5 are still open.

1. **OP-001 format in comma mode:** show `1,234` for editing (proposed), or keep `1.234` and change the parser. Either changes saved behaviour for existing users.
2. **OP-003 on a log axis:** keep negative values in the statistics and draw only what the axis can show (proposed), or keep the present filter and say so in the figure. The first changes numbers in existing figures.
3. **OP-002 scope:** one prepared-data entry for graph, layout, thumbnail and export (proposed), or a one-line fix in `drawLayout` now and the larger change later.
4. **P8-018 brackets:** decided 28 Oct 2026: supplied results only, and built for charts over columns (see section 2).
5. **Roadmap open decisions 1 to 4** are unchanged and still needed before steps 2 and 6.

## 4a. Found by the audits (27 October 2026)

From [AUDIT-P0.md](AUDIT-P0.md) and [AUDIT-P3.md](AUDIT-P3.md); sizes are the audits' estimates.

| Item | Source | Size |
|---|---|---|
| Reference values from outside the code for nonlinear fit intervals (SE, CI, bands); the line CI test takes its t quantile from the code under test | P0 | **Done 27 Oct 2026** for the two-phase model against NIST MGH17 (all parameters and standard errors to 6 to 9 digits), bands against a delta method worked out in the test; the t quantile is tabulated. Other models have no outside reference yet |
| Missing section 15 fixtures: bubble area, dot apportionment, nested weighting, ROC, exact binomial, Holm and BH (the features do not exist yet) | P0 | L (with the features). Bubble area and nested weighting have code and tests since 28 Oct 2026 (`xyBubble.test.ts`, `subjects.test.ts`); the others still need their features. The Tukey fence, survival ties and the no-event median are done (27 Oct 2026; `medianSurvival` was added; since 28 Oct 2026 the median is shown in the Results as a "Survival summary" analysis of a survival table, and not on the graph, as decided; no interval is given for it) |
| Composition with a zero total: the contract says blocking error, the code warns and skips the row | P0 | **Decided 28 Oct 2026**: the code is kept (the row is not drawn and a warning names it) and the contract now says so |
| Undo and save tests: redo cleared by a new edit, undo across add or remove table, theme and data undo pair, page-exit flush hook | P0 | **Done 27 Oct 2026** (history tests; a browser test of the exit flush that fails when the handlers are removed) |
| Axis breaks outside column, grouped and XY (points and error bars in a gap), histogram, heat map, survival | P0 | **Done 27 Oct 2026**, with two defects fixed in the XY model (points in a gap dropped silently, error bars with an end in a gap drawn at the edge). Survival (28 Oct 2026): the curve was placed on a linear axis while the axis was drawn broken, so the data sat in the wrong place; it now uses the axis mapper, and marks and error bars inside a gap are not drawn and are counted. **Step drops fixed 28 Oct 2026**: a survival or ECDF step whose time lies inside a gap is no longer drawn at the nearer edge of the gap, as if the event happened there; the line is cut in data space (`stepPathThroughBreaks`, `axisScale.ts`), so the level before the drop ends at one edge and the new level begins at the other with no drop between (tested in `stepBreaks.test.ts`; a chart with no broken axis keeps its plain path, so its output is unchanged). Not changed: the confidence band of a survival curve is a filled shape and still takes a vertex inside a gap to the nearer edge (the fill is trimmed by the clip); a histogram bar that spans a gap is one rectangle trimmed by the clip, as for columns |
| CSV import: BOM, `NaN` and `Infinity` text, file and column limit, duplicate or empty headers | P0 | **Done 27 Oct 2026**: tests for each; a file with more than 100,000 data lines is refused with the count (there is no limit on columns: the app has none to apply) |
| Annotation anchor in data units (today: percent of the chart) | P3 | **Done 27 Oct 2026** (XY, survival, histogram: X and Y; columns and grouped: the value axis only, the position across the categories stays a fraction of the page; pie and heat map: page only). Anchor selector and X, Y fields in the Annotations tab; drag and arrow keys keep the values; a value outside the range is not drawn and a notice says so (as for reference lines, not moved to the edge). Tried in Chrome on a bar chart (anchor, Y value); drag, axis changes and the XY fields are covered by tests only. Not done: the second (right) Y axis |
| Numeric legend offset (today: right, bottom or top only; no numeric route) | P3 | **Done 27 Oct 2026**: Move right and Move down (pt) under Legend; moves the legend only, the plot stays; a warning when it leaves the chart; saved as `offsetXPt` and `offsetYPt` (FILE_FORMAT) |
| Reset ladder: field, data set or section, graph (`resetStyle` and `clearSummaryOverrides` have no UI) | P3 | **Done 27 Oct 2026** (column, XY, survival, histogram inspectors): the dot beside an overridden setting is a button that clears that setting for the data set; a Reset button beside the data set selector clears its style, summary, part looks and point settings; the graph's Reset button says what it keeps. Tried in Chrome. Not done: the pie, heat map and grouped inspectors have no per-data-set overrides to reset there (not checked in detail), and the reset of one annotation or reference line is the delete button |
| Mixed-state multi-selection (`Selection` is single) | P3 | **Done 27 Oct 2026** (column, XY, survival, grouped and contingency inspectors): several data sets can be selected together (Ctrl, Cmd or Shift on the chart; the boxes under "Edit several data sets together…"; Shift+Left or Right on the keyboard) and edited as one, in one undo step. Where they differ a field shows "Mixed" (an empty number box, a "Mixed" entry in a selector, a faded colour, an unticked box that is neither) and carries a "mixed" tag; typing or choosing a value sets it for all of them. The dot beside a setting resets it in every selected data set that has its own value, and Reset beside the selector resets them all. Global (all data sets) shows the same marks where data sets differ; with a palette the colour fields always say "mixed", since each data set has its own colour. Tried in Chrome on a bar chart (select with Ctrl-click, edit two, "Mixed" with a third, reset with the dot, Shift+arrow keys); the XY inspector and the "Mixed" selector and checkbox are covered by tests only. Not done: pie, heat map and histogram inspectors (they have no per-data-set settings of this kind); several points or annotations cannot be selected together |
| Property search (no registry of field labels) | P3 | **Not wanted** (decided 27 Oct 2026): not built, and not planned |
| Keyboard: chart canvas, Navigator arrows, grid Home and End | P3 | **Chart canvas done 27 Oct 2026**: the chart takes focus (focus ring); Left and Right select the data sets, Down and Up go into and along the points (Page Up and Down jump ten, Home and End go to the first and last), Escape selects the whole chart, Enter opens the settings; the selection is read out (`role=status`); on a selected annotation the arrows move it (Shift 5%, Alt 0.1%). Tried in Chrome for a bar chart (data sets, points, Escape, the focus ring); the annotation nudge from the canvas, XY and pie charts are covered by tests only. Then also done (all tried in Chrome): the chart title, legend and axes are stops after the last data set (outlined on the chart, read out, Enter opens their settings); Up, Down, Home, End and Left and Right (fold a folder) in the Navigator; Home, End, Ctrl+Home and Ctrl+End in the data grid. Not done: annotations are reached through the list in the Annotations tab, not by the arrow keys; no `tree` role in the Navigator |
| Grid fill down and right | P3 | **Done 27 Oct 2026**: Ctrl+D and Ctrl+R (planFill, `ui/data/fill.ts`; one undo step). Tried in Chrome: Ctrl+D fills and the browser does not take it; Ctrl+R could only be sent as a synthetic key event (the test tool reloads the page itself), where the grid handled it and called preventDefault. Series fill (1, 2, 3 ... or a step) is Rows → Fill series… (start, step, down the rows or across the columns; one Undo step), tried in Chrome. |
| Status text keeps old messages | P3 | **Done 27 Oct 2026**: the status line clears on the next action (the first edit, undo or redo, new selection or change of page after the message appeared); a message set by the same action stays. This includes error messages and the message about the restored recovery copy (the recovery line beside it is separate and stays). Tried in Chrome |
| Small screens: the inspector clip at 375 px was not reproduced in Chrome (it fits, 30 to 374 px, no sideways scroll); "no width queries" in section 1.4 is out of date | P3 | S |

## 4b. Found by measuring (27 October 2026)

From `npm run perf` (see the performance table in [ROADMAP.md](../ROADMAP.md)); sizes are my estimates.

| Item | What was found | Size |
|---|---|---|
| A style edit rebuilds everything | Changing a title on a graph of 100 000 observations takes 2.3 to 2.5 s to the next frame, 0.5 to 0.8 s of it until the drawing changes. The model and the whole scene are made again, and React writes every dot again, although only a text changed (roadmap rule 4: a style or axis edit must not recompute what it does not change). Ideas: key the geometry on what it depends on (not on the title or fonts), keep the scene of the marks when only chrome changes, and give the marks a stable identity so that React skips them. | L |
| Drawing 100 000 dots | The graph of 100 000 observations takes 5.7 to 7.8 s to draw (target 3 s). Ideas: clip and simplify the preview to the viewport above about 100 000 points (the roadmap rule; export stays exact), draw dots of one style as one path. | L |
| Picking a point of 10 000 | 25 to 32 ms to the drawing, but 246 to 297 ms to the next frame: browser layout and paint of 10 000 elements. | M |
| Pan and zoom, UI during export | Not measured. | M |
| A fit in a worker | **Built 28 Oct 2026** (design: roadmap, "Fits in a worker"). *Measured*: a two-phase fit of 300 points in Chrome (development server): longest gap between frames 2121 ms on the main thread, 65 to 133 ms in the worker; the curve appeared at about the same time (2.4 to 2.7 s against 2.5 s). *Measured in node only*: the cost of each model for each number of points, which sets the threshold for sending a fit away. *Only tested, not measured*: stale results dropped, a style edit not refitting, export computing the final fit, a worker failure falling back (unit tests with an in-process worker). The browser test covers the pending state, a title edit during the fit and the curve arriving. *Not done*: the Results sheet, a worker pool, a cancel button, 100 000 points, the production build | L |

## 5. Not adopted from the reviews

- Prism-style workarounds: repeated medians to fake a box, estimate and limits as three "replicates", a dummy graph for a legend, 1.99/2.00 range limits.
- Silent downsampling of exports, and any claim of Prism parity in packing, violins or splines.
- ANOVA, post-hoc and model-selection workflows (roadmap: out of scope).
- Replacing zero by a tiny value before a log axis.
