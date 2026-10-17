import { useId } from 'react'

export function LogoMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`lg${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c4b5fd" />
          <stop offset="0.7" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#f0abfc" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0d0b16" />
      <path
        d="M11 42 C 14 22, 24 18, 27 30 C 30 42, 33 44, 36 32 C 39 20, 49 16, 53 38"
        fill="none"
        stroke={`url(#lg${id})`}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-lg font-extrabold tracking-tight">Elvora</div>
          <div className="text-[11px] text-muted">Progress with purpose.</div>
        </div>
      )}
    </div>
  )
}
