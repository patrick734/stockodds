/** A probability pie: most of the circle taken, the rest still open. */
export function LogoMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" className="mark-bg" />
      <circle cx="32" cy="32" r="18" className="mark-ring" />
      <path d="M32 32 L32 14 A18 18 0 1 1 14.9 37.6 Z" className="mark-pie" />
      <path d="M32 32 L14.9 37.6 A18 18 0 0 1 32 14 Z" className="mark-slice" />
    </svg>
  );
}
