export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-strong bg-ink shadow-glow"
      style={{ width: size, height: size }}
    >
      <img src="/logo.png" alt="" className="h-[145%] w-[145%] object-contain" />
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-black tracking-tight text-fg">
        Art<span className="bg-gradient-to-r from-neonBlue via-neonTeal to-neonPurple bg-clip-text text-transparent">But</span>Sports
      </span>
    </span>
  );
}
