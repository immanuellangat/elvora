import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import { AlarmClock, BellOff } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../components/ui'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import type { Alarm, AlarmSound } from '../db/types'
import { dueOccurrence, snoozeDue } from '../lib/alarms'
import { audioContext, startAlarmSound } from '../lib/audio'
import { notify } from '../lib/notify'

export interface RingEvent {
  key: string
  title: string
  label: string
  sound: AlarmSound
  alarmId?: string
}

interface AlarmApi {
  alarms: Alarm[]
  ringing: RingEvent | null
  /** Ring right away (used by countdown timers). */
  ring: (e: Omit<RingEvent, 'key' | 'sound'> & { sound?: AlarmSound }) => void
}

const AlarmContext = createContext<AlarmApi | null>(null)

export function useAlarms(): AlarmApi {
  const ctx = useContext(AlarmContext)
  if (!ctx) throw new Error('useAlarms must be used inside AlarmProvider')
  return ctx
}

/** Stop ringing on its own after this long, so a forgotten alarm doesn't play forever. */
const MAX_RING_MS = 10 * 60_000

function RingingScreen({ event, snoozeMinutes, onStop, onSnooze }: { event: RingEvent; snoozeMinutes: number; onStop: () => void; onSnooze: () => void }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alarm-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-bg/95 px-6 text-center backdrop-blur-xl"
    >
      <motion.div
        className="pointer-events-none absolute h-[36rem] w-[36rem] rounded-full bg-violet-500/20 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="brand-gradient relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-glow"
        animate={{ rotate: [0, -12, 12, -10, 10, 0] }}
        transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.6 }}
      >
        <AlarmClock size={44} />
      </motion.div>
      <div className="tabular relative mt-8 font-display text-7xl font-extrabold tracking-tight">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <h2 id="alarm-title" className="relative mt-3 text-2xl font-bold">
        {event.title}
      </h2>
      {event.label && <p className="relative mt-1 max-w-sm text-muted">{event.label}</p>}
      <div className="relative mt-10 flex w-full max-w-xs flex-col gap-3">
        <Button size="lg" autoFocus onClick={onStop} icon={<BellOff size={18} />}>
          Stop
        </Button>
        <Button size="lg" variant="secondary" onClick={onSnooze}>
          Snooze {snoozeMinutes} min
        </Button>
      </div>
    </motion.div>,
    document.body,
  )
}

export function AlarmProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const alarms = useLiveQuery(() => db.alarms.toArray(), []) ?? []
  const alarmsRef = useRef(alarms)
  alarmsRef.current = alarms
  const [queue, setQueue] = useState<RingEvent[]>([])
  const handled = useRef(new Set<string>())
  const snoozeTimers = useRef<number[]>([])

  const enqueue = useCallback((e: RingEvent) => {
    setQueue((q) => (q.some((x) => x.key === e.key) ? q : [...q, e]))
  }, [])

  // Browsers only allow sound after a user gesture; unlock audio on the first one.
  useEffect(() => {
    const unlock = () => {
      try {
        audioContext()
      } catch {
        // audio unavailable
      }
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Check scheduled alarms every second.
  useEffect(() => {
    const check = () => {
      const now = new Date()
      for (const a of alarmsRef.current) {
        if (snoozeDue(a, now)) {
          const key = `snooze:${a.id}:${a.snoozeUntil}`
          if (handled.current.has(key)) continue
          handled.current.add(key)
          void db.alarms.update(a.id, { snoozeUntil: undefined })
          enqueue({ key, title: a.label || 'Alarm', label: 'Snoozed alarm', sound: a.sound, alarmId: a.id })
          continue
        }
        const occ = dueOccurrence(a, now)
        if (!occ) continue
        const key = `${a.id}:${occ}`
        if (handled.current.has(key)) continue
        handled.current.add(key)
        void db.alarms.update(a.id, { lastFiredKey: occ, ...(a.days.length === 0 ? { enabled: false } : {}) })
        enqueue({ key, title: a.label || 'Alarm', label: '', sound: a.sound, alarmId: a.id })
      }
    }
    check()
    const id = window.setInterval(check, 1000)
    return () => window.clearInterval(id)
  }, [enqueue])

  useEffect(
    () => () => {
      snoozeTimers.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )

  const current = queue[0] ?? null
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), [])

  // Sound, notification and tab title while ringing.
  useEffect(() => {
    if (!current) return
    const s = settingsRef.current
    const stop = startAlarmSound(current.sound, s.alarmVolume, s.alarmGentleStart)
    void notify(s, `⏰ ${current.title}`, current.label || 'Tap to open Elvora')
    const original = document.title
    let flip = false
    const titleId = window.setInterval(() => {
      flip = !flip
      document.title = flip ? `⏰ ${current.title}` : original
    }, 1000)
    const autoStop = window.setTimeout(dismiss, MAX_RING_MS)
    return () => {
      stop()
      window.clearInterval(titleId)
      window.clearTimeout(autoStop)
      document.title = original
    }
  }, [current, dismiss])

  const snooze = useCallback(() => {
    if (!current) return
    const ms = Math.max(1, settingsRef.current.snoozeMinutes) * 60_000
    if (current.alarmId) {
      void db.alarms.update(current.alarmId, { snoozeUntil: Date.now() + ms })
    } else {
      const again: RingEvent = { ...current, key: `${current.key}:snooze:${Date.now()}` }
      snoozeTimers.current.push(window.setTimeout(() => enqueue(again), ms))
    }
    dismiss()
  }, [current, dismiss, enqueue])

  const api = useMemo<AlarmApi>(
    () => ({
      alarms,
      ringing: current,
      ring: (e) => enqueue({ ...e, key: `ring:${Date.now()}:${Math.random()}`, sound: e.sound ?? settingsRef.current.alarmSound }),
    }),
    [alarms, current, enqueue],
  )

  return (
    <AlarmContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {current && <RingingScreen key={current.key} event={current} snoozeMinutes={settings.snoozeMinutes} onStop={dismiss} onSnooze={snooze} />}
      </AnimatePresence>
    </AlarmContext.Provider>
  )
}
