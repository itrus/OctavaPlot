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

The file is written with two-space indents and the keys in a fixed order, so saving a project that has not changed gives the same text. A complete small file is [tests/fixtures/example.oplot](../tests/fixtures/example.oplot).

## Project

| Key | Type | Meaning |
|---|---|---|
| `id` | text | Identifier of the project. |
| `name` | text | Name of the project; the suggested file name when saving. |
| `dataTables` | list | The data tables; at least one. |
| `charts` | list | The graphs. May be empty. |
| `analyses` | list, optional | Analyses of the Results section (descriptive statistics, curve fits): their settings only. Results are not stored; they are calculated again from the tables. |
| `layouts` | list, optional | A4 pages of graphs: `orientation` (`portrait` or `landscape`), `background` (`#rrggbb` or `null`), `arrangement` (`{"kind":"grid","cols":2,"rows":1}`, `{"kind":"inset"}`, or `{"kind":"free","frames":[{"x":10,"y":10,"w":120,"h":90}]}` with the boxes in mm from the top left of the page), `panels` (the graph `id` in each slot, or `null`), `scaling` (`smallest`, `largest`, `fit`, or `percent` with a number; `equal`, the earlier name of `smallest`, is still read), `labelStyle` (`none`, `A`, `a`, `I`, `1`), `labelSizePt`, `showTitle`, `title`, `marginMm`, `gapMm`. A panel whose graph is missing is emptied on opening. |

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
| `layout` | `xy` and `grouped` tables: how a Y series is entered: `{"kind":"single"}`, `{"kind":"replicates","n":3}` or `{"kind":"summary","format":"mean-sd-n"}` (other formats: see `SummaryFormat`). The columns then come in blocks of that width after the first column. |
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
| `legend`, `grid`, `frame`, colours, `fontFamily` | The look of the whole chart. |
| `defaults`, `layers` | Styles of the data sets: see below. `layers` has at least one layer. |
| `bars`, `barLabels`, `distribution`, `heatmap`, `histogram`, `pie`, `survival`, `pairs`, `fit`, `jitter` | Settings that belong to one family of charts. They are always present. |
| `hiddenGroupIds`, `groupOrder`, `extraGroups`, `displayNames` | Which data sets are on the graph, in what order, from which other tables, and under what names. An older file may hold `groupGaps` (a space before each data set): it is folded into `bars.gapPct` on opening and not written again. |
| `annotations`, `referenceLines` | Text and lines placed on the chart. |
| `layerStyles` | Look of single layers by layer ID: `color`, `widthPt`, `lineStyle`, `opacity`, any of them. Used by the fit curve and the fit band. A setting that cannot be read is dropped, with a note. |
| `hiddenLayerIds` | IDs of the parts of an XY chart that are not drawn (for example `<series id>:fitBand`). Hiding changes no calculation. |

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
- the structure is damaged: the project, a table, a group, an observation or a chart is not an object or lacks a required key; a value is not a finite number or `null`; there are no tables; two tables, charts, groups or observations of one table have the same `id`; a table has the wrong number of rows or observations; a chart refers to a table that does not exist or has no layer.

A key whose value has the wrong type does not refuse the file. In a chart, its axes and its styles, a number must be a finite number, text must be text, a flag true or false, a list a list and a group of settings an object; a key that is not takes its default, and a note is shown in the status bar after opening. A key that may be empty (a limit, a colour, an ID) may also be `null`. Some numbers that are out of range (a font size, a line width, an offset, a pattern spacing) are brought to the nearest allowed value, also with a note. Annotations, reference lines and display names are checked one by one, and an entry that cannot be read is dropped, with a note. Keys that are missing are filled with the defaults, without a note. Keys that the program does not know are kept in the chart and written again on saving, but not used.

Nothing in a file is run, fetched or shown as HTML.

## Not in the file

Calculated results (statistics, fitted curves, chart geometry), the selection and the open view, the undo history, the zoom, and the application settings.

## Privacy

The file is not encrypted. Row titles, data set names, values, annotations and the project name are written in the clear. Do not enter patient identifiers (the Business Associate Agreements in place cover Google Workspace and Microsoft 365 only, not this app; whether sample identifiers are acceptable has not been verified).

## Checking and changing the format

The tests in [src/state/serialize.test.ts](../src/state/serialize.test.ts) and [src/state/projectFile.test.ts](../src/state/projectFile.test.ts) cover reading, the checks above and the saving of one example, with UTF-8 text, annotations, styles and missing values. If the format is changed on purpose, delete `tests/fixtures/example.oplot`, run the tests (they write it again) and read the difference.
