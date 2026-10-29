# P0 correctness audit (roadmap step 3)

Read-only audit, 27 October 2026. No source or test file was changed.

## Method

- Read the tests and the code they exercise in `src/stats`, `src/chart/*`, `src/state`, `src/model`, `src/ui/data`, by grep and by opening the relevant cases. Test line numbers are those of the working tree (it has uncommitted changes).
- Ran, once, a subset: `src/stats`, `column/axisTruth`, `grouped/groupedAxisTruth`, `errorGeometry`, `seriesFamilies`, `pie`, `src/model/table`, `state/recovery*`, `serialize.repair`, `src/ui/data`. Result: 29 files, 526 tests, all passed. The full suite was not run.
- "Independent" means the expected value is a literal or a closed form written in the test, not a call to the function under test. I did not check where each literal came from (SciPy, R, hand); no test file cites its source.
- Verdicts: fine (tests cover the stated behaviour), missing test, possible defect (read in code, not run).
- Anything marked "not checked" was not opened.

## 1. P0 items

| Item | Tests that exist | Gaps | Verdict |
|---|---|---|---|
| Fit intervals | `stats/fit.test.ts` (line: classical SE and pointwise CI/PI vs hand formulas, l.22; parameter CI at 90/95/99% vs literals, l.195), `chart/xy/fitCurve.test.ts` (sheet and graph labels widen with level, l.156) | Nonlinear parameter SE, CI and bands have no reference values from outside the code (only "has errors", "wider than"). The t quantile in the line test comes from the implementation (`studentTQuantileUpper`), so that case is not independent. No test for a prediction band at a level other than 0.95 on a nonlinear model | missing test |
| Fit convergence | `fit.test.ts` l.204 (maxIterations 2: not converged, no SE, no band); `fitScaling.test.ts` l.134-163 (constant Y, too few points, collinear data: no clean convergence, no SE) | `fitCurve` silently uses 0.95 when `level` is outside (0,1) (`fit.ts` l.569); no test of that | fine (the silent fallback is a note, not a defect) |
| Numerical conditioning | `fitScaling.test.ts` (rescale X, Y, both; shift X by 1000; Y x 1e-9, all models); `fit.test.ts` l.214 (shift X by 1e8, linear), l.223 (polynomial centring), l.230 (hill 4PL, units 1e-9..1e6); `moments.test.ts`; `summary.test.ts` l.287 (SD at 1e-200 and 1e9) | No test of a nonlinear model with a 1e8 X shift; `conditioned()` limit `MAX_CONDITION` is not tested at its boundary | fine |
| Histogram bins | `stats/histogram.test.ts` (nice widths, log2(n)+1 start, constant data, anchor, inner-edge rule, outside count, 1e12 edges, 8 "every value in exactly one bin" cases incl. 1e300 and 1e-15 gaps); `chart/histogram/histogram.test.ts`, `histogramRange.test.ts` (ECDF range), `histogramLayers.test.ts` | Cap on the number of bins for a tiny width over a huge range: not checked. User-set width of 0, negative or NaN: not checked. Only one auto rule (log2(n)+1) exists, so no rule-comparison tests are needed | fine |
| Axis-break geometry | `shared/axes/breaks.test.ts` (segments, ticks, layout, log and reversed blocked, XY split at exact data values l.168); `column/axisTruth.test.ts` (points, bars, paired lines, connector, boxes, error bars in a gap); `grouped/groupedAxisTruth.test.ts` (same, plus stacked and floating) | No test for histogram, heat map, survival, or pie with a break (not checked whether these families ignore `axis.breaks` or draw it). XY: only the line-splitting case; XY points in a gap and XY error bars in a gap have no case seen. A bar that spans a gap is one rectangle trimmed by the clip (known, OP-005 stays partly open) | missing test (non-column families) |
| CSV import | `ui/data/csv.test.ts` (quotes, unclosed quote, delimiter detection and naming, comma mode, round trips in 3 modes, exclusions, bad values name line and column); `csvPreview.test.ts`; `cellText.test.ts` (paste, row limit, underflow to 0 refused) | Not found: UTF-8 BOM, Infinity or "NaN" text, file-size or column-count limit for CSV (the project file has one), duplicate or empty header names | missing test |
| Project import | `state/projectFile.test.ts` (round trip, size limit, not UTF-8, damaged, wrong types with notes, checked-in example); `serialize.test.ts`; `serialize.repair.test.ts` (15 repair and refusal cases with paths) | Looks complete for the cases named in OP-025. No fuzz or version-2 file case beyond "reads version 1 only" | fine |
| Save | `projectFile.test.ts`; `recovery.test.ts` (saved-as-file vs recovery vs memory, flush decision, status text); `recoveryStore.test.ts` (two-tab conflict, full store); `saveShortcut.test.ts` | The browser hook that calls the flush on page exit and the "unchanged after undo back to the saved point" case: not checked (no test seen) | missing test |
| Undo | `state/history.test.ts` (2 cases: no merge across charts, merge on the same object); `commands.test.ts` l.94, 109, 165, 174 (one undo step, override restore, 800 ms window, style undo keeps title) | History depth limit, redo cleared by a new edit, undo across add/remove table, undo of a data edit leaving theme edits (contract section 15 states the reverse pair for theme): only the style/title pair is tested | missing test |
| Stable series colours | `model/table/chartTable.test.ts` l.97 (added sets keep colour when an earlier one is removed), l.116 (old file with no slot); `chart/__tests__/drawOrder.test.ts` l.20 (colour follows its series when reordered) | Own series removed or hidden then re-added; colour after table duplicate: not checked | fine |
| `exp_two_phase` identifiability | `fit.test.ts` l.134 (well-separated rates 2.5 and 0.15, converges), l.204 (non-converged: no SE). `fitScaling.test.ts` runs it in CASES for scaling and constant Y | No test for single-exponential data fitted by two phases, or for two nearly equal rates (ill-conditioned: expect no SE and not converged). `fit.ts` has no ordering constraint: parameter names say "k1 (fast rate)" and "k2 (slow rate)" but nothing enforces k1 > k2 (no sort or swap found in `fit.ts`). A fit can return the phases swapped, so the labels may be wrong. Start values are a fixed 10/span and 1/span | possible defect at the audit; **not reproduced** in the follow-up below (the rate order was always right) |
| Confidence-level change recomputes intervals | `fitCurve.test.ts` l.156 (sheet and graph labels), l.198 and l.246 (cache); `curveFit.ts` `cachedFit` includes `level` in the key; `analysis.test.ts` l.67 (change level, repair a bad level) | Band width on the drawn graph after a level change: not checked (l.35 of `fitCurve.test.ts` tests band presence and PI > CI only). Non-fit intervals (mean CI, median CI, survival band) at a changed level: survival has `survivalBand.test.ts` l.49 (99%); mean CI at 99% in `descriptive.test.ts` l.73 | fine for the fit sheet; band: missing test |

