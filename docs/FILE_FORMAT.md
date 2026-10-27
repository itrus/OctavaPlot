# OctavaPlot project file (`.oplot`), version 1

A project is saved as one file with the extension `.oplot`. The file is UTF-8 text in JSON. It is not compressed, packed, signed or encrypted, so any text editor or `diff` can read it. The browser autosave stores the same text.

The program that writes and reads it is [src/state/serialize.ts](../src/state/serialize.ts) (the envelope and the checks) and [src/state/projectFile.ts](../src/state/projectFile.ts) (the file name, the size limit and the UTF-8 check). The types in [src/model/types.ts](../src/model/types.ts) list every field; this page explains what the file is made of and what a reader may rely on.

## Version

There is one version number, in the envelope: `1`. This version of OctavaPlot reads version 1 and nothing else, and it opens no other format. A file with another `format` or `version` is refused. A change that older programs cannot read will raise the number; no older version exists to convert from.

## Envelope

```json
{
  "format": "octavaplot-project",
  "version": 1,
  "project": { }
}
```

| Key | Value |
|---|---|
| `format` | The text `octavaplot-project`. |
| `version` | The number `1`. |
| `project` | The project: see below. |

The file is written with two-space indents and the keys in a fixed order, so saving a project that has not changed gives the same text. A complete small file is [example.oplot](example.oplot).

## Project

| Key | Type | Meaning |
|---|---|---|
| `id` | text | Identifier of the project. |
| `name` | text | Name of the project; the suggested file name when saving. |
| `dataTables` | list | The data tables; at least one. |
| `charts` | list | The graphs. May be empty. |
| `analyses` | list, optional | Analyses of the Results section (descriptive statistics, curve fits): their settings only. Results are not stored; they are calculated again from the tables. Each has an `id` (not empty, not used twice), a `kind` (`descriptive` or `curvefit`) and a `dataTableId` of a table that exists; a curve fit needs an XY table and a known `model`. A file that breaks one of these is refused (see below), not repaired. |
| `layouts` | list, optional | A4 pages of graphs: `orientation` (`portrait` or `landscape`), `background` (`#rrggbb` or `null`), `arrangement` (`{"kind":"grid","cols":2,"rows":1}`, `{"kind":"inset"}`, or `{"kind":"free","frames":[{"x":10,"y":10,"w":120,"h":90}]}` with the boxes in mm from the top left of the page), `panels` (the graph `id` in each slot, or `null`), `scaling` (`smallest`, `largest`, `fit`, or `percent` with a number; `equal`, the earlier name of `smallest`, is still read), `labelStyle` (`none`, `A`, `a`, `I`, `1`), `labelSizePt`, `showTitle`, `title`, `marginMm`, `gapMm`. A panel whose graph is missing is emptied on opening, with a note. A layout needs an `id`. |

Every `id` in the file is a text. Identifiers are kept as they are on opening and saving, so a reference from one object to another stays valid.

## Data tables

The numbers of the project live in the data tables only.

```json
{
  "id": "table-1", "name": "Data 1", "kind": "column",
  "rowCount": 20,
  "rows":   [ { "id": "row-0", "title": "" } ],
  "groups": [ { "id": "group-0", "name": "Group A", "title": "", "paletteIndex": 0,
                "observations": [ { "id": "obs-0-0", "value": 1.1 } ] } ]
}
```

| Key | Meaning |
|---|---|
| `kind` | What the columns mean: `column`, `xy`, `grouped`, `contingency` or `survival`. |
| `layout` | `xy` and `grouped` tables: how a Y series is entered: `{"kind":"single"}`, `{"kind":"replicates","n":3}` or `{"kind":"summary","format":"mean-sd-n"}` (other formats: see `SummaryFormat`). The columns then come in blocks of that width after the first column. A layout that cannot be read (an `n` that is not a whole number of at least 2, an unknown `format`) refuses the file: reading it as single values would change what the columns mean. A missing `layout`, and `{"kind":"single"}`, are the same. |
| `rowCount` | The number of rows: a whole number, 0 or more. |
| `rows` | One entry per row, so exactly `rowCount` of them. `title` is free text. Left out, it is made with empty titles. |
| `groups` | The columns, in order. Each has a `name`, a `title` (free text under the name), a `paletteIndex` and its `observations`. XY and survival tables need the first column (X, or time). |
| `observations` | The values of a column, exactly `rowCount` of them, in row order: entry *i* belongs to `rows[i]`. |

