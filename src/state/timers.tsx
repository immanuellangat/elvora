import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { logSession, setHabitDone } from '../db/actions'
import { DEFAULT_SETTINGS, updateSettings, useSettings } from '../db/settings'
import type { Settings } from '../db/types'
import { playChime, audioContext } from '../lib/audio'
import { dayKey, formatClock } from '../lib/dates'
import { notify } from '../lib/notify'
import { useAlarms } from './alarms'

export type Phase = 'focus' | 'short' | 'long'

export interface LinkMeta {
  label: string
  habitId?: string
  taskId?: string
}

export interface PomodoroState extends LinkMeta {
  phase: Phase
  running: boolean
  endsAt: number | null
  remainingMs: number
  phaseMs: number
  completedFocus: number
}

export interface StopwatchState {
  running: boolean
  startedAt: number | null
  firstStart: number | null
  accumulatedMs: number
  laps: number[]
  label: string
  habitId?: string
}

export interface CountdownState {
  running: boolean
  endsAt: number | null
  firstStart: number | null
  remainingMs: number
  durationMs: number
  finishedAt: number | null
  label: string
  habitId?: string
}

export const PHASE_LABEL: Record<Phase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' }

export function phaseMs(phase: Phase, s: Settings): number {
  const min = phase === 'focus' ? s.focusMinutes : phase === 'short' ? s.shortBreakMinutes : s.longBreakMinutes
  return Math.max(1, min) * 60_000
}

export function pomodoroRemaining(p: PomodoroState, now: number): number {
  return p.running && p.endsAt ? Math.max(0, p.endsAt - now) : p.remainingMs
}

export function stopwatchElapsed(s: StopwatchState, now: number): number {
  return s.accumulatedMs + (s.running && s.startedAt ? now - s.startedAt : 0)
}

export function countdownRemaining(c: CountdownState, now: number): number {
  return c.running && c.endsAt ? Math.max(0, c.endsAt - now) : c.remainingMs
}

export const MIN_STEP_MS = 60_000
export const MAX_TIMER_MS = 180 * 60_000

/**
 * Lengthen or shorten a timer by `deltaMs`. Elapsed time is kept, so a paused or
 * running timer only gains or loses the difference. Never drops below one minute left.
 */
export function adjustTimer(
  t: { running: boolean; endsAt: number | null; remainingMs: number; totalMs: number },
  deltaMs: number,
  now: number,
): { endsAt: number | null; remainingMs: number; totalMs: number } {
  const remaining = t.running && t.endsAt ? Math.max(0, t.endsAt - now) : t.remainingMs
  const elapsed = Math.max(0, t.totalMs - remaining)
  const nextRemaining = Math.min(MAX_TIMER_MS - elapsed, Math.max(MIN_STEP_MS, remaining + deltaMs))
  const nextTotal = elapsed + nextRemaining
  return {
    endsAt: t.running ? now + nextRemaining : null,
    remainingMs: nextRemaining,
    totalMs: nextTotal,
  }
}

const freshPomodoro = (s: Settings): PomodoroState => ({
  phase: 'focus',
  running: false,
  endsAt: null,
  remainingMs: phaseMs('focus', s),
  phaseMs: phaseMs('focus', s),
  completedFocus: 0,
  label: '',
})

const freshStopwatch = (): StopwatchState => ({
  running: false,
  startedAt: null,
  firstStart: null,
  accumulatedMs: 0,
  laps: [],
  label: '',
})

const freshCountdown = (ms = 10 * 60_000): CountdownState => ({
  running: false,
  endsAt: null,
  firstStart: null,
  remainingMs: ms,
  durationMs: ms,
  finishedAt: null,
  label: '',
})

interface Persisted {
  pomodoro: PomodoroState
  stopwatch: StopwatchState
  countdown: CountdownState
}

const STORAGE_KEY = 'elvora.timers.v1'

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {}
  } catch {
    return {}
  }
}

