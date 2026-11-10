/*
 * The Surelane mark, "Lane": three bands that grow toward you, like markings on
 * the lane ahead. Three bands for the three searches a day. The top band carries
 * the iris accent.
 *
 * Geometry is on a 96 grid. Below 24 px the heavier small-size cut is used, so
 * the top band still reads. The favicon and app icons (src/app/icon.svg,
 * public/*.png, src/app/apple-icon.png) are drawn from these same paths.
 */
export const LANE = ['M34 26.59L48 15.39L62 26.59L58 31.59L48 23.59L38 31.59Z', 'M27 45.77L48 28.97L69 45.77L63.63 52.48L48 39.98L32.37 52.48Z', 'M17.5 71.55L48 47.15L78.5 71.55L71.25 80.61L48 62.01L24.75 80.61Z'] as const;
export const LANE_SMALL = ['M33 23.99L48 11.99L63 23.99L57.75 30.55L48 22.75L38.25 30.55Z', 'M26 47.52L48 29.92L70 47.52L64 55.01L48 42.21L32 55.01Z', 'M17 74.95L48 50.15L79 74.95L71.75 84.01L48 65.01L24.25 84.01Z'] as const;
const BOX = { standard: [17.5, 15.39, 61, 65.22], small: [17, 11.99, 62, 72.02] } as const;
/** Obsidian Iris on a dark tile: top, middle and bottom band. */
export const TILE = { ground: '#0E0C1C', bands: ['#8F7BFF', '#CFC8FF', '#FFFFFF'] } as const;

/**
 * The mark alone. Its colours follow the theme through --mark-top, --mark-mid
 * and --mark-bot, so it works on light, dark and hero surfaces. `tile` puts it
 * on the dark rounded square used for app icons.
 */
export function Mark({ className = '', size = 32, tile = false }: { className?: string; size?: number; tile?: boolean }) {
  const cut = size < 24 ? 'small' : 'standard';
  const paths = cut === 'small' ? LANE_SMALL : LANE;
  if (tile) {
    return (
      <svg viewBox="0 0 96 96" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
        <rect width="96" height="96" rx="22" fill={TILE.ground} />
        {paths.map((d, i) => <path key={d} d={d} fill={TILE.bands[i]} />)}
      </svg>
    );
  }
  const [x, y, w, h] = BOX[cut];
  const fills = ['var(--mark-top)', 'var(--mark-mid)', 'var(--mark-bot)'];
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} width={Math.round((size * w) / h)} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      {paths.map((d, i) => <path key={d} d={d} fill={fills[i]} />)}
    </svg>
  );
}

/** Mark and wordmark. The wordmark takes the surrounding text colour, so it works on light, dark and hero surfaces. */
export function Logo({ className = '', size = 30 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(size * 0.36) }} role="img" aria-label="Surelane">
      <Mark size={size} />
      <span aria-hidden="true" className="font-display font-semibold tracking-[-0.02em]" style={{ fontSize: Math.round(size * 0.72), lineHeight: 1 }}>Surelane</span>
    </span>
  );
}
