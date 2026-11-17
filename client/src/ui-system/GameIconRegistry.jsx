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
