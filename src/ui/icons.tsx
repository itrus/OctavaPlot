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
