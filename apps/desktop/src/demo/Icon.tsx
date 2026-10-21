import type { CSSProperties } from 'react';

export type IconName = 'arrow' | 'memory' | 'activity' | 'settings' | 'minus' | 'close' | 'sun' | 'spark' | 'leaf' | 'back' | 'copy' | 'check' | 'expand' | 'restore' | 'chevron';
const paths: Record<IconName, React.ReactNode> = {
  arrow: <><path d="M12 19V5M6 11l6-6 6 6" /></>,
  memory: <><path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M8 3v5l4-2 4 2V3H8Z" /><path d="M8 13h8M8 17h5" /></>,
  activity: <><path d="M4 12a8 8 0 1 0 2-5.3M4 4v5h5M12 8v5l3 2" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none" /></>,
  minus: <path d="M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2m-3-7-1.5 1.5M6.5 17.5 5 19M5 5l1.5 1.5m11 11L19 19" /></>,
  spark: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" /></>,
  leaf: <><path d="M19 4C9 3 3 8 5 14c2 6 10 5 13-2 1-3 1-5 1-8ZM4 21 15 9" /></>,
  back: <path d="m10 6-6 6 6 6M4 12h16" />,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  expand: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></>,
  restore: <><path d="M3 8h5V3M16 3v5h5M3 16h5v5M21 16h-5v5" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
};

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
