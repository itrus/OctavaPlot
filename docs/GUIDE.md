# OctavaPlot user guide

What the app does, by feature. The overview, the install steps and the project file are in the [README](../README.md); the saved format is in [FILE_FORMAT.md](FILE_FORMAT.md) and where the code is, in [ARCHITECTURE.md](ARCHITECTURE.md).

## Contents

1. [Tables and charts](#tables-and-charts)
2. [Chart reference](#chart-reference)
3. [Analyses (Results)](#analyses-results)
4. [Graph like another graph](#graph-like-another-graph)
5. [Layouts and export](#layouts-and-export)
6. [Editing and behaviour](#editing-and-behaviour)
7. [Calculation settings](#calculation-settings)
8. [Colour palettes](#colour-palettes)

## Tables and charts

### Table types and chart types

A table has a **type**, chosen when it is created (Navigator → New Data Table…); a graph is made from a table and has a **chart type** that suits that table (Navigator → New Graph…). The two steps are separate dialogs, so a chart type can never be paired with the wrong kind of table. The type of an existing table can be changed from the button with its name on the table's toolbar.

| Table type | Layout | Chart types |
|---|---|---|
| Column table | Each column is a group; the rows are its replicate values | Bar chart, Scatter dot plot (also aligned), Mean with error bars, Floating bars, Box and whiskers (also notched), Violin plot, Before and after (these can also run horizontally); Histogram, Cumulative distribution |
| XY table | First column is X (numbers); every other column is a Y series, or a Y with a size (bubbles) or with an error of Y and of X | Points only, Connecting line, Points and connecting line, Offset traces, Bubbles, Volcano plot, Bars at numeric X, Spikes, Area under the curve |
| Grouped table | Each row is a category; each block of columns is a series (single values, replicates, or values already calculated) | Interleaved bars and Interleaved scatter (also three-way or separated), Floating bars, Grouped box and violin, Stacked bars, Lines over categories, Forest plot, Heat map |
| Contingency table | Rows are categories (their row titles), columns are counts, so a column is one whole (one pie); for bars the rows are groups of subjects and the columns outcomes | Side-by-side bars, Stacked bars, 100% stacked bars, Pie charts, Doughnut charts, Slices, 10 × 10 dot plot |
| Survival table | First column is the time; each other column is a group holding 1 (event) or 0 (censored) on the row of each subject | Survival curve (Kaplan–Meier), Cumulative events |

**New Data Table…** opens one dialog: the table format along the top (XY, Column, Grouped, Contingency or Survival), whether to start empty or with sample data (the default follows Settings → General → "Start new tables with sample data"), and, for XY and grouped tables, how the Y values are entered:

- a single value;
- N replicates in side-by-side subcolumns (the chart plots their centre with SD, SEM, CI or range error bars). This is listed first and is the default;
- values already calculated elsewhere (mean with SD, SEM, %CV, ± error, or upper and lower limits, drawn as entered; the format is always shown beside its option);
- for XY only: a Y and a size for each point (bubbles), or a Y, an error of Y and an error of X.

A series with subcolumns is one block of columns under a shared series name; `src/model/table/tableLayout.ts` defines the layouts.

**New Graph…** shows a gallery for each table family (XY, Column, Grouped, Contingency, Survival), in tabs where a family has several kinds of graph (for example Column: Individual values, Box and violin, Mean/median & error), with a live preview drawn from the table's own data. The gallery has 57 entries (34 chart types, some offered as several presets); all of them can be made. It always shows every entry, and an entry planned but not built would be shown locked, with its thumbnail and preset ID. The catalogue is `src/model/graph/chartGallery.ts`; to make a planned graph available, give its entry a `type`. The chart types are catalogued in `src/model/graph/chartTypes.ts`: adding a chart type means adding it there, a preset in `defaults.ts`, and its drawing.

### What each chart type can do

The table below is generated from the capability registry (`src/model/graph/capabilities.ts`) and checked against it by a test, so it cannot drift from the code: a control that a drawing does not honour is not offered.

<!-- capabilities:start -->
| Chart type | Table | Horizontal | Reference lines | Right Y axis | Curve fit | Join by X | Survival options | Look per part | Keep out of range |
|---|---|---|---|---|---|---|---|---|---|
| Bar chart | Column | yes | Y | yes | – | – | – | yes | yes |
| Scatter dot plot | Column | yes | Y | yes | – | – | – | yes | yes |
| Mean with error bars | Column | yes | Y | yes | – | – | – | yes | yes |
| Box and whiskers | Column | yes | Y | – | – | – | – | – | yes |
| Floating bars (min to max) | Column | yes | Y | – | – | – | – | – | yes |
| Before and after | Column | yes | Y | – | – | – | – | yes | yes |
| Histogram | Column | – | X and Y | – | – | – | – | – | yes |
| Cumulative distribution | Column | – | X and Y | – | – | – | – | yes | yes |
| Violin plot | Column | yes | Y | – | – | – | – | – | yes |
| Points and connecting line | XY | – | X and Y | yes | yes | yes | – | yes | yes |
| Points only | XY | – | X and Y | yes | yes | yes | – | yes | yes |
| Connecting line | XY | – | X and Y | yes | yes | yes | – | yes | yes |
| Offset traces | XY | – | X and Y | – | yes | yes | – | yes | yes |
| Bubbles | XY | – | X and Y | yes | yes | – | – | yes | yes |
| Volcano plot | XY | – | X and Y | – | yes | – | – | yes | yes |
| Bars at numeric X | XY | – | X and Y | yes | yes | – | – | yes | yes |
| Spikes | XY | – | X and Y | yes | yes | – | – | yes | yes |
| Area under the curve | XY | – | X and Y | yes | yes | yes | – | yes | yes |
| Interleaved bars | Grouped | yes | Y | – | – | – | – | yes | yes |
| Stacked bars | Grouped | yes | Y | – | – | – | – | – | – |
| Floating bars (min to max) | Grouped | yes | Y | – | – | – | – | yes | yes |
| Grouped box and whiskers | Grouped | yes | Y | – | – | – | – | yes | yes |
| Grouped violin | Grouped | yes | Y | – | – | – | – | yes | yes |
| Heat map | Grouped | – | – | – | – | – | – | – | – |
| Lines over categories | Grouped | yes | Y | – | – | – | – | yes | yes |
| Pie charts | Contingency | – | – | – | – | – | – | – | – |
| Doughnut charts | Contingency | – | – | – | – | – | – | – | – |
| Slices | Contingency | – | – | – | – | – | – | – | – |
| 10 × 10 dot plot | Contingency | – | – | – | – | – | – | – | – |
| Side-by-side bars | Contingency | yes | Y | – | – | – | – | – | – |
| Stacked bars | Contingency | yes | Y | – | – | – | – | – | – |
| 100% stacked bars | Contingency | yes | Y | – | – | – | – | – | – |
| Survival curve | Survival | – | X and Y | – | – | – | yes | yes | – |
| Cumulative events | Survival | – | X and Y | – | – | – | yes | yes | – |
<!-- capabilities:end -->

### Factors

A **factor** names the second grouping level of a series of a grouped table: select its columns and choose **Factor…**. It changes no value or calculation, and is kept in the file and in CSV (as a "<Group> factor" column). Pairing is by table row: a before-and-after plot joins the values of each row. The graphs that use a factor:

| Graph | What the factor does |
|---|---|
| Three-way bars and dots (grouped table) | Series that share a factor are drawn together, with a wider gap between clusters and the factor written under them |
| Separated scatter (grouped table) | No role: each series gets its own group of columns, one for each category (the option "Group the columns by" Series) |

## Chart reference

### Distributions, columns and axes

**Box and whiskers** draw the quartiles (type 6 rule), the median and whiskers from the raw values. The whiskers end at the minimum and maximum, at the Tukey fences (the most extreme values inside Q1 − k·IQR and Q3 + k·IQR) or at a percentile pair (10–90, 5–95, 2.5–97.5, 1–99). Dots can show the values outside the whiskers or all of them; with fewer than 4 values only the range and the median are drawn. A **notched** box narrows at the median to median ± 1.58 × IQR / √n (its body is an outline, so a pattern fill does not apply; with few values a notch that would pass a quartile is cut there, which is noted).

**Violins** use a Gaussian kernel with bandwidth 0.9·min(SD, IQR/1.34)·n^(−1/5) times 0.5, 1 or 2 (light, medium, heavy) or a bandwidth you set. The ends are cut at the smallest and largest value or follow the tails, and the widths are scaled to equal maximum width, equal area or sample size. Values that are all equal, or fewer than 3, have no density and are shown as dots with a notice.

**Dot placement.** The dots of a scatter dot plot, a bar, box or violin chart can be Aligned, Jitter or Swarm. A swarm places the dots from the lowest up at the free place nearest the middle, so that none touches another and no height changes; the width setting is the widest it may be. Nested charts keep their own clusters and a paired plot keeps its dots on the line.

**Direction.** A column chart (bars, dots, means, boxes, violins) can run horizontally: Layout → Direction, or the "Horizontal" graphs of the New Graph gallery. The chart is built vertically in a "virtual" plotting region and turned a quarter by one SVG matrix (`Orientation` in `src/chart/column/columnModel.ts`); symbols and text stay upright. The numbers then run along the bottom with the value axis (Y) settings, and the data set names down the left. Horizontal column charts have no right axis and no point labels. Grouped and contingency bars (side by side, stacked, 100%) can run horizontally too.

**Columns.** Layout → Columns sets the space between columns, before the first and after the last (percent of a column's width; Auto is the usual layout) and where bars begin. Data Sets on Graph orders the data sets of a column chart. Labels above the bars (Annotations tab) show the plotted value or the sample size with decimals, thousands separator, prefix and suffix. A bar can carry a second label inside it, at its end or at its base (so n can sit in the base and the value beyond the end). Its colour is black or white by contrast with the bar as drawn (the pattern background for a patterned bar) unless one is chosen. A bar too small for the text gets no inside label and a warning that names the group. Column and side-by-side grouped bars only.

**Axes.** Each numeric axis has:

- a scale (linear, log 10, log 2, natural log; values of 0 or less are left out and counted), and reverse;
- major and minor ticks (direction and length; 2 to 9 times the power on a base 10 log axis), minor gridlines, and number format (automatic, decimal, scientific, decimals, thousands, prefix, suffix);
- the Frame section, which sets axis, plotting area and page colours (a transparent page gives a transparent PNG; Settings → Graphs → Page background chooses white or transparent for new graphs), a box frame, and the colour, thickness and pattern of the gridlines;
- Text, which sets font, text colour, bold, and the distances of titles and numbers from the axis.

Survival curves and stacked or percentage bars keep a plain linear axis.

**Axis origin, breaks and scale bars.** Frame → Origin moves the axis lines to a value of the other axis (the numbers stay at the edge). An axis can have up to two **breaks**: a range of values left out, with a gap and a mark on the axis; what is drawn across the gap is cut off by the clip, never joined. Breaks are for linear, not reversed axes (the left axis, and either axis of an XY chart). A hidden axis can have a **scale bar** instead: a bar one major interval long, with that interval written beside it.

### Bars, pies, histograms and heat maps

**Floating bars** run from the smallest to the largest value of a column, with a line at the mean or median (the summary setting); on a grouped table, from the smallest to the largest replicate of each series in each category. **Stacked bars** of a grouped table pile the series on each other, each as high as its own value; negative values pile downwards from the baseline; the parts have no error bars (an error of a part is not an error of the total). **Before and after** joins the values of each row across the columns; a row with a missing value breaks its line unless you choose to join across it, and no value is made up. Its dots take the colour of their column, and its lines a colour for each row (Plot → "Lines joining the rows" → Colour by: Row, or One colour). Grouped bars of replicates can show the individual values over the bars.

**Parts of a whole** (from a contingency table; a chart draws one column at a time, the first that is on the graph, or the one chosen under Parts → Column; the parts are its rows, named by their row titles, and percentages are shares of the column's total):

- **Pie and doughnut charts** make one pie of the column, the parts being its rows. Labels (name, count, percent), start angle, direction, hole and totals are in the Style section; the title of the pie (the column name) is above it. A column with a negative count, or counts that add up to zero, is not drawn and a notice says so. The sample table is one column with three categories.
- **Slices** draw one bar of the column, a segment as wide as each share, with its text under it (left out where it does not fit).
- **10 × 10 dot plot** draws 100 dots, circles or squares of a size you choose (Dot shape, Dot size), in a grid, filled row by row from the top left. Each share is exact: a dot on the border of two parts is cut between them by area, filled from the left. The legend names the parts.

**Histograms** put the values of each column into bins (automatic: about log2(n) + 1 bins of a round width; or a width you set), as counts, fractions, percents or densities of all the values, optionally cumulative; several data sets share the same bins. **Cumulative distributions** step up at each different value (ties are one jump), at-or-below or above, as a fraction, percent or count.

**Heat maps** colour the cells of a grouped table (the centre of replicates, or the entered value).

- **Scale.** One of 27 continuous gradients (GSEA, which is diverging; 11 Bootstrap 5 hues and 4 Material Design hues, all from ggsci; 6 Published gradients sampled from a Datawrapper article, approximate and running dark to light; and 5 named colour maps with 11 stops each, as supplied: Viridis, Cividis and Inferno (the viridis family) and the diverging ColorBrewer maps RdBu and BrBG; stops are joined in RGB; the Scale button opens a window with every gradient drawn as a bar, grouped by origin), or a Custom scale of two colours (low, high) or three (low, middle, high; with a middle colour the scale is diverging and uses the Centre value, as GSEA does). The inspector shows a preview strip and the colours at the ends, always editable; editing a gradient's colours turns it into Custom, starting from the colours on screen (a gradient with several stops keeps its two ends and loses the in-between shades). Files saved with the earlier scales open with the nearest new one.
- **Statistic.** The cell shows the mean, median, geometric mean, SD (n−1), SEM, %CV or the number of values of its replicates (SD and SEM need 2 values, the geometric mean needs all values above 0, %CV needs a mean that is not 0; a cell that cannot be calculated is drawn as missing and a warning says why). For a table of values already calculated, the entered mean, SD, SEM, %CV or N is shown as entered and nothing is derived from it. The colour bar is titled with the statistic and the normalisation unless it is the plain mean.
- **Normalisation.** Each row or column can be normalised (z-score, min-max or centred); a row without spread has no z-score and its cells are shown as missing.
- **Intervals.** The scale can be cut into 2 to 12 equal steps, or up to 11 edges you type (which win over the steps); each interval takes the scale colour at its middle and the colour bar shows the same intervals.
- **Marks.** Missing, excluded and out-of-range cells can each have a mark (none, slash, cross, outline), and excluded and out-of-range cells their own colour.
- **Layout.** Cell size, extra space after every n-th row or column, writing only every n-th label, and the colour bar (width, length, number of ticks, title). All of these default to the plain drawing.

### Survival curves

Survival curves use the product-limit estimate (events are counted before censoring at a tied time); censored subjects are marked on the curve. Options: a pointwise confidence band using the Greenwood standard error (log-log by default, or plain, at the level you choose), an at-risk table listing the subjects still under observation at each tick of the time axis, a symbol at every event, and error bars of one Greenwood standard error at each event time.

### Forest plots

A forest plot shows an estimate and its interval for each study, one row each. Make a grouped table with **Mean (or median), Upper/Lower limits** (the rows are the studies; the three columns are the estimate and its upper and lower limits), then **New Graph… → Grouped → Summary data → Forest plot** (or **Forest plot, ratios**). It is the chart of lines over categories turned on its side (Layout → Direction), with square markers, no joining line, no legend and a dashed reference line at no effect: 0 for differences, 1 for ratios on a log axis (the line and the axis are edited in the inspector like any other). **Nothing is calculated or pooled**: the estimates and limits are what you typed, every marker has the same size, and there are no weights.

To mark a pooled row, tick it under **Style → Summary rows**: it is then drawn as a diamond from its lower to its upper limit, centred on its estimate, with no bar (a row with no usable interval stays an ordinary marker, and a notice says so). The value axis is titled "Effect and interval" ("Ratio (log scale)" for ratios).

### XY features

XY charts have a symbol layer and a path layer for each series; the line joins the points in table order ("Connect points in: Ascending X" joins them by X instead, still breaking at a missing Y). The X axis is numeric with Auto or Manual limits, paths break at a missing value (never bridged, never zero), and the automatic range includes zero only when the data starts near it.

- **X error bars.** An XY table made with "Enter a Y, an error of Y and an error of X for each point" has three columns for each series; the X error (plus or minus) is drawn by the layer X error bars, with a colour, thickness and opacity, and can be kept out of the axis range. A negative X error draws no bar and is counted in a notice. X lower and upper limits are not built.
- **Oblique reference lines and equal units.** Reference lines can be the identity line or y = a + bx, cut to the plot and at the gaps of a broken axis. Equal units widens the axis with more room until one unit is as long on both (not on a log or broken axis).
- **Extra ticks and shaded regions.** Ticks at chosen values among the automatic ones (with text, mark and a gridline of their own), on XY charts and the value axis of bar, grouped, histogram and survival charts; bands between two values of an axis drawn behind the data (XY; not part of the axis range).
- **Right Y axis.** Each data set can be plotted on the left or right Y axis (bar, scatter and mean charts, and the XY charts Points only, Connecting line, Points and connecting line, Bubbles, Bars at numeric X, Spikes and Area under the curve; not offset traces, survival or histogram, and not a column chart turned horizontal). Inspector: Plot data on. The right axis has its own range, ticks, title, log scale, reversal, manual limits and gridlines (drawn dashed when the left grid is on); it cannot be broken. On an XY chart the legend marks a right-axis series "(right axis)" and the tooltip names the axis; reference lines, shaded regions, extra ticks and annotations anchored to data stay on the left axis, and equal units concern X and the left Y only. Notices appear when an axis is empty, hidden or untitled, or when connectors across axes are skipped.
- **Dates, times and durations** for the X column of an XY table (X type… in the data table; the CSV import suggests a type and never applies it). ISO 8601 only; times are shown in UTC; calendar ticks. Other columns and chart families do not have them; curve fits and equal units are not applied on a time axis. Rules: `docs/calculation-contracts.md`, section 17.
- **Bubbles** draw the area of a bubble in proportion to its size; the largest bubble has the symbol size. A size legend (reference circles under the plot) can be switched on under Style → Size legend.
- **Bars at numeric X** draw a bar from a baseline to Y at each X; several series stand side by side.
- **Offset traces** lift trace i by i times an offset (blank = automatic), written on the figure. The table is never changed.
- **Volcano plot.** An XY table of one Y: X is the log2 fold change, Y the p-value (or its −log10), the row titles the names. A p-value outside (0, 1] is not drawn and is counted. Points past both thresholds are up (red) or down (blue), the others grey; the three threshold lines are ordinary reference lines that follow the thresholds until deleted; the up and down points can carry their row titles.
- **Large graphs.** Above 100 000 dots the preview of a column-family graph draws the dots in simplified form (a note says so); the export draws every dot.

### Fitted curves

A curve fit is an analysis in the Results section. On an XY table, **Fit curve…** (or New Analysis → Curve fit) adds one and opens it. Choose the model there: straight line, polynomial (degree 2 to 6), one- and two-phase exponential, Gaussian peak, hyperbola, and 4- and 5-parameter logistic. The sheet lists, for each Y series, the equation, the number of points and degrees of freedom, R squared, the sum of squares, Sy.x, and each parameter with its standard error and confidence limits; a fit that cannot be made says why under Notes. Every replicate is a point of the fit. The cells can be selected and copied like those of a data table. Fits run in a Web Worker, so a long fit does not block the screen ("Fitting the curve…").

A graph draws a curve fit by choosing it under Format graph → Fitted curve (or with **Make graph** in the Results): the curve, an optional confidence or prediction band at the level of the fit, the whole X axis, and the parameters written on the graph. A curve fit gives no errors or bands when the fit did not converge; the Results are copied at full precision. Tables, graphs and analyses are renamed by double-clicking them in the navigator (or F2).

### Annotations and text

**Shapes and lines** (Graphics on the toolbar of a graph and of a page layout) draw on top of the chart or the page, under the texts. A comparison is marked with one of the brackets with a text (quick texts ns, * to **** and # to ####): nothing is calculated, the result is yours, from your own test. The menu has three groups of eleven: shapes (circle, ellipse, arc, square, rectangle, rounded rectangle, bent lines and bent arrows), lines (line, arrow, double arrow, end caps, brackets open down, up or to either side) and the same lines with a text at the middle ("ns" to start with). Choose one and drag where it goes; a click places it at its own size. A selected object has a handle at each end: drag the object to move it, a handle to move that end; the arrow keys move the selected objects (Shift 5%, Alt 0.1%) and Delete removes them; Ctrl or Shift adds an object to the selection. **Copy and paste:** Ctrl+C copies the selected texts or shapes, Ctrl+X cuts them, and Ctrl+V pastes them on the same graph, on another graph or on a page layout, 2% to the right and down (4% the next time the same copy is pasted), selected. A text or shape anchored to values stays anchored on a graph and is placed where it was drawn on a page, which has no axes. The copy is JSON text on the clipboard, so it also works between tabs; a plain text from elsewhere pastes as a new text. Settings (Notes): the text (quick texts, bold, italic, font, colour, size, above or below the line, distance), the line (pattern, colour, opacity, width), the ends of a line (arrowhead, bar, tick to either side, their size) and its route (straight, or bent once), the corners of a rectangle, the fill of a closed shape, and on a graph with axes the anchor: on the page, or at values on the axes so that the object follows the axis range (a point outside the range leaves it out, with a notice). Arrowheads and ticks are drawn as shapes, so the SVG, PNG and PDF exports show them as on screen.

**Rich text.** The text of a graph (titles, axis titles, names, legend, annotations, labels, texts of shapes) can hold subscripts, superscripts and Greek letters, written as plain text: `H_{2}O` gives H₂O, `m^{-2}` gives m⁻², `\mu mol/L` gives μ mol/L.

- Greek and symbols by name: `\alpha` … `\omega`, `\Gamma \Delta \Theta \Lambda \Xi \Pi \Sigma \Upsilon \Phi \Psi \Omega`, `\pm \times \cdot \deg \leq \geq \neq \approx \infty`; `{}` ends a name so a letter can follow (`\mu{}m`); `\_ \^ \\ \{ \}` write the character itself.
- **The braces are required**, so that names such as `Mouse_3` or `Run_2` are never changed. Text without a backslash, `_{` or `^{` is written exactly as typed, and what is not understood is kept as typed. Scripts do not nest. Typing the Greek letter directly works too.
- On the page of a layout the title and the panel labels use it too, and the export checks the glyphs of each font used on the page. The Results sheets and CSV files keep what you typed.

**Results in text.** An annotation, a reference line label or the text of a shape can hold `{{mean Control}}`, `{{n Drug A}}` or `{{sd Control|2}}` (n, sum, mean, sd, sem, median, min, max; `|2` is the decimals). They are filled when the graph is drawn and follow the data; excluded values are left out; a token that cannot be filled stays as typed and the chart warns. A reference line can also be drawn at a result (Value from). Not in titles, axis titles or the legend.

**Row titles and point labels.** The data table has an optional Row title column (undoable, copy and paste aware). Labels can be drawn on each point from the row title or the value, with placement, collision handling (keep, hide, repel), a leader line, colour, size and decimals. Labels that cannot be placed are listed in the inspector. A point can override the data set label settings (Selected point box). A point label of a column chart can be dragged.

**Text annotations.** The graph's toolbar has two tools: **Select** (V), which selects whatever is clicked (a data set, a point, a label, the title, the legend, an axis, a text, a shape) and opens its settings, and drags what can be dragged; and **Text** (T; Escape cancels), which places a new text where the graph is clicked, opens it under Notes and puts the cursor in its text box. Notes → "+ Add text annotation" does the same at a fixed place. A text has:

- its text (several lines; sub- and superscripts as markup, see Rich text) and quick texts `ns`, `*`, `**`, `***`, `****`;
- Style: bold, italic and underline (of the whole text), superscript and subscript (of the selected letters, or a new one at the cursor), and Undo and Redo;
- font family (or the graph's font), text colour and opacity, font size (with Larger and Smaller buttons that step through the usual sizes), alignment of its lines (left, centre, right) and line spacing;
- its anchor and place: on the page, or (XY, survival and histogram: X and Y; column and grouped charts: the value axis) at values on the axes; it is moved with the mouse or the arrow keys.

A new text is as large as the numbers of the axes, in the graph's text colour.

### Look and order

- **Symbols:** 28 shapes: circle, square, triangle (up, down, left and right), diamond, hexagon, pentagon, octagon, star, the four half circles, a vertical and a horizontal bar, the marks plus, cross, asterisk and hash, a circle with a dot, a plus or a cross inside, a square with a dot, a plus or a cross inside, and a hexagon with a dot. The inside has its own opacity (Fill opacity: 1 solid, 0 hollow, in between see-through) while the border stays opaque, so hollow symbols are drawn with the border colour and thickness. In XY charts of replicates the symbols show either the centre of each row or every replicate, never both (Symbols box → "Symbols show").
- **Line patterns:** lines (XY, grouped, survival, cumulative distribution and fitted curves) and gridlines can be solid, long dashes, dashes, dots, dash-dot or dash-dot-dot. The dashes scale with the line width, so a thick dotted line keeps its look.
- **Fill patterns:** bars can be solid, patterned or unfilled (the last only from a file). Patterns: horizontal, vertical, diagonal up, diagonal down, crosshatch, diagonal crosshatch, dots. In pattern mode the bar fill colour is ignored and the pattern background is used (P). Limits (P): spacing 2 to 100 pt, line width or dot diameter 0.2 to 10 pt, and the spacing is never below the mark width. At most 20 000 marks (`MAX_PATTERN_MARKS`) are drawn per bar; beyond that a warning is shown. Opacity applies to the pattern and its background, not to the border. Legend keys use the same pattern.
- **Legend:** has its own order of entries (Top, Up, Down, Bottom, Reverse, Reset order) that never moves the marks, a number of columns (1 to 6) and a numeric offset. "Graph like another graph" copies the number of columns but not the order. Keys follow the look of the layers of their series.
- **Colours stay with their data set:** removing a data set or a series does not move the colours of the others, in every graph (a new one takes the next colour); the same for hiding and reordering.
- **Order of objects:** the series of XY, grouped, contingency and survival graphs can be put in another order (Data Sets on Graph: first to last, Top / Up / Down / Bottom / Reverse); the last is drawn on top, and each series keeps its colour. Under Layout, "Lines and error bars go" chooses whether lines and error bars are drawn over the symbols and bars (On top), behind them (Underneath), or as the chart type usually does (Auto).
- **Layers:** every chart is drawn from layers, which can be hidden, reordered, kept out of the axis range and, where the table above says so, given a look of their own.

## Analyses (Results)

**Results → New Analysis…** adds an analysis of a column, XY or grouped table (counts and event flags have no descriptive statistics).

**Descriptive statistics** gives, for every column (each sub-column on its own): the number of values, minimum, quartiles, median, maximum and range, the 10% and 90% percentiles, the exact confidence interval of the median with the coverage it actually reaches, mean, SD, SEM, the t interval of the mean, coefficient of variation, geometric mean, SD factor and interval, skewness, kurtosis and sum. The confidence level (90, 95 or 99%) is a setting of the analysis. Results are never stored: they are recalculated from the table each time, so they follow the data. A statistic that cannot be calculated (too few values, or a geometric mean of values that are not all positive) is left empty. Export CSV and Copy are on the toolbar.

**Survival summary** (for a survival table) gives, for each group, the number of subjects, events and censored, the **median survival time** (the first time at which the Kaplan–Meier estimate is 0.5 or below, the estimate the survival chart draws; "Not reached" when the curve never gets there) and how many entries were left out (neither 1 nor 0, or no valid time). No interval is given for the median, since the contracts name no method for one. The median is shown here and not on the graph.

**Curve fits** are described under [Fitted curves](#fitted-curves).

## Graph like another graph

**New Graph… → Like an existing graph** makes a graph of any table that takes its format from a graph you choose, with a live preview.

- **What is taken.** For a table of the same type: the chart type and its options, the size, fonts, colours, frame, grid, axis look, legend, and the style of each data set, matched by position (the third data set of the source styles the third of the new table). For a table of another type: only the general format (size, fonts, colours, frame, grid, axis look, legend).
- **What is never taken.** The data, the title and axis titles, axis ranges, breaks and scales, reference lines, annotations, hidden data sets, the fitted curve and the styles of single values.
- **Linking.** By default the new graph is **linked** to the one it was made like (🔗 in the navigator; **Unlink** on the graph's toolbar, or untick the box in the dialog). A linked graph follows later changes to the source's format in every detail it has not changed itself: if you set the font size on the linked graph, that size stays its own and the other details keep following. Setting a detail back to what the source has makes it follow again. Nothing is recorded about what you changed: each setting is compared with the source's value before and after the edit, and the linked graph takes the new value only if it still had the old one. The change and what follows from it are one undo step. Without the link the two graphs share nothing.

## Layouts and export

### Layouts

**Layouts → New Layout…** makes an A4 page of graphs (portrait, 210 × 297 mm, or landscape, 297 × 210 mm): a standard arrangement (one graph, a graph with an inset, two or three graphs side by side on a landscape page or one above the other on a portrait page, or 2 × 2) or an array of up to 6 × 6, with placeholders or filled with the graphs of the project. The graph in each panel is chosen in the inspector (pages Page, Panels, Graphs, Legend and Export; the arrangement is chosen from thumbnails, as in New Layout); choosing a graph that is already on the page swaps the two. Deleting a graph empties its panel.

- **Size of the graphs** keeps the sizes harmonised. The scaling factor of a graph is its size on the page / its size in Graphs. *Match the smallest* gives every graph the smallest factor that any panel needs, so every graph fits; *Match the largest* gives every graph the largest, so fonts and lines match but graphs that need more room are cut off (with a warning); *Fill each panel* lets each graph have its own factor; *Set to a percentage* sets one factor.
- **Aligned axes.** In a grid, the plots of a column start and end at the same left and right, and the plots of a row at the same top and bottom, whatever room each graph needs for its numbers, titles and legend: a graph that needs less room gets a smaller plot, and its titles and legend stay at its edges. Graphs of a column of different widths are put at one x, those of a row at one y. Pies and heat maps keep their place and are not lined up; insets and free placement are not lined up. Nothing is saved: the page works it out each time it is drawn.
- **Panels** are lettered A B C, a b c, I II III or 1 2 3 (or not). The page has a margin, a space between panels, an optional title and a colour (or none).
- **Free placement** (Arrangement → Free placement) turns the panels into boxes that are dragged to move and by a corner to resize, or typed in mm; panels can be added (up to 12) and removed, and each graph is drawn centred in its box with its proportions kept.
- **Texts on the page.** The layout's toolbar has the same Select and Text tools as a graph: Text places a text where the page is clicked and opens it under Notes (the layout's inspector page for texts). A page text has the same settings as a graph's text (style, scripts, quick texts, font, colour, size, alignment, line spacing); it is dragged on the page, and Delete removes the selected one. It is drawn on top of the graphs in the preview and in every export. A new page text is 12 pt black.
- **Master legend** (Legend of the page: at the bottom or on the right, a text size, and an option to hide the graphs' own legends) is made from the legends of the graphs, merging entries that have the same name and look. It takes a band from the panel area; with free placement the band is reserved but the boxes are not moved out of it.

### Export

| Format | What it is |
|---|---|
| SVG | Vector, with a title, a description and ids that cannot collide with another export. The font is named, not embedded. |
| PDF | Vector: paths and text, written from the same SVG (`src/chart/export/svgPdf.ts` reads the SVG, `src/chart/export/pdf.ts` writes the file, without a library). Text is in the standard fonts Helvetica, Times and Courier (Symbol for Greek letters and signs), the nearest to the font of the graph, not embedded; a character none of them has is written as "?" and the status line says which. A transparent page is white. No resolution. |
| PNG, a graph | At its own size: one pixel for each pixel on screen, 96 dpi written into the file. There is no resolution to choose; for a sharper graph use SVG or PDF. |
| PNG, a layout page | At a resolution of 300, 600 or 1200 dpi (300 by default), set in Settings → Export and in the layout's Export page, and written into the file. 1200 dpi takes a few seconds. |

- **Export page of a graph.** The Export icon of the inspector opens a page with the format tiles (PNG, SVG, PDF), a wide Export button that names the file (the name of the graph, with the date and time when Settings → "Date and time in file names" is on), and a report: size (px, pt, mm), the fonts the drawing asks for and whether the browser has them (diagnosed only; fonts are not embedded), characters, the warnings of the chart, the known limits (a PDF uses the standard fonts; an SVG does not carry its fonts), and Copy report (JSON). A page layout has the same page in its inspector; for a PNG its size is in pixels at the chosen resolution, for SVG and PDF it reads `A4 · 210 × 297 mm`.
- **Batch export.** In the Graphs folder, **Export N…** writes the selected graphs as one ZIP of SVG, PNG or PDF files (names get date stamps and `_2`-style numbers), all read from one state of the project.
- Only one export runs at a time.

## Editing and behaviour

- **Interface.** The top bar has the logo, name, version and build number, the project name and the save state ("All changes saved"); under it a menu bar: File (new, open, save, Export figure or layout, Settings), Edit (Undo, Redo, Duplicate, Rename, Highlight (a colour for the name of the table, graph, result or layout in the navigator, to find it again; None clears it), Delete, new table, CSV import and export), View (the two panels), Analyze, Format (the pages of the inspector) and Help (GitHub, About; the About window also opens at start unless "Don't show at start" is ticked in it or in Settings; its R tab shows whether the R server answers); Undo and Redo are also icon buttons on the toolbar of each view. The navigator lists tables, graphs, results and layouts in folders; the inspector at the right has an icon rail with the pages Graph (size, layout, frame, titles), Plot (data sets and their look), Axes, Legend, Analysis (summary, calculation options, distribution, fits and the confidence band of a survival curve), Notes (texts, shapes, guides, labels) and Export. A page a graph has no settings for is left out (a pie has no Axes). A click on the chart opens the page of what was clicked. The graph type is a menu at the left of the graph toolbar. The inspector remembers, for each graph and for the session, its page, tab, scroll and opened sections.
- **Selecting several.** Ctrl, Cmd or Shift selects several data sets, points (column charts) or annotations (with the keyboard, Shift with Left and Right adds data sets), and the inspector shows "Mixed" where they differ. The arrow keys reach the annotations after the axes (Page Down and Page Up step between them).
- **Settings** (one page): don't show About at start; Autosave; start new tables with sample data; decimal separator; default width and height of new graphs and their page background; date and time in file names; default export format; default layout PNG resolution. They are stored in the browser, not in the project.
- **Missing values.** An empty cell is a missing value (never zero). Non-numeric input is rejected with a message; a paste containing any non-numeric cell is rejected whole. A pasted block with rows of different lengths is padded with missing values. Pasting beyond the table adds rows, and extra columns add new groups.
- **Small samples.** n = 1: SD and SEM are undefined, no error bar, a warning is shown. n = 0: no mean is drawn.
- **Defaults.** "All groups" edits clear conflicting per-group overrides of the same property. Switching graph type changes only the visibility presets (bars, symbols, lines, mean line); data, colours and axis settings are kept. Values display as stored (typed `1.10` shows `1.1`).
- **Undo and redo** cover data and formatting (Ctrl+Z and Ctrl+Y when not typing in a text field). Tables, graphs and results can be duplicated and deleted from the navigator (deleting a table takes its graphs and results with it); both can be undone.
- **Saving.** Ctrl or Cmd+S saves the project. Autosave goes to `localStorage`; a failed autosave is shown in the status bar and retried, and the copy found at start-up is kept as a backup.
- **Decimal separator.** Settings → General → Decimal separator (point, comma or automatic) decides how numbers are read, shown, edited, copied and exported to CSV, so what is written reads back as the same number. There is no thousands separator: it is neither read nor written, so `1.234` is the decimal 1.234, never 1234, and `1.234,5` is refused. Point and comma are strict (the other character is refused); automatic reads either, writes points, and refuses `1,234` as ambiguous. In comma mode CSV files are semicolon-separated.
- **CSV and factors.** A CSV file also carries the factors: after the first column of a series with a factor comes "<Group> factor" (and the exclusion columns, when asked for); reading the file back restores them. A "<Group> subject" column from an older export is recognised and left out, with a note.

## Calculation settings

Summary settings (centre, spread, confidence level, small-sample policy, invalid-value policy) are calculation settings, stored in `summary` and `groupSummary`, not in the style hierarchy. Appearance (colour, cap, direction) stays in style.

Evidence labels in the documents: **D** = stated in a public source (see `docs/calculation-contracts.md`); **P** = proposal made here because no source gives a value; **U** = unverified.

- **Centre:** mean, geometric mean, median. **Spread:** none, SD (n−1), SEM, CI, range, IQR, GSD. Not every spread is allowed for every centre; a stored spread that is not allowed is not drawn and the inspector shows the reason. SD is the default spread of a new Bar chart and Mean with error bars.
- **Mean CI** uses the t distribution with n−1 degrees of freedom. The default confidence level is 0.95 (P).
- **Median CI** is exact, from binomial order statistics, for n ≤ 20 000 (`MEDIAN_CI_EXACT_MAX_N`). Its coverage is at least the requested level and is usually higher; for n = 5 and n = 6 the interval is the widest available (smallest to largest value) and its actual coverage is reported, not the nominal level. Above 20 000 the interval is unavailable and a notice says so.
- **Missing and invalid values.** Missing cells are never counted. Invalid values are left out or reject the data set, per the invalid-value policy. The "Hide summary when too few values" option maps to the reject policy for small samples (P).

## Colour palettes

The **Colour palette** field (Plot) opens a window with every palette: point at one to see its colours, group, source and colour-blind note, click it to apply it to the data sets in order. "Colourblind friendly for the first N colours" is measured by simulation (Machado et al., 2009), not claimed from the name of a palette.

| Group | Palettes | Source |
|---|---|---|
| Journals | Science (AAAS, the default), Nature (NPG), New England Journal of Medicine, The Lancet, JAMA, BMJ, Journal of Clinical Oncology | ggsci |
| Software and design systems | D3 (category10 and category20), Gephi, Observable, Primer, Atlassian, iTerm, IGV (the genome browser) | ggsci |
| Published styles | 37 palettes named after the organisation whose style guide they follow, one per variant (for example "Economist-style", "Economist-style, blue shades", "Eurofound-style, extended order · 1–12"): YouGov, Eurostat, Economist, Financial Times, New America, The Times, Quartz, McKinsey, Eurofound, Mailchimp, NPR, Bloomberg, NZZ, CFPB, Urban Institute, OHA, New York Times, Dallas Morning News, Cato | Datawrapper article |
| Other | Vibrant, Pastel, Colourblind-friendly, Monochrome, Black and White (the app's own earlier palettes, kept so that saved charts still open), Retro, Warm and cool | the app; Okabe & Ito (2008) |

**Sources.** The first two groups are from the **ggsci** R package (Xiao N. *ggsci: Scientific Journal and Sci-Fi Themed Color Palettes for ggplot2*; <https://nanx.me/ggsci/>, <https://github.com/nanxstats/ggsci>; descriptions follow <https://nanx.me/ggsci/articles/ggsci.html>). The Published styles, and the six Published heat-map gradients, are collected from the Datawrapper article of 30 March 2022 <https://www.datawrapper.de/blog/colors-for-data-vis-style-guides> (the title in the app is taken from the address and marked not verified) and the guides it cites. A value printed as HEX in a guide is exact; one read from an image is approximate, and each description says which. The names say whose guide a palette follows, not that the organisation issued or endorses it.

More notes on single palettes are in [docs/ARCHITECTURE.md](ARCHITECTURE.md#notes-on-the-colour-palettes).