An observation is `{ "id": …, "value": … }`. `value` is a number or `null`. `null` means missing: it is never zero. `NaN` and infinity cannot be stored. A value can be kept but left out of every chart and calculation with `"excluded": true` and an optional `"excludedReason"`.

The identifiers of groups must differ within a table, and those of observations must differ within a table.

## Charts

A chart draws one table, named by `dataTableId`; the table must exist. `type` is one of the chart types of `ChartType` (`bar`, `scatter`, `xyLine`, `survival`, …) and must suit the kind of table. A chart the table cannot give (a survival curve of a column table) is changed to the default chart of the table, and the file's notes say so.

| Group of keys | Meaning |
|---|---|
| `id`, `name`, `title`, `showTitle` | Identity and title. |
| `linkedTo` | Optional: the `id` of the graph this one was made like and still follows (see the README, Graph like another graph). A link to a missing graph, to itself or round in a circle is removed on opening, with a note. |
| `widthPx`, `heightPx` | Size in CSS pixels (96 px = 1 inch). |
| `xAxis`, `yAxis`, `y2Axis` | Settings of the axes: titles, limits, scale (linear, log), ticks, breaks, grid. `y2Axis` is drawn only while a data set is bound to it. |
| `legend`, `grid`, `frame`, colours, `fontFamily` | The look of the whole chart. `legend` may hold `order` (a list of data set ids: the order of the legend entries, without moving the marks; ids that do not exist are ignored) `columns` (2 to 6; absent means one), and `offsetXPt` and `offsetYPt` (the shift of the legend from its place in pt, right and down positive, within 1000; absent means 0). |
| `defaults`, `layers` | Styles of the data sets: see below. `layers` holds one layer, the one the graph is drawn from. A file with more is read with a note and only the first is kept; a file with none is refused. |
| `printWidthMm` | Optional. The width in mm the graph is meant to be printed at (20 to 400; clamped on reading, anything that is not a number is dropped). Absent means none, and it is not written then. Only the export dialog's warnings use it. |
| `lineConnect` | XY charts: `table` (default; the line joins the points in row order) or `x` (in ascending X, ties in row order). Only the order the line is joined in changes. |
| `bars`, `barLabels` (optional `inside`: `{ "position": "end" or "base", "show": "none", "n" or "value", "color": a colour or null }`, left out when it is the default: no label inside the bar), `distribution`, `heatmap` (its `summary` is `mean`, `median`, `geomean`, `sd`, `sem`, `cv` or `n`; its `palette` is one of the 16 gradient names `gsea`, `bs-blue`, …, `md-deep-purple`, or `custom`, which uses `customColours`: `{ "low": "#rrggbb", "mid": "#rrggbb" or null, "high": "#rrggbb" }` (with a `mid` the scale is diverging; an invalid `low` or `high` falls back to white or black, anything but a colour in `mid` becomes null); the earlier names `viridis`, `magma`, `blue`, `greenred` and `grayscale` are still read and become the nearest of these), `histogram`, `histogram`, `pie`, `survival`, `pairs`, `fit`, `jitter` | Settings that belong to one family of charts. They are always present. |
| `hiddenGroupIds`, `groupOrder`, `extraGroups`, `displayNames` | Which data sets are on the graph, in what order, from which other tables (`extraGroups`: `{ "tableId", "groupId", "slot" }`; `slot` is optional, a whole number 0 or more that keeps the colour of an added data set when another is removed; older files have none and use the order of the list), and under what names. An older file may hold `groupGaps` (a space before each data set): it is folded into `bars.gapPct` on opening and not written again. |
| `annotations`, `referenceLines` | Text and lines placed on the chart. |
| `layerStyles` | Look of single parts of a graph (layers) by layer ID, any of `color`, `widthPt`, `lineStyle`, `opacity`, `shape`. XY and survival charts: the line, error bars, points, individual values, fit curve and bands, area. Each kind of part takes only the settings that suit it. A setting that cannot be read is dropped, with a note. |
| `hiddenLayerIds` | IDs of the parts of a graph that are not drawn (for example `<series id>:fitBand`, `<series id>:errorBars`, `<reference line id>:referenceLine`). Hiding changes no calculation and no axis. |
| `rangeExcludedLayerIds` | IDs of parts of an XY chart whose values the axis range is not fitted to (points, individual values, error bars, fit curve). The part is still drawn. |
| `layerOrder` | IDs of the data parts of a graph from the lowest to the highest, once one was moved. Empty: the order of the chart type. IDs that are not parts of the graph are ignored; a part that is not listed goes above the part below it in the order of the chart type. |

### Styles

The look of one mark is found from the highest of these that sets it:

