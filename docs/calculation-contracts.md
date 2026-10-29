# Calculation contracts and preset catalogue

Carried over from the earlier specification. These are the behavioural rules for calculations, the preset IDs used in the New Graph gallery, and the acceptance fixtures. See [ROADMAP.md](../ROADMAP.md) for scope and phases.

Labels: **D** = documented by a public source (GraphPad Prism user guide, ggprism, R manuals). **P** = proposal for this app, not a verified default. **U** = unverified. Every default is P unless marked D. Units are `pt` and `px` (1 px = 0.75 pt); browser zoom and device pixel ratio affect rasterisation only.

## 1. Principles

- A **preset** configures compatible layers. A **geometry** draws. A **calculation** produces values for a geometry. A **theme** assigns defaults.
- Calculations belong to layers. Hiding a path must not erase the summary or band beneath it.
- **Missing** is not zero. **Excluded** removes a value from calculations. **Hidden** is visual only. A hidden layer keeps its calculation and (by default) its axis-range contribution; a disabled layer does neither.
- A viewport change never refits, recomputes histograms, or removes observations.
- Supplied spread needs a semantic label (SD, SEM, CI, prediction interval, range, IQR, unspecified). Unspecified cannot become a CI.
- Numeric-looking category labels never silently become numeric coordinates.
- Style precedence: object override > group override > layer override > preset > theme.
- Stable IDs for series, observations, groups, annotations and layers. Reordering data never moves a custom style to another observation.
- Validation severity: **blocking** (reject, keep last valid state), **calculation unavailable** (keep the valid centre, omit the uncertainty, explain), **visual warning** (render truthfully, report affected objects), **informational**.
- Calculation identity: input IDs and version, exclusions, grouping, method, parameters, confidence level, seed, algorithm version. Style-only edits reuse results. A newer edit is never overwritten by an older completed calculation.
- Use binary64, stable summation and variance, integer counts until division, survival functions for small tail probabilities.

## 2. Preset catalogue

`src/model/graph/chartGallery.ts` uses these IDs for planned graphs.

| Group | Preset IDs |
|---|---|
| Numeric XY | `xy.scatter`, `xy.line`, `xy.line_symbols`, `xy.area`, `xy.bars`, `xy.spikes`, `xy.vector`, `xy.bubble`, `xy.trajectory`, `xy.offset_traces` |
| Category and distribution | `category.strip`, `category.aligned`, `category.paired`, `category.bar`, `category.summary`, `category.range`, `distribution.box`, `distribution.violin`, `category.grouped`, `category.stacked`, `category.normalised_stack`, `category.nested`, `category.counts` |
| Calculated curves and diagnostics | `distribution.histogram`, `distribution.frequency_polygon`, `distribution.ecdf`, `curve.survival`, `curve.cumulative_event`, `curve.roc`, `curve.fit`, `curve.function`, `diagnostic.qq`, `diagnostic.bland_altman`, `diagnostic.residual` |
| Matrix, composition, specialised | `matrix.heatmap`, `whole.pie`, `whole.doughnut`, `whole.bar`, `whole.dot_grid`, `special.forest`, `special.volcano`, `special.population_pyramid` |

Boxes and violins can sit at numeric X. Horizontal versions rotate the roles, not the calculation. A band is an ordered lower/upper layer, not a shaded rectangle; it can stay visible when its centre path is hidden. A categorical axis never gets measurement uncertainty by rotation.

## 3. Summaries and error bars

