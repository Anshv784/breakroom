export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cf7e4" />
          <stop offset=".5" stopColor="#b58cff" />
          <stop offset="1" stopColor="#ffd27a" />
        </linearGradient>
      </defs>
      <rect x="15" y="8" width="34" height="48" rx="5" fill="none" stroke="url(#lg)" strokeWidth="5" />
      <path d="M15 30 L49 25" stroke="url(#lg)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="42" r="4" fill="url(#lg)" />
    </svg>
  );
}
