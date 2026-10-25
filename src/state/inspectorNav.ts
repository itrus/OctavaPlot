/** Where the inspector can be sent: the app keeps the last request (see AppContext), the inspector reads it. */
export type InspectorTab = 'appearance' | 'datasets' | 'annotations';
export type AppearanceSection = 'style' | 'axes' | 'frame' | 'text' | 'layout' | 'legend';

/** A place in the inspector: a tab and, for Appearance, one of its sections. */
export interface InspectorTarget {
  tab: InspectorTab;
  section?: AppearanceSection;
}