- Mean `m = Σy/n`; sample variance `s² = Σ(y−m)²/(n−1)`; `SEM = s/√n`.
- Mean CI: `m ± t(1−α/2, n−1)·SEM`, with `α = 1−C`. Never `m ± 1.96·SD`.
- Geometric mean: `exp(mean(ln y))` for positive values. GSD is the factor `exp(sd(ln y))`; limits `g/GSD`, `g·GSD`. Geometric CI is the exponentiated t interval of the log values (asymmetric on a linear axis).
- Range is `[min, max]`; IQR is `[Q1, Q3]`. Neither is a CI.
- Median CI (exact, order statistic): sort; take the largest `k ≥ 1` with `1 − 2·P(Binomial(n, 0.5) ≤ k−1) ≥ C`; draw `[y(k), y(n−k+1)]` and report achieved coverage. If none reaches `C`, report unavailable.
- Conversions: SD and n give SEM and CI; SEM and n give SD and CI; percent CV with a nonzero mean gives SD. **Without n no t-based CI.** Asymmetric endpoints are not assumed to encode a symmetric SD.
- Small samples: draw the centre, omit undefined spread, never draw a zero-width CI. Geometric summaries require positive values.
- Error distances are nonnegative; absolute endpoints need `lower ≤ upper` and the centre inside. Transform endpoints through the axis, not the length. Invalid log endpoint: clip with warning (default), never substitute an epsilon. X and Y error bars are independent; X error does not enter a fit's objective.
- Cap length is the full cap width (default 5 pt).
- Bands: kinds are summary interval, fitted-mean CI, prediction interval, survival CI, supplied. The meaning stays attached (legend text such as "95% pointwise confidence interval"). A prediction band includes residual variation. Pointwise is not simultaneous. Invalid or missing limits break the band. Crossing limits are rejected, not swapped.

## 4. Box plots and violins

- Quartiles: type 6. For sorted values, `r = (n+1)·p`, linear interpolation between 1-based ranks, clamped to 1..n. Values 1..8 give Q1 = 2.25, median = 4.5, Q3 = 6.75.
- Whisker rules: min-max (default), Tukey, 10-90, 5-95, 2.5-97.5, 1-99 percentiles. Tukey fences are `Q1 − 1.5·IQR` and `Q3 + 1.5·IQR`; whiskers end at the most extreme **observed values inside** the fences. "Outside whiskers" is a display class, never an exclusion.
- n < 4: median and range without a box (n = 3 draws no quartile rectangle). A supplied five-number summary cannot give Tukey outliers or a violin.
- Violin (P estimator): Gaussian kernel, `a = min(s, IQR/1.34)` (the positive one if only one is), `h0 = 0.9·a·n^(−1/5)`, light/medium/heavy = 0.5/1/2 × h0, `f(v) = Σ exp(−½((v−yᵢ)/h)²) / (n·h·√(2π))`. Numeric bandwidth overrides. Default trim is the sample min-max (no artificial taper); full-tail mode extends at least three bandwidths and discloses it. Grid size 256. Normalisation: equal maximum width (default), equal area, or count-scaled with an explicit comparison population. Constant data: degenerate line with a notice. n < 3: points or summary fallback. A log axis does not switch the density to log data.

## 5. Histograms, ECDF, smoothing

- Boundary rule `[left, right)`, final edge inclusive (P). Out-of-range values are omitted and counted, never folded into edge bins. Density is `count/(n·width)`; unequal widths must integrate to the included proportion. Cumulative density integrates. The denominator choice is shown when tails are omitted.
- Automatic bins (P): start at `max(1, ceil(log2(n)+1))` bins, derive a width from the range, round up to a `1, 2, 2.5, 5, 10` decimal multiple, anchor the first edge at a width multiple not above the minimum, extend to include the maximum, record resolved edges. Constant input: one bin with an explicit unit-scale width. Never a zero-width bin or a NaN density.
- ECDF: `F(x) = count(yᵢ ≤ x)/n`; ties are one jump. Descending is `1 − F(x)` (strictly above). Straight display is an approximation, not a different calculation.

## 6. Variable-driven symbols

- Proportional area: `d = d_ref·√(z/z_ref)`. Range-mapped area: `t = (z−zmin)/(zmax−zmin)`, `d = √(dmin² + t(dmax²−dmin²))`. Never interpolate diameter. Non-circular shapes scale by filled area. Degenerate domain: fixed size and a notice.
- Categorical mappings are keyed by category ID. Size and colour legends are combined only for the same discrete mapping, and legend symbols use the plotted mapping.
- Origin-to-each vectors are separate segments. A zero origin cannot sit on a log axis; require an explicit valid origin.

## 7. Heatmap, composition