## 2. Section 15 fixtures of `docs/calculation-contracts.md`

"Where" gives file:line. "Independent" is by the definition in the method note.

| Fixture | Implemented as a test | Reference values | Verdict |
|---|---|---|---|
| Arithmetic summary 1..5 | `stats/summary.test.ts` l.18, l.101-110 | Independent (closed forms with sqrt 2.5, sqrt 0.5) | pass (ran) |
| Mean 95% CI | `summary.test.ts` l.114; `special.test.ts` l.120 | Independent (literals 1.03675684, 4.96324316, t = 2.7764451051978) | pass |
| Type-6 quartiles 1..8 | `summary.test.ts` l.136 | Independent literals | pass |
| Tukey whisker 1..8,30 | `stats/distribution.test.ts` l.21 | Independent; asserts Q1 2.5, Q3 7.5, whisker 8, outlier 30. Upper fence 15 is not asserted | partial |
| Geometric 1,10,100 | `summary.test.ts` l.163 | Independent | pass |
| Median CI n=5 | `summary.test.ts` l.199-204; `special.test.ts` l.160 | Independent (0.9375, unavailable) | pass |
| Median CI n=6 | `summary.test.ts` l.207; `special.test.ts` l.161 | Independent (0.96875) | pass |
| Histogram edges | `stats/histogram.test.ts` l.37 | Independent | pass |
| ECDF ties | `histogram.test.ts` l.79 | Independent | pass |
| Bubble area | None. No source: "bubble" appears only in `chartGallery.ts` and `GallerySketches.tsx` | n/a | missing (feature not built) |
| Dot apportionment | None. No source (no apportionment code found) | n/a | missing (feature not built) |
| Nested weighting | None. "Nested dots" is a gallery entry (`chartGallery.ts`); no equal-unit mean code found | n/a | missing (feature not built) |
| Survival ties | No exact fixture. `chart/__tests__/seriesFamilies.test.ts` l.53 uses (5 event, 5 censor, 5 event, 8 event), l.43 a censored case; median 2 not tested (median code not checked) | Independent literals, different input | partial |
| No-event survival | `seriesFamilies.test.ts` l.60: no steps, marks at S = 1. "Median not reached" not tested (not checked) | Independent | partial |
| ROC perfect / complete tie | None. No ROC code in `src` | n/a | missing (feature not built) |
| Exact binomial k=0 n=10 | None. `special.ts` has only the median-CI binomial sums; no Clopper-Pearson function found | n/a | missing |
| Exact line | `stats/fit.test.ts` l.13 | Independent | pass |
| Holm / BH | None. No source for either (grep: no Holm, Benjamini, Bonferroni) | n/a | missing (feature not built) |
| Log endpoint | `chart/shared/parts/errorGeometry.test.ts` l.196 (centre 2, [-1, 5], forged interval); warning text not checked | Independent | pass for geometry, warning not checked |
| Composition zero total | `chart/pie/pie.test.ts` l.49 (row adding to zero is not drawn, warning "counts add up to zero") | Independent | pass (the contract says "blocking error"; the code warns and skips the row) |

