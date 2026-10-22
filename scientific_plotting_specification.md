# Scientific Plotting Package: Functional and Visual Specification

**Document revision:** 0.1  
**Research date:** 16 October 2026  
**Target:** a Rust-based website for editing and rendering one scientific chart  
**Status:** implementation specification; not a statement that the software has been implemented or visually validated

## Contents

1. [Scope and interpretation](#1-scope-and-interpretation)
2. [Chart model and inspector](#2-chart-model-and-inspector)
3. [Chart and preset catalogue](#3-chart-and-preset-catalogue)
4. [Applicability matrices](#4-applicability-matrices)
5. [Common graphical properties](#5-common-graphical-properties)
6. [Axes, scales, ticks, and grids](#6-axes-scales-ticks-and-grids)
7. [Symbols, paths, areas, and numeric-X bars](#7-symbols-paths-areas-and-numeric-x-bars)
8. [Categorical, grouped, nested, and count displays](#8-categorical-grouped-nested-and-count-displays)
9. [Summaries, error bars, and uncertainty bands](#9-summaries-error-bars-and-uncertainty-bands)
10. [Box plots and violins](#10-box-plots-and-violins)
11. [Histograms, cumulative distributions, and smooth curves](#11-histograms-cumulative-distributions-and-smooth-curves)
12. [Variable-driven symbols and vectors](#12-variable-driven-symbols-and-vectors)
13. [Matrix heatmaps](#13-matrix-heatmaps)
14. [Parts-of-whole charts](#14-parts-of-whole-charts)
15. [Survival and cumulative-event curves](#15-survival-and-cumulative-event-curves)
16. [ROC curves](#16-roc-curves)
17. [Fitted and generated curves](#17-fitted-and-generated-curves)
18. [Specialised chart recipes](#18-specialised-chart-recipes)
19. [Labels, legends, and annotations](#19-labels-legends-and-annotations)
20. [Initial visual theme](#20-initial-visual-theme)
21. [Rust implementation contracts](#21-rust-implementation-contracts)
22. [Acceptance tests](#22-acceptance-tests)
23. [Evidence gaps and fidelity work](#23-evidence-gaps-and-fidelity-work)
24. [Source register](#24-source-register)

## 1. Scope and interpretation

### 1.1 Product boundary

The product edits **one chart with one plotting region**. That chart can contain many series, compatible graphical layers, annotations, and legends. Two value axes are permitted. A legend or text annotation is not another chart.

The package must support the chart families and graphical controls below. It must also perform the **calculations needed to construct those charts**: summaries and error bars, quartiles, density estimation, frequency distributions, cumulative distributions, survival estimates, ROC coordinates, curve generation and fitting, and the bounded annotation calculations specified here.

These calculations belong to the relevant chart layer. There is no separate analysis workspace, analysis-sheet tree, general-purpose statistical reporting system, or automatic test-selection workflow. A calculation appears in the inspector because a plotted object needs it. Calculated values may be shown as chart labels or as explanatory read-only inspector information.

Out of scope: multi-panel figures; multi-chart documents; external application integrations; email or office-document workflows; project-file compatibility; export-management workflows; statistical model comparison; power calculations; clustering; general multivariate modelling; unrestricted hypothesis-testing pipelines. There is no requirement to implement 3D scenes, maps, network diagrams, Sankey diagrams, or polar/radar charts in this specification.

### 1.2 Evidence and defaults

Three labels distinguish evidence from product decisions:

| Label | Meaning |
|---|---|
| **D** | A capability or numerical rule is explicitly described by a cited public source. |
| **P** | A proposed requirement, interaction, algorithm, or default for this new package. It is not asserted to be an externally verified default. |
| **U** | A fidelity detail remains unverified. Its proposed implementation is stated rather than guessed. |

**Every default in a property table is P unless explicitly marked D.** Source notes establish capabilities; they do not imply that every detail of the new inspector or every proposed numeric limit is externally documented. Limits identified as validation limits are product choices, not claims about another implementation.

"Must" defines the required behaviour of this specification. "May" marks an extension. The document is a broad, source-backed functional inventory, not a proof that every undocumented menu item or platform-specific rendering detail has been recovered.

### 1.3 Core distinctions

A **preset** configures compatible layers. A **geometry** draws an object. A **calculation** produces values used by a geometry. A **theme** assigns visual defaults. These are separate concepts.

For example, a mean-and-error line chart consists of a summary calculation, a symbol layer, a path layer, and an error-bar or band layer. Switching the path off must not erase the summary or the uncertainty values. A bar, line, and violin may share a value axis without acquiring each other's inappropriate controls.

A chart type is not tied to a particular table-shaped user interface. Numeric X coordinates, category positions, nesting, and observation matching are explicit data roles. Numeric-looking category labels must never silently become numeric coordinates. [S01], [S02]

## 2. Chart model and inspector

### 2.1 Persistent chart objects

| Object | Required responsibilities |
|---|---|
| Chart | Preset, orientation, dimensions, theme, background, title, layer order, and validation state. |
| Data binding | Fields, units, groups, subject IDs, missing/excluded flags, observation order, and input mode. |
| Layer | Geometry, calculation reference, data selection, axis binding, styling, visibility, and overrides. |
| Scale/axis | Domain, transform, ticks, labels, title, line, grids, and optional discontinuities. |
| Legend | Bound encoding, entries, ordering, appearance, position, and live/custom text. |
| Annotation | Geometry/text, anchors, coordinates, styles, and optional calculated value binding. |
| Theme | Shared visual tokens and categorical encodings; never the observations themselves. |

Each series, observation, group, annotation, and layer must have a stable internal identifier. Reordering data must not move a custom point style to a different observation.

### 2.2 Inspector organisation

There is one persistent inspector. Its sections are **Chart**, **Data**, **Layers**, **Axes**, **Legends**, **Annotations**, **Theme**, and **Validation**. Sections expand inline. Selecting a point, axis, legend, band, or label focuses the corresponding controls. Chart selection restores chart-level controls.

No setting may require a separate modal formatting window. Inline colour pickers, font selectors, formula editors, group lists, and expandable advanced sections are permitted. A property-search field locates settings by user-facing label and stable property ID.

Selection scope must be explicit: chart, selected layers, series, groups, or individual objects. Multi-selection displays a mixed state where values differ. Editing one mixed field changes only that field. Reset operations offer **reset selected properties**, **clear object overrides**, and **reset layer to theme**; these are different operations.

Irrelevant controls are hidden. Potentially applicable controls whose prerequisites are missing remain disabled with a short reason, for example: "A band needs an ordered curve and lower/upper limits." Search results can reveal such disabled controls without making invalid configurations possible.

Changes preview immediately. Undo/redo treats one completed interaction as one transaction. Invalid edits keep the last valid chart and show a local error, rather than deleting layers or silently substituting another calculation.

### 2.3 Data contracts

| Input mode | Required fields | Can construct | Cannot infer |
|---|---|---|---|
| Raw XY | X, Y; optional series, subject, order, label | Points, trajectories, distributions at X, fits | Experimental independence from row order alone. |
| Raw categorical | Value, category; optional series and subject | Dots, bars, boxes, violins, paired plots | Pairing without a key or explicit positional matching. |
| Nested observations | Value, outer group, independent-unit ID, replicate ID | Unit-level and group-level displays | A valid independent sample size by pooling technical repeats. |
| Supplied summary | Centre plus named spread/limits; optional n | Summary markers, bars, errors, bands | Individual observations, genuine violin density, raw-dot overlays. |
| Five-number summary | Minimum, Q1, median, Q3, maximum | Min/max box plot | Tukey outliers or other percentile whiskers without more data. |
| Interval rows | Estimate, lower, upper, row label | Forest/range plots | A fitted model, between-study variance, or pooled estimate. |
| Count matrix | Nonnegative integer counts, two categories | Count/grouped/stacked/normalised bars, heatmaps | Replicate SD or SEM from a single count. |
| Numeric matrix | Row ID, column ID, value; optional replicates | Heatmap | Clustering or a correlation matrix unless explicitly supplied. |
| Composition | Nonnegative weight, part ID/label | Pie, doughnut, whole-bar, dot-grid | Statistical uncertainty from weights alone. |
| Time-to-event | Time/duration, event status, group | Survival and cumulative-event curves | Competing-risk incidence from ordinary censoring data. |
| Binary diagnostic scores | Score, binary truth, series | ROC curves | Clinical threshold preferences or which score direction is positive. |
| Function | Expression, parameter values, domain | Generated curve families | Parameter uncertainty without a fitting/uncertainty model. |

The inspector must distinguish **raw**, **supplied summary**, and **derived** data. Supplied uncertainty needs a semantic label: SD, SEM, confidence interval, prediction interval, range, IQR, or unspecified interval. An unspecified interval can be drawn but cannot be converted to a confidence interval.

### 2.4 Data-state semantics

**Missing** is not zero. **Excluded** is an explicit calculation exclusion. **Hidden** is a visual state. A hidden layer retains its calculation and contributes to axis limits by default; a disabled layer does neither. A per-layer `rangeContribution` setting makes this distinction visible.

A viewport change must not refit a curve, recalculate a histogram using only visible values, change a multiple-comparison family, or remove outlying observations. Calculation-domain filters are separate, named controls.

Recalculation updates dependent objects atomically. The inspector reports included, excluded, missing, invalid, and clipped observation counts separately. Source values remain available when a display transformation or offset is applied.

## 3. Chart and preset catalogue

The following are **product presets**, not a claim that every row is a distinct native renderer. Grouped and nested arrangements are modifiers; specialised recipes reuse the same geometries. Shared and chart-specific settings are specified in subsequent sections.

### 3.1 Numeric-coordinate and trajectory presets

| Preset ID | Chart | Required data | Distinctive settings |
|---|---|---|---|
| `xy.scatter` | XY scatter | X and Y | Symbols, labels, X/Y uncertainty; no path by default. |
| `xy.line` | Connected line | Ordered X/Y | Straight or step connection, missing-point gaps, start behaviour. |
| `xy.line_symbols` | Line with symbols | Ordered X/Y | Independent symbol/path styling and symbol gaps. |
| `xy.area` | Filled curve | Ordered X/Y | Fill above/below, baseline, range, opacity and boundary. |
| `xy.bars` | Bars at numeric X | X and value/summary | Data-spaced bars, physical/data-space widths, baseline. |
| `xy.spikes` | Spikes/drop lines | X and Y | Thin baseline-to-value strokes; optional terminal symbols. |
| `xy.vector` | Origin-to-point vectors | X/Y endpoints | Origin, arrowheads, grouping, line encodings. |
| `xy.bubble` | Bubble/mapped scatter | X/Y plus size or colour | Area-based size mapping, continuous/categorical colour, encoding legends. |
| `xy.trajectory` | Repeated-measure/spaghetti plot | X, Y, subject ID, order | One path per subject, optional summary overlay. |
| `xy.offset_traces` | Offset trace/waterfall-style display | Multiple XY series | Explicit X/Y offsets, scale bars, offsets disclosed. |

Evidence: numeric-X symbols, bars, paths, fills and errors [S03]; additional line behaviour [S04]; offsets [S05]; variable encodings and vectors [S06]-[S10].

### 3.2 Categorical and distribution presets

| Preset ID | Chart | Required data | Distinctive settings |
|---|---|---|---|
| `category.strip` | Spread individual-value plot | Category and values | Standard/classic/expanded distribution; summary overlay. |
| `category.aligned` | Aligned individual-value plot | Category and values | No category-direction spread. |
| `category.paired` | Before-after/paired plot | Category, value, subject | Pair selection, trajectories, missing-pair policy. |
| `category.bar` | Summary/value bar | Category and value/replicates | Centre/spread, baseline, fill, border, raw-point overlay. |
| `category.summary` | Mean/median marker or short line | Category and replicates/summary | Marker/summary line with optional interval. |
| `category.range` | Floating range bar | Category and lower/upper | Range endpoints; optional centre; no baseline-to-zero implication. |
| `distribution.box` | Box-and-whisker plot | Replicates or allowed summary | Whisker rule, median/mean, outliers/all points, width. |
| `distribution.violin` | Violin plot | Replicate values | Density smoothing, fill/border, quartiles/median, raw overlay. |
| `category.grouped` | Grouped/interleaved display | Two categories plus values | Within/between-group gaps; mixed compatible geometries. |
| `category.stacked` | Stacked bars | Category and additive series | Stack order, sign handling, separators. |
| `category.normalised_stack` | Fraction/100% stacked bars | Nonnegative series values | Explicit denominator, fraction/percent display. |
| `category.nested` | Nested distribution/summary | Group, independent unit, repeats | Unit-level points/summaries, hierarchy-aware group summary. |
| `category.counts` | Contingency/count display | Count matrix or classified rows | Counts/fractions/percentages, denominator, grouped/stacked arrangement. |

Boxes and violins can also be placed at **numeric X coordinates**. Horizontal versions rotate category and value directions; they are not separate statistical calculations. The grouped/nested modifiers can be combined with dot, summary, bar, box, violin, and paired layers when their required keys exist. [S11]-[S20], [S28], [S29], [S70], [S71]

### 3.3 Calculated curves and diagnostic displays

| Preset ID | Chart | Required data | Distinctive settings |
|---|---|---|---|
| `distribution.histogram` | Histogram | Values or declared bin counts | Bins, boundary rule, frequency units, cumulative mode. |
| `distribution.frequency_polygon` | Frequency polygon | Values or bins | Bin-centre path, optional endpoint closure. |
| `distribution.ecdf` | Empirical cumulative distribution | Values | Exact steps or binned cumulative frequencies; probability scale. |
| `curve.survival` | Survival curve | Time and censor/event status | Product-limit estimate, censor marks, pointwise SE/CI. |
| `curve.cumulative_event` | Cumulative-event curve | Same as survival | `1 - survival`; not a competing-risk estimator. |
| `curve.roc` | ROC curve | Binary truth and scores | Direction, threshold points, chance line, coordinate intervals. |
| `curve.fit` | Fitted curve with data | XY observations | Model, domain, weights, parameters, confidence/prediction band. |
| `curve.smooth` | Spline/LOWESS curve | XY observations | Method, knots/span, duplicate-X treatment, sampling. |
| `curve.function` | Function/curve family | Expression and parameters | Domain, parameter sets, sampling; no observations required. |
| `diagnostic.qq` | Normal quantile-quantile plot | Values | Plotting-position rule, reference line, axis orientation. |
| `diagnostic.bland_altman` | Agreement plot | Matched measurements | Difference/ratio mode, bias, limits of agreement. |
| `diagnostic.residual` | Residual plot | Data plus fitted/supplied predictions | Residual definition, X/fitted-value axis, zero line. |

These presets produce their plotted values inside the chart pipeline; they do not open an analysis workspace. Fitted, smooth, and generated curves may be overlaid on compatible XY observations. [S30]-[S41], [S62], [S63], [S65]

### 3.4 Matrix, composition, and specialised presets

| Preset ID | Chart | Required data | Distinctive settings |
|---|---|---|---|
| `matrix.heatmap` | Matrix heatmap | Numeric matrix | Colour mapping, labels, gaps, orientation, colourbar. |
| `whole.pie` | Pie | Part weights | Part appearance, order, start angle, explosion, labels. |
| `whole.doughnut` | Doughnut | Part weights | Pie settings plus hole and total label. |
| `whole.bar` | One stacked whole-bar | Part weights | Horizontal/vertical orientation, proportions, aspect ratio. |
| `whole.dot_grid` | Parts-of-whole dot grid | Part weights | Dot count, grid dimensions, apportionment, fill order. |
| `special.forest` | Forest/estimate plot | Estimates and intervals | Horizontal intervals, reference value, row labels, optional size encoding. |
| `special.volcano` | Volcano plot | Fold changes and p values, or specified raw comparisons | Log transforms, thresholds, classifications, selective labels. |
| `special.population_pyramid` | Population pyramid | Categories and two count series | Opposing bars, common magnitude scale, positive tick labels. |

Specialised presets are compositions, not independent analysis systems. No pooled effect is invented for a forest plot; no differential-expression model is inferred from the name "volcano". [S42]-[S48], [S69]

## 4. Applicability matrices

### 4.1 Geometry capabilities

**Yes** means supported when the input exists. **Layer** means add a separate compatible layer rather than attaching the setting to this geometry. **No** means do not expose it on this geometry.

| Geometry | Value-direction error bars | Independent X uncertainty | Uncertainty band | Raw-point overlay | Fill | Baseline |
|---|---|---|---|---|---|---|
| XY symbols | Yes | Yes | Layer, ordered domain required | Already points | Symbol interior | No |
| XY connected path | Yes, at knots/summary positions | Yes, at knots | Yes, lower/upper sequences | Yes | Area layer | For area only |
| Step path | Yes, at specified events/knots | Supplied only where meaningful | Yes, matching step convention | Yes | Area layer | For area only |
| Numeric-X bar | Yes | Layer, not bar width | No | Yes | Bar interior | Yes |
| Category/grouped bar | Yes | No categorical-coordinate error | No | Yes | Bar interior | Yes |
| Stacked/normalised bars | Restricted; see Section 8 | No | No | Not automatically meaningful | Segment interior | Shared stack origin |
| Category summary symbol/line | Yes | No categorical-coordinate error | No; add ordered summary path first | Yes | Symbol interior | No |
| Individual/paired dots | Supplied observation intervals only | No categorical-coordinate error | No | Already points | Symbol interior | No |
| Box plot | No: whiskers are separate | No | No | All/outside/none | Box interior | No |
| Violin | No: quartile lines are separate | No | No | Yes | Density interior | No |
| Floating range/forest | Interval is geometry | Numeric estimate interval after rotation | No | Separate point layer | Optional range bar | No |
| Bubble/vector | Supplied intervals at endpoints | Supplied intervals | No | Already points | Symbols only | Vector origin only |
| Histogram | Only supplied bin intervals in this scope | No: bin width is not error | No | Separate layer | Bin interior | Usually zero |
| Heatmap | No | No | No | No | Cell colours | No |
| Pie/doughnut/whole-bar/dot-grid | No | No | No | No | Parts/dots | No Cartesian baseline |

A band is an **ordered lower/upper-bound layer**, not a generic shaded rectangle. It can remain visible when its centre path is hidden. Rotating a chart rotates the band and error bars with the value direction. A categorical axis does not acquire measurement uncertainty by rotating the chart.

### 4.2 Summary/interval compatibility

| Centre | Raw data required | Permitted calculated spread | Supplied interval accepted |
|---|---|---|---|
| Arithmetic mean | No, if sufficient summary supplied | None, SD, SEM, confidence interval, min-max | Yes |
| Geometric mean | Positive observations, or adequate log-scale summary | None, geometric SD factor, log-scale mean CI back-transformed | Yes |
| Median | Raw observations for calculated quantiles | None, IQR, min-max, exact order-statistic CI | Yes |
| Single observation | No replicates | No calculated sample spread | Yes |
| Proportion/count-derived fraction | Numerator and denominator | Explicit binomial interval when enabled | Yes |
| Fitted expectation | Observations and fitted model | Pointwise confidence or prediction interval | Yes |
| Survival estimate | Time/event/censor data | Greenwood SE; pointwise survival CI | Yes |
| ROC coordinate | Scores and truth | Binomial coordinate intervals | Yes |

A box's Q1/Q3 and whiskers are never presented as SEM or a confidence interval. A model prediction band is never selected using a sample SD dropdown. [S21]-[S27], [S35], [S38]

### 4.3 Axis and layout applicability

| Chart domain | Continuous X | Category axis | Second value axis | Log value scale | Axis breaks | Curve fitting |
|---|---|---|---|---|---|---|
| General XY | Yes | Only by explicit conversion | Yes | Positive-domain layers | Continuous axes only | Yes |
| Category/grouped/nested | No, unless numeric-X placement chosen | Yes | Yes | Valid positive objects/baselines | Value axis only | No automatic category-index fit |
| Numeric-X box/violin | Yes | No | Yes | Distribution constraints apply | Continuous axes | Separate raw-data fit only |
| Survival | Time/duration | No | Allowed, normally off | Positive displayed values only | Time/value, with caution | No automatic parametric survival fit |
| ROC | False-positive rate | No | Off in preset | Off in preset | Off in preset | No generic smoothing by default |
| Heatmap | Discrete cells | Rows and columns | No | Colour transform only | Gaps, not numeric breaks | No |
| Parts-of-whole | No | No | No | No | No | No |
| Forest/pyramid | Numeric value direction | Rows | Off in preset | Forest ratios only | Value direction | No |

## 5. Common graphical properties

Property names are logical identifiers, not a required public API or file format. A property block is inherited wherever referenced. Listed defaults are P unless marked D.

### 5.1 Chart-level controls

| Property | Type / permitted values | Default | Conditions and meaning |
|---|---|---|---|
| `chart.preset` | Catalogue ID | Chosen at creation | Changing preset preserves compatible bindings/styles. |
| `chart.orientation` | Vertical / horizontal | Vertical | For Cartesian categorical/range presets; whole-bar has its own orientation. |
| `chart.width` | Positive physical length | 160 mm | Entire chart, including title and legends. |
| `chart.height` | Positive physical length | 120 mm | Independent from viewport zoom. |
| `chart.sizeTarget` | Whole chart / plotting region | Whole chart | Defines which rectangle width/height edit. |
| `chart.aspectLock` | Boolean / numeric ratio | Off | Resize without silently rescaling typography. |
| `chart.resizePolicy` | Layout only / scale all appearance | Layout only | Explicit behaviour; physical strokes remain fixed by default. |
| `chart.background` | RGBA | White | Distinct from plot background. |
| `chart.plotBackground` | RGBA | White | Clear fills reveal this or underlying objects as appropriate. |
| `chart.padding` | Four physical lengths / automatic | Automatic | Must include outside ticks, labels, title and legend. |
| `chart.title` | Rich text / field binding | Empty | Font and position use text properties. |
| `chart.subtitle` | Rich text | Empty | Additional chart-attached text; not another panel. |
| `chart.layerOrder` | Ordered layer IDs | Preset order | Separate from category and legend order. |
| `chart.clipPolicy` | Plot clip plus annotation exceptions | Plot clip | Labels/legends may live outside the plot rectangle. |
| `chart.theme` | Theme identifier | Scientific light | Per-property overrides survive a theme change. |

### 5.2 Stroke, fill, and text blocks

| Property | Type / permitted values | Default |
|---|---|---|
| `stroke.visible` | Boolean | True where a border/path exists |
| `stroke.color` | RGBA | Theme/series colour |
| `stroke.width` | Length in pt or mm; nonnegative | Role-specific |
| `stroke.pattern` | Solid, dashed, dotted, dash-dot, long-dash, custom even-length dash array | Solid |
| `stroke.dashOffset` | Physical length | 0 |
| `stroke.cap` | Butt / round / square | Square for axes; round for data paths |
| `stroke.join` | Miter / round / bevel | Round for data paths |
| `fill.mode` | None / solid / pattern | Geometry-specific |
| `fill.color` | RGBA | Series colour |
| `fill.opacity` | 0..1 | 1; bands use 0.20 |
| `fill.pattern` | Horizontal, vertical, two diagonals, crosshatch, diagonal crosshatch, dots | None |
| `fill.patternSpacing` | Positive physical length | 4 pt |
| `fill.patternWidth` | Positive physical length | 0.5 pt |
| `fill.patternColor` | RGBA | Border colour |
| `fill.backgroundColor` | RGBA, including transparent | White |
| `text.content` | Unicode rich text, optional live binding | Empty |
| `text.fontFamily` | Available font family | Sans-serif theme family |
| `text.fontSize` | Positive length in pt | Role-specific |
| `text.weight` | Normal / bold; supported numeric weights | Role-specific |
| `text.italic` | Boolean | False |
| `text.underline` | Boolean | False |
| `text.color` | RGBA | Black |
| `text.align` | Start / centre / end | Role-specific |
| `text.rotation` | Angle in degrees | 0 |
| `text.lineHeight` | Positive multiplier | 0.9 for initial scientific theme |
| `text.offset` | X/Y physical lengths | 0, 0 |
| `text.background` | Optional fill and border | None |

Rich text must support Greek letters, mathematical symbols, superscripts, subscripts, and multiple lines. Formatting individual spans must not reset the rest of the label. Missing glyphs must be reported rather than silently displayed as empty rectangles.

Fill patterns are independent of colour, for monochrome readability. Pattern spacing and strokes use physical units, not data units. True alpha compositing is required; overlapping translucent objects must show the objects underneath. [S49], [S50]

### 5.3 Layer-level controls and inheritance

| Property | Type / values | Default / applicability |
|---|---|---|
| `layer.enabled` | Boolean | True; disabling removes drawing, computation and range contribution. |
| `layer.visible` | Boolean | True; hiding does not change calculations. |
| `layer.rangeContribution` | Always when enabled / visible only / never | Always when enabled. |
| `layer.name` | Text or data-label binding | Live binding. |
| `layer.dataSelection` | Fields, groups, explicit inclusion predicate | All bound valid data. |
| `layer.axisBinding` | Primary / secondary value axis | Primary; Cartesian layers only. |
| `layer.geometry` | Compatible geometry enum | Preset-specific. |
| `layer.grouping` | Ordered fields/keys | Explicit data roles. |
| `layer.opacity` | 0..1 | 1; multiplies child alpha. |
| `layer.legendVisible` | Boolean / automatic | Automatic. |
| `layer.zIndex` | Order key | Preset order. |
| `layer.objectOverrides` | ID-keyed property overrides | Empty. |

Style precedence is: **object override > group override > layer override > preset > chart theme**. Each inspector control shows whether its value is inherited or overridden. Style changes must not change data inclusion, calculations, or the meaning of the axes.

## 6. Axes, scales, ticks, and grids

Evidence: axis frames, domains, numbering, ticks, dual axes, breaks, custom ticks, scale bars and titles are separately documented capabilities. The unified controls below are the product design. [S51]-[S61]

### 6.1 Scale and range

| Property | Type / values | Default | Applicability |
|---|---|---|---|
| `axis.kind` | Continuous / category / date / duration / probability | Binding-derived | Explicit; no guessing from text labels. |
| `axis.scale` | Linear / log10 / log2 / natural-log / normal-probability | Linear | Normal-probability uses probabilities; logs require positive coordinates. |
| `axis.minimum` | Auto / finite value | Auto | Continuous axes. |
| `axis.maximum` | Auto / finite value | Auto | Must exceed minimum before optional reversal. |
| `axis.padding` | Low/high fraction or physical allowance | 5% each | No padding past fixed probability limits. |
| `axis.includeZero` | Auto / always / never | Bar preset: always; XY: auto | Log axes cannot include zero. |
| `axis.reverse` | Boolean | False | Reverses display, not stored observations. |
| `axis.categoryOrder` | Input / explicit / ascending / descending statistic | Input | Sorting requires an explicit statistic and stable tie rule. |
| `axis.categoryLabels` | Bound text / overrides | Bound text | Independent from internal category IDs. |
| `axis.equalUnits` | Off / linked axis pair | Off | Equal numeric units must account for physical plot dimensions. |
| `axis.domainPopulation` | Enabled layers / selected layers | Enabled layers | Does not alter calculation inclusion. |
| `axis.nonpositivePolicy` | Reject layer / omit invalid marks with warning | Omit and report | No silent replacement by a small positive number. |

Normal-probability coordinates are `Phi^-1(p)`, with an explicit fraction/percentage input convention and `0 < p < 1`. Endpoints 0 and 1 are not finite coordinates. A log axis changes visual coordinates only; fitting and summary calculations remain on their specified data scale.

Auto-range must include valid error endpoints, box whiskers, relevant baselines and curve bounds, not just central points. A point clipped by a manual range is not excluded. Percentage formatting alone must not multiply data by 100 twice.

### 6.2 Frame, axis location and titles

| Property | Type / values | Default | Meaning |
|---|---|---|---|
| `axis.visible` | Boolean | X and primary Y on | Hide axis independently from data. |
| `frame.mode` | Axes only / full rectangle / offset axes / none | Axes only | Full frame need not repeat every tick label. |
| `axis.position` | Low edge / high edge / crossing value | Low edge | Coordinate/value axis position, not series binding. |
| `axis.crossingValue` | Finite number | 0 if valid, else low edge | Continuous crossing only. |
| `axis.offsetGap` | Nonnegative physical length | 4 pt when offset | Separation from plotting-region corner/edge. |
| `axis.line` | Stroke block | Theme axis stroke | Independent per axis. |
| `axis.mirror` | None / line / ticks / ticks and labels | None | Does not create an independently scaled second X axis. |
| `axis.titleVisible` | Boolean | True when title nonempty | No title text manufactured from unknown units. |
| `axis.title` | Rich text / field-and-unit binding | Binding-derived | Reset to live data title supported. |
| `axis.titleLocation` | Centre / low end / high end / explicit anchor | Centre | Independent physical offset. |
| `axis.titleRotation` | Angle; presets horizontal/up/down | X: 0; Y: 90 | Horizontal chart rotation updates sensible defaults only. |
| `axis.titleStyle` | Text block | Theme axis-title style | Individual rich-text spans permitted. |

One Cartesian chart has **one independent X scale and at most two independent value scales**. Series use an explicit primary/secondary value-axis binding. For horizontal charts, logical value-axis identities remain stable even though their screen positions rotate. Heatmaps and parts-of-whole charts do not expose this mechanism.

### 6.3 Major and minor ticks

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `ticks.major.mode` | Auto / interval / explicit values | Auto | Category mode uses selected categories. |
| `ticks.major.interval` | Positive number / time unit and count | Auto | Independent from minimum and maximum. |
| `ticks.major.start` | Auto / finite first tick | Auto | Phase/anchor; not the axis minimum. |
| `ticks.major.direction` | In / out / both / none | Out | Per axis. |
| `ticks.major.length` | Nonnegative physical length | 5.6 pt | Theme-derived P; see Section 20. |
| `ticks.major.stroke` | Stroke block | Axis stroke | May differ from axis line. |
| `ticks.minor.mode` | None / subdivisions / explicit | None | Continuous axes only. |
| `ticks.minor.intervals` | Integer >=2 | 2 when enabled | Four intervals create three internal minor ticks. |
| `ticks.minor.spacing` | Linear in data / linear in transformed coordinate / log mantissas | Scale-dependent | Must be named, not ambiguous "even spacing". |
| `ticks.minor.length` | Nonnegative physical length | 2.8 pt | Independent from major ticks. |
| `ticks.minor.direction` | In / out / both / none | Out | Can differ from major ticks. |
| `ticks.minor.stroke` | Stroke block | Axis stroke | Independent if overridden. |
| `ticks.labels.visible` | Boolean | True for major ticks | Minor labels off by default. |
| `ticks.labels.every` | Positive integer | 1 | Suppresses labels, not necessarily tick marks. |

Log10 minor ticks can use mantissas 2 through 9 within a decade. Log2 and natural-log axes require their own explicit subdivisions; a base-10 pattern must not be reused accidentally. Category axes must not show numeric min/max, logarithm, or minor-interval controls.

### 6.4 Numbering, dates and durations

| Property | Type / values | Default |
|---|---|---|
| `numbers.format` | Auto / fixed / significant / scientific / engineering / powers / log exponents / date / duration | Auto |
| `numbers.decimals` | Integer >=0 / auto | Auto |
| `numbers.significantDigits` | Integer >=1 | 3 |
| `numbers.prefix` | Text | Empty |
| `numbers.suffix` | Text | Empty |
| `numbers.thousandsSeparator` | None / locale / explicit | None |
| `numbers.decimalSeparator` | Locale / explicit | Locale |
| `numbers.percentMode` | Raw number / fraction-as-percent / already-percent | Raw number |
| `numbers.negativeStyle` | Minus / parentheses / absolute magnitude | Minus; pyramid uses magnitude |
| `numbers.rotation` | Degrees; presets 0, 45, 90, 270 | 0 |
| `numbers.side` | Low / high / both | Axis side |
| `numbers.offset` | Physical length | Theme value |
| `numbers.style` | Text block | Theme tick text |
| `numbers.dateFormat` | Valid calendar formatting pattern | Locale-appropriate |
| `numbers.timeZone` | Explicit zone / UTC | UTC for timestamps |
| `numbers.durationUnit` | Seconds / minutes / hours / days / explicit unit | Bound unit |
| `numbers.customLabels` | Coordinate-to-text map | Empty |

Calendar dates, instants, and elapsed durations are distinct types. Displaying day labels does not convert unequal month lengths into equal elapsed times. Replacing tick labels with row labels must preserve numeric positions unless the user explicitly selects category-index placement. [S53], [S61]

### 6.5 Grids and reference objects

| Property | Type / values | Default |
|---|---|---|
| `grid.major.visible` | Per-axis Boolean | False |
| `grid.minor.visible` | Per-axis Boolean | False |
| `grid.major.stroke` | Stroke block | Thin light stroke |
| `grid.minor.stroke` | Stroke block | Thinner light stroke |
| `grid.zOrder` | Behind / above data | Behind |
| `reference.value` | Number or calculated scalar binding | Explicit |
| `reference.axis` | X / primary Y / secondary Y | Explicit |
| `reference.tickVisible` | Boolean | True |
| `reference.label` | Text / formatted bound value / none | Formatted value |
| `reference.lineVisible` | Boolean | False |
| `reference.stroke` | Stroke block | Reference style |
| `reference.labelStyle` | Text block | Tick style |
| `reference.replaceRegularLabel` | Boolean | True on exact-position collision |
| `reference.region` | Paired coordinates, axis binding and fill | None |
| `reference.identityLine` | Boolean plus stroke | Off |

An identity line means `Y = X`, not a screen-space 45-degree diagonal. Regions between reference values are axis-aware filled bands, not statistical uncertainty. An editor alignment grid is not a plotted grid and must not appear in the rendered chart. [S58], [S60], [S04]

### 6.6 Discontinuous axes and scale bars

| Property | Type / values | Default | Constraints |
|---|---|---|---|
| `axis.segments` | One, two or three ordered ranges | One | Up to two breaks; continuous axes only. |
| `segment.minimum` / `maximum` | Finite ordered bounds | Explicit when split | Segments must not overlap. |
| `segment.lengthFraction` | Positive fractions summing to 1 | Equal | Physical allocation of remaining axis length. |
| `segment.tickSettings` | Major/minor block | Inherit | Shared transform, separate range/ticks. |
| `axis.breakGap` | Physical length | 6 pt | Not a data interval. |
| `axis.breakMark` | Slash / double slash / zigzag / none | Double slash | Style is P; exact glyphs are fidelity work. |
| `axis.breakStroke` | Stroke block | Axis stroke | Per axis. |
| `bars.showBreakMark` | Boolean | True | Bars crossing removed ranges. |
| `scaleBar.visible` | Boolean | False | Can replace a hidden axis. |
| `scaleBar.lengthMode` | One major interval / explicit data length | One major interval | Must be interpretable on the chosen scale. |
| `scaleBar.anchor` | Data or plot-relative coordinate | Plot corner | Must not drift during data updates. |
| `scaleBar.caps` | None / endpoints | Endpoints | - |
| `scaleBar.label` | Auto / custom / none | Auto with units | - |
| `scaleBar.stroke` | Stroke block | Axis stroke | - |

Do not bridge missing axis regions with a continuous path or polygon. Split/clamp graphical primitives at each segment boundary. The initial implementation must reject the combination of reversed and segmented axes rather than display ambiguous ordering. Scale bars on nonlinear axes need an explicit endpoint pair or ratio label; a constant additive length is not position-invariant there. [S56], [S57]

## 7. Symbols, paths, areas, and numeric-X bars

### 7.1 Symbols and point labels

| Property | Type / values | Default | Applicability |
|---|---|---|---|
| `symbol.visible` | Boolean | Scatter: on; line-only: off | Point and summary layers. |
| `symbol.shape` | Circle, square, up/down/left/right triangle, diamond, plus, cross, star, dash, custom character | Circle | Filled and open variants use the fill setting. |
| `symbol.size` | Positive physical diameter/extent | 6 pt | Explicitly not radius; mapping may override. |
| `symbol.border` | Stroke block | 0.75 pt, series colour | Closed symbols; open stroke shapes use their stroke. |
| `symbol.fill` | Fill block | Series colour | Closed shapes. |
| `symbol.openMode` | Clear / background knockout | Clear | A clear interior reveals earlier layers; knockout masks them. |
| `symbol.customCharacter` | One Unicode grapheme plus font | Empty | Does not change data labels. |
| `symbol.rotation` | Degrees | 0 | Only supported noncircular shapes/glyphs. |
| `symbol.visibilityRule` | All / selected observations / none | All | Never an exclusion from calculations. |
| `pointLabel.visible` | Boolean | False | Point layers. |
| `pointLabel.source` | Label field / row label / formatted coordinates / expression | Label field | Expression must be safe and chart-local. |
| `pointLabel.placement` | Above / below / left / right / centred / custom | Above-right | - |
| `pointLabel.offset` | Two physical lengths | 3 pt, 3 pt | Point-relative, not page-absolute. |
| `pointLabel.collision` | Keep / hide overlaps / repel | Keep | Suppressed labels remain listed in inspector. |
| `pointLabel.leader` | Optional stroke | None | For displaced labels. |
| `pointLabel.style` | Text block | 11.2 pt regular | Per-point overrides supported. |

Moving a label stores an offset from the identified point, so it follows the point after resizing or data edits. Open-symbol masking and transparent interiors are distinct. Individual point appearance is independent of the series default. [S03], [S72], [S09]

### 7.2 Connections and trajectories

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `path.visible` | Boolean | Preset-dependent | Independent of symbols. |
| `path.interpolation` | Straight / step-after / step-before / step-mid | Straight | Smooth curves use Section 11, not this property. |
| `path.coordinateSpace` | Screen-straight / data-linear resampled | Screen-straight | Matters on transformed axes. |
| `path.order` | Input / ascending X / explicit order field | Input; fitted curves ascending X | Never sort subject paths across subjects. |
| `path.partition` | Series / subject / selected categorical field | Series | Separate path per partition. |
| `path.start` | First point / origin | First point | Source origin choice requires explicit coordinates. |
| `path.origin` | Axis intersection / explicit X,Y | Axis intersection | Numeric coordinates only. |
| `path.missingPolicy` | Break / connect across | Break | Does not interpolate missing values numerically. |
| `path.symbolGap` | None / automatic / physical clearance | Automatic | Clears symbol edge, not a fixed fraction of data. |
| `path.arrowStart` / `arrowEnd` | None / open / filled triangle / bar | None | Head length and width independently editable. |
| `path.arrowLength` | Positive physical length | 6 pt | Does not rescale with data domain. |
| `path.arrowWidth` | Positive physical length | 4 pt | As above. |
| `path.stroke` | Stroke block | Series colour, 1.5 pt | Group/series overrides allowed. |
| `path.displayOffsetX` / `Y` | Data-unit offset | 0 | Explicit display operation, not a fitted-data transformation. |

A straight connection is not a regression. On a log axis, connecting transformed endpoints with a screen-straight line differs from sampling a straight relationship in data coordinates. The inspector must name this distinction. [S03], [S04], [S05], [S32]

For before-after and spaghetti displays, matching uses subject IDs. Positional matching can be selected deliberately when no IDs exist, but must be labelled as such. Missing measurements break an individual trajectory unless bridging is explicitly enabled. No interpolation or imputation is implied by bridging a visible line.

### 7.3 Area layers and numeric-X bars

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `area.mode` | Below curve / above curve / between curves | Below | Between-curves requires two aligned bound paths. |
| `area.baselineMode` | Axis edge / numeric baseline | Numeric | Separate from axis crossing. |
| `area.baseline` | Finite value | 0 on linear axes | Log axes require a positive baseline or an edge. |
| `area.domain` | Full curve / explicit interval | Full curve | No change to the curve calculation. |
| `area.fill` | Fill block | Series colour at 0.20 opacity | Pattern allowed. |
| `area.boundary` | Stroke block / none | None | Centre path styled separately. |
| `xyBar.widthMode` | Physical / data units / fraction of local X spacing | Physical | Mode must be visible. |
| `xyBar.width` | Positive length or value | 8 pt | Width in transformed data coordinates needs explicit interpretation. |
| `xyBar.baseline` | Axis edge / finite value | 0 on linear axes | Log-domain validation applies. |
| `xyBar.fill` | Fill block | Series colour | Spikes use no fill. |
| `xyBar.border` | Stroke block | 0.75 pt | Spike stroke defaults 1 pt. |
| `xyBar.bottomEdge` | Visible / hidden | Visible | Can avoid double lines at the baseline. |
| `xyBar.alignment` | Centre / leading edge / trailing edge | Centre | Numeric bins typically use explicit left/right edges instead. |

Do not infer measurement error from bar width. Filled areas must split at missing values, curve discontinuities and axis breaks. For crossing boundaries, tessellation must preserve the specified region rather than produce self-intersecting fill artefacts.

## 8. Categorical, grouped, nested, and count displays

### 8.1 Positioning, spacing and order

| Property | Type / values | Default | Meaning |
|---|---|---|---|
| `category.layout` | Single / grouped / stacked / superimposed / hybrid | Single | Compatible geometries only. |
| `category.valueDirection` | Vertical / horizontal | Vertical | Rotates all compatible objects consistently. |
| `category.order` | Explicit IDs / input / selected summary ascending or descending | Input | Distinct from legend and z-order. |
| `series.order` | Explicit IDs | Input | Group/stack order, not necessarily legend order. |
| `series.relationToPrevious` | Interleave / stack / new group / superimpose | Interleave | Enables grouped-stacked hybrid bars. |
| `spacing.withinGroup` | Gap as percent of nominal bar width | 25% | 0% means touching bars. |
| `spacing.betweenGroups` | Gap as percent of nominal bar width | 100% | Separate from within-group spacing. |
| `spacing.beforeFirst` / `afterLast` | Percent of nominal bar width | 50% | Independent end margins. |
| `spacing.localMultiplier` | Percent of normal local gap | 100% | Per-boundary override, not the same unit as bar-width percentage. |
| `spacing.missingSlot` | 0..100% of normal slot | 100% | Missing values do not become zero-height bars. |
| `spacing.separator` | Optional stroke per group boundary | None | Real separator object; no dummy rows needed. |
| `category.width` | Fraction of available slot, 0..1 | 0.8 | Dots, boxes and violins use their own widths inside the slot. |
| `category.baseline` | Axis edge / numeric value | 0 | Bars only, not boxes/violins. |
| `category.baselineEdge` | Visible / hidden | Visible | Bar bottom edge. |

Layout must resolve all slot widths before rendering. Width/gap edits are constrained together so bars cannot accidentally extend outside their assigned group. A named "fit into plotting region" mode computes a shared nominal width; an explicit physical-width mode instead allows the inspector to report insufficient space.

Category position, front-to-back layer order, legend order, and within-stack order are independent arrays. Reordering one must not implicitly reorder all the others. [S12]-[S17], [S73], [S74]

### 8.2 Individual-value distributions

| Property | Type / values | Default | Meaning |
|---|---|---|---|
| `strip.distribution` | Aligned / standard / classic / expanded | Standard | Reference-documented presentation choices. |
| `strip.maximumWidth` | Slot fraction, 0..1 | 0.8 | Spreading is category-direction only. |
| `strip.seed` | Unsigned integer | 0 | Reproducible position layout. |
| `strip.collisionGap` | Nonnegative physical length | 0.5 pt | Clearance beyond actual symbol shape. |
| `strip.overflow` | Retain overlaps and warn / shrink symbols explicitly | Retain and warn | Never discard observations to resolve crowding. |
| `strip.summaryOverlay` | None / summary marker / short line / bar | None | Separate summary settings and styles. |
| `strip.summaryWidth` | Fraction of slot | 0.5 | Short horizontal/vertical line, not an error cap. |

Standard distribution should visually preserve local concentration; classic prioritises packing; expanded prioritises spread without strongly curved point rows. These goals are documented, but their exact placement algorithms are not fully specified. The new engine must implement deterministic, versioned layout algorithms and classify them as P, not promise pixel-identical packing. [S18]

No method may jitter values along the **measurement direction**. Category spreading is a presentation adjustment only. Point identity, tooltips, labels, pairing and calculations use the original observations. A fixed seed and stable observation IDs must reproduce the layout.

### 8.3 Grouped and mixed displays

A grouped chart may combine bars for one series, points for another, and boxes or violins for a third. The inspector shows only controls supported by the selected layer, while chart-level spacing is shared. Category labels refer to stable categories even when one series has missing cells.

Before-after connections may link selected category transitions rather than necessarily every adjacent category. Subject-level path colour, width, pattern, symbol style and opacity can differ from the group summary overlay. A summary line across category means is an **ordered category path**, not a numeric-X regression.

Raw observations can overlay bars; box overlays may show all values or only points outside selected whiskers. A supplied mean and SD cannot support either overlay without the original observations. [S11], [S15], [S19]

### 8.4 Stacks, normalisation and uncertainty

| Property | Type / values | Default |
|---|---|---|
| `stack.mode` | Additive / normalised fraction / normalised percent | Additive |
| `stack.order` | Explicit series IDs | Series order |
| `stack.negativeValues` | Separate positive/negative accumulators / reject | Separate for additive; reject for normalised |
| `stack.denominator` | Per category / selected total / supplied denominator | Per category |
| `stack.missingPolicy` | Missing stack component / treat as zero explicitly | Missing component |
| `stack.labels` | Segment value / fraction / percent / none | None |
| `stack.errorMode` | None / supplied segment interval / supplied total interval / paired-total calculation | None |
| `stack.totalStyle` | Summary marker/error style | Black |

For an additive stack, a component's height is its own value, not its cumulative endpoint. Positive and negative values accumulate separately from the baseline. Superimposed bars all begin at the baseline and use true alpha compositing; they are not disguised stacks.

Errors on stack components must not be presented as uncertainty of the cumulative total. Total uncertainty can be calculated from **jointly observed replicate totals**, using matched replicate IDs, or supplied externally. Independent component errors cannot simply be added or combined without a declared covariance assumption. Normalised stacks do not inherit ordinary component SD/SEM errors automatically.

All-zero or missing-denominator normalised stacks are undefined, not 100% empty space assigned to one category. Excluded components are removed from the denominator; merely hidden components remain in it unless a separate denominator setting says otherwise. [S16], [S71]

### 8.5 Nested data

| Property | Type / values | Default |
|---|---|---|
| `nested.outerGroup` | Categorical field | Required |
| `nested.unitId` | Independent-unit field | Required |
| `nested.replicateId` | Within-unit key | Optional but recommended |
| `nested.displayLevel` | Raw repeats / unit summaries / both | Both |
| `nested.unitSummary` | Mean / geometric mean / median | Mean |
| `nested.groupSummaryInput` | Unit summaries / all observations with explicit warning | Unit summaries |
| `nested.unitArrangement` | Interleave / separate / superimpose | Interleave |
| `nested.unitEncoding` | Colour / shape / both / none | Shape |
| `nested.summaryWeighting` | Equal independent units / explicitly supplied weights | Equal units |
| `nested.sampleSizeLabel` | Units / observations / both / none | Both when enabled |

When measurements are repeated inside independent subjects, group uncertainty defaults to variation among **subject summaries**, not among every technical repeat. Unequal replicate counts must not silently give some subjects more weight. Raw repeats remain visible when requested; their display does not change the unit used for n. [S19], [S20]

### 8.6 Counts and contingency-style displays

The plotting adapter accepts a count matrix or explicitly cross-tabulates classified raw observations. Cross-tabulation counts rows after declared exclusions, not nonmissing cells across unrelated fields. Matrix counts must be nonnegative integers; a supplied fractional matrix is a general numeric matrix, not a count input.

| Property | Type / values | Default |
|---|---|---|
| `counts.display` | Count / fraction / percent | Count |
| `counts.denominator` | Row total / column total / grand total / supplied | Row total |
| `counts.arrangement` | Grouped / stacked / normalised stack / superimposed | Grouped |
| `counts.interval` | None / exact binomial / supplied | None |
| `counts.confidenceLevel` | 0 < C < 1 | 0.95 |

A binomial interval requires a meaningful numerator and denominator; it is not automatically valid for arbitrary weighted counts. No chi-square, association model, or effect-size report is produced by choosing this chart. [S70], [S71]

## 9. Summaries, error bars, and uncertainty bands

### 9.1 Calculation settings

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `summary.centre` | Mean / geometric mean / median / supplied / none | Mean for summary presets | Individual-value presets default none. |
| `summary.spread` | None / SD / SEM / CI / min-max / IQR / geometric SD / supplied | None until chosen | Restricted by Section 4.2. |
| `summary.confidenceLevel` | 0 < C < 1 | 0.95 | CI methods only. |
| `summary.inputLevel` | Observations / unit summaries / supplied summary | Binding-derived | Nested data defaults unit summaries. |
| `summary.nField` | Positive integer count field | None | Needed for conversions using n. |
| `summary.excludedPolicy` | Omit explicitly excluded values | Omit | Exclusion count disclosed. |
| `summary.invalidPolicy` | Omit with warning / reject group | Omit with warning | Geometric summaries require positivity. |
| `summary.smallSamplePolicy` | Draw available centre, omit undefined spread / reject | Draw centre | Never silently draw a zero-width CI. |

Required arithmetic contracts:

- For included values `y_i`, use arithmetic mean `m = sum(y_i)/n`, sample variance `s^2 = sum((y_i-m)^2)/(n-1)`, and `SEM = s/sqrt(n)`.
- A mean confidence interval is `m +/- t_(1-alpha/2,n-1) * SEM`, where `alpha = 1-C`. It is not `m +/- 1.96*SD`.
- For positive observations, let `z_i = ln(y_i)`. The geometric mean is `exp(mean(z))`; geometric SD is the **multiplicative factor** `exp(sd(z))`. Its drawn limits are `g/GSD` and `g*GSD`.
- A geometric-mean CI exponentiates the t interval of the mean log values. Its endpoints generally appear asymmetric on a linear axis.
- A range is `[minimum, maximum]`; IQR is `[Q1,Q3]`. Neither is a confidence interval.

These are graph-building calculations. Mean/geometric/median display choices and supplied-spread conversions are documented capabilities; the explicit validation and data contracts are P. [S21], [S22]

Median confidence intervals use an exact order-statistic construction. Sort the n observations. Choose the largest integer `k >= 1` for which `1 - 2*P(Binomial(n,0.5) <= k-1) >= C`, then draw `[y_(k), y_(n-k+1)]`. Report achieved coverage. If no finite interval meets the requested coverage, report unavailable rather than label a narrower interval as the requested CI. Ties can make the interval conservative. [S75]

Supplied SD and n may produce SEM and a mean CI; supplied SEM and n may produce SD and a mean CI. Supplied percent CV and a nonzero mean may produce SD under the declared CV convention. **Without n, no t-based CI conversion is permitted.** Supplied asymmetric endpoints are not assumed to encode a symmetric SD.

### 9.2 Error-bar geometry

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `error.visible` | Boolean | On when spread explicitly selected | Separate from symbol/path visibility. |
| `error.direction` | Value / X / both numeric dimensions | Value | No uncertainty on a category coordinate. |
| `error.inputForm` | Symmetric distance / asymmetric distances / absolute endpoints | Binding-derived | Stored interpretation must be explicit. |
| `error.sides` | Both / positive only / negative only | Both | One-sided display is not a one-sided confidence calculation. |
| `error.capStyle` | Bar / none | Bar | Capless whisker style. |
| `error.capLength` | Nonnegative physical length | 5 pt | Full cap width, not half-width. |
| `error.capWidthMode` | Physical / fraction of bar or symbol width | Physical | Fraction mode enabled for compatible marks. |
| `error.stroke` | Stroke block | 1 pt, series colour | Independently style cap and stem if overridden. |
| `error.zOrder` | Behind / above centre mark | Behind | Bars usually draw errors above fill. |
| `error.position` | Centre of associated mark | Associated mark | Follows category dodging and orientation. |
| `error.logInvalidEndpoint` | Clip with warning / suppress whole interval | Clip with warning | Do not replace negative limits with arbitrary epsilon. |

X and Y uncertainty controls are independent in the new package. Symmetric and asymmetric X limits are both supported as a deliberate P generalisation of the supplied-X-error capability. X uncertainty does not automatically change the objective function of a fitted model. [S23]

Error distances must be nonnegative. Absolute endpoints require `lower <= upper`; ordinary centre-based errors additionally require the centre to lie within them. A general interval-only geometry may omit a centre. Transform endpoints separately through the axis mapping rather than transforming an error length.

### 9.3 Uncertainty bands

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `band.kind` | Summary interval / fitted-mean CI / prediction interval / survival CI / supplied | Supplied until linked | Meaning stays visible in inspector and accessible description. |
| `band.presentation` | Boundaries / fill / boundaries and fill | Fill | Independent from central path. |
| `band.lowerStroke` / `upperStroke` | Stroke block | Off | Can be solid or dotted envelopes. |
| `band.fill` | Fill block | Series colour at 0.20 opacity | Lower layer than centre path. |
| `band.interpolation` | Inherit centre / straight / matching step | Inherit | No spline through bounds by accident. |
| `band.gapPolicy` | Break / bridge | Break | Invalid or missing limits split a band. |
| `band.domain` | Bound curve domain / explicit subset | Bound domain | Bounds need matching domain points. |
| `band.crossingPolicy` | Reject invalid interval | Reject | Do not silently swap inconsistent lower/upper data. |
| `band.legendText` | Automatic semantic description / custom | Automatic | For example, "95% pointwise confidence interval". |

The same graphical envelope may represent very different quantities. The chosen calculation must remain attached to the band. A confidence band for the fitted mean and a prediction band for a future observation are not interchangeable; prediction uncertainty includes residual variation. Pointwise intervals do not constitute a simultaneous confidence band. [S24]-[S27]

## 10. Box plots and violins

### 10.1 Box-and-whisker controls

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `box.input` | Raw values / five-number summary / explicit quantiles and whiskers | Raw | Prevents pseudo-observations from supplied summaries. |
| `box.width` | Category-slot fraction or physical width at numeric X | 0.65 slot | Per-group override supported. |
| `box.quartileRule` | Type-6 interpolated quantiles | Type 6 (D rule) | Fixed compatibility rule initially. |
| `box.whiskerRule` | Min-max / Tukey / 10-90 / 5-95 / 2.5-97.5 / 1-99 percentiles | Min-max | Explicitly distinct rules. |
| `box.tukeyMultiplier` | Positive number | 1.5 | Display as advanced P extension if editable. |
| `box.fill` | Fill block | Series fill | - |
| `box.border` | Stroke block | 1 pt | - |
| `box.medianVisible` | Boolean | True | - |
| `box.medianStroke` | Stroke block | 1.5 pt | - |
| `box.meanVisible` | Boolean | False | - |
| `box.meanSymbol` | Symbol block | Plus | - |
| `box.whiskerStroke` | Stroke block | 1 pt | - |
| `box.whiskerCaps` | None / bar | Bar | - |
| `box.whiskerCapWidth` | Fraction of box width | 0.5 | - |
| `box.points` | None / outside whiskers / all | None | - |
| `box.pointStyle` | Symbol and strip blocks | Series point style | - |
| `box.smallN` | Median and range without box / points only / reject | Median and range | Applies when n < 4. |

For sorted values and probability p, type-6 quantiles use `r=(n+1)*p`, linearly interpolate between adjacent 1-based ranks, and clamp outside ranks 1..n. For example, values 1 through 8 produce Q1=2.25, median=4.5 and Q3=6.75. [S28], [S76]

Tukey fences are `Q1 - 1.5*IQR` and `Q3 + 1.5*IQR`. Whiskers end at the most extreme **observed values within** those fences, not at the fence coordinates. Percentile whiskers use the same quantile interpolation rule. "Outside whiskers" is a display classification, not an exclusion or an automatic outlier-removal decision.

A min-max box with all points is represented by `whiskerRule=min-max` plus `points=all`; it is not a seventh independent statistical rule. At n=3, draw the median and range without a quartile rectangle under the default fallback. A supplied five-number summary does not permit reconstructing Tukey outliers. [S28]

### 10.2 Violin controls

| Property | Type / values | Default | Evidence / conditions |
|---|---|---|---|
| `violin.width` | Slot fraction or physical width | 0.8 slot | P numeric default. |
| `violin.smoothing` | Light / medium / heavy / numeric bandwidth | Medium | D named levels; numerical meanings P. |
| `violin.bandwidth` | Positive data-scale value | Automatic | Visible read-only resolved value in automatic mode. |
| `violin.densityScale` | Original measurement / log measurement | Original | Log mode requires positive values and explicit disclosure. |
| `violin.trim` | Sample min-max / full kernel tails | Sample min-max | D bounded presentation; tail mode P extension. |
| `violin.normalisation` | Equal maximum width / equal area / sample-count-scaled | Equal maximum width | P exact normalisation contract. |
| `violin.fill` | Fill block | Series fill | - |
| `violin.border` | Stroke block | 1 pt | - |
| `violin.medianVisible` | Boolean | True | - |
| `violin.quartilesVisible` | Boolean | True | - |
| `violin.medianStroke` | Stroke block | 1.5 pt | - |
| `violin.quartileStroke` | Stroke block | 1 pt, dashed | - |
| `violin.points` | None / all | None | - |
| `violin.pointStyle` | Symbol and strip blocks | Series style | - |
| `violin.gridSize` | Integer >=64 | 256 | Numerical evaluation, not number of observations. |
| `violin.smallSamplePolicy` | Points/summary fallback / draw with warning / reject | Points/summary fallback | n < 3 or no positive bandwidth. |

The documented violin presentation includes smoothing levels, bounded ends, fill/border, median/quartile lines and optional observations. It does not establish an exact kernel or numerical bandwidth for those levels. [S29]

**Proposed deterministic estimator:** use a Gaussian kernel. Let `a=min(s,IQR/1.34)` when both are positive; otherwise use the positive one. Set `h0=0.9*a*n^(-1/5)`. Light/medium/heavy multiply h0 by 0.5/1/2. Evaluate `f(v)=sum(exp(-0.5*((v-y_i)/h)^2))/(n*h*sqrt(2*pi))`. Numeric bandwidth overrides the preset. This is a P calculation, not a verified reproduction of an undocumented density implementation.

Under min-max trimming, terminate the polygon at the sample endpoints without tapering it artificially to zero. In full-tail mode evaluate to at least three bandwidths beyond the extrema and disclose the chosen tail rule. Equal-width mode divides by the maximum density of each violin; equal-area mode uses a common density-to-width factor; sample-count mode multiplies by n before using a common scale. The comparison population used for a common scale must be explicit.

Constant data must not create division by zero or a fabricated broad distribution. Use a degenerate line/point fallback with a notice. A log axis alone does not switch the density calculation to log data. If log-density estimation is selected, state whether the displayed density is per log-unit; do not silently claim it is the original-unit density.

## 11. Histograms, cumulative distributions, and smooth curves

### 11.1 Histograms and frequency polygons

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `histogram.input` | Raw values / supplied bin counts | Raw | Supplied bins require edges, not just labels. |
| `histogram.binning` | Automatic / width and anchor / explicit edges | Automatic | Resolved edges always inspectable. |
| `histogram.binWidth` | Positive value | Auto | Shared across compared series by default. |
| `histogram.firstCentre` | Finite value | Auto | Alternative explicit anchor to first lower edge. |
| `histogram.edges` | Strictly increasing numbers | Auto | Supports unequal widths with explicit density convention. |
| `histogram.boundaryRule` | Left-closed/right-open | `[left,right)` (D rule) | Final-edge policy separately declared. |
| `histogram.finalEdgeInclusive` | Boolean | True | P policy for supplied terminal edge. |
| `histogram.outOfRange` | Omit and count / overflow bins | Omit and count | Never silently fold into edge bins. |
| `histogram.frequency` | Count / fraction / percent / probability density | Count | Density is count divided by n and bin width. |
| `histogram.denominator` | All included observations / observations in displayed bin domain | All included | Explicit if some values fall outside bins. |
| `histogram.cumulative` | Off / ascending / descending | Off | Cumulative density integrates, not sums density heights. |
| `histogram.replicates` | Each observation / explicit within-unit summary | Each observation | No silent replicate averaging. |
| `histogram.sharedBins` | Boolean | True across compared series | - |
| `histogram.barGap` | 0..100% of bin width | 0% | - |
| `histogram.fill` / `border` | Common style blocks | Series fill / 0.75 pt border | - |
| `histogram.overlayMode` | Overlay / grouped within bin / stacked | Overlay | Same bin edges required for grouped/stacked. |
| `frequencyPolygon.closeEnds` | None / one zero-height bin outside each end | None | P option; zero endpoints are synthetic and labelled internally. |

A source documents automatic bin selection around `log2(n)` with convenient widths but not a complete tie-breaking algorithm. [S30] The new automatic rule is therefore P: start with `max(1,ceil(log2(n)+1))` bins, calculate a width from the range, round it upward to a `1,2,2.5,5,10` decimal-multiple width, and anchor the first lower edge at a width multiple not greater than the minimum. Extend the last edge far enough to include the maximum. Record all resolved edges.

For constant input, use one bin with an explicit width derived from the unit scale or a user choice; do not divide by a zero range. For unequal-width bins, probability-density area must integrate to the included proportion. A relative-frequency histogram with omitted tails must not pretend its visible bars represent the full sample without the denominator choice being shown. [S30], [S31]

### 11.2 Empirical cumulative distribution

| Property | Type / values | Default |
|---|---|---|
| `ecdf.mode` | Exact observations / cumulative bins | Exact |
| `ecdf.direction` | At-or-below / strictly above | At-or-below |
| `ecdf.units` | Fraction / percent / cumulative count | Fraction |
| `ecdf.connection` | Step-after / straight display approximation | Step-after |
| `ecdf.symbols` | None / at unique values | None |
| `ecdf.probabilityAxis` | Linear / normal-probability | Linear |
| `ecdf.tailExtension` | None / to displayed axis limits | To limits |

For exact ECDF, `F(x)=count(y_i<=x)/n`; combine ties into a single jump with the correct multiplicity. A descending curve uses `1-F(x)` under the stated strict-above convention. No automatic sample confidence band is required; a supplied band can be added with its method labelled. A straight display approximation must not change the ECDF calculation itself. [S30], [S31]

### 11.3 Interpolation and smoothing

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `smooth.method` | Cubic interpolating / Akima / cubic smoothing spline / LOWESS | User selection | Do not equate smooth appearance with a fitted scientific model. |
| `smooth.duplicateX` | Mean at equal X / reject | Mean, with disclosure | Required for single-valued interpolation. |
| `smooth.domain` | Data range / explicit interval | Data range | Extrapolation off by default. |
| `smooth.coordinateScale` | Original X/Y / explicitly transformed fields | Original | Independent of visual log axes. |
| `smooth.knots` | Positive integer / explicit knot coordinates | 5 where supported | Insufficient unique X reduces capability with notice, not silently. |
| `smooth.penalty` | Nonnegative scalar / resolved automatic | 0 in fixed-knot mode | P regularisation control. |
| `smooth.lowessLevel` | Coarse / medium / fine / explicit neighbourhood | Medium | Named levels D; numeric mapping P. |
| `smooth.neighbourFraction` | 0 < f <= 1 | Coarse 0.75; medium 0.50; fine 0.25 | P; resolved neighbour count displayed. |
| `smooth.kernel` | Inverse-cubic / tricube | Inverse-cubic | Explicit P normalisation; see below. |
| `smooth.robustIterations` | Nonnegative integer | 0 | Optional P extension, not undocumented automatic outlier removal. |
| `smooth.segments` | Positive integer | 150; LOWESS at least 4*n | Source documents LOWESS lower bound. |
| `smooth.showOriginalPoints` | Boolean | True | - |
| `smooth.stroke` | Stroke block | 1.5 pt series colour | - |

Cubic and Akima interpolation pass through the resolved unique-X points. The initial natural-cubic boundary condition and the precise Akima endpoint convention must be versioned P choices. Cubic smoothing uses a cubic B-spline basis with declared knots and an optional second-derivative penalty; it is not falsely labelled an exact reconstruction of an unspecified spline routine. [S32]

The public LOWESS description specifies a local linear fit and an inverse-cubic weighting expression, but does not fully establish the named levels' neighbour counts or distance normalisation. [S33] The P implementation chooses the k nearest X values, normalises distance by the furthest selected distance, and uses `w(u)=(1+abs(u)^3)^(-3)`. The alternate tricube kernel uses `(1-abs(u)^3)^3` for `abs(u)<1`, and zero otherwise. Weighted local least squares yields the curve value. Boundary ties, singular local fits and duplicate X require deterministic handling; insufficient distinct X produces a notice and a simpler valid fallback.

A smoother does not obtain a confidence band merely by enabling the generic band control. It needs independently supplied bounds or a separately specified uncertainty method. Derived first/second derivatives and cumulative integrals of a generated function may be added as explicitly named curve layers; they are not hidden transformations of the original curve. [S63], [S65]

## 12. Variable-driven symbols and vectors

### 12.1 Encodings

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `encoding.x` / `y` | Numeric field or explicitly derived field | Required | Category roles use categorical presets. |
| `encoding.colourMode` | Uniform / categorical / continuous | Uniform | - |
| `encoding.colourField` | Field | None | Required when mapped. |
| `encoding.colourPalette` | Ordered palette or gradient | Theme palette | - |
| `encoding.colourDomain` | Auto / manual low, optional centre, high | Auto | - |
| `encoding.colourOutOfRange` | Clamp / explicit low-high colours / omit | Clamp | - |
| `encoding.colourMissing` | Explicit colour / omit | Grey with notice | - |
| `encoding.shapeMode` | Uniform / categorical | Uniform | Categorical shape mapping is P generalisation. |
| `encoding.shapeField` | Category field | None | - |
| `encoding.sizeMode` | Uniform / categorical / proportional anchored-small / proportional anchored-large / range-mapped area | Uniform | - |
| `encoding.sizeField` | Numeric/category field | None | - |
| `encoding.sizeMinimum` / `maximum` | Positive physical extents | 4 pt / 18 pt | - |
| `encoding.sizeDomain` | Auto / manual numeric low and high | Auto | - |
| `encoding.sizeOutOfRange` | Clamp / omit | Clamp | - |
| `encoding.sizeMissing` | Default size / omit | Omit with notice | - |
| `encoding.opacity` | Uniform alpha / category mapping | 1 | - |
| `encoding.pointOrder` | Input / largest first / smallest first | Largest first for bubbles | - |

Categorical colour/size assignments are keyed by category IDs, not by transient sort positions. Changing one mapping must not overwrite unrelated symbol borders or labels. A uniform border can be applied independently from variable-driven fill. [S06]-[S09]

**Area scaling is mandatory.** For proportional scaling from reference value `z_ref` and diameter `d_ref`, use `d=d_ref*sqrt(z/z_ref)`. Reference values must be positive and z nonnegative. For range-mapped area, with `t=(z-z_min)/(z_max-z_min)`, use `d=sqrt(d_min^2+t*(d_max^2-d_min^2))`, with the selected clamp/omit rule. Do not interpolate diameter directly. With values 10,15,20 and endpoint diameters 10,20, the middle diameter is about 15.8114. [S08]

Noncircular shapes must be scaled by their actual filled area when representing numeric magnitude; equal bounding boxes do not imply equal area. Zero-sized observations remain addressable in the inspector. A degenerate size domain uses a declared fixed size and notice, not a division by zero.

### 12.2 Lines and vectors

| Property | Type / values | Default |
|---|---|---|
| `vector.mode` | Origin-to-each / sequential path from first / sequential path from origin | Origin-to-each |
| `vector.originMode` | Zero / axis intersection / explicit | Zero |
| `vector.origin` | X/Y pair | 0,0 |
| `vector.partition` | None / category field | None |
| `vector.colour` | Uniform / per-group mapping | Series colour |
| `vector.strokeWidth` | Uniform / per-group | 1.5 pt |
| `vector.pattern` | Uniform / per-group | Solid |
| `vector.arrows` | Start/end head settings | End head |
| `vector.symbolGap` | Physical clearance / none | None |

An origin-to-each vector layer creates separate segments, not one chain. A sequential layer honours the order key within each partition. The default zero origin cannot be plotted on a logarithmic axis; require a valid explicit origin instead of silently using an epsilon. [S10]

### 12.3 Encoding legends

Colour and size legends are separately enabled and positioned. Combine legends only when they describe the **same discrete category mapping**. Independent continuous colour and size fields require independent legends. Size legend symbols use the same area mapping as plotted symbols; a displayed legend symbol must not be resized without adjusting its represented value or marking that it is schematic. [S77], [S78]

## 13. Matrix heatmaps

A heatmap is a rectangular matrix display, not a continuous XY scatter layer. Row/column labels are categorical even when they look numeric. There is one heatmap plotting region; legends and value labels remain chart decorations. [S42]

### 13.1 Data and colour mapping

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `heatmap.value` | Numeric field/matrix | Required | - |
| `heatmap.replicateSummary` | Mean / median / geometric mean / SD / SEM / percent CV | Mean | Applies only when replicates are supplied. |
| `heatmap.normalisation` | None / row / column | None | P graph-local transformation. |
| `heatmap.normalisationMethod` | Centre / z-score / min-max | Z-score when enabled | Declare across which cells; zero denominator gives missing+notice. |
| `heatmap.colourMode` | Single gradient / grayscale / rainbow / diverging / numeric intervals | Single gradient | - |
| `heatmap.minimum` / `maximum` | Auto / finite value | Auto | - |
| `heatmap.centre` | Auto / finite value | Midpoint for diverging | - |
| `heatmap.lowColour` / `highColour` | RGBA | Theme endpoints | - |
| `heatmap.centreColour` | RGBA | White | - |
| `heatmap.reverseColours` | Boolean | False | - |
| `heatmap.colourTransform` | Linear / log-positive | Linear | P explicit transform; independent from matrix normalisation. |
| `heatmap.colourInterpolation` | sRGB / linear-light RGB | sRGB | P exact interpolation contract. |
| `heatmap.intervals` | Ordered boundaries plus colours | None | For interval/categorical colour mapping. |
| `heatmap.belowColour` / `aboveColour` | Endpoint / explicit RGBA | Endpoint | - |
| `heatmap.missingColour` | RGBA | Light grey | - |
| `heatmap.excludedColour` | RGBA | White | - |
| `heatmap.missingMark` / `excludedMark` | None / cross | Cross | - |

Replicate reduction precedes matrix normalisation and colour scaling. A geometric mean rejects nonpositive included values. Percent CV is undefined at a zero mean; the convention for a negative mean must be explicit. Labels can show original or transformed values, but must identify which.

Single-gradient, grayscale/reverse, rainbow/reverse, diverging-centred and numeric-interval mappings are documented. [S43] Numeric colour intervals use half-open ranges `[b_i,b_(i+1))`, with an explicitly inclusive final maximum. A value exactly on a boundary belongs to one interval only. Auto min/max excludes missing and explicitly excluded cells; reversing colours does not reverse row order.

### 13.2 Cell geometry, labels and gaps

| Property | Type / values | Default |
|---|---|---|
| `heatmap.rowOrder` / `columnOrder` | Explicit IDs / input / reverse | Input |
| `heatmap.transpose` | Boolean | False |
| `heatmap.sizeMode` | Plot size / cell size | Plot size |
| `heatmap.cellWidth` / `cellHeight` | Positive physical lengths | Auto |
| `heatmap.cellAspectLock` | Boolean / ratio | Off |
| `heatmap.cellBorder` | Stroke block / none | None |
| `heatmap.outerBorder` | Stroke block / none | None |
| `heatmap.rowGap` / `columnGap` | Nonnegative physical lengths | 0 |
| `heatmap.specialGaps` | Boundary ID and extra gap | None |
| `heatmap.valuesVisible` | Boolean | False |
| `heatmap.valueSource` | Original / reduced / normalised | Reduced |
| `heatmap.valueFormat` | Number format block | Auto |
| `heatmap.valueColour` | Automatic contrast / explicit | Automatic contrast |
| `heatmap.valueStyle` | Text block | 10 pt regular |
| `heatmap.rowLabelSide` | Left / right / both / none | Left |
| `heatmap.columnLabelSide` | Bottom / top / both / none | Bottom |
| `heatmap.labelRotation` | Separate row/column angle | 0 |

Automatic contrast chooses a readable dark/light label against the **composited** cell colour. Transpose swaps the row/column roles and associated labels while preserving stable cell identities. Gaps are real layout objects, not inserted missing observations. [S44]-[S46]

### 13.3 Heatmap colourbar

Expose visibility, horizontal/vertical orientation, title, endpoints, intermediate ticks, number formatting, label side, reversal, width/height, border, background and placement. Numeric-interval maps use discrete swatches or stepped bars; continuous maps use a continuous gradient. Missing/excluded categories can receive separate swatches rather than fictional numeric colourbar positions. The scale must match the heatmap's actual transform and clipping. [S47]

## 14. Parts-of-whole charts

These presets share a composition calculation and per-part styling. Pie, doughnut, a single horizontal/vertical stacked bar, and a dot grid are required. The dot grid is a composition display, not an individual-observation scatter plot. [S48]

### 14.1 Shared composition settings

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `whole.valueField` | Nonnegative weight/count | Required | - |
| `whole.partField` | Unique part ID/category | Required | - |
| `whole.order` | Input / reverse / explicit / value ascending or descending | Input | - |
| `whole.normalisation` | Included total / supplied total | Included total | - |
| `whole.partVisible` | Per-part Boolean | True | Hiding does not exclude from denominator. |
| `whole.partExcluded` | Per-part Boolean | False | Exclusion recalculates the denominator. |
| `whole.partFill` | Per-part fill block | Theme palette | - |
| `whole.partBorder` | Stroke block | 0.5 pt | - |
| `whole.outerBorder` | Stroke block | 1 pt | - |
| `whole.labels` | Name / value / percent / combinations / none | None; legend on | - |
| `whole.percentDigits` | Nonnegative integer | 1 | - |
| `whole.totalVisible` | Boolean | False | - |
| `whole.totalPrefix` / `suffix` | Text | "Total = " / empty | - |
| `whole.totalStyle` | Text block | Theme annotation | - |
| `whole.legendComponents` | Swatch, name, value, percent toggles | Swatch and name | - |

Weights must be finite, nonnegative and have a positive included total. Negative parts cannot be made valid by taking absolute values. Zero parts retain their IDs and optional legend entries; never fabricate a tiny positive slice to preserve a label. If a supplied denominator exceeds the included sum, display the unallocated remainder explicitly or reject; do not silently close the circle with mislabelled percentages.

### 14.2 Pie and doughnut geometry

| Property | Type / values | Default |
|---|---|---|
| `pie.startAngle` | Degrees from top, clockwise-positive | 0 |
| `pie.direction` | Clockwise / counterclockwise | Clockwise |
| `pie.diameter` | Positive physical length / fit | Fit |
| `pie.aspectRatio` | Width/height, positive | 1 |
| `pie.explode` | Per-part offset as fraction of radius | 0 |
| `pie.labelPosition` | Inside / outside / automatic | Automatic when labels enabled |
| `pie.labelLeader` | Stroke block / none | On for outside labels |
| `doughnut.holeFraction` | 0 <= h < 1 | 0.5 |
| `doughnut.totalPlacement` | Centre / custom | Centre |

Exact start-angle, collision and aspect-ratio defaults are P. Segment angle is `2*pi*weight/total`. Exploded parts move along their angular bisectors without changing angles or percentages. Border seams must not be double-width at adjacent slices; outer and internal borders are drawn as separate roles.

### 14.3 Whole-bar and dot-grid settings

| Property | Type / values | Default |
|---|---|---|
| `wholeBar.orientation` | Horizontal / vertical | Horizontal |
| `wholeBar.length` / `thickness` | Positive physical lengths / fit | Fit / 24 pt |
| `wholeBar.segmentGap` | Nonnegative physical length | 0 |
| `dotGrid.dotCount` | Positive integer | 100 |
| `dotGrid.columns` | Positive integer | 10 |
| `dotGrid.rows` | Calculated or explicit compatible count | Calculated |
| `dotGrid.shape` | Circle / square / supported symbol | Circle |
| `dotGrid.size` | Physical extent / fit | Fit |
| `dotGrid.gap` | Nonnegative physical length | 2 pt |
| `dotGrid.fillOrder` | Row-first / column-first; direction switches | Row-first from lower left |
| `dotGrid.apportionment` | Largest remainder | Largest remainder (P) |

For N dots, compute `q_i=N*w_i/total`, assign `floor(q_i)`, then distribute remaining dots by descending fractional remainder, ties resolved by part order. The sum must equal N. Percent labels reflect original weights, not rounded dot counts. For weights 1,1,1 and N=100, the deterministic allocation is 34,33,33.

## 15. Survival and cumulative-event curves

### 15.1 Input and inspector controls

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `survival.timeField` | Nonnegative time/duration | Required | - |
| `survival.eventField` | Binary status or mapped labels | Required | - |
| `survival.eventCode` / `censorCode` | Distinct declared codes | 1 / 0 (D convention) | - |
| `survival.groupField` | Categorical field | Single group | - |
| `survival.timeUnit` | Explicit unit | Data-derived | - |
| `survival.display` | Survival / cumulative event | Survival | - |
| `survival.units` | Fraction / percent | Percent | - |
| `survival.interval` | None / SE / pointwise CI | None until selected | - |
| `survival.confidenceLevel` | 0 < C < 1 | 0.95 | - |
| `survival.ciMethod` | Log-log Greenwood / symmetric Greenwood | Log-log Greenwood (D recommended method) | - |
| `survival.uncertaintyDisplay` | Error bars / band / bound paths | Band | - |
| `survival.connection` | Step-after / straight | Step-after | - |
| `survival.symbols` | Censored only / all recorded times / none | Censored only | - |
| `survival.censorSymbol` | Symbol block | Plus, 5 pt | - |
| `survival.terminalCensorMark` | Always / respect symbol setting | Always | Explicit legacy-style terminal indication. |
| `survival.extendTo` | Last observed time / explicit time within known follow-up | Last observed time | - |
| `survival.medianMarker` | None / reference lines / labelled point | None | - |
| `survival.fill` | None / below / above | None | - |

Raw time-to-event values must be sufficient to calculate the curve; a raw count of events divided by total subjects is not a substitute when censoring occurs. Date inputs first produce explicitly defined elapsed durations. Unknown status codes are invalid rather than silently treated as censored. [S34]-[S36]

### 15.2 Calculation contract

For each group, sort times and combine ties. At event time t_j, let n_j be subjects at risk just before that time, d_j events and c_j censored observations. Calculate

`S(t) = product over t_j <= t of (1 - d_j/n_j)`.

Subjects with an event or censoring at t_j are both in the pre-time risk set. Apply the event decrement before removing tied censored observations. Draw the horizontal portion up to the event and the drop at the event; censor marks at a tied time use the post-event survival level. [S35]

For `0<S<1`, Greenwood cumulative term is `G=sum(d_j/[n_j*(n_j-d_j)])`, so `SE(S)=S*sqrt(G)`. With `g=ln(-ln(S))`, transformed standard error is `sqrt(G)/abs(ln(S))`. For `z=Phi^-1(1-alpha/2)`, log-log limits are

`lower=exp(-exp(g+z*SE_g))`,  
`upper=exp(-exp(g-z*SE_g))`.

Symmetric limits are `S +/- z*SE(S)` clipped to [0,1]. Log-log pointwise intervals are explicitly documented, despite less precise wording on an older explanatory page. These are not simultaneous coverage bands. [S35]

Boundary treatment is P: omit undefined transformed limits at S=0 or S=1, retain the survival path, and stop the band at the last finite bound instead of extrapolating fabricated uncertainty. A group with no events stays at 1 over observed follow-up; its median is not reached. An event at time zero is allowed and drawn using explicit pre/post-event states, not altered to an arbitrary small time.

Cumulative-event values are `F=1-S`; transformed interval endpoints become `[1-upper_S,1-lower_S]`. This is not a competing-risk cumulative-incidence estimator. Median survival is the first event time where S<=0.5, or "not reached". No mean survival, hazard model, or automatic group-comparison report is required.

## 16. ROC curves

### 16.1 Controls

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `roc.scoreField` | Numeric score | Required | - |
| `roc.truthField` | Binary ground truth | Required | - |
| `roc.positiveClass` | One declared class | Required | - |
| `roc.direction` | Higher score positive / lower score positive | Higher | Never choose the better-looking direction silently. |
| `roc.seriesField` | Score series/group | Single curve | - |
| `roc.units` | Fraction / percent | Fraction | - |
| `roc.xQuantity` | False-positive rate / specificity | False-positive rate | Specificity mode can reverse X to preserve familiar orientation. |
| `roc.connection` | Empirical straight segments / steps | Straight segments | - |
| `roc.symbols` | None / threshold points | None | - |
| `roc.thresholdLabels` | None / selected / all | None | - |
| `roc.chanceLine` | Boolean plus stroke | True | - |
| `roc.aucLabel` | None / AUC | None | - |
| `roc.coordinateIntervals` | None / exact binomial | None | - |
| `roc.confidenceLevel` | 0 < C < 1 | 0.95 | - |
| `roc.intervalGeometry` | X/Y error bars | Error bars | - |
| `roc.axisAspect` | Equal physical scales / free | Equal | - |

The initial preset fixes both coordinate domains to 0..1 or 0..100 and does not offer axis breaks or generic LOWESS smoothing. Multiple ROC curves may share the one chart. An optional supplied bound layer must identify its method; there is no automatic conversion of an AUC interval into a ROC ribbon. [S37], [S38]

### 16.2 Coordinate and AUC construction

Use all distinct pooled score thresholds and outer thresholds representing all-negative/all-positive classification. Combine equal scores before advancing either coordinate; do not split ties in an order chosen by class. For higher-positive scores, sensitivity is TP/P and false-positive rate is FP/N. Threshold labels can use safe midpoints between adjacent distinct scores. [S38]

The empirical AUC is trapezoidal area under the resulting ordered ROC curve. It also equals the fraction of positive-negative score pairs in the correct order plus half the tied-pair fraction. A perfect separation yields 1; all tied scores yield 0.5. Do not replace an AUC below 0.5 with its complement without changing and disclosing the positive direction.

For exact coordinate uncertainty, use two-sided Clopper-Pearson intervals independently for sensitivity and specificity. For k successes out of n and alpha=1-C, lower is 0 when k=0, otherwise the alpha/2 quantile of `Beta(k,n-k+1)`; upper is 1 when k=n, otherwise the `1-alpha/2` quantile of `Beta(k+1,n-k)`. False-positive-rate limits are one minus reversed specificity limits. [S38]

These coordinate intervals are marginal intervals at thresholds, not a simultaneous two-dimensional confidence region. At least one positive and one negative observation are required. A separate AUC confidence calculation is not needed merely to draw the curve; it may be supplied with a method label. Raw ROC generation itself is required, not delegated to external data preparation.

## 17. Fitted and generated curves

### 17.1 Fitted curves as chart layers

A fit is a chart-bound producer of a curve and optional uncertainty. The original observations remain a separate layer. Displaying only a selected X range must not change the fit domain. Adding a fitted curve must not replace point-to-point connections without an explicit user action. [S03], [S62]

| Property | Type / values | Default | Conditions |
|---|---|---|---|
| `fit.mode` | Estimate parameters / supplied parameters / supplied coordinates | Estimate | - |
| `fit.model` | Model preset / safe custom expression | Explicit selection | - |
| `fit.input` | Individual observations / per-X summaries | Individual observations | Independence assumptions must be declared for intervals. |
| `fit.seriesMode` | Separate fit per series / selected series only | Separate | No shared-parameter global fit required. |
| `fit.domain` | All included data / explicit X interval / explicit observation selection | All included | - |
| `fit.curveDomain` | Fit-domain range / data range / explicit interval | Fit-domain range | - |
| `fit.extrapolationVisible` | Boolean | False | Extrapolated region receives warning or distinct style. |
| `fit.weights` | Equal / supplied inverse variance / supplied nonnegative weights | Equal | - |
| `fit.parameterValues` | Name-to-number map | Preset initialisation | - |
| `fit.parameterBounds` | Optional lower/upper bounds | Model domain bounds | - |
| `fit.fixedParameters` | Parameter-name set | Empty | - |
| `fit.objective` | Least squares in declared response space | Least squares | - |
| `fit.xTransform` / `yTransform` | Identity / explicit derived field | Identity | Visual log axes do not select log fitting. |
| `fit.maxIterations` | Positive integer | 1000 (P) | - |
| `fit.relativeTolerance` | Positive scalar | 1e-8 (P) | - |
| `fit.curveSegments` | Positive integer | 150 | - |
| `fit.sampling` | Uniform X / uniform transformed X / adaptive | Adaptive | - |
| `fit.band` | None / fitted-mean CI / prediction interval | None | - |
| `fit.confidenceLevel` | 0 < C < 1 | 0.95 | - |
| `fit.bandMethod` | Classical linear / local-Jacobian approximation / supplied | Model-dependent | - |
| `fit.labelContent` | Equation / selected parameters / none | None | - |

X error bars remain visual unless the selected fitter explicitly models uncertainty in X. Do not imply ordinary least squares accounts for them. A weighted fit must state whether supplied weights are known inverse variances or relative weights; that affects covariance scaling and prediction uncertainty.

### 17.2 Required initial model presets

These are **P model presets** sufficient for common plotted relationships, not a claim to reproduce an entire domain-specific equation library. Arbitrary safe formulas and supplied curves extend the plotting surface without creating a general analysis workspace. Curve generation and model-based regression remain distinct operations. [S63], [S64]

| Model ID | Formula / behaviour | Constraints |
|---|---|---|
| `linear` | `a+b*x` | Optional fixed intercept. |
| `polynomial` | `sum(a_j*x^j)` | Degree 2..6 initially; normalise X internally for conditioning. |
| `exp_decay` | `c+A*exp(-k*x)` | k>=0. |
| `exp_association` | `c+A*(1-exp(-k*x))` | k>=0. |
| `exp_two_phase` | `c+A1*exp(-k1*x)+A2*exp(-k2*x)` | Nonnegative rates; report identifiability problems. |
| `gaussian_peak` | `c+A*exp(-0.5*((x-mu)/sigma)^2)` | sigma>0. |
| `hyperbola` | `c+V*x/(K+x)` | Domain excludes denominator zero; conventional positive-X preset. |
| `hill_4pl` | `b+(t-b)/(1+(c/x)^h)` | x>0, c>0; sign of h controls direction. |
| `asymmetric_5pl` | `b+(t-b)/(1+(c/x)^h)^s` | x,c,s>0; c is not generally the half-height point when s!=1. |
| `custom` | Validated expression and named parameters | No arbitrary code execution or external I/O. |

A dose-response chart is usually a model curve plus data on a logarithmic concentration axis, not another drawing primitive. The inspector must distinguish raw concentration X from a precomputed logarithm of concentration so that logarithms are not applied twice.

### 17.3 Fitting and interval calculation requirements

Linear least squares must use a numerically stable solver. Nonlinear least squares must use a bounded, convergence-checked procedure with reproducible initialisation. Parameter scaling, fixed values and bounds must be included in the calculation identity. A failed or singular fit cannot be displayed as successfully converged.

For independent homoscedastic linear observations, with design row `v(x)`, residual variance `s_r^2=RSS/(n-p)`, and coefficient covariance `V=s_r^2*(X'X)^(-1)`, fitted-mean SE is `sqrt(v*V*v')`. Pointwise confidence limits use the relevant t quantile with n-p degrees of freedom. Prediction SE is `sqrt(v*V*v'+s_r^2)` for one future independent observation.

For a nonlinear model, the initial P uncertainty method uses the local parameter Jacobian and covariance approximation: `SE_mean(x)=sqrt(J(x)*V*J(x)')`. The inspector labels these intervals **approximate, pointwise**. Prediction intervals additionally require an explicit residual variance model. Parameter confidence intervals, especially profile-likelihood parameter intervals, must not be repurposed as curve bands. [S25], [S26]

Bands are unavailable when there are no residual degrees of freedom, the covariance is singular, convergence fails, or the assumed variance model is unsupported. A central curve may still be shown with a visible warning if its numerical evaluation is valid. Repeated measures require a declared assumption; the package must not silently treat every repeat as independent for inferential bands.

### 17.4 Generated functions and curve families

| Property | Type / values | Default |
|---|---|---|
| `function.expression` | Safe scalar expression in x and parameters | Required |
| `function.parameters` | Named numeric values | Required by expression |
| `function.family` | List of parameter sets | One set |
| `function.minimumX` / `maximumX` | Ordered finite values | Explicit |
| `function.segments` | Positive integer | 150 (D documented baseline) |
| `function.sampling` | Linear X / logarithmic X / adaptive | Adaptive (P) |
| `function.derivative` | None / first / second | None |
| `function.integral` | None / cumulative from explicit lower limit | None |
| `function.discontinuityPolicy` | Split and report | Split |
| `function.legendLabel` | Parameter-based / custom | Parameter-based |

Generate one curve per parameter set inside the same plotting region. Adaptive sampling supplements the nominal segment count until a declared screen-space tolerance is met, subject to a vertex limit. It must split at undefined values, poles and discontinuities rather than draw long misleading bridges. Derivative/integral settings produce distinct labelled layers. Analytic or automatic derivatives are preferred where supported; numerical fallback must expose tolerance and failure. [S63]

## 18. Specialised chart recipes

These recipes reuse the preceding geometries and therefore inherit their appropriate settings. They must not expose unrelated controls merely because their implementation uses a common XY renderer.

### 18.1 Normal quantile-quantile plot

| Property | Type / values | Default |
|---|---|---|
| `qq.values` | Numeric observation field | Required |
| `qq.orientation` | Observed X, expected Y / expected X, observed Y | Observed X, expected Y |
| `qq.plottingPosition` | `i/(n+1)` / `(i-0.375)/(n+0.25)` | `i/(n+1)` (P) |
| `qq.expectedScale` | Fitted mean/SD / standard normal / supplied mean/SD | Fitted mean/SD |
| `qq.reference` | Identity / quartile line / supplied line / none | Identity on fitted original-unit scale |
| `qq.symbols` | Symbol block | Circle, 5 pt |
| `qq.labels` | Point-label block | Off |

Sort observed values. Calculate probabilities with the selected rule and expected normal quantiles using an inverse normal CDF. On fitted original-unit scale, expected values are `mean + sd*Phi^-1(p_i)`. On standard-normal scale they are simply `Phi^-1(p_i)`. Reference lines must be defined in those coordinates, not always drawn as a screen diagonal. Do not calculate or display a normality-test p value merely because a QQ plot was selected. [S39]

### 18.2 Bland-Altman/agreement plot

| Property | Type / values | Default |
|---|---|---|
| `agreement.aField` / `bField` | Matched numeric fields | Required |
| `agreement.pairId` | Subject/pair key | Required or explicitly positional |
| `agreement.mode` | Difference / percent difference / ratio | Difference |
| `agreement.differenceDirection` | B-A / A-B | B-A |
| `agreement.x` | Mean of pair / A / B | Mean of pair |
| `agreement.limitMultiplier` | Positive scalar | 1.96 |
| `agreement.biasLine` | Stroke and label toggle | On |
| `agreement.limitLines` | Two stroke and label blocks | On, dashed |
| `agreement.limitRegion` | Optional reference-region fill | Off |
| `agreement.missingPairPolicy` | Omit incomplete pair / reject | Omit and report |

For difference mode, `x_i=(A_i+B_i)/2`, `d_i=B_i-A_i` under the default direction, bias=`mean(d)`, and limits of agreement=`bias +/- 1.96*sd(d)`. Those limits describe dispersion of pair differences; they are not a confidence interval of bias. [S40], [S41]

For percent difference, the P definition is `100*(B-A)/((A+B)/2)`; zero denominators are invalid. For ratio mode, require positive measurements, summarise `ln(B/A)`, and exponentiate bias and limits. The inspector must display the actual formula so alternative percentage/ratio conventions are not conflated. Confidence intervals for bias or limits are not generated by styling the reference region.

### 18.3 Residual plot

| Property | Type / values | Default |
|---|---|---|
| `residual.modelLayer` | Compatible fitted layer / supplied predictions | Required |
| `residual.x` | Original X / fitted Y | Fitted Y |
| `residual.kind` | Raw / divided by residual SD / internally studentised | Raw |
| `residual.zeroLine` | Stroke and label | On |
| `residual.labels` | Point-label block | Off |

Raw residual is observed minus predicted. Scaling by residual SD is available only when that SD exists. Internally studentised residuals require a fitter that supplies leverage and the correct formula, not just a renamed SD-normalised residual. The residual chart uses a stored/local model result; it does not refit a different model when the X-axis display changes. A single chart can display residuals or original observations, not automatically create a multi-panel diagnostic figure.

### 18.4 Forest plot

| Property | Type / values | Default |
|---|---|---|
| `forest.estimate` / `lower` / `upper` | Numeric fields | Required |
| `forest.rowLabel` | Text field | Required |
| `forest.intervalMeaning` | CI / prediction / range / supplied interval | Supplied interval |
| `forest.nullValue` | Finite value | 0 for differences; 1 for ratios |
| `forest.scale` | Linear / log-positive | Linear |
| `forest.symbol` | Symbol block | Square |
| `forest.weightField` | Nonnegative magnitude / none | None |
| `forest.rowOrder` | Explicit / input / estimate order | Input |
| `forest.rowSpacing` | Physical length / fit | Fit |
| `forest.estimateLabels` | None / estimate / estimate and interval | None |
| `forest.summaryRows` | Explicitly supplied summary-row IDs | Empty |
| `forest.summaryShape` | Diamond / ordinary symbol | Diamond |

Use horizontal interval segments and a vertical reference line. Optional symbol area may encode supplied study weight, with the same truthful area scaling as bubbles. A diamond can represent an explicitly supplied summary estimate and limits. The preset does not calculate a meta-analytic pooled effect or manufacture a study weight from sample size. [S69]

### 18.5 Volcano plot

| Property | Type / values | Default |
|---|---|---|
| `volcano.input` | Supplied fold change and p / explicitly configured raw comparisons | Supplied |
| `volcano.foldRepresentation` | Ratio / log2 fold change | Log2 |
| `volcano.pRepresentation` | Raw p / adjusted p | Explicit, no guessing |
| `volcano.foldThreshold` | Nonnegative log2 magnitude | 1 (P visual preset) |
| `volcano.pThreshold` | 0 < p <= 1 | 0.05 (P visual preset) |
| `volcano.classification` | Below threshold / positive change / negative change | Three classes |
| `volcano.zeroP` | Report lower bound and cap / reject | Report and cap only with known numerical bound |
| `volcano.labels` | None / selected / threshold-passing / top N | None |
| `volcano.topN` | Positive integer plus ranking field | 10 by p |

Map ratio fold changes through log2, and p values through `-log10(p)`. Values already in log2 units must not be transformed again. If the selected p field is adjusted, both the axis title and threshold description say so.

Raw-input mode requires explicit groups, a comparison method from Section 19, the correction family and fold-change definition. A default P fold change may be the ratio of positive arithmetic group means; zeros do not get an automatic pseudocount. An underflowed p=0 is not an exact zero probability: cap only against a declared numerical bound and mark the point. [S69]

### 18.6 Population pyramid and offset traces

For a pyramid, require category, left-series magnitude and right-series magnitude. Both magnitudes remain nonnegative in the data. Apply the sign inversion only in the display mapping for the left series; format tick labels as positive magnitudes. Expose category order, a common symmetric magnitude range, group-specific fill/border, gaps, centre-axis placement, counts versus declared percentages, and left/right series labels. Do not choose separate incomparable scales by default. [S69]

For offset traces, expose per-series X/Y display offsets, original-value labels, series order, line style and optional scale bars. Offsets are not cumulative unless explicitly generated that way. The chart description must disclose offsets; a conventional unqualified Y axis can otherwise imply false measurement levels. [S05]

## 19. Labels, legends, and annotations

### 19.1 Series legends

| Property | Type / values | Default |
|---|---|---|
| `legend.visible` | Automatic / on / off | Automatic: on for multiple informative series |
| `legend.entries` | Selected layer/category IDs | All eligible |
| `legend.order` | Explicit / series order / reverse | Series order initially |
| `legend.textSource` | Live data label / custom | Live |
| `legend.title` | None / mapped variable / custom | None for series legend |
| `legend.keyType` | Symbol / line / both / square / rectangle / patch | Geometry-derived |
| `legend.keyWidth` / `keyHeight` | Physical lengths | 25.2 pt / auto |
| `legend.textStyle` | Text block | 11.2 pt regular |
| `legend.titleStyle` | Text block | 14 pt bold |
| `legend.position` | Left / right / top / bottom / inside / explicit | Right |
| `legend.anchor` | Chart-relative or plot-relative position | Right centre |
| `legend.columns` | Positive integer / auto | 1 |
| `legend.entrySpacing` | Nonnegative physical lengths | Theme spacing |
| `legend.padding` | Four physical lengths | 7 pt each |
| `legend.background` | Fill block | None |
| `legend.border` | Stroke block / none | None |
| `legend.mergeCompatible` | Boolean | True for identical discrete mappings |

Editing legend text detaches only that entry from its data-label binding. A reset command restores the binding. Deleting an entry from the legend must not delete the series or exclude its observations. Legend order can differ from layer order. [S79]

Colourbars also expose domain, tick step/start, explicit ticks, orientation, reversal, label formatting and border. Size legends expose represented values, number of entries, symbols and arrangement, and must honour the actual size mapping. Independently encoded variables must never be merged into a misleading single legend. [S77], [S78], [S80]

### 19.2 General annotations

| Property | Type / values | Default |
|---|---|---|
| `annotation.type` | Text / line / arrow / double-arrow / rectangle / ellipse / bracket / polyline / polygon | Text |
| `annotation.anchorMode` | Data coordinates / plot-relative fractions / chart physical coordinates / object IDs | Plot-relative |
| `annotation.axisBinding` | Primary / secondary value axis | Primary |
| `annotation.position` | Coordinates appropriate to anchor mode | Explicit |
| `annotation.targetIds` | Stable point/category/layer IDs | Empty |
| `annotation.text` | Rich text or scalar binding | Empty |
| `annotation.stroke` / `fill` | Common style blocks | Black stroke / no fill |
| `annotation.arrowheads` | Start/end types, sizes | None |
| `annotation.rotation` | Degrees | 0 |
| `annotation.zOrder` | Behind data / above data / explicit | Above |
| `annotation.clip` | Plot / chart / none | Chart |
| `annotation.locked` | Boolean | False |
| `annotation.visible` | Boolean | True |

Data-anchored objects move with data and scales; plot-relative objects move with the plotting region; physical chart objects retain their physical placement. The inspector must show which mode is active. Bound values can include n, a summary, AUC, fit coefficients, or median survival, with a method-aware label. A stale value must not remain styled as current after its source calculation fails. [S49]

### 19.3 Comparison brackets and significance labels

| Property | Type / values | Default |
|---|---|---|
| `comparison.source` | Manual text / supplied p / calculated p | Explicit |
| `comparison.targets` | Two category/series IDs or one target and a reference value | Required |
| `comparison.labelMode` | Numeric p / stars / custom text | Numeric p |
| `comparison.prefix` | "p = " / "P = " / custom / none | "p = " |
| `comparison.pDigits` | Significant digits / fixed decimals / threshold format | 3 significant digits |
| `comparison.starThresholds` | Ordered probability-to-text map | <=0.05: *, <=0.01: **, <=0.001: ***, <=0.0001: **** |
| `comparison.nonSignificantText` | Text / hidden | "ns" |
| `comparison.visibility` | All selected / p below cutoff / explicit subset | All selected |
| `comparison.cutoff` | 0..1 | 0.05 when filter enabled |
| `comparison.bracketStyle` | Elbow bracket / straight connector / connector with label gap | Elbow bracket (P exact styles) |
| `comparison.stroke` | Stroke block | 1 pt black |
| `comparison.tipLength` | Physical length | 4 pt |
| `comparison.labelGap` | Physical length | 3 pt |
| `comparison.textStyle` | Text block | 12 pt regular |
| `comparison.starSize` | Positive physical length | 14 pt |
| `comparison.placement` | Automatic lanes / explicit coordinate | Automatic |
| `comparison.stackGap` | Physical length | 8 pt |
| `comparison.labelSide` | Above/below or left/right after rotation | Away from data |
| `comparison.horizontalTextDirection` | Up / down / horizontal | Horizontal |

Each comparison can override line and text appearance. Brackets remain attached to stable group IDs after category reorder. Automatic placement must clear error endpoints, outliers and other brackets; on log axes, lane gaps are physical, not additive data values. Filtering displayed comparisons must not change the multiple-comparison correction family. Numeric/star labels, filtering, independent star/text size and bracket styling are documented capabilities. [S81]

### 19.4 Bounded calculation service for plotted comparisons

Calculated labels are in scope because they are explicitly requested chart elements. The following is a **P bounded calculation surface**, not a requirement to reproduce every statistical procedure that can supply a p value.

| Method | Required inputs and controls | Required safeguards |
|---|---|---|
| One-sample t | Values, reference mean, alternative | n>=2 and estimable variance. |
| Welch two-sample t | Two groups, alternative | Independent groups declared; separate sample variances. |
| Equal-variance two-sample t | Two groups, alternative | User explicitly selects pooled-variance assumption. |
| Paired t | Matched pairs, alternative | Calculate on paired differences; report omitted incomplete pairs. |
| Mann-Whitney/rank-sum | Two independent groups, alternative | Ties and exact/asymptotic method explicitly handled. |
| One-sample/paired signed-rank | Values or matched differences, reference, alternative | Zero-difference rule and effective pair count stated. |
| Two-curve logrank | Two bound survival groups | Tied-event risk sets and variance calculation preserved. |
| Supplied result | p value plus method/adjustment metadata | Validate p in [0,1]; never imply the package recomputed it. |

The t methods use the declared alternative and the appropriate t distribution. Welch degrees of freedom use the Satterthwaite expression. Paired t reduces to a one-sample test of the differences. Display method, input counts and assumptions alongside the label controls, not in a separate report. [S82]

Rank procedures use average ranks for ties. The initial signed-rank convention discards exact zero differences before ranking absolute nonzero differences and reports their number. Use an exact conditional/permutation reference distribution when the selected implementation supports the problem size; otherwise use a declared, tie-corrected normal approximation with an explicit continuity-correction setting. The result stores which method actually ran. It must not mislabel a rank-sum procedure as a universal test of unequal medians. [S83]

For two-curve logrank, sum `d_1j - n_1j*d_j/n_j` over event times, with variance contributions `n_1j*n_0j*d_j*(n_j-d_j)/(n_j^2*(n_j-1))` where defined. Compare the squared standardised total with a one-degree-of-freedom chi-square distribution. A zero total variance produces unavailable, not a fabricated p value. [S84]

| Property | Type / values | Default |
|---|---|---|
| `comparison.method` | Listed computed method | User must select |
| `comparison.alternative` | Two-sided / greater / less | Two-sided |
| `comparison.referenceValue` | Finite value | 0 for differences |
| `comparison.family` | Explicit list of comparison IDs | All configured comparisons in named family |
| `comparison.adjustment` | None / Bonferroni / Holm / BH / BY | Holm for multiple configured comparisons; explicit selection shown |
| `comparison.rankExactMode` | Automatic / exact / approximation | Automatic |
| `comparison.continuityCorrection` | Boolean | True for normal rank approximation |

For m p values, Bonferroni returns `min(1,m*p)`. Holm sorts ascending and takes cumulative maxima of `(m-i+1)*p_(i)`, capped at 1. BH takes reverse cumulative minima of `m*p_(i)/i`, capped at 1; BY multiplies the BH factor by `sum(1/j,j=1..m)`. Restore original comparison order after adjustment. The legend/label must distinguish adjusted from unadjusted values. [S85]

There is no automatic choice of test after a normality screen. Multi-factor, mixed-effects, complex post-hoc, or other unsupported designs can supply labelled results but are not silently approximated by pairwise t tests. Removing a bracket visually does not remove that test from its declared correction family.

## 20. Initial visual theme

### 20.1 Appearance target and units

The initial look is a white scientific plotting surface with strong axes, clean sans-serif typography, compact solid symbols, sparse decoration and independently styled data series. Gridlines and a full border are off by default. Legends use less emphatic text than titles and axis labels. These general traits are supported by the supplementary theme documentation. [S66], [S67]

All physical quantities must resolve to one internal unit. Use `1 inch=25.4 mm=72 pt` and `1 CSS px=0.75 pt` at the browser's nominal 96 px/in conversion. Browser zoom and device-pixel ratio affect rasterisation, not the stored chart size.

### 20.2 Numeric starting tokens

The typographic ratios below are derived from the inspected supplementary theme definition, not asserted as universal defaults of every source chart. The chosen stroke calibration is P: a foreign renderer's numerical linewidth is not automatically a point value. [S67], [S86]

| Token | Initial value | Status |
|---|---:|---|
| Base text size | 14 pt | D supplementary theme value |
| Font family | Sans-serif | D supplementary theme value |
| Axis titles | 14 pt bold | Derived from documented theme inheritance |
| Tick labels | 13.3 pt bold | D ratio 0.95 of base |
| Chart title | 16.8 pt bold | D ratio 1.2 of base |
| Legend text | 11.2 pt regular | D ratio 0.8 of base |
| Legend title | Hidden | D supplementary default |
| Major tick length | 5.6 pt | D ratio base/2.5 |
| Minor tick length | 2.8 pt | D supplementary custom-tick token |
| X tick-label gap | 2.8 pt | D formula |
| Y tick-label gap | 1.75 pt | D formula |
| Axis-title gap | 8.4 pt | D formula |
| Outer margin | 7 pt minimum before layout expansion | D formula, P adaptive interpretation |
| Legend key width | 25.2 pt | D formula |
| Axis/frame stroke | 0.75 mm, approximately 2.126 pt | P initial calibration |
| Data path stroke | 1.5 pt | P |
| Symbol extent | 6 pt | P |
| Symbol border | 0.75 pt | P |
| Error stem / cap width | 1 pt | P |
| Error cap full length | 5 pt | P |
| Box/violin border | 1 pt | P |
| Uncertainty fill opacity | 0.20 | P |
| Background and plot background | White | D general theme trait |
| Text and axes | Black | D general theme trait |
| Gridlines / full frame | Off / off | D supplementary defaults |

Use one explicitly selected sans-serif font asset/version for deterministic deployment. The inspector can offer other available fonts, but must disclose fallback substitution. Matching generic family names alone does not guarantee matching metrics. No font files are part of this specification.

### 20.3 Palette and theme controls

| Property | Type / values | Default |
|---|---|---|
| `theme.baseFontSize` | Positive pt | 14 |
| `theme.fontFamily` | Available family | Deployment-selected sans-serif |
| `theme.scaleStrokesWithText` | Boolean | True for theme-derived tokens only |
| `theme.scaleSymbolsWithText` | Boolean | False |
| `theme.seriesPalette` | Named ordered colours / custom RGBA list | Initial colour sequence below |
| `theme.fillPalette` | Shared with series / separate palette | Shared |
| `theme.shapePalette` | Filled / open / mixed / explicit sequence | Mixed |
| `theme.patternPalette` | Explicit sequence / none | None |
| `theme.assignment` | Stable category IDs / explicit map | Stable IDs |
| `theme.paletteOverflow` | Repeat with additional shapes/patterns / require expansion | Repeat with warning and shape distinction |
| `theme.continuousPalette` | Sequential / diverging / grayscale / rainbow / custom stops | Sequential |
| `theme.roleColours` | Per-role colours for axes, titles, labels, background, plot | Scientific light |

**P seed colour sequence:** `#000000`, `#0072B2`, `#D55E00`, `#009E73`, `#CC79A7`, `#E69F00`, `#56B4E9`, `#F0E442`. This is a usable starting palette, **not a claim of exact source palette RGB values**. The complete source palette arrays were not verified in this research and remain fidelity work. Source documentation confirms separate colour/fill/shape palette mechanisms and many named palettes. [S68], [S87]

A palette change preserves manual per-series overrides unless the user selects "replace overrides". Palette reorder must not accidentally recolour a previously identified group. Theme preview uses current chart data without changing calculations.

### 20.4 Fidelity requirements

Visual matching must be assessed with fixed physical dimensions, font files, source data, axis ranges and rendering scale. Compare axis offsets, tick lengths, symbol areas, line joins, cap lengths, label baselines, legend spacing and fill boundaries separately. A visually similar screenshot is not evidence that the underlying defaults or statistical calculations match.

The implementation should preserve deliberate differences from older rendering constraints: real transparency, explicit missing categories, meaningful error messages and stable object IDs. Exact source packing, palette arrays, symbol glyph geometry, and some automatic sizing rules are U items in Section 23.

## 21. Rust implementation contracts

This section specifies architecture and behaviour, not a prescribed crate stack.

### 21.1 Pipeline

Use a deterministic pipeline:

`typed data -> inclusion/validation -> chart-bound calculation -> layer geometry -> scale mapping -> layout -> drawing primitives -> render`

Inspector edits create typed commands. A command either validates and updates the chart model or returns a local error. The view must not mutate numerical data merely to draw a different style.

Separate a renderer-independent Rust calculation/model core from text/layout and drawing backends. The core should expose typed structures for observations, summaries, limits, encodings, axes and annotations, not loosely typed maps containing unrelated properties for every chart. A browser build may use WebAssembly; that is a deployment choice, not a change in calculations.

### 21.2 Capability-driven inspector

Each layer advertises capability flags and prerequisites, for example `has_numeric_x`, `has_category_axis`, `supports_value_errors`, `supports_ordered_bounds`, `supports_baseline`, `requires_raw_distribution`, `supports_colour_mapping`, and `supports_size_mapping`.

Derive inspector controls from those capabilities plus the current data mode. Do not implement one universal "error" toggle that turns into bars, whiskers, bands or confidence calculations depending on hidden state. The meaning must be explicit.

A type/preset change must return a compatibility result: preserved properties, newly available properties, and unsupported properties retained as inactive history or removed with disclosure. The operation is undoable.

### 21.3 Numerical and state requirements

Use at least binary64 for continuous calculations. Use integer counts until division is required. Use stable summation/variance and numerically reliable probability, quantile and linear-algebra routines. Avoid deriving very small upper-tail probabilities by subtracting two nearly equal floating-point values when a survival-function calculation exists.

Calculation identity includes input IDs/version, exclusions, grouping, method, parameters, confidence level, seed and algorithm version. Style-only edits must reuse numerical results. Changing an axis range must not invalidate data-level summaries or fits. Rendering geometry may be regenerated without rerunning statistics.

Asynchronous browser workers may be used by the application, but updates must be cancellable and versioned. A completed older calculation must not overwrite a newer edit. The chart visibly identifies pending or failed calculations; it never combines a new centre with stale uncertainty bounds.

### 21.4 Rendering requirements

Render from vector-like primitives: paths, polygons, symbols, text runs and clipped groups. Shared geometry must feed all supported rendering surfaces so hit testing and the visible chart agree. Do not rasterise text or axes prematurely.

Dash patterns, font sizes, cap lengths and symbol sizes are physical quantities. Scaling the data range must not alter them. Pattern fills use stable chart/object-local coordinates. Continuous colour interpolation and alpha compositing have declared colour-space semantics.

Hit testing returns stable object IDs, including invisible but inspectable zero-sized observations where appropriate. A visual selection highlight is editor-only and not part of the scientific chart. Text layout must reserve space for rotated labels, multiline titles, comparison brackets, secondary axes and legends without silently clipping them.

### 21.5 Validation severity

| Severity | Example | Required behaviour |
|---|---|---|
| Blocking | Pie has negative weights; ROC has one class; lower>upper | Reject affected configuration; preserve last valid state. |
| Calculation unavailable | n=1 for SD; singular fitted covariance | Keep valid central geometry, omit invalid uncertainty and explain. |
| Visual warning | Clipped error endpoint, crowded labels, palette exhausted | Render truthful geometry and report affected objects/counts. |
| Informational | Data displayed with offsets; supplied interval meaning unknown | Persist a visible inspector explanation and chart description. |

## 22. Acceptance tests

These are required tests, not a claim that an implementation has passed them. Numeric fixture values below are independently calculable; visual fixtures require an implemented renderer.

### 22.1 Numerical fixtures

| Test | Input | Expected behaviour/result |
|---|---|---|
| Arithmetic summary | 1,2,3,4,5 | n=5; mean=3; sample SD=sqrt(2.5); SEM=sqrt(0.5). |
| Mean 95% CI | Same input | Approximately [1.03675684,4.96324316], using t with 4 df. |
| Type-6 quartiles | 1..8 | Q1=2.25; median=4.5; Q3=6.75. |
| Tukey whisker snapping | 1,2,3,4,5,6,7,8,30 | Q1=2.5; Q3=7.5; upper fence=15; upper whisker=8; 30 outside. |
| Geometric summary | 1,10,100 | Geometric mean=10; GSD=10; GSD limits=[1,100]. |
| Median CI availability | Five observations, requested 95% | Finite min-max interval covers only 93.75%; requested exact finite CI unavailable. |
| Median CI availability | Six observations, requested 95% | Min-max interval gives 96.875% coverage. |
| Histogram boundaries | Values 0,1,2,3; edges 0,1,2,3; final inclusive | Counts 1,1,2. |
| ECDF ties | 1,1,2,3 | F(1)=0.5; F(2)=0.75; F(3)=1. |
| Bubble area mapping | z=10,15,20; endpoint diameters 10,20 | Diameters 10,sqrt(250),20; middle about 15.8113883. |
| Dot apportionment | Weights 1,1,1; 100 dots | 34,33,33 in stable part order. |
| Nested weighting | Unit A: [0,0,0]; unit B: [10] | Equal-unit mean=5, not pooled-observation mean=2.5. |
| Survival tied event/censor | Times/status: (1,event),(2,event),(2,censor),(3,event) | S after 1=0.75; after 2=0.5; after 3=0. Median=2. |
| No-event survival | Three censored observations | S stays 1 until last follow-up; median not reached. |
| ROC perfect separation | Negative scores 0,1; positive scores 2,3 | AUC=1 with higher-positive direction. |
| ROC complete tie | All scores identical, both classes present | AUC=0.5; ties advance coordinates together. |
| Exact binomial endpoint | k=0,n=10,C=0.95 | Lower=0; upper approximately 0.3084971. |
| Exact fitted line | X=0,1,2; Y=1,3,5 | Intercept=1; slope=2; zero residual within numerical tolerance. |
| Holm adjustment | p=[0.01,0.03,0.04] | Adjusted p=[0.03,0.06,0.06]. |
| BH adjustment | Same p values | Adjusted p=[0.03,0.04,0.04]. |
| Log endpoint validation | Centre=2, interval=[-1,5] on log Y | Retain centre; clip/suppress invalid endpoint according to policy; explicit warning. |
| Composition zero total | Weights 0,0 | Blocking error; no pie angle or percent fabricated. |

Use absolute and relative tolerances appropriate to each algorithm. Exact integer and rational fixtures must not be relaxed to loose visual tolerances. For stable summary calculations, a 1e-10 relative target is a reasonable P baseline on ordinary finite inputs; ill-conditioned cases need separately specified tests and diagnostics.

### 22.2 Applicability and interaction tests

Test the **absence** of inappropriate options as well as the presence of valid ones. A bar exposes error stems but not a curve ribbon. A box exposes whisker rules but not SEM. A supplied-summary violin request is blocked. A category axis has no logarithmic coordinate scale. A heatmap has a colourbar but no second value axis. A pie has no numeric-axis inspector.

Switching a line chart from error bars to a band must preserve its bound calculation. Hiding the centre path must leave a valid band visible. Rotating a categorical chart must rotate errors, brackets, labels and category/value roles together. Hiding a layer must not silently change n, a correction family, or a normalisation denominator.

Reorder categories and verify that custom point styles, paired connections, bracket targets and legend labels still refer to the same IDs. Undo a theme edit without reverting data edits. Change a data value and verify that labels and comparison results update together. Enter an invalid property and confirm the last valid rendering remains available.

### 22.3 Visual fixture set

Maintain at least one fixed fixture for each catalogue preset, and additional fixtures for the combinations below:

| Fixture | Features it must exercise |
|---|---|
| XY symbols and errors | Filled, clear and knockout symbols; asymmetric X/Y intervals; labels. |
| Ordered uncertainty | Straight, step-before and step-after paths; fill-only and boundary-only bands. |
| Log-scale chart | Log ticks, transformed endpoints, invalid interval warning, data-linear versus screen-straight connection. |
| Dual-axis chart | Independently scaled series, titles and grid references; unambiguous axis binding. |
| Broken-axis chart | Two breaks, separate segment ticks, split bars and paths, no false bridging. |
| Grouped hybrid | Interleaved and stacked bars, one missing cell, local gap override, separators. |
| Distribution chart | Box, violin, raw overlay and summary marker on one shared value scale. |
| Nested chart | Unequal repeat counts, unit-specific symbols and independent-unit group errors. |
| Dense point cloud | All four spreading choices with a fixed seed; no value-axis jitter. |
| Bubble/vector chart | Continuous colour, area sizing, size and colour legends, origin vectors. |
| Heatmap | Missing/excluded cells, interval colours, contrast labels, transpose and special gaps. |
| Composition set | Pie/doughnut/whole-bar/dot-grid; zero part; exploded slice; rounded percentages. |
| Survival chart | Ties, censor marks, terminal censor, asymmetric pointwise band and median marker. |
| ROC chart | Ties, threshold labels, exact coordinate intervals and a chance line. |
| Fitted chart | Raw data, bounded nonlinear fit, separate CI and prediction layers, failed-fit state. |
| Annotated chart | Rich text, Greek letters, superscripts, horizontal comparison brackets and relocated legend. |

Visual testing must compare fixed-size output at multiple device-pixel ratios, while measuring layout in physical units. A P initial tolerance is 0.25 pt for object placement and stroke extents after agreed font calibration; anti-aliasing comparisons require a separate pixel tolerance. Do not enforce raw pixel equality across different font/rasterisation engines.

## 23. Evidence gaps and fidelity work

The following details were not fully established by the reviewed public material. They are **not silently claimed to match**. Required P behaviour is already specified so implementation can proceed.

| Item | Evidence status | Required treatment |
|---|---|---|
| Complete original colour/fill palette arrays and ordering | U | Current seed palette is P; verify exact arrays before claiming colour parity. |
| Exact symbol outlines and font-character metrics | U | Use named primitives and pinned fonts; compare selected reference fixtures. |
| All automatic ranges, tick choices and label collision heuristics | U | Deterministic P rules; record resolved values; expose manual overrides. |
| Exact standard/classic/expanded point placement | U | Reproducible P layouts; no claim of pixel-identical packing. |
| Numerical bandwidth/kernel behind named violin levels | U | Use declared P Gaussian estimator and multipliers. |
| LOWESS neighbour counts, normalisation and endpoint details | Partly D, partly U | Preserve named options, declare P numeric choices and algorithm version. |
| Complete spline endpoint/knot conventions | Partly D, partly U | Explicit P boundary conditions and knot placement. |
| Exact bar width, margin and legend spacing defaults across all chart families | U | Role-based P defaults, then fixture-based calibration. |
| Exact nonlinear solver and confidence-band details for every model | U | Declared, tested P solver and band methods; no automatic equivalence claim. |
| Full inventory of domain-specific fitting equations | Outside graphical scope | Initial presets plus safe custom functions/supplied curves; no claim to duplicate an entire modelling library. |
| Every advanced post-hoc or multi-factor p-value calculation | Outside bounded calculation scope | Render supplied labelled results; do not substitute a different test. |
| Numeric visual defaults from screenshots alone | Not treated as verified defaults | Screenshots establish available controls, not universal initial values. |

Before declaring a feature visually matched, record a fixture with its data, settings, physical dimensions, font identity and expected result. Before declaring a calculated feature numerically matched, record independent numerical fixtures including ties, missing values, small samples and boundary cases. Styling and numerical equivalence are separate acceptance decisions.

## 24. Source register

References support the capabilities and rules described in the cited sections. Inspector structure, property IDs, initial defaults marked P, architecture, validations and test designs are requirements for the new package. Public documentation was reviewed on **16 October 2026**. Some linked pages contain older examples or historical text; those examples were not assumed to establish current universal defaults. Source URLs are retained solely for traceability.

[S01]: https://www.graphpad.com/guides/prism/latest/user-guide/how_to_begin.htm "Plotting concepts and data organisation"
[S02]: https://www.graphpad.com/guides/prism/latest/user-guide/xy_table.htm "Numeric XY input, replicates, labels and supplied errors"
[S03]: https://www.graphpad.com/guides/prism/latest/user-guide/using_format_graph_xy.htm "XY appearance: symbols, paths, bars, uncertainty and fills"
[S04]: https://www.graphpad.com/guides/prism/latest/user-guide/using_more_settings_xy_graphs.htm "Additional XY settings: missing points and identity line"
[S05]: https://www.graphpad.com/guides/prism/latest/user-guide/using_nudging_a_data_set_on_a_graph.htm "Display offsets and offset trace arrangements"
[S06]: https://www.graphpad.com/guides/prism/latest/user-guide/mv_graphs_symbol_fill_color.htm "Variable-driven symbol fill colours"
[S07]: https://www.graphpad.com/guides/prism/latest/user-guide/mv_graphs_symbol_border.htm "Independent symbol borders"
[S08]: https://www.graphpad.com/guides/prism/latest/user-guide/mv_graphs_symbol_size.htm "Symbol size and area-based scaling"
[S09]: https://www.graphpad.com/guides/prism/latest/user-guide/mv_graphs_label_opt.htm "Variable-driven point labels"
[S10]: https://www.graphpad.com/guides/prism/latest/user-guide/mv_graphs_connecting_line_opt.htm "Grouped connecting paths and origin-to-point vectors"
[S11]: https://www.graphpad.com/guides/prism/latest/user-guide/using_format_graph_one_way.htm "Column and individual-value chart appearance"
[S12]: https://www.graphpad.com/guides/prism/latest/user-guide/columngraphspacing.htm "Category spacing and separators"
[S13]: https://www.graphpad.com/guides/prism/latest/user-guide/using_chage_the_plotting_order_of_da.htm "Column plotting order"
[S14]: https://www.graphpad.com/guides/prism/latest/user-guide/using_more_settings_one_way.htm "Additional column-chart settings"
[S15]: https://www.graphpad.com/guides/prism/latest/user-guide/using_format_graph_two_way.htm "Grouped-chart appearance"
[S16]: https://www.graphpad.com/guides/prism/latest/user-guide/using_changing_the_spacing_between_b_2.htm "Grouped, stacked, superimposed and hybrid spacing"
[S17]: https://www.graphpad.com/guides/prism/latest/user-guide/using_chage_the_plotting_order_of_da_2.htm "Grouped plotting order"
[S18]: https://www.graphpad.com/guides/prism/latest/user-guide/using_graphing_each_replicate.htm "Individual-value spreading methods"
[S19]: https://www.graphpad.com/guides/prism/latest/user-guide/appearance-of-nested-graphs.htm "Nested-chart appearance"
[S20]: https://www.graphpad.com/guides/prism/latest/user-guide/nested-tables.htm "Nested data organisation"
[S21]: https://www.graphpad.com/guides/prism/latest/user-guide/graphing-error-bars-computed-f.htm "Calculated means, medians and spread for graphs"
[S22]: https://www.graphpad.com/guides/prism/latest/user-guide/graphing-error-bars-computed-2.htm "Error bars supplied or converted from summary data"
[S23]: https://www.graphpad.com/guides/prism/latest/user-guide/horizontal_error_bars.htm "Horizontal measurement-error bars"
[S24]: https://www.graphpad.com/guides/prism/latest/user-guide/graphing-error-envelopes.htm "Error envelopes and filled uncertainty"
[S25]: https://www.graphpad.com/guides/prism/latest/user-guide/using_confidence_and_prediction_band.htm "Displaying confidence and prediction bands"
[S26]: https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_confidence_tab.htm "Curve confidence settings and parameter-interval distinctions"
[S27]: https://www.graphpad.com/guides/prism/latest/user-guide/using_error_bars_and_confidence_band.htm "Survival uncertainty display"
[S28]: https://www.graphpad.com/guides/prism/latest/user-guide/box-and-whiskers.htm "Box-and-whisker rules and small samples"
[S29]: https://www.graphpad.com/guides/prism/latest/user-guide/graphing-box-and-whisker-and-v.htm "Box and violin display options"
[S30]: https://www.graphpad.com/guides/prism/latest/statistics/stat_howto_frequency_distribution.htm "Frequency-distribution construction and bin rules"
[S31]: https://www.graphpad.com/guides/prism/latest/statistics/graphing_frequency_distribution_histograms_with_prism.htm "Histogram and cumulative-frequency presentation"
[S32]: https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_spline-and-lowess-curves.htm "Cubic, Akima, smoothing and LOWESS curves"
[S33]: https://www.graphpad.com/support/faqid/933/ "Local smoothing weighting and local-linear method"
[S34]: https://www.graphpad.com/guides/prism/latest/statistics/stat_howto_survival.htm "Time-to-event input and curve construction"
[S35]: https://www.graphpad.com/guides/prism/latest/statistics/the_fraction_(or_percent)_survival_at_each_time.htm "Survival proportions, tied times and log-log intervals"
[S36]: https://www.graphpad.com/guides/prism/latest/user-guide/using_format_graph_survival.htm "Survival graph appearance"
[S37]: https://www.graphpad.com/guides/prism/latest/statistics/stat_howto_roc.htm "ROC input and presentation"
[S38]: https://www.graphpad.com/guides/prism/latest/statistics/stat_calcualtion_details_for_roc_cu.htm "ROC thresholds, area and exact coordinate intervals"
[S39]: https://www.graphpad.com/guides/prism/latest/statistics/stat_qq-plot.htm "Normal quantile-quantile plots"
[S40]: https://www.graphpad.com/guides/prism/latest/statistics/stat_bland_altman.htm "Agreement plot construction"
[S41]: https://www.graphpad.com/guides/prism/latest/statistics/bland-altman_results.htm "Bias and limits of agreement"
[S42]: https://www.graphpad.com/guides/prism/latest/user-guide/heat_maps.htm "Matrix heatmaps and replicate summaries"
[S43]: https://www.graphpad.com/guides/prism/latest/user-guide/color_mapping.htm "Heatmap colour mappings and special values"
[S44]: https://www.graphpad.com/guides/prism/latest/user-guide/graph_settings.htm "Heatmap geometry, reversal and transpose"
[S45]: https://www.graphpad.com/guides/prism/latest/user-guide/titles_and_labels.htm "Heatmap titles and value labels"
[S46]: https://www.graphpad.com/guides/prism/latest/user-guide/gaps.htm "Heatmap gaps"
[S47]: https://www.graphpad.com/guides/prism/latest/user-guide/legendsheatmap.htm "Heatmap colour legends"
[S48]: https://www.graphpad.com/guides/prism/latest/user-guide/appearance-_parts_of_whole.htm "Parts-of-whole chart variants and controls"
[S49]: https://www.graphpad.com/guides/prism/latest/user-guide/drawing_lines_arrows_and_shapes.htm "Lines, arrows and shape annotations"
[S50]: https://www.graphpad.com/guides/prism/latest/user-guide/using_changing_a_graphs_colors.htm "Chart colour schemes and custom colours"
[S51]: https://www.graphpad.com/guides/prism/latest/user-guide/frame_and_axes.htm "Axis frames and origin"
[S52]: https://www.graphpad.com/guides/prism/latest/user-guide/format_of_each_axis.htm "Axis ranges and transformations"
[S53]: https://www.graphpad.com/guides/prism/latest/user-guide/axis_numbering.htm "Axis numbering and category labels"
[S54]: https://www.graphpad.com/guides/prism/latest/user-guide/major_and_minor_ticks.htm "Major and minor ticks"
[S55]: https://www.graphpad.com/guides/prism/latest/user-guide/graphs_with_two_y_axes.htm "Two value axes"
[S56]: https://www.graphpad.com/guides/prism/latest/user-guide/hiding_axes_and_showing_scale_bars.htm "Hidden axes and scale bars"
[S57]: https://www.graphpad.com/guides/prism/latest/user-guide/discontinuous_and_hidden_axes.htm "Discontinuous axes"
[S58]: https://www.graphpad.com/guides/prism/latest/user-guide/using_key_concepts_additional_ticks_.htm "Additional ticks, reference lines and filled regions"
[S59]: https://www.graphpad.com/guides/prism/latest/user-guide/axis_numbering_and_ticks_on_a_log_axis.htm "Logarithmic tick numbering"
[S60]: https://www.graphpad.com/guides/prism/latest/user-guide/grid_lines_revised.htm "Gridline controls"
[S61]: https://www.graphpad.com/guides/prism/latest/user-guide/axis_titles.htm "Axis titles and text placement"
[S62]: https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_range_tab.htm "Fit-domain versus rendered-curve domain"
[S63]: https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_howtoplotafunction.htm "Generated functions, parameter families and curve sampling"
[S64]: https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_principles_of_curve_fitting.htm "Model-based regression and curve-generation concepts"
[S65]: https://www.graphpad.com/guides/prism/latest/statistics/stat_smoothing_differentiating_and_integrating_curves.htm "Smoothing, derivative and integral curves"
[S66]: https://csdaw.github.io/ggprism/articles/themes.html "Supplementary scientific-theme appearance"
[S67]: https://github.com/csdaw/ggprism/blob/master/R/theme_prism.R "Supplementary theme definition and numeric ratios"
[S68]: https://csdaw.github.io/ggprism/articles/colours.html "Supplementary colour, fill and shape palettes"
[S69]: https://www.graphpad.com/series/advanced-graph-types-and-best-practices-in-prism "Bubble, forest, pyramid, spaghetti, volcano and related chart recipes"
[S70]: https://www.graphpad.com/guides/prism/latest/user-guide/contingency_table.htm "Count-matrix data requirements"
[S71]: https://www.graphpad.com/guides/prism/latest/user-guide/using_changing_the_spacing_between_b_2_2.htm "Count-chart grouping and spacing"
[S72]: https://www.graphpad.com/guides/prism/latest/user-guide/using_formatting_individual_symbols_.htm "Individual point formatting"
[S73]: https://www.graphpad.com/guides/prism/latest/user-guide/using_changing_front_to_back_order_o.htm "XY layer front-to-back order"
[S74]: https://www.graphpad.com/guides/prism/latest/user-guide/using_more_settings_two_way.htm "Additional grouped-chart settings"
[S75]: https://www.graphpad.com/guides/prism/latest/statistics/stat_median_and_its_confidence_inte.htm "Median confidence intervals"
[S76]: https://www.graphpad.com/guides/prism/latest/statistics/stat_percentiles_and_the_median.htm "Interpolated percentiles and median"
[S77]: https://www.graphpad.com/guides/prism/latest/user-guide/mv_graphs_legend_display_opt.htm "Separate versus combined encoding legends"
[S78]: https://www.graphpad.com/guides/prism/latest/user-guide/mv_graphs_legend_size.htm "Size-legend properties"
[S79]: https://www.graphpad.com/guides/prism/latest/user-guide/legendsxy.htm "Series-legend display and live labels"
[S80]: https://www.graphpad.com/guides/prism/latest/user-guide/mv_graphs_legend_fill_color.htm "Colour-legend properties"
[S81]: https://www.graphpad.com/guides/prism/latest/user-guide/simple_pairwise_comparisons.htm "Pairwise comparison lines and labels"
[S82]: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/t.test.html "Primary numerical reference: one-sample, paired and two-sample t procedures"
[S83]: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/wilcox.test.html "Primary numerical reference: rank-sum and signed-rank procedures"
[S84]: https://www.graphpad.com/guides/prism/latest/statistics/stat_analysis_choices_for_survival.htm "Survival group-comparison choices"
[S85]: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/p.adjust.html "Primary numerical reference: p-value adjustments"
[S86]: https://ggplot2.tidyverse.org/reference/aes_linetype_size_shape.html "Supplementary renderer linewidth and symbol-unit conventions"
[S87]: https://csdaw.github.io/ggprism/reference/prism_colour_pal.html "Supplementary palette registry and example colour values"

### Reference index

| ID | Scope |
|---|---|
| [S01] | Plotting concepts and data organisation |
| [S02] | Numeric XY input, replicates, labels and supplied errors |
| [S03] | XY appearance: symbols, paths, bars, uncertainty and fills |
| [S04] | Additional XY settings: missing points and identity line |
| [S05] | Display offsets and offset trace arrangements |
| [S06] | Variable-driven symbol fill colours |
| [S07] | Independent symbol borders |
| [S08] | Symbol size and area-based scaling |
| [S09] | Variable-driven point labels |
| [S10] | Grouped connecting paths and origin-to-point vectors |
| [S11] | Column and individual-value chart appearance |
| [S12] | Category spacing and separators |
| [S13] | Column plotting order |
| [S14] | Additional column-chart settings |
| [S15] | Grouped-chart appearance |
| [S16] | Grouped, stacked, superimposed and hybrid spacing |
| [S17] | Grouped plotting order |
| [S18] | Individual-value spreading methods |
| [S19] | Nested-chart appearance |
| [S20] | Nested data organisation |
| [S21] | Calculated means, medians and spread for graphs |
| [S22] | Error bars supplied or converted from summary data |
| [S23] | Horizontal measurement-error bars |
| [S24] | Error envelopes and filled uncertainty |
| [S25] | Displaying confidence and prediction bands |
| [S26] | Curve confidence settings and parameter-interval distinctions |
| [S27] | Survival uncertainty display |
| [S28] | Box-and-whisker rules and small samples |
| [S29] | Box and violin display options |
| [S30] | Frequency-distribution construction and bin rules |
| [S31] | Histogram and cumulative-frequency presentation |
| [S32] | Cubic, Akima, smoothing and LOWESS curves |
| [S33] | Local smoothing weighting and local-linear method |
| [S34] | Time-to-event input and curve construction |
| [S35] | Survival proportions, tied times and log-log intervals |
| [S36] | Survival graph appearance |
| [S37] | ROC input and presentation |
| [S38] | ROC thresholds, area and exact coordinate intervals |
| [S39] | Normal quantile-quantile plots |
| [S40] | Agreement plot construction |
| [S41] | Bias and limits of agreement |
| [S42] | Matrix heatmaps and replicate summaries |
| [S43] | Heatmap colour mappings and special values |
| [S44] | Heatmap geometry, reversal and transpose |
| [S45] | Heatmap titles and value labels |
| [S46] | Heatmap gaps |
| [S47] | Heatmap colour legends |
| [S48] | Parts-of-whole chart variants and controls |
| [S49] | Lines, arrows and shape annotations |
| [S50] | Chart colour schemes and custom colours |
| [S51] | Axis frames and origin |
| [S52] | Axis ranges and transformations |
| [S53] | Axis numbering and category labels |
| [S54] | Major and minor ticks |
| [S55] | Two value axes |
| [S56] | Hidden axes and scale bars |
| [S57] | Discontinuous axes |
| [S58] | Additional ticks, reference lines and filled regions |
| [S59] | Logarithmic tick numbering |
| [S60] | Gridline controls |
| [S61] | Axis titles and text placement |
| [S62] | Fit-domain versus rendered-curve domain |
| [S63] | Generated functions, parameter families and curve sampling |
| [S64] | Model-based regression and curve-generation concepts |
| [S65] | Smoothing, derivative and integral curves |
| [S66] | Supplementary scientific-theme appearance |
| [S67] | Supplementary theme definition and numeric ratios |
| [S68] | Supplementary colour, fill and shape palettes |
| [S69] | Bubble, forest, pyramid, spaghetti, volcano and related chart recipes |
| [S70] | Count-matrix data requirements |
| [S71] | Count-chart grouping and spacing |
| [S72] | Individual point formatting |
| [S73] | XY layer front-to-back order |
| [S74] | Additional grouped-chart settings |
| [S75] | Median confidence intervals |
| [S76] | Interpolated percentiles and median |
| [S77] | Separate versus combined encoding legends |
| [S78] | Size-legend properties |
| [S79] | Series-legend display and live labels |
| [S80] | Colour-legend properties |
| [S81] | Pairwise comparison lines and labels |
| [S82] | Primary numerical reference: one-sample, paired and two-sample t procedures |
| [S83] | Primary numerical reference: rank-sum and signed-rank procedures |
| [S84] | Survival group-comparison choices |
| [S85] | Primary numerical reference: p-value adjustments |
| [S86] | Supplementary renderer linewidth and symbol-unit conventions |
| [S87] | Supplementary palette registry and example colour values |
