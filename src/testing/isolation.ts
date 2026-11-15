import { afterEach, beforeEach } from 'vitest';
import { forgetPlaces } from '../state/inspectorNav';
import { clearCalcCache, calcStats } from '../stats/calcCache';
import { resetFitService } from '../stats/fitService';
import { fitStats } from '../model/project/curveFit';

/**
 * The test files share one process (isolate: false, which cuts the run from about 56 s to about 20 s), so the module-level state that a
 * test can leave behind is put back before and after each test. A new cache or counter at module level belongs here. A WeakMap keyed by
 * the object it describes needs nothing: a test builds its own objects. Not reset on purpose: the ID counter of model/ids.ts (it only
 * grows, and IDs are unique anyway), and the answers of the font checks of ui/export/browserFonts.ts (they ask the browser, absent here).
 */
function reset(): void {
  clearCalcCache();
  Object.assign(calcStats, { computed: 0, hits: 0 });
  fitStats.calculated = 0;
  resetFitService();
  forgetPlaces();
}

beforeEach(reset);
afterEach(reset);