The "Interaction and applicability tests" bullets at the end of section 15 were not audited (not checked), except the theme-undo case (see Undo above).

No fixture test found calls its own implementation to produce the expected value. One non-fixture case does: `fit.test.ts` l.22 uses `studentTQuantileUpper` from the code under test for the line CI and PI.

## 3. OP-001..OP-036 claims, BACKLOG section 1 (and the Progress paragraph)

Section 1 lists OP-001..OP-025, OP-033. OP-026..OP-032, 034..036 are in other sections or the Progress paragraph; those with a defect claim are included. The backlog states test names for none; the file is found by topic.

| ID | Claimed fixed | Regression test found | Note |
|---|---|---|---|
| OP-001 decimal comma | yes | `ui/data/cellText.test.ts` l.133-195, `csv.test.ts` l.96-113 | covered |
| OP-002 layout ignores exclusions | yes | `model/table/preparedChart.test.ts` l.41, l.49; `src/architecture.test.ts` (guard not opened) | covered |
| OP-003 log axis drops values | yes | `column/axisTruth.test.ts` l.36-77; `grouped/groupedAxisTruth.test.ts` l.30 | covered |
| OP-004 fit tiny Y | yes | `stats/fitScaling.test.ts` l.105 | covered |
| OP-005 broken axis | partly | `axisTruth.test.ts` l.88-182, `groupedAxisTruth.test.ts` l.62-100; XY `breaks.test.ts` l.168 | open outside column and grouped, as stated; no tests for other families |
| OP-006 descending ECDF range | yes | `histogram/histogramRange.test.ts` l.37 | covered |
| OP-007 hyperbola X = 0 | yes | `fit.test.ts` l.242-257 | covered |
| OP-008 supplied mean outside limits | yes | `model/table/suppliedStats.test.ts` l.5 | covered |
| OP-009 duplicate graph layer ids | yes | `state/commands.test.ts` l.234 | covered |
| OP-010 row titles of added sets | yes | `model/table/chartTable.test.ts` l.124 | covered |
| OP-011 colour of added series | yes | `chartTable.test.ts` l.97, l.116 | covered |
| OP-012 layout PNG dpi | yes | `chart/export/pngDpi.test.ts` (layout case not opened) | not checked whether the layout path is the one tested |
| OP-013 thumbnail clip ids | yes | `ui/views/FolderThumbs.test.tsx` l.10 | covered |
| OP-014 histogram edge rounding | yes | `stats/histogram.test.ts` l.98-129 | covered |
| OP-015 SD underflow | yes | `summary.test.ts` l.287; `moments.test.ts` l.11 | covered |
| OP-016 `/s+/g` | yes | `model/graph/layers.test.ts` l.106 | covered |
| OP-017 `.test.tsx` not run | yes | `vite.config.ts` l.35 `include: ['src/**/*.test.{ts,tsx}']`; `controls.test.tsx` exists | config checked; no test asserts the include itself |
| OP-018 prefixIds passes | yes | `chart/export/prefixIds.test.ts` l.36-61 (matches old implementation, linear scaling) | covered |
| OP-019 paired matching cost | yes | `column/pairedMatching.test.ts` l.69 (10,000 rows, timing) | timing test can be flaky on a slow machine |
| OP-020 cache keys, Results fits | yes | `stats/calcCache.test.ts`; `fitCurve.test.ts` l.198, l.246 | covered |
| OP-021 concurrent PNG exports | yes | `ui/export/exportJob.test.ts` l.16 | covered |
| OP-022 large paste stack overflow | yes | `cellText.test.ts` l.215-225 (row limit refusal) | no test with a very large row array that would overflow `Math.max(...)`; not checked whether the limit is below the overflow size |
| OP-023 flush on page exit | yes | `state/recovery.test.ts` l.23-26 (`flushDecision`, pure) | the listener that calls it on pagehide: no test found |
| OP-024 two tabs one key | yes | `state/recoveryStore.test.ts` l.35-104 | covered |
| OP-025 import repair | yes | `state/serialize.repair.test.ts` | covered |
| OP-026 labels on inputs | yes (sweep) | `controls.test.tsx` (not opened) | not checked |
| OP-027 roving tab stop | yes | `ui/inspector/common/roving.test.ts` (not opened); backlog says focus movement not testable | not checked |
| OP-028 Ctrl/Cmd+S | yes | `ui/components/saveShortcut.test.ts` l.7-13 | covered |
| OP-029..031 rows, CSV preview, CSV export | yes | `rowCommands.test.ts`, `csvPreview.test.ts`, `csv.test.ts` l.135-181 | files exist; contents of the first two not opened |
| OP-033 layout report warnings | yes | `chart/export/exportReport.test.ts` (not opened) | not checked |
| OP-034, 035, 036 | yes | `export.test.ts`/`fontCheck.test.ts`, `chartGallery.test.ts`, `architecture.test.ts` | not checked |
| OP-032 small screens | partly | none (CSS, looked at in a browser per the backlog) | out of P0 scope |

