import { useId } from 'react';

/*
 * The Surelane mark: a check that carries on into a forward arrow, on an
 * indigo-to-violet tile. "Sure" is the check; "lane" is the way forward.
 * The same geometry is used for the favicon and app icons (src/app/icon.svg).
 */
export const MARK_GLYPH = 'M13.5 24l6.75 6.75L34 17';
export const MARK_ARROW = 'M26 17h8v8';

export function Mark({ className = '', size = 32 }: { className?: string; size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" /><stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="24" y1="0" x2="24" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#g${id})`} />
      <rect x="1" y="1" width="46" height="46" rx="12" fill={`url(#h${id})`} />
      <path d={MARK_GLYPH} fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={MARK_ARROW} fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark and wordmark. The wordmark takes the surrounding text colour, so it works on light, dark and hero surfaces. */
export function Logo({ className = '', size = 30 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} role="img" aria-label="Surelane">
      <Mark size={size} />
      <span aria-hidden="true" className="font-display font-extrabold tracking-[-0.035em]" style={{ fontSize: Math.round(size * 0.68), lineHeight: 1 }}>Surelane</span>
    </span>
  );
}