interface TimerApi {
  pomodoro: PomodoroState
  stopwatch: StopwatchState
  countdown: CountdownState
  startFocus: (meta?: Partial<LinkMeta>) => void
  pausePomodoro: () => void
  resetPomodoro: () => void
  endPomodoro: () => void
  finishFocusEarly: () => void
  skipPhase: () => void
  setPhase: (phase: Phase) => void
  setPomodoroMeta: (meta: Partial<LinkMeta>) => void
  /** Add or remove time from the current focus/break phase. */
  adjustPomodoro: (deltaMs: number) => void
  swStart: () => void
  swPause: () => void
  swReset: () => void
  swLap: () => void
  swSave: () => Promise<number>
  swMeta: (meta: { label?: string; habitId?: string }) => void
  cdSet: (ms: number) => void
  cdStart: () => void
  cdPause: () => void
  cdReset: () => void
  cdMeta: (meta: { label?: string; habitId?: string }) => void
  /** Add or remove time from the countdown timer. */
  cdAdjust: (deltaMs: number) => void
}

const TimerContext = createContext<TimerApi | null>(null)

export function useTimers(): TimerApi {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimers must be used inside TimerProvider')
  return ctx
}

async function recordSession(
  kind: 'focus' | 'stopwatch' | 'timer',
  meta: { label: string; habitId?: string; taskId?: string },
  elapsedMs: number,
  endAt: number,
  minMs: number,
) {
  if (elapsedMs < minMs) return
  const fallback = kind === 'focus' ? 'Focus session' : kind === 'stopwatch' ? 'Stopwatch' : 'Timer'
  await logSession({
    kind,
    label: meta.label.trim() || fallback,
    habitId: meta.habitId || undefined,
    taskId: meta.taskId || undefined,
    start: endAt - elapsedMs,
    end: endAt,
    durationSec: Math.round(elapsedMs / 1000),
  })
  if (meta.habitId) await setHabitDone(meta.habitId, dayKey(endAt), true)
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const alarms = useAlarms()
  const alarmsRef = useRef(alarms)
  alarmsRef.current = alarms

  const [initial] = useState(loadPersisted)
  const [pomodoro, setPomodoroState] = useState<PomodoroState>(() => initial.pomodoro ?? freshPomodoro(DEFAULT_SETTINGS))
  const [stopwatch, setStopwatchState] = useState<StopwatchState>(() => initial.stopwatch ?? freshStopwatch())
  const [countdown, setCountdownState] = useState<CountdownState>(() => initial.countdown ?? freshCountdown())

  const pRef = useRef(pomodoro)
  const cRef = useRef(countdown)
  const setPomodoro = useCallback((next: PomodoroState) => {
    pRef.current = next
    setPomodoroState(next)
  }, [])
  const sRef = useRef(stopwatch)
  const setStopwatch = useCallback((next: StopwatchState) => {
    sRef.current = next
    setStopwatchState(next)
  }, [])
  const setCountdown = useCallback((next: CountdownState) => {
    cRef.current = next
    setCountdownState(next)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pomodoro, stopwatch, countdown }))
    } catch {
      // storage full or unavailable
    }
  }, [pomodoro, stopwatch, countdown])

  // While the user is stepping the time with the arrows, don't let (older) saved
  // settings overwrite the length they're dialing in.
  const adjustingUntil = useRef(0)
  const persistTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current)
  }, [])

  // Apply new durations from settings when the current phase hasn't started.
  useEffect(() => {
    if (Date.now() < adjustingUntil.current) return
    const p = pRef.current
    const ms = phaseMs(p.phase, settings)
    if (!p.running && p.remainingMs === p.phaseMs && p.phaseMs !== ms) {
      setPomodoro({ ...p, phaseMs: ms, remainingMs: ms })
    }
  }, [settings, setPomodoro])

  /**
   * Move to the next phase. `elapsedMs` is focus time to log when leaving a focus phase;
   * `natural` is true when the phase ended by itself or was finished (not skipped).
   */
  const advance = useCallback(
    (at: number, elapsedMs: number | null, natural: boolean) => {
      const p = pRef.current
      const s = settingsRef.current
      let completedFocus = p.completedFocus
      let next: Phase = 'focus'
      if (p.phase === 'focus') {
        let counted = false
        if (elapsedMs !== null && elapsedMs >= 60_000) {
          void recordSession('focus', p, elapsedMs, at, 60_000)
          completedFocus++
          counted = true
        }
        next = counted && completedFocus % Math.max(1, s.cyclesBeforeLongBreak) === 0 ? 'long' : 'short'
      }
      const ms = phaseMs(next, s)
      const fresh = Date.now() - at < 15_000
      const auto = natural && fresh && (next === 'focus' ? s.autoStartFocus : s.autoStartBreaks)
      setPomodoro({
        ...p,
        phase: next,
        completedFocus,
        phaseMs: ms,
        remainingMs: ms,
        running: auto,
        endsAt: auto ? Date.now() + ms : null,
      })
    },
    [setPomodoro],
  )

  // Single heartbeat: detect finished phases and keep the tab title informative.
  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const p = pRef.current
      const s = settingsRef.current
      if (p.running && p.endsAt && now >= p.endsAt) {
        const wasFocus = p.phase === 'focus'
        advance(p.endsAt, wasFocus ? p.phaseMs : null, true)
        playChime(s.chimeVolume)
        void notify(
          s,
          wasFocus ? 'Focus session complete' : 'Break is over',
          wasFocus ? 'Nice work. Time for a breather.' : 'Ready when you are.',
        )
      }
      const c = cRef.current
      if (c.running && c.endsAt && now >= c.endsAt) {
        const at = c.endsAt
        setCountdown({ ...c, running: false, endsAt: null, remainingMs: 0, finishedAt: at })
        void recordSession('timer', c, c.durationMs, at, 10_000)
        if (s.timerAlarm) alarmsRef.current.ring({ title: "Time's up", label: c.label || 'Your timer has finished.' })
        else {
          playChime(s.chimeVolume)
          void notify(s, "Time's up", c.label || 'Your timer has finished.')
        }
      }

      const pr = pRef.current
      const cr = cRef.current
      if (pr.running) document.title = `${formatClock(pomodoroRemaining(pr, now))} · ${PHASE_LABEL[pr.phase]} — Elvora`
      else if (cr.running) document.title = `${formatClock(countdownRemaining(cr, now))} · Timer — Elvora`
      else document.title = 'Elvora'
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [advance, setCountdown])

  const api = useMemo<TimerApi>(() => {
    const now = () => Date.now()
    return {
      pomodoro,
      stopwatch,
      countdown,

      startFocus: (meta) => {
        audioContext()
        const p = pRef.current
        if (p.running) return
        setPomodoro({ ...p, ...(meta ?? {}), running: true, endsAt: now() + p.remainingMs })
      },
      pausePomodoro: () => {
        const p = pRef.current
        if (!p.running) return
        setPomodoro({ ...p, running: false, endsAt: null, remainingMs: pomodoroRemaining(p, now()) })
      },
      resetPomodoro: () => {
        const p = pRef.current
        setPomodoro({ ...p, running: false, endsAt: null, remainingMs: p.phaseMs })
      },
      endPomodoro: () => {
        const p = pRef.current
        if (p.phase === 'focus') void recordSession('focus', p, p.phaseMs - pomodoroRemaining(p, now()), now(), 60_000)
        setPomodoro({ ...freshPomodoro(settingsRef.current), label: p.label, habitId: p.habitId, taskId: p.taskId })
      },
      finishFocusEarly: () => {
        const p = pRef.current
        if (p.phase !== 'focus') return
        advance(now(), p.phaseMs - pomodoroRemaining(p, now()), true)
      },
      skipPhase: () => advance(now(), null, false),
      setPhase: (phase) => {
        const p = pRef.current
        const ms = phaseMs(phase, settingsRef.current)
        setPomodoro({ ...p, phase, running: false, endsAt: null, phaseMs: ms, remainingMs: ms })
      },
      setPomodoroMeta: (meta) => setPomodoro({ ...pRef.current, ...meta }),
      adjustPomodoro: (deltaMs) => {
        const p = pRef.current
        const fresh = !p.running && p.remainingMs === p.phaseMs
        const r = adjustTimer({ ...p, totalMs: p.phaseMs }, deltaMs, now())
        setPomodoro({ ...p, endsAt: r.endsAt, remainingMs: r.remainingMs, phaseMs: r.totalMs })
        // A phase that hasn't started yet becomes the new default length,
        // saved once the user stops pressing.
        if (fresh) {
          adjustingUntil.current = Date.now() + 2_000
          if (persistTimer.current !== null) window.clearTimeout(persistTimer.current)
          persistTimer.current = window.setTimeout(() => {
            persistTimer.current = null
            const cur = pRef.current
            const minutes = Math.round(cur.phaseMs / 60_000)
            const key = cur.phase === 'focus' ? 'focusMinutes' : cur.phase === 'short' ? 'shortBreakMinutes' : 'longBreakMinutes'
            void updateSettings({ [key]: minutes })
          }, 400)
        }
      },

      swStart: () => {
        const sw = sRef.current
        if (!sw.running) setStopwatch({ ...sw, running: true, startedAt: now(), firstStart: sw.firstStart ?? now() })
      },
      swPause: () => {
        const sw = sRef.current
        if (sw.running) setStopwatch({ ...sw, running: false, startedAt: null, accumulatedMs: stopwatchElapsed(sw, now()) })
      },
      swReset: () => {
        const sw = sRef.current
        setStopwatch({ ...freshStopwatch(), label: sw.label, habitId: sw.habitId })
      },
      swLap: () => {
        const sw = sRef.current
        setStopwatch({ ...sw, laps: [...sw.laps, stopwatchElapsed(sw, now())] })
      },
      swSave: async () => {
        const sw = sRef.current
        const end = now()
        const elapsed = stopwatchElapsed(sw, end)
        setStopwatch({ ...freshStopwatch(), label: sw.label, habitId: sw.habitId })
        await recordSession('stopwatch', sw, elapsed, end, 1000)
        return Math.round(elapsed / 1000)
      },
      swMeta: (meta) => setStopwatch({ ...sRef.current, ...meta }),

      cdSet: (ms) => {
        const c = cRef.current
        if (c.running) return
        setCountdown({ ...freshCountdown(ms), label: c.label, habitId: c.habitId })
      },
      cdStart: () => {
        audioContext()
        const c = cRef.current
        if (c.running) return
        const base = c.remainingMs > 0 ? c : { ...c, remainingMs: c.durationMs, finishedAt: null }
        setCountdown({ ...base, running: true, endsAt: now() + base.remainingMs, firstStart: base.firstStart ?? now(), finishedAt: null })
      },
      cdPause: () => {
        const c = cRef.current
        if (!c.running) return
        setCountdown({ ...c, running: false, endsAt: null, remainingMs: countdownRemaining(c, now()) })
      },
      cdReset: () => {
        const c = cRef.current
        setCountdown({ ...freshCountdown(c.durationMs), label: c.label, habitId: c.habitId })
      },
      cdMeta: (meta) => setCountdown({ ...cRef.current, ...meta }),
      cdAdjust: (deltaMs) => {
        const c = cRef.current
        // After a timer finishes, arrows set up the next one.
        const base = c.finishedAt ? { ...c, remainingMs: c.durationMs, finishedAt: null, firstStart: null } : c
        const r = adjustTimer({ ...base, totalMs: base.durationMs }, deltaMs, now())
        setCountdown({ ...base, endsAt: r.endsAt, remainingMs: r.remainingMs, durationMs: r.totalMs })
      },
    }
  }, [pomodoro, stopwatch, countdown, advance, setPomodoro, setStopwatch, setCountdown])

  return <TimerContext.Provider value={api}>{children}</TimerContext.Provider>
}