## 4. Top gaps, by priority

| # | Gap | Size |
|---|---|---|
| 1 | `exp_two_phase`: nothing enforces k1 > k2, so the fast/slow labels can come back swapped. Add a test with swapped starts; fix is to sort the pairs after the fit. Add near-equal-rate and single-exponential cases (expect no SE, not converged) | S |
| 2 | Section 15 fixtures with no code: bubble area, dot apportionment, nested weighting, ROC, exact binomial, Holm, BH (7 rows). The roadmap says the fixtures must pass, so either build the features or mark these rows "not built" in the contract | L |
| 3 | Fixtures that exist but are partial: Tukey fence 15, survival ties input (1e,2e,2c,3e) with median 2, no-event "median not reached", log-endpoint warning text, composition zero total wording | S |
| 4 | Nonlinear fit intervals checked only by inequality. Add 2 or 3 reference cases (SE, CI, CI band, PI band at 90% and 99%) with values from SciPy `curve_fit` or R `nls`, noting the source in the test | M |
| 5 | Undo and save: history depth, redo cleared by a new edit, dirty state after undo to the saved point, pagehide hook calls the flush (OP-023), data-edit undo leaving theme edits | M |
| 6 | Axis break outside column and grouped (OP-005): decide per family (XY points and error bars in a gap, histogram, survival, heat map, pie) whether breaks apply; test it or block the control | M |
| 7 | CSV import: BOM, Infinity and NaN text, size and column limits, duplicate headers | S |
| 8 | OP-022 and OP-012: a test that fails on `Math.max(...rows)` with a very large input, and a test that the layout PNG path (not only single graph) gets the dpi chunk | S |
| 9 | Histogram: cap on bin count for a tiny width and a huge range; width of 0 or NaN | S |
| 10 | Replace the `studentTQuantileUpper` call in `fit.test.ts` l.22 with a literal t value | S |

## Current state of the section 15 fixtures, 29 October 2026

The table in section 2 is the audit of 27 October 2026 and is kept as it was. The state now, from the tests in the working tree (full run 29 October 2026: 201 files, 4627 tests passed):

