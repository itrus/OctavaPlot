import type { ReactNode } from 'react';

/** Small 16 px line icons; they inherit the text colour and are hidden from assistive technology (buttons keep their text). */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const NewProjectIcon = () => (
  <Icon>
    <path d="M9.5 1.8H4.2a1 1 0 0 0-1 1v10.4a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1V5.1z" />
    <path d="M9.5 1.8v3.3h3.3M8 7.6v3.8M6.1 9.5h3.8" />
  </Icon>
);

export const OpenProjectIcon = () => (
  <Icon>
    <path d="M1.8 12.8V3.6a1 1 0 0 1 1-1h3l1.4 1.6h5a1 1 0 0 1 1 1v1.2" />
    <path d="M1.8 12.8l1.7-5.2a1 1 0 0 1 1-.7h9.5a.7.7 0 0 1 .7.9l-1.5 4.7a1 1 0 0 1-1 .7H2.8" />
  </Icon>
);

export const SaveProjectIcon = () => (
  <Icon>
    <path d="M3 2.2h7.8l2.2 2.2v8.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.2a1 1 0 0 1 1-1z" />
    <path d="M5 2.2v3.4h5V2.2M4.8 13.8V9h6.4v4.8" />
  </Icon>
);

/** Arrow into a tray: bring a file in. */
export const ImportIcon = () => (
  <Icon>
    <path d="M8 10V2M4.8 6.8 8 10l3.2-3.2M2.5 13.5h11" />
  </Icon>
);

/** Arrow out of a tray: send a file out (also used for chart export). */
export const ExportIcon = () => (
  <Icon>
    <path d="M8 2v8M4.8 5.2 8 2l3.2 3.2M2.5 13.5h11" />
  </Icon>
);

/** Gear. */
export const SettingsIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.6v1.7M8 12.7v1.7M1.6 8h1.7M12.7 8h1.7M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2" />
  </Icon>
);

/** Counterclockwise circular arrow: put things back as they were. */
export const ResetIcon = () => (
  <Icon>
    <path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9" />
    <path d="M2.4 1.8v3.3h3.3" />
  </Icon>
);

/** Circled i. */
export const InfoIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="6.3" />
    <path d="M8 7.2V11.2" />
    <circle cx="8" cy="4.9" r="0.5" fill="currentColor" />
  </Icon>
);

/** Waste bin: delete. */
export const DeleteIcon = () => (
  <Icon>
    <path d="M2.5 4.2h11M6 4.2V2.6h4v1.6M4 4.2l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-9M6.6 6.8v4.6M9.4 6.8v4.6" />
  </Icon>
);

/** A column with a plus: add a group, series or outcome. */
export const AddColumnIcon = () => (
  <Icon>
    <rect x="2.5" y="2.5" width="5" height="11" rx="1" />
    <path d="M11.5 6v4M9.5 8h4" />
  </Icon>
);

/** An eye, crossed out: leave the selected values out of charts and calculations. */
export const ExcludeIcon = () => (
  <Icon>
    <path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4z" />
    <circle cx="8" cy="8" r="1.8" />
    <path d="M3 13 13 3" />
  </Icon>
);

/** An eye: use the selected values again. */
export const IncludeIcon = () => (
  <Icon>
    <path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4z" />
    <circle cx="8" cy="8" r="1.8" />
  </Icon>
);

/** Axes with a curve: fit a curve. */
export const FitCurveIcon = () => (
  <Icon>
    <path d="M2.5 2.5v11h11" />
    <path d="M4.5 11c2-.2 3-2 4-4s2-3 3.5-3.2" />
  </Icon>
);

/** Many rows with a plus: add a large block of rows. */
export const AddManyRowsIcon = () => (
  <Icon>
    <path d="M2.5 2.5h11M2.5 5.5h11M2.5 8.5h6" />
    <path d="M11.5 9.5v4M9.5 11.5h4" />
  </Icon>
);