- Replicate reduction, then normalisation, then colour scaling. Geometric mean rejects non-positive values. Percent CV at zero mean is undefined. Zero denominator gives missing with a notice. Auto min/max ignores missing and excluded cells. Interval colours use `[b(i), b(i+1))` with an inclusive final maximum. Reversing colours does not reverse row order. Labels name which value they show. Gaps are layout objects.
- Weights must be finite, nonnegative, with a positive included total. Hiding a part keeps it in the denominator; excluding removes it. Zero parts keep their ID, with no fabricated slice. A supplied denominator above the included sum shows the remainder or is rejected. Slice angle `2π·w/total`.
- Dot grid (**not built**, postponed by decision on 29 October 2026; no code and no fixture test): `q = N·w/total`, floor, then the remaining dots by descending fractional remainder, ties by part order. Weights 1, 1, 1 with N = 100 give 34, 33, 33. Percent labels use the original weights.
- Stacks: an additive component's height is its own value; positive and negative accumulate separately. Normalised stacks reject negatives; an all-zero denominator is undefined. Component errors are not the total's uncertainty.
- Nested data: group uncertainty comes from unit summaries, with equal weight per independent unit. n counts units.
- Counts: nonnegative integers; cross-tabulate after exclusions; no chi-square or effect-size report.

## 8. Survival

- Sort and combine ties. At event time `tⱼ`: `nⱼ` at risk just before, `dⱼ` events, `cⱼ` censored. `S(t) = Π(1 − dⱼ/nⱼ)`. The event decrement applies before tied censored subjects leave; censor marks at a tied time sit at the post-event level.
- Greenwood: `G = Σ dⱼ/[nⱼ(nⱼ−dⱼ)]`, `SE(S) = S·√G`. For `0 < S < 1`, `g = ln(−ln S)`, `SE_g = √G/|ln S|`, `z = Φ⁻¹(1−α/2)`: lower `exp(−exp(g + z·SE_g))`, upper `exp(−exp(g − z·SE_g))` (log-log, default). Symmetric limits `S ± z·SE` are clipped to [0, 1]. Limits at S = 0 or 1 are omitted; the band stops at the last finite bound.
- Cumulative event `F = 1 − S`, limits `[1−upper, 1−lower]`. Not competing risks. Median is the first time `S ≤ 0.5`, else "not reached". No events: S stays 1.
- Unknown status codes are invalid, not censored. Event at time 0 is allowed with explicit pre and post states.

## 9. ROC

*Status, 29 October 2026: not built (postponed by decision). No code and no fixture test.*

- Pooled distinct thresholds plus all-negative and all-positive outer points. Equal scores advance together. Sensitivity `TP/P`, FPR `FP/N`. Direction is explicit; never pick the better-looking one.
- AUC is the trapezoidal area, equal to the fraction of correctly ordered positive-negative pairs plus half the tied fraction. Do not replace AUC < 0.5 by its complement without changing the direction. Both classes must be present.
- Coordinate intervals: Clopper-Pearson, independently for sensitivity and specificity. For k of n: lower is 0 if k = 0, else the α/2 quantile of `Beta(k, n−k+1)`; upper is 1 if k = n, else the 1−α/2 quantile of `Beta(k+1, n−k)`. FPR limits are one minus the reversed specificity limits. These are marginal, not a joint region.

## 10. Fitted and generated curves

- A fit is a chart-bound producer of a curve and optional uncertainty. Raw observations remain a separate layer. The displayed X range never changes the fit domain. Visual log axes do not select log fitting. Separate fit per series; no global fit.
- Models (P): `linear`, `polynomial` (degree 2-6, X normalised internally), `exp_decay`, `exp_association`, `exp_two_phase`, `gaussian_peak`, `hyperbola`, `hill_4pl`, `asymmetric_5pl`, `custom` (validated expression; no code execution or I/O). Distinguish raw concentration X from a precomputed log so logs are not applied twice.
- Linear least squares uses a stable solver. Nonlinear: bounded, convergence-checked, reproducible start. Scaling, fixed values and bounds belong to the calculation identity. A failed or singular fit is never shown as converged. Defaults: 1000 iterations, tolerance 1e-8, 150 curve segments.
- Linear bands: `s_r² = RSS/(n−p)`, `V = s_r²(X′X)⁻¹`, mean SE `√(vVv′)`, t quantile with `n−p` df; prediction SE `√(vVv′ + s_r²)`. Nonlinear: local Jacobian, `SE(x) = √(JVJ′)`, labelled approximate and pointwise. Parameter intervals (including profile likelihood) are not curve bands.
- Bands are unavailable with no residual degrees of freedom, a singular covariance, failed convergence or an unsupported variance model. The centre curve may remain with a warning. Repeats are not silently treated as independent. Weights are declared as known inverse variances or relative weights.
- Generated functions: one curve per parameter set; adaptive sampling to a screen tolerance with a vertex limit; split at poles and undefined values; derivatives and integrals are separate named layers.

