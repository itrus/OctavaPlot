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
| Calculated curves and diagnostics | `distribution.histogram`, `distribution.frequency_polygon`, `distribution.ecdf`, `curve.survival`, `curve.cumulative_event`, `curve.roc`, `curve.fit`, `curve.smooth`, `curve.function`, `diagnostic.qq`, `diagnostic.bland_altman`, `diagnostic.residual` |
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
- Smoothing: cubic, Akima, cubic smoothing spline, LOWESS. Duplicate X are averaged with disclosure. No extrapolation by default. No confidence band unless supplied bounds or a separate uncertainty method exists. LOWESS (P): k nearest X, distance divided by the furthest selected, weight `(1+|u|³)^(−3)` (tricube `(1−|u|³)³` optional), weighted local linear fit; neighbour fraction coarse/medium/fine = 0.75/0.50/0.25; at least `4n` segments (150 otherwise).

## 6. Variable-driven symbols

- Proportional area: `d = d_ref·√(z/z_ref)`. Range-mapped area: `t = (z−zmin)/(zmax−zmin)`, `d = √(dmin² + t(dmax²−dmin²))`. Never interpolate diameter. Non-circular shapes scale by filled area. Degenerate domain: fixed size and a notice.
- Categorical mappings are keyed by category ID. Size and colour legends are combined only for the same discrete mapping, and legend symbols use the plotted mapping.
- Origin-to-each vectors are separate segments. A zero origin cannot sit on a log axis; require an explicit valid origin.

## 7. Heatmap, composition

- Replicate reduction, then normalisation, then colour scaling. Geometric mean rejects non-positive values. Percent CV at zero mean is undefined. Zero denominator gives missing with a notice. Auto min/max ignores missing and excluded cells. Interval colours use `[b(i), b(i+1))` with an inclusive final maximum. Reversing colours does not reverse row order. Labels name which value they show. Gaps are layout objects.
- Weights must be finite, nonnegative, with a positive included total. Hiding a part keeps it in the denominator; excluding removes it. Zero parts keep their ID, with no fabricated slice. A supplied denominator above the included sum shows the remainder or is rejected. Slice angle `2π·w/total`.
- Dot grid: `q = N·w/total`, floor, then the remaining dots by descending fractional remainder, ties by part order. Weights 1, 1, 1 with N = 100 give 34, 33, 33. Percent labels use the original weights.
- Stacks: an additive component's height is its own value; positive and negative accumulate separately. Normalised stacks reject negatives; an all-zero denominator is undefined. Component errors are not the total's uncertainty.
- Nested data: group uncertainty comes from unit summaries, with equal weight per independent unit. n counts units.
- Counts: nonnegative integers; cross-tabulate after exclusions; no chi-square or effect-size report.

## 8. Survival

- Sort and combine ties. At event time `tⱼ`: `nⱼ` at risk just before, `dⱼ` events, `cⱼ` censored. `S(t) = Π(1 − dⱼ/nⱼ)`. The event decrement applies before tied censored subjects leave; censor marks at a tied time sit at the post-event level.
- Greenwood: `G = Σ dⱼ/[nⱼ(nⱼ−dⱼ)]`, `SE(S) = S·√G`. For `0 < S < 1`, `g = ln(−ln S)`, `SE_g = √G/|ln S|`, `z = Φ⁻¹(1−α/2)`: lower `exp(−exp(g + z·SE_g))`, upper `exp(−exp(g − z·SE_g))` (log-log, default). Symmetric limits `S ± z·SE` are clipped to [0, 1]. Limits at S = 0 or 1 are omitted; the band stops at the last finite bound.
- Cumulative event `F = 1 − S`, limits `[1−upper, 1−lower]`. Not competing risks. Median is the first time `S ≤ 0.5`, else "not reached". No events: S stays 1.
- Unknown status codes are invalid, not censored. Event at time 0 is allowed with explicit pre and post states.

## 9. ROC

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
- Dates, instants and durations are distinct types.
- A reference identity line is `Y = X`, not a screen diagonal. Reference regions are axis-aware bands, not uncertainty. The editor's alignment grid is never exported.
- Broken axes: up to two breaks, continuous axes only; split and clamp every primitive at each segment boundary, never bridge. Reversed plus segmented is rejected. Scale bars on nonlinear axes need an explicit endpoint pair or ratio label.

## 13. Comparisons (bracket labels)

- Sources: manual text, supplied p, or calculated p. Supplied results are labelled as not recomputed.
- Methods: one-sample t, Welch, equal-variance t (explicit), paired t (on differences), Mann-Whitney, signed-rank, two-curve logrank, supplied. Welch uses Satterthwaite df. Rank methods use average ranks; signed-rank drops exact zero differences and reports the count; exact distribution when feasible, else a tie-corrected normal approximation with a continuity-correction setting; the method that ran is stored.
- Logrank: sum `d₁ⱼ − n₁ⱼ·dⱼ/nⱼ` with variance `n₁ⱼ n₀ⱼ dⱼ (nⱼ−dⱼ)/(nⱼ²(nⱼ−1))`, squared standardised total against χ² with 1 df. Zero variance means unavailable.
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
| Composition zero total | weights 0, 0 | that row is not drawn (no angle, percent or fabricated slice) and a warning names it; other rows still draw |

Interaction and applicability tests:

- Absent controls matter as much as present ones: a bar has error stems but no curve ribbon; a box has whisker rules but no SEM; a supplied-summary violin is blocked; a category axis has no log scale; a heatmap has a colourbar but no second value axis; a pie has no numeric-axis inspector.
- Switching error bars to a band keeps the bound calculation. Hiding the centre path leaves a valid band.
- Rotating a categorical chart rotates errors, brackets, labels and roles together.
- Reordering categories keeps custom point styles, pairs, bracket targets and legend labels on the same IDs.
- Undo of a theme edit leaves data edits. A data change updates labels and comparison results together. An invalid property keeps the last valid render.

## 16. Open fidelity items (U)

Exact palette arrays; symbol outlines and font metrics; automatic ranges, ticks and label collision; strip-plot packing (`standard`, `classic`, `expanded` must be deterministic, seeded and versioned, with no value-axis jitter); violin kernel behind the named levels; LOWESS and spline endpoint details; default bar widths and legend spacing; solver and band details for every model; full domain-specific equation libraries (out of scope); advanced post-hoc or multi-factor p values (render supplied results only). Before calling a feature matched, record a fixture with data, settings, size in pt, font identity and expected result.
