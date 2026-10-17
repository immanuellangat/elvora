import clsx from 'clsx'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

export const STEP_MS = 60_000
export const BIG_STEP_MS = 5 * 60_000

/** Steps once on press, then repeats (speeding up) while held. */
function useHoldRepeat(onStep: () => void) {
  const stepRef = useRef(onStep)
  stepRef.current = onStep
  const timer = useRef<number | null>(null)

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])

  const start = () => {
    stop()
    stepRef.current()
    let delay = 380
    const tick = () => {
      stepRef.current()
      delay = Math.max(60, delay * 0.8)
      timer.current = window.setTimeout(tick, delay)
    }
    timer.current = window.setTimeout(tick, delay)
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      start()
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // Keyboard activation (Enter/Space) arrives as a click with detail 0.
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) stepRef.current()
    },
  }
}

function ArrowButton({ dir, label, onStep, disabled, size }: { dir: 'up' | 'down'; label: string; onStep: () => void; disabled?: boolean; size: 'md' | 'lg' }) {
  const hold = useHoldRepeat(onStep)
  const Icon = dir === 'up' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (hold to repeat)`}
      disabled={disabled}
      {...hold}
      className={clsx(
        'flex touch-none select-none items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-brand active:scale-90 disabled:pointer-events-none disabled:opacity-25',
        size === 'lg' ? 'h-11 w-11' : 'h-9 w-9',
      )}
    >
      <Icon size={size === 'lg' ? 26 : 22} strokeWidth={2.5} />
    </button>
  )
}

/**
 * Wraps a time display with up/down arrows. The display itself is a spinbutton:
 * focus it and use ↑/↓ (Shift for 5 minutes), PageUp/PageDown for 5 minutes.
 */
export function TimeStepper({
  children,
  onAdjust,
  minutes,
  canDecrease = true,
  canIncrease = true,
  label,
  size = 'md',
}: {
  children: ReactNode
  onAdjust: (deltaMs: number) => void
  minutes: number
  canDecrease?: boolean
  canIncrease?: boolean
  label: string
  size?: 'md' | 'lg'
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    const big = e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown'
    const step = big ? BIG_STEP_MS : STEP_MS
    if ((e.key === 'ArrowUp' || e.key === 'PageUp') && canIncrease) onAdjust(step)
    else if ((e.key === 'ArrowDown' || e.key === 'PageDown') && canDecrease) onAdjust(-step)
    else return
    e.preventDefault()
  }

  return (
    <div className="flex flex-col items-center">
      <ArrowButton dir="up" size={size} label="Add 1 minute" disabled={!canIncrease} onStep={() => onAdjust(STEP_MS)} />
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={minutes}
        aria-valuetext={`${minutes} minutes`}
        aria-valuemin={1}
        aria-valuemax={180}
        onKeyDown={onKeyDown}
        className="rounded-2xl px-2 outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        {children}
      </div>
      <ArrowButton dir="down" size={size} label="Remove 1 minute" disabled={!canDecrease} onStep={() => onAdjust(-STEP_MS)} />
    </div>
  )
}
