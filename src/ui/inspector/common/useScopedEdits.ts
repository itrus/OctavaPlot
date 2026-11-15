import { useMemo } from 'react';
import { clearGroupStyleSettings, clearGroupSummarySettings, patchStyle, patchSummary } from '../../../state/commands';
import { isGroupOverridden } from '../../../model/graph/style';
import { isSummaryOverridden, validateSummaryPatch } from '../../../model/graph/summary';
import { mixedStyleKeys, mixedSummaryKeys, type StyleScope } from '../../../model/graph/selection/scope';
import type { Chart, ChartLayer, ChartStyle, Group, Id, SummarySpec } from '../../../model/types';
import { useCommands } from '../../../state/AppContext';
import type { Overridden } from './controls';

/** A change of style for a scope (a data set, several, or all), as one undo step that follows the same typing in the same place. */
export function useRestyle(chart: Chart): (scope: StyleScope, patch: Partial<ChartStyle>) => void {
  const { run } = useCommands();
  // A colour set by hand wins over the palette (a data set override is read after it), so the palette stays for the data sets that were not recoloured.
  return (scope, patch) => run('Change style', patchStyle(chart.id, scope, patch), `style:${scope}:${Object.keys(patch).join(',')}`);
}

/**
 * The edits of the style and the summary of the data sets an inspector has in scope (all of them, one, or several selected together),
 * and what says that a setting is the data sets' own or differs between them: the same for the inspector of a column chart and that of
 * an XY chart, which differ only in how they list the data sets they reach. `inScope` is those that are shown (hidden ones are not drawn,
 * so they do not count as differing).
 */
export function useScopedEdits(chart: Chart, layer: ChartLayer, scope: StyleScope, scopeIds: readonly Id[], inScope: ReadonlyArray<Pick<Group, 'id' | 'paletteIndex'>>) {
  const { run } = useCommands();
  const inScopeKey = inScope.map((g) => g.id).join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mixedStyle = useMemo(() => mixedStyleKeys(chart, layer, inScope), [chart, layer, inScopeKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mixedSummary = useMemo(() => mixedSummaryKeys(layer, inScope.map((g) => g.id)), [layer, inScopeKey]);
  /** A setting these data sets have their own value for: the dot beside it is the way back to the graph's value; "mixed" when they differ. */
  const ov = (key: keyof ChartStyle): Overridden => {
    const own = scopeIds.filter((id) => isGroupOverridden(layer, id, key));
    const mixed = mixedStyle.has(key);
    return own.length === 0 && !mixed ? false : { reset: own.length > 0 ? () => run('Reset setting', clearGroupStyleSettings(chart.id, own, [key])) : undefined, mixed };
  };
  const ovSum = (key: keyof SummarySpec): Overridden => {
    const own = scopeIds.filter((id) => isSummaryOverridden(layer, id, key));
    const mixed = mixedSummary.has(key);
    return own.length === 0 && !mixed ? false : { reset: own.length > 0 ? () => run('Reset setting', clearGroupSummarySettings(chart.id, own, [key])) : undefined, mixed };
  };
  const restyle = useRestyle(chart);
  const setStyle = (patch: Partial<ChartStyle>) => restyle(scope, patch);
  const setSummary = (patch: Partial<SummarySpec>, label = 'Change summary') => {
    if (!validateSummaryPatch(patch)) return;
    run(label, patchSummary(chart.id, scope, patch), `summary:${scope}:${Object.keys(patch).join(',')}`);
  };
  return { mixedStyle, mixedSummary, ov, ovSum, setStyle, setSummary };
}