1. `layers[i].objectOverrides[objectId]`, the style of one value or mark;
2. `layers[i].groupOverrides[groupId]`, the style of one data set;
3. `layers[i].style`, the style of the layer;
4. `defaults`, the style of the chart, which always has every key.

A style is the keys of `ChartStyle`: bars, symbols, error bars, lines, point labels. The calculation choices (centre, spread, confidence level) are kept apart in `layers[i].summary`, with per data set changes in `groupSummary`.

### Units and colours

- **Lengths** whose key ends in `Pt` are in typographic points (72 pt = 1 inch, so 1 pt = 4/3 px): font sizes, line widths, symbol sizes, offsets. They are true points: a chart of the stated pixel size, exported, has text of that size.
- **Sizes of the chart** are in pixels (`widthPx`, `heightPx`).
- **Fractions** (`xFrac`, `yFrac` of an annotation, `widthFraction` of the jitter) are of the chart's width or height, or of a column's slot.
- **Colours** are `#rrggbb` (six hex digits). A colour that is `null` where the type allows it means "none" (a transparent background) or "automatic".
- **Percentages** have `Pct` in the key.

## What is checked on opening

A file is refused as a whole, and the project that was open stays as it was, when:

- its name does not end in `.oplot` (any case), or it is over 64 MB (checked before it is read);
- it is not UTF-8 text, or the text is not JSON;
- `format` or `version` is not the one above;
- the structure is damaged: the project, a table, a group, an observation, a chart, an analysis or a layout is not an object or lacks a required key; a value is not a finite number or `null`; there are no tables; two tables, charts, groups or observations of one table have the same `id`; a table has the wrong number of rows or observations; a chart refers to a table that does not exist or has no layer;
- something that would change what the figure or the numbers mean would have to be guessed: a replicate or summary layout of a table that cannot be read; two analyses with the same `id`, or one without an `id`, with an unknown `kind`, with a table that does not exist, with an unknown curve-fit model, or a curve fit of a table that is not XY; an entry of a graph's `extraGroups` that cannot be read, names a table or data set that does not exist, or is listed twice. The message names the place, for example `Invalid project file: project.analyses[1].id is duplicated.`, and the open project is not changed.

Only the look is repaired, never the meaning. A key whose value has the wrong type does not refuse the file. In a chart, its axes and its styles, a number must be a finite number, text must be text, a flag true or false, a list a list and a group of settings an object; a key that is not takes its default, and a note is shown in the status bar after opening. A key that may be empty (a limit, a colour, an ID) may also be `null`. Some numbers that are out of range (a font size, a line width, an offset, a pattern spacing) are brought to the nearest allowed value, also with a note. Annotations, reference lines and display names are checked one by one, and an entry that cannot be read is dropped, with a note. A confidence level of an analysis that cannot be read is set to 0.95, with a note, and a panel of a layout that names a graph that does not exist is emptied, with a note. Keys that are missing are filled with the defaults, without a note. Keys that the program does not know are kept in the chart and written again on saving, but not used.

Every note starts with the place of the value (for example `project.charts[2].heatmap.palette`). After opening, the status bar says how many values were changed and shows the first; the button Details lists all of them.

Nothing in a file is run, fetched or shown as HTML.

## The browser recovery copy

The autosave in the browser stores the same text as a file, under the key `octavaplot:project:autosave`, so any version can read it. Beside it, under `octavaplot:project:autosave:meta`, the browser keeps a small record that is not part of the `.oplot` file: `{ "writer", "rev", "savedAt", "hash" }` (the tab that wrote it, a counter, the time, and a hash of the text). A tab uses it to see that another tab has written the copy since it last read or wrote it. It then stops writing and offers three choices: keep this tab's copy, load the other tab's copy, or save this tab as a file. Older versions ignore the record.

## Not in the file

Calculated results (statistics, fitted curves, chart geometry), the selection and the open view, the undo history, the zoom, and the application settings.

## Privacy

The file is not encrypted. Row titles, data set names, values, annotations and the project name are written in the clear. Do not enter patient identifiers (the Business Associate Agreements in place cover Google Workspace and Microsoft 365 only, not this app; whether sample identifiers are acceptable has not been verified).

## Checking and changing the format

The tests in [src/state/serialize.test.ts](../src/state/serialize.test.ts) and [src/state/projectFile.test.ts](../src/state/projectFile.test.ts) cover reading, the checks above and the saving of one example, with UTF-8 text, annotations, styles and missing values. If the format is changed on purpose, delete `docs/example.oplot`, run the tests (they write it again) and read the difference.
