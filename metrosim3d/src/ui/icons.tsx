import type { ReactNode } from 'react';

const S = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  pan: S(<><path d="M12 2v20M2 12h20" /><path d="M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" /></>),
  road: S(<><path d="M7 21L10 3M17 21L14 3" /><path d="M12 5v2M12 11v2M12 17v2" /></>),
  res: S(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>),
  com: S(<><path d="M4 9h16l-1-5H5z" /><path d="M5 9v11h14V9" /><path d="M9 20v-5h6v5" /></>),
  ind: S(<><path d="M3 20V10l6 4V10l6 4V6h4v14z" /><path d="M3 20h18" /></>),
  place: S(<><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>),
  bulldoze: S(<><path d="M3 17h11V9H8l-3 4H3z" /><circle cx="6" cy="18" r="2" /><circle cx="12" cy="18" r="2" /><path d="M14 13h3l4 5h-6" /></>),
  undo: S(<><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 010 10h-3" /></>),
  save: S(<><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></>),
  settings: S(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>),
  pause: S(<><path d="M9 5v14M15 5v14" /></>),
  play: S(<path d="M7 4l12 8-12 8z" />),
  fast: S(<><path d="M3 5l8 7-8 7z" /><path d="M13 5l8 7-8 7z" /></>),
  rotL: S(<><path d="M3 12a9 9 0 109-9" /><path d="M3 4v5h5" /></>),
  rotR: S(<><path d="M21 12a9 9 0 11-9-9" /><path d="M21 4v5h-5" /></>),
  up: S(<path d="M6 15l6-6 6 6" />),
  down: S(<path d="M6 9l6 6 6-6" />),
  plus: S(<path d="M12 5v14M5 12h14" />),
  minus: S(<path d="M5 12h14" />),
  home: S(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /></>),
  stats: S(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  close: S(<path d="M6 6l12 12M18 6L6 18" />),
};
