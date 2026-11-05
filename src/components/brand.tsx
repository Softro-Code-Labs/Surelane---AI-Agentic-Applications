import { LOGO_VIEW, MARK_VIEW, PATHS } from './brand-paths';

/** The three chevrons. Colours come from tokens, so the mark reverses itself on the petrol band and in dark mode. */
function Chevrons() {
  return (
    <>
      <path fillRule="evenodd" d={PATHS.base} fill="var(--logo-a)" />
      <path fillRule="evenodd" d={PATHS.mid} fill="var(--logo-c)" />
      <path fillRule="evenodd" d={PATHS.top} fill="var(--logo-b)" />
    </>
  );
}

export function Mark({ className = 'h-7 w-auto' }: { className?: string }) {
  return <svg viewBox={MARK_VIEW} className={className} aria-hidden="true"><Chevrons /></svg>;
}

export function Logo({ className = 'h-7 w-auto' }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEW} className={className} role="img" aria-label="Surelane">
      <Chevrons />
      <path fillRule="evenodd" d={PATHS.word} fill="var(--logo-word)" />
    </svg>
  );
}
