export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="8" fill="#141417" stroke="#36363e" />
      {/* gallery frame */}
      <rect x="8" y="8" width="16" height="16" rx="2" stroke="#6c6c76" strokeWidth="1.4" />
      {/* motion arc — sport */}
      <path
        d="M9.5 21.5C12.5 13 19.5 11 23 14.5"
        stroke="url(#lg)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="23" cy="14.5" r="2.4" fill="url(#lg)" />
      <defs>
        <linearGradient id="lg" x1="9" y1="22" x2="24" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b9821f" />
          <stop offset="1" stopColor="#f2c178" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-fg">
        Art<span className="text-fg-dim">But</span>Sports
      </span>
    </span>
  );
}