## 11. Diagnostics and recipes

- Q-Q: sort; probabilities `i/(n+1)` (default) or `(i−0.375)/(n+0.25)`; expected `mean + sd·Φ⁻¹(p)` on the fitted scale, or `Φ⁻¹(p)` on the standard scale. Reference lines live in those coordinates. No normality p value.
- Bland-Altman: `x = (A+B)/2`, `d = B−A`, bias `mean(d)`, limits `bias ± 1.96·sd(d)` (dispersion of differences, not a CI of bias). Percent mode `100(B−A)/((A+B)/2)`, zero denominators invalid. Ratio mode needs positive values and summarises `ln(B/A)`, then exponentiates. The inspector shows the formula.
- Residuals: observed minus predicted, from the stored model result (no refit when axes change). SD-scaled only if the SD exists; internally studentised needs leverage.
- Forest: supplied intervals only, no pooled effect, no weight manufactured from n. Null value 0 (differences) or 1 (ratios). Diamond for an explicitly supplied summary row.
- Volcano: ratio fold change through log2; p through `−log10(p)`; no double transform. Adjusted p is labelled as such. Zero p is capped only against a declared bound and marked. No pseudocount.
- Pyramid: magnitudes stay nonnegative in the data; sign is applied in the display; tick labels are positive; a common symmetric range.
- Offset traces: per-series display offsets, disclosed; not cumulative unless generated so.

## 12. Axes

- One X scale and at most two value scales. Linear, log10, log2, ln, normal-probability (`Φ⁻¹(p)`, `0 < p < 1`). Log axes need positive coordinates; omit invalid marks with a warning, never substitute a small number. Log changes visual coordinates only.
- Auto range includes error endpoints, whiskers, baselines and curve bounds. A clipped point is not excluded. Percent formatting must not multiply by 100 twice.
- Minor ticks: log10 uses mantissas 2-9; log2 and ln need their own subdivisions. Category axes have no numeric controls.
- Dates, instants and durations are distinct types (built for the X axis of XY charts, section 17).
- A reference identity line is `Y = X`, not a screen diagonal. Reference regions are axis-aware bands, not uncertainty. The editor's alignment grid is never exported.
- Broken axes: up to two breaks, continuous axes only; split and clamp every primitive at each segment boundary, never bridge. Reversed plus segmented is rejected. Scale bars on nonlinear axes need an explicit endpoint pair or ratio label.

## 13. Comparisons (bracket labels)

- Sources: manual text, supplied p, or calculated p. Supplied results are labelled as not recomputed.
- Methods: one-sample t, Welch, equal-variance t (explicit), paired t (on differences), Mann-Whitney, signed-rank, two-curve logrank, supplied. Welch uses Satterthwaite df. Rank methods use average ranks; signed-rank drops exact zero differences and reports the count; exact distribution when feasible, else a tie-corrected normal approximation with a continuity-correction setting; the method that ran is stored.
- Logrank: sum `d₁ⱼ − n₁ⱼ·dⱼ/nⱼ` with variance `n₁ⱼ n₀ⱼ dⱼ (nⱼ−dⱼ)/(nⱼ²(nⱼ−1))`, squared standardised total against χ² with 1 df. Zero variance means unavailable.
- *Status, 29 October 2026: no test is calculated and no p-value is adjusted. Brackets carry the label the owner types or a result token (section 18); the methods and adjustments below are not built (Holm, BH and the exact binomial interval are postponed by decision).*
- Adjustment over m p-values: Bonferroni `min(1, m·p)`; Holm cumulative maxima of `(m−i+1)·p(i)`; BH reverse cumulative minima of `m·p(i)/i`; BY multiplies BH by `Σ1/j`. Restore the original order. Labels say adjusted or unadjusted. Hiding a bracket never changes its correction family. No automatic test choice after a normality screen.
- Stars default: ≤0.05 `*`, ≤0.01 `**`, ≤0.001 `***`, ≤0.0001 `****`; otherwise "ns". Brackets stay attached to stable group IDs. Lane gaps are physical (pt).

