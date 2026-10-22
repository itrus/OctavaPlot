import type { HitTarget } from '../../chart/hitTest';

export type InspectorTab = 'appearance' | 'datasets' | 'annotations';
export type AppearanceSection = 'style' | 'axes' | 'text' | 'dimensions' | 'legend';

/** A place in the inspector: a tab and, for Appearance, one of its sections. */
export interface InspectorTarget {
  tab: InspectorTab;
  section?: AppearanceSection;
}

/** The inspector page that holds the settings of a clicked chart element; null when it has none (the background). */
export function inspectorTargetFor(hit: HitTarget): InspectorTarget | null {
  switch (hit.kind) {
    case 'bar':
    case 'point':
    case 'error':
    case 'line':
    case 'meanLine':
    case 'label':
      return { tab: 'appearance', section: 'style' };
    case 'legend':
      return { tab: 'appearance', section: 'legend' };
    case 'axis':
      return { tab: 'appearance', section: 'axes' };
    case 'title':
      return { tab: 'appearance', section: 'text' };
    case 'annotation':
      return { tab: 'annotations' };
    default:
      return null;
  }
}