| Fixture | Now |
|---|---|
| Arithmetic summary, mean 95% CI, type-6 quartiles, geometric, median CI n=5 and n=6, histogram edges, ECDF ties, exact line | pass (unchanged) |
| Tukey whisker | pass: the fence 15 is pinned (`distribution.test.ts`) |
| Bubble area | pass: `xyBubble.test.ts` (28 October 2026) |
| Nested weighting | pass: `subjects.test.ts`, equal-unit mean 5 against pooled 2.5 (28 October 2026) |
| Survival ties, no-event survival | pass: `seriesFamilies.test.ts` with `medianSurvival`; the Results sheet is tested in `survivalSheet.test.ts` |
| Log endpoint | pass for geometry; the warning text is still not checked |
| Composition zero total | pass; the contract was changed to say that the row is skipped with a warning (28 October 2026) |
| Dates to days, offsets, zones, calendar ticks, duration | eight new rows of section 15 (29 October 2026); tests in `timeColumn.test.ts`, `timeAxis.test.ts`, `xyTime.test.ts`, `timeColumns.test.ts` |
| **Dot apportionment, ROC perfect, ROC complete tie, exact binomial, Holm, BH** | **Not built and no test.** Postponed by decision (29 October 2026), not forgotten: the features do not exist, so these six rows stay open |

The "possible defect" for `exp_two_phase` (item 1 of the top gaps) was not reproduced; see the follow-up. Gap 2 now reads: bubble area and nested weighting are done; dot apportionment, ROC, exact binomial, Holm and BH are unbuilt.

## Follow-up, 27 October 2026 (after the audit)

- **`exp_two_phase` ordering: not reproduced.** The audit read no ordering constraint in `fit.ts` and flagged a possible swap of the labels k1 (fast) and k2 (slow). Fitting noise-free curves with the phases listed either way round (rates 2.5/0.15, 0.15/2.5, 0.05/3, 20/0.1) always gave the fast rate as k1. One curve (rates 5 and 0.5, amplitudes 2 and 8) did not settle: the rates collapsed to one value, `converged` was false and no uncertainty was given, as the contract wants. Regression tests were added in `src/stats/fit.test.ts`. The start values (fast rate 10/span, slow 1/span) are what is limiting; a better start for that curve is open.
- **OP-022:** a test does exist (`ui/data/cellText.test.ts`: 200 000 rows refused without throwing, exactly 100 000 accepted); the audit's "no test would catch it" is too strong, but whether 100 000 elements would overflow a spread on every engine was not checked.

## Work done on the gaps, 27 October 2026

| Gap | What was done |
|---|---|
| Nonlinear fit intervals | Checked against **NIST's certified values** (StRD, MGH17, the same model as the two-phase decay): the fit now reproduces the certified RSS, the residual SD, all five parameters and all five standard errors to 6 to 9 significant digits. The bands are checked against the delta method worked out in the test by a separate solver (which itself reproduces the certified standard errors). The t quantile of the straight-line test is now a tabulated value. Other models (Hill, peak, hyperbola ...) still have no outside reference. |
| Two-phase start values | The old start ended in a one-rate solution for MGH17 (RSS 0.0506 against 5.46e-5) and for rates 5 and 0.5. The fit now also starts from the three best pairs of rates of a grid, with offset and amplitudes solved exactly (variable projection), and keeps the best result. Both curves are found now. |
| Undo and save | History tests: redo cleared by a new edit, a no-op leaving it, 200 steps kept, undo across adding and removing a table, a data and a style edit undone in order, opening another project starting a new history. Browser test: an edit made with the autosave timer stopped is in the recovery copy after the page is left (checked by disabling the three exit handlers: the test then fails). |
| Axis breaks outside column and grouped charts | **Two defects found and fixed in the XY model** (which also draws histograms, cumulative distributions and survival curves): a point inside a gap was dropped without a word, and an error bar with an end inside a gap was drawn to the edge of the gap as if that were its value. Both now follow the column rule: not drawn, and a warning counts them. Tests for points, lines, spikes, error bars on both axes. Pie and heat map ignore breaks (documented by a test); category charts break their value axis only. Not checked: bars of a histogram, or steps of a survival curve, that span a gap. |
| Section 15 | Tukey fence pinned at 15; survival ties and no-event survival written with the contract's values; `medianSurvival` added (the app had none) so that "median 2" and "median not reached" are tested. The seven fixtures whose features do not exist remain. |
| Smaller holes | A peak fitted with X shifted by 1e8; a histogram width that would make too many bins (capped) and a width of 0, negative or not a number; the drawn band at other levels. Not done: the conditioning limit at its boundary, a series removed and added again. |
| Done 28 Oct 2026 | Composition with a zero total: decided to keep the code (warn and skip the row) and changed the contract to say so. |
