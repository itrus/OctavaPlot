# OctavaPlot — prototype v0.1

Local React + TypeScript + Vite + D3 app for editing a replicate data table and a bar / scatter / mean±error chart. No backend; works offline after `npm install`.

**Live:** https://itrus.github.io/OctavaPlot/ (deployed from `main` by GitHub Actions; data stays in your browser's `localStorage`, so do not enter patient-linked data).

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
| `src/chart/model.ts` | Geometry construction (bars, error bars, points, lines) |
| `src/chart/ChartSvg.tsx` | Declarative SVG drawing |
| `src/chart/hatch.ts`, `labels.ts`, `axes.ts`, `errorGeometry.ts` | Fill pattern marks, point-label layout, axis binding, error-bar geometry |
| `src/chart/hitTest.ts` | Hit testing / selection helpers (editor only) |
| `src/chart/export.tsx` | SVG / PNG export (rendered without editor state) |
| `src/state/` | Commands, undo/redo history, JSON save/load, autosave |
| `src/ui/` | Navigator, data table, graph view, formatting inspector |

Style precedence: object override > group override > layer override > (group palette) > chart defaults. Chart internal unit is the point (1 in = 72 pt = 25.4 mm); the SVG viewBox is in pt.

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

- **Navigator:** search box; Data Tables, Info, Results, Graphs and Layouts sections with "New …" rows; Family panel (current table and its graphs). New Data Table and New Graph work; the Info, Results and Layouts rows are disabled placeholders.
- **Format Graph panel:** tabs Appearance / Data Sets on Graph / Graph Settings / Annotations; Data set selector with `<` `>` stepping (Global = all data sets); Style, Bars, Symbols (now with border colour and thickness), Error bars, Lines and Additional options group boxes with enable checkboxes.
- **Status bar:** sheet selector, status messages, graph zoom slider.

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

## Compliance note

Row titles, data-set names and values are stored unencrypted in the browser (`localStorage` autosave) and in saved JSON files. The Business Associate Agreements in place cover Google Workspace (sagemedic.info) and Microsoft 365 (sagemedic.com) only, not this app or the browser. Do not enter patient identifiers (not verified whether sample identifiers are acceptable). There is no autosave off-switch yet.

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