## 14. Theme (P unless noted)

| Token | Value |
|---|---|
| Base text | 14 pt sans-serif (D) |
| Axis title | 14 pt bold |
| Tick labels | 13.3 pt bold (D, 0.95 × base) |
| Chart title | 16.8 pt bold (D, 1.2 × base) |
| Legend text | 11.2 pt regular (D, 0.8 × base) |
| Major / minor tick | 5.6 pt / 2.8 pt |
| Axis stroke | about 2.1 pt |
| Data path / symbol / symbol border | 1.5 pt / 6 pt / 0.75 pt |
| Error stem / cap length | 1 pt / 5 pt |
| Box and violin border | 1 pt |
| Band fill opacity | 0.20 |
| Background, text | white, black; grid and full frame off |

Seed palette (P, not any source's exact colors): `#000000`, `#0072B2`, `#D55E00`, `#009E73`, `#CC79A7`, `#E69F00`, `#56B4E9`, `#F0E442`. A palette change keeps manual overrides unless "replace overrides" is chosen. Palette overflow repeats with distinct shapes and a warning. Use one pinned sans-serif font and disclose fallbacks.

## 15. Acceptance fixtures

Exact and rational values keep exact tolerance; ordinary finite summaries target 1e-10 relative.

| Test | Input | Expected |
|---|---|---|
| Arithmetic summary | 1,2,3,4,5 | n=5; mean 3; SD √2.5; SEM √0.5 |
| Mean 95% CI | same | about [1.03675684, 4.96324316] (t, 4 df) |
| Type-6 quartiles | 1..8 | 2.25, 4.5, 6.75 |
| Tukey whisker | 1..8, 30 | Q1 2.5; Q3 7.5; upper fence 15; upper whisker 8; 30 outside |
| Geometric summary | 1, 10, 100 | mean 10; GSD 10; limits [1, 100] |
| Median CI, n=5, 95% | five values | min-max covers 93.75%; finite 95% CI unavailable |
| Median CI, n=6, 95% | six values | min-max covers 96.875% |
| Histogram edges | 0,1,2,3 with edges 0,1,2,3, final inclusive | counts 1, 1, 2 |
| ECDF ties | 1,1,2,3 | F(1)=0.5, F(2)=0.75, F(3)=1 |
| Bubble area | z=10,15,20; d 10..20 | 10, √250 (about 15.8113883), 20 |
| Dot apportionment | 1,1,1; N=100 | 34, 33, 33 |
| Nested weighting | unit A [0,0,0]; unit B [10] | equal-unit mean 5, not pooled 2.5 |
| Survival ties | (1,event),(2,event),(2,censor),(3,event) | S 0.75, 0.5, 0; median 2 |
| No-event survival | three censored | S stays 1; median not reached |
| ROC perfect | neg 0,1; pos 2,3 | AUC 1 |
| ROC complete tie | identical scores, both classes | AUC 0.5; ties advance together |
| Exact binomial | k=0, n=10, C=0.95 | lower 0; upper about 0.3084971 |
| Exact line | X 0,1,2; Y 1,3,5 | intercept 1; slope 2; zero residual |
| Holm | p = 0.01, 0.03, 0.04 | 0.03, 0.06, 0.06 |
| BH | same | 0.03, 0.04, 0.04 |
| Log endpoint | centre 2, interval [−1, 5] on log Y | keep centre; clip or suppress the endpoint; warning |
| Date to days | 2025-03-04; 2000-02-29; 1900-02-29 | 20151 days from 1970-01-01; 11016; refused (1900 is not a leap year) |
| Time with an offset | 2025-03-04T12:30:00+02:00 and 2025-03-04T10:30:00Z | both 1741084200 s; both counted in the note "converted to UTC" |
| Time without a zone | 2025-03-04T10:30:00 | 1741084200 s, no note; the same on every machine time zone |
| Zones mixed | 2025-03-04T10:30:00, then 2025-03-04T10:30:00Z | the second is refused |
| Calendar ticks, a year | dates 2024-01-01 to 2025-01-01 | ticks on 1 Oct 2023, then every third month, to 1 Apr 2025 |
| Calendar ticks, a month | dates 2025-03-03 to 2025-03-31 | ticks on Mondays, 24 Feb to 7 Apr |
| Calendar ticks, years | dates 2015-06-15 to 2024-06-15 | ticks on 1 January of 2014, 2016 ... 2026 |
| Duration | 1:30:00 in a column of hours, minutes, seconds | 1.5, 90, 5400 |
| Composition zero total | weights 0, 0 | that row is not drawn (no angle, percent or fabricated slice) and a warning names it; other rows still draw |

Status of the fixtures above, 29 October 2026 (a row is "tested" when a unit test holds the stated values, written from outside the code under test; see [AUDIT-P0.md](AUDIT-P0.md)):

| Tested | Not built, no test (postponed by decision) |
|---|---|
| Arithmetic summary, mean CI, type-6 quartiles, Tukey whisker (fence 15 pinned), geometric summary, median CI n=5 and n=6, histogram edges, ECDF ties, bubble area, nested weighting, survival ties, no-event survival, exact line, log endpoint (geometry; the warning text was not checked), composition zero total, the eight date, time, zone, tick and duration rows | Dot apportionment, ROC perfect, ROC complete tie, exact binomial, Holm, BH |

Interaction and applicability tests:

- Absent controls matter as much as present ones: a bar has error stems but no curve ribbon; a box has whisker rules but no SEM; a supplied-summary violin is blocked; a category axis has no log scale; a heatmap has a colourbar but no second value axis; a pie has no numeric-axis inspector.
- Switching error bars to a band keeps the bound calculation. Hiding the centre path leaves a valid band.
- Rotating a categorical chart rotates errors, brackets, labels and roles together.
- Reordering categories keeps custom point styles, pairs, bracket targets and legend labels on the same IDs.
- Undo of a theme edit leaves data edits. A data change updates labels and comparison results together. An invalid property keeps the last valid render.

## 16. Open fidelity items (U)

Exact palette arrays; symbol outlines and font metrics; automatic ranges, ticks and label collision; strip-plot packing (`standard`, `classic`, `expanded` must be deterministic, seeded and versioned, with no value-axis jitter); violin kernel behind the named levels; default bar widths and legend spacing; solver and band details for every model; full domain-specific equation libraries (out of scope); advanced post-hoc or multi-factor p values (render supplied results only). Before calling a feature matched, record a fixture with data, settings, size in pt, font identity and expected result.

## 17. Dates, times and durations

Built for the X column of an XY table (29 October 2026). Y columns, survival, histogram and category axes are not.

**What is stored.** A column holds numbers, as every column does. The type of the X column (`Group.time`, `{kind, unit}`) says what they mean; setting it never changes a number.

| Type | Stored as | Written as |
|---|---|---|
| `date` | whole days since 1970-01-01 (proleptic Gregorian, years 0001 to 9999) | `2025-03-04` |
| `datetime` | seconds since 1970-01-01T00:00:00, a fraction to a microsecond | `2025-03-04T10:30:00` (a space is read too) |
| `duration` | a length in the unit of the column (days, hours, minutes or seconds) | `1:30:00` (hours may pass 24) |

Dates are counted with integer calendar arithmetic. `Date` and the machine's time zone are never used for values, so a file reads the same everywhere.

**Reading (ISO 8601 first).**
- A date column takes `YYYY-MM-DD` only; a datetime column takes a date, `T` or a space, and `hh:mm` or `hh:mm:ss[.ffffff]`. A date in a datetime column, or a time of day in a date column, is refused, not completed or cut. Nothing else is guessed (`03/04/2025`, `4 March 2025`, `2025-3-4`, `2025-03`, `20250304` are refused with the form to use). A month or day that does not exist, a leap second (:60), 24:00 and more than six fraction digits are refused.
- A duration is `H:MM[:SS[.f]]`, an ISO 8601 duration (`PT1H30M`, `P1DT2H`, `P2W`; years and months are refused, since they have no fixed length), or a number with an optional unit (`90 min`, `1.5h`, `2d`). A bare number is in the unit of the column.
- Empty is missing, never zero.

**Time zones (decided 29 October 2026).**
1. A time written **without** a zone is a wall-clock reading. It is stored as it is, as if it were UTC, and shown again as it is. It is not read as the machine's local time.
2. A time written **with** an offset (`Z`, `+02:00`, `+0200`, `+02`) is an instant. It is converted to UTC when it is read, and the paste, import or edit says how many were converted ("2 times had a UTC offset and were converted to UTC (times are stored and shown in UTC)"). Nothing is converted silently.
3. A column is all one or all the other. In a paste or an import, the cells that differ from the first filled cell are refused, since they would put readings of different clocks on one axis.
4. Times are always shown and written in UTC, with no zone designator, so a file that was written reads back to the same numbers (an offset that was converted is not restored). The axis is in UTC and has no daylight saving: every day is 24 hours.
5. A date has no zone and no conversion.

**Writing.** A value that cannot be written in its form is written as the next form that can, never rounded: a date column with a fraction of a day shows a date and time, a number outside the years 0001 to 9999 shows as the number. Durations are shown to a microsecond with trailing zeros dropped.

**Axis.**
- Dates and times: ticks fall on calendar boundaries in UTC, never at an even number of days from the first value. The steps are 1, 2, 5, 10, 15, 30 seconds; 1, 2, 5, 10, 15, 30 minutes; 1, 2, 3, 6, 12 hours; 1 day; 1 week (Monday); 1, 3, 6 months (on January, April, July, October for 3); 1, 2, 5, 10, 20, 50 ... years (on years divisible by the step). A date axis starts at 1 day. The step is the one nearest the wanted spacing (about 120 pt) whose labels still fit between ticks.
- Labels name the boundary and always carry the year: `2025`, `2025-03`, `2025-03-04`, `2025-03-04 10:30`, `2025-03-04 10:30:15`. A value that is not a boundary (the end value of a short stretch of a broken axis, an extra tick) is written in full.
- Durations are not a calendar: ticks are multiples of 1, 2, 5, 10, 15, 30 seconds, minutes or hours (2, 3, 6, 12 hours), then 1, 2, 5 times a power of ten days, counted from zero. Labels are `h:mm`, `h:mm:ss` below a minute, and `N d` for whole-day steps. Minor ticks are evenly spaced.
- The range is the data and 5% each side, then out to the ticks, as for a numeric axis. A single value gets a day (date), an hour (time) or one unit (duration) on each side. Zero is never added to the range. Limits set by hand are in the unit of the column and are typed as dates in the inspector; a pair that cannot be one is ignored with a warning.
- **Log:** a time axis is linear. A log scale set on it is not applied and a notice says so.
- **Breaks and reversal:** as on a numeric axis (a broken axis is not reversed). Ticks are only where there is axis; a stretch with no boundary gets its end values.
- **Not used, and said so:** a major tick interval (the ticks follow the calendar), minor ticks on a date or time axis.
- **Curve fits** are not made on a time X axis (a fit needs numbers; the X values are 1.7 billion seconds from an arbitrary origin). Equal units are not applied.
- The tooltip of a point writes its X as a date, time or duration.

**File.** `time` on the first column of an XY table: `{"kind":"date","unit":"d"}`, `{"kind":"datetime","unit":"s"}`, `{"kind":"duration","unit":"s"|"min"|"h"|"d"}`. Optional, so a file without it opens as before and no migration step is needed; no version change. A `time` that is not one of these, or on any other column, refuses the file. An older program ignores it and reads the numbers as plain ones.

**Not built (29 October 2026):** a type on Y columns, survival times, histogram values and the other tables; a date as the axis of a category chart; a major tick interval in calendar units (every 2 weeks); minor ticks on dates; local time zones and daylight saving; locale date forms; week numbers; Fill series, annotations, brackets and vector steps in dates (they take numbers in the stored unit); the Results sheet and a fit on dates.

Fixtures: section 15 (dates to days, offsets, zones, ticks). The tests are `src/util/timeColumn.test.ts`, `src/chart/shared/axes/timeAxis.test.ts`, `src/chart/xy/xyTime.test.ts` and `src/ui/data/timeColumns.test.ts`; the reference values are Unix times and day numbers known from outside the code.

## 18. Guides and results in text (XY and others)

Built 29 October 2026, tested on the model and in the SVG export (the reference values are worked by hand or are geometric properties). Controls not tried in a browser.

**Results in text.** A text of a figure (an annotation, a reference line label, a bracket label) may hold `{{stat Name}}` or `{{stat Name|d}}`: `stat` is n, sum, mean, sd, sem, median, min or max, `Name` a data set (its table name or the name shown on the chart, case ignored; a table with one data set needs none) and `d` the decimals. The value is the descriptive statistic of the values of that data set with excluded values left out, as in every calculation (SD and SEM need two values). It is filled each time the graph is drawn, so it follows the data. A token that cannot be filled (no such data set, no values) stays as typed and the chart warns. Fixture: values 2, 4, 4, 4, 5, 5, 7, 9 give mean 5, SD √(32/7), SEM SD/√8, median 4.5. A reference line bound to a result (`valueFrom`) is drawn at it; when it is unavailable the line is not drawn and a notice says so.

**X error bars** (XY table layout `xerror`: Y, Y error, X error; plus or minus). The bar runs from X − e to X + e (one side only, when the error direction setting says so). A negative error draws no bar and is counted in a notice; an empty one is no bar and no notice. On a log axis an end at or below 0 is drawn at the low end and counted as clipped; on a broken axis a bar with an end in the omitted range is not drawn and is counted. They enter the axis range unless kept out. The OP-008 check (centre inside its limits) does not apply, since the error is given as plus or minus.

**Oblique reference lines.** `y = intercept + slope · x` (the identity line is slope 1, intercept 0), drawn from where it enters the plot to where it leaves, sampled on a log axis, cut at the omitted range of a broken axis. A line that misses the plot is skipped with a notice. **Equal units** widens the axis with more room until one unit has the same length on both (pt per unit equal; the identity line then runs at 45 degrees). A limit set by hand is kept; with both limits of that axis fixed, or on a log, broken or time axis, it is not applied and a notice says so.

**Extra ticks and regions.** An extra tick (value, optional text, at most 12) is merged among the automatic ticks, replaces a minor tick it lands on and carries a gridline when the grid is on; a value outside the range, in an omitted range or at or below 0 on a log axis is skipped with a notice. A region is a band between two values of an axis, cut to the axis range and pieced around gaps; one with nothing left is skipped with a notice; on a log axis a limit at or below 0 reaches to the edge. Regions do not enter the axis range.

**Right Y axis on XY charts.** A series bound to the right axis is scaled on it (points, lines, bars, spikes, areas, error bars, the fit curve). The right axis has its own range, log scale, reversal and limits, and no breaks. Reference lines, regions, extra ticks and annotations in data units use the left axis. A bracket joining two series on the right axis uses its scale; one joining series on different axes is skipped with a notice.

**Comparison brackets on grouped and XY charts.** Placement is the rule of section 13 and of the column charts: a bracket stands above the highest value either end draws, overlapping brackets are stacked (the shorter lower), a hidden bracket keeps its room, and the axis grows to hold the stack and its label unless the bracket layer is kept out of the range. Grouped bars: the ends are two series in one category, or one series in two categories; an end with no value skips the bracket with a warning. XY: a vertical bar to the right of the two points at one X, with lanes where brackets overlap; a bracket with no point at its X is skipped with a warning. The placement uses loops, not spreads into `Math.min`/`Math.max`, so a very large number of values is safe.

**Heat map intervals.** `steps` (2 to 12) cuts the scale into equal intervals and `breaks` (up to 11 edges) into the intervals you give, which win; an interval takes the scale colour at its middle; intervals are `[b(i), b(i+1))` with an inclusive final maximum (section 7). Missing, excluded and out-of-range cells each have a mark and, for the last two, a colour of their own; a cell is excluded only when it has no value left after exclusion.

**Large graphs (preview only).** Above 100 000 dots the screen preview of a column-family graph merges consecutive opaque dots of one look into paths per 12 pt square (dots with transparency are not merged); every dot keeps its position. The export, thumbnails and layouts draw every dot, and a note says the preview is simplified. Dots are counted only on points layers that are shown.
