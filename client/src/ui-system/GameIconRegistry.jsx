import React from 'react';

const paths = Object.freeze({
  back: <path d="M14.5 5 7.5 12l7 7M8 12h10" />,
  reload: <><path d="M20 11a8 8 0 1 0-2.34 5.66" /><path d="M20 4v7h-7" /></>,
  warning: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5" /><path d="M12 17.5h.01" /></>,
  offline: <><path d="m3 3 18 18" /><path d="M8.5 8.5a7 7 0 0 1 9.4 1.1" /><path d="M5 12a11 11 0 0 1 1.6-1.7" /><path d="M9 16a4.5 4.5 0 0 1 6 0" /><path d="M12 20h.01" /></>,
  download: <><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M4 19h16" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></>,
  logout: <><path d="M10 5H5v14h5" /><path d="m14 8 4 4-4 4" /><path d="M9 12h9" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" /></>,
  apple: <><path d="M15.5 7.5c-1.4-.1-2.6.8-3.3.8-.8 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 3-.4 7.4 1.2 9.7.8 1.1 1.7 2.4 3 2.3 1.2 0 1.7-.7 3.2-.7 1.4 0 1.9.7 3.2.7 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.8 0-2.3 1.9-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.9" /><path d="M15.1 4.4c.7-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.2 1.8-1.1 2.9 1 .1 2-.5 2.8-1.3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  energy: <path d="M13 2 4 14h8l-1 8 9-12h-8l1-8Z" />,
  coin: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
  gem: <><path d="m12 21-9-12 4-6h10l4 6-9 12Z" /><path d="M3 9h18M8 9l4 12 4-12M7 3l1 6M17 3l-1 6" /></>,
  blueprint: <><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="12" cy="8" r="1.5" /><path d="m12 9.5-3 7M12 9.5l3 7M10 14h4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 0 0 0 2l-2.1 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.5 3.1h5l.5-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4L18.9 13a7 7 0 0 0 .1-1Z" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></>,
  armory: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M12 12v4" /></>,
  barracks: <><circle cx="9" cy="8" r="3" /><path d="M3 21a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5" /></>,
  shop: <><circle cx="9" cy="20" r="1" /><circle cx="19" cy="20" r="1" /><path d="M3 4h2l2.5 11h11l2-8H7" /></>,
  event: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  gift: <><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M12 9v12M2 6h20v4H2z" /><path d="M12 6H7.5a2.5 2.5 0 1 1 0-5C11 1 12 6 12 6ZM12 6h4.5a2.5 2.5 0 1 0 0-5C13 1 12 6 12 6Z" /></>,
  swords: <><path d="M4 3h3l11 11-3 3L4 6V3ZM20 3h-3L6 14l3 3L20 6V3Z" /><path d="m6 18-3 3M18 18l3 3" /></>,
  mission: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></>,
  crown: <><path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z" /><path d="M5 21h14" /></>,
});

export const GAME_ICON_NAMES_V440 = Object.freeze(Object.keys(paths));

export default function GameIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className = '',
  title,
}) {
  const body = paths[name] || paths.info;
  const labelled = Boolean(title);

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      className={className}
      focusable="false"
    >
      {labelled && <title>{title}</title>}
      {body}
    </svg>
  );
}
