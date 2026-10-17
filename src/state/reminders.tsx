import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, Clock, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { setHabitDone } from '../db/actions'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import type { Habit } from '../db/types'
import { playChime } from '../lib/audio'
import { dayKey } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { notify } from '../lib/notify'
import { habitReminderDue } from '../lib/reminders'
import { useToast } from './toast'

const SHOWN_KEY = 'elvora.reminders.v1'
const LATER_MS = 15 * 60_000

function loadShown(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function saveShown(map: Record<string, string>) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

/** Gentle, non-blocking nudges for habits with a reminder time. */
export function ReminderProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const today = useToday()
  const toast = useToast()
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? []
  const handledToday = useLiveQuery(async () => new Set((await db.habitLogs.where('date').equals(today).toArray()).map((l) => l.habitId)), [today])
  const [visible, setVisible] = useState<string[]>([])
  const shown = useRef(loadShown())
  const later = useRef(new Map<string, number>())
  const data = useRef({ habits, handledToday })
  data.current = { habits, handledToday }

  useEffect(() => {
    const check = () => {
      const { habits: list, handledToday: handled } = data.current
      if (!handled) return
      const now = new Date()
      const fresh: Habit[] = []
      for (const h of list) {
        const snoozedUntil = later.current.get(h.id)
        if (snoozedUntil) {
          if (now.getTime() >= snoozedUntil && !handled.has(h.id)) {
            later.current.delete(h.id)
            fresh.push(h)
          }
          continue
        }
        const key = habitReminderDue(h, now, { handled: handled.has(h.id), lastKey: shown.current[h.id] })
        if (!key) continue
        shown.current = { ...shown.current, [h.id]: key }
        saveShown(shown.current)
        fresh.push(h)
      }
      if (!fresh.length) return
      setVisible((v) => [...v, ...fresh.map((h) => h.id).filter((id) => !v.includes(id))])
      const s = settingsRef.current
      playChime(s.chimeVolume)
      void notify(s, fresh.length === 1 ? `${fresh[0].emoji} Time for ${fresh[0].name}` : `${fresh.length} habits are waiting`, 'A small step now keeps your rhythm going.')
    }
    check()
    const id = window.setInterval(check, 15_000)
    return () => window.clearInterval(id)
  }, [])

  // Hide reminders for habits that got done or skipped elsewhere.
  const pending = visible.filter((id) => !handledToday?.has(id)).map((id) => habits.find((h) => h.id === id)).filter((h): h is Habit => Boolean(h))
  useEffect(() => {
    if (pending.length !== visible.length) setVisible(pending.map((h) => h.id))
  }, [pending, visible.length])

  const close = (id: string) => setVisible((v) => v.filter((x) => x !== id))

  return (
    <>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-16 z-[65] flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:bottom-6 lg:left-[17.5rem] lg:top-auto lg:items-start lg:px-0">
          <AnimatePresence>
            {pending.map((h) => (
              <motion.div
                key={h.id}
                layout
                role="status"
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-3xl border border-brand/30 bg-surface p-3 pr-2 shadow-xl"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-xl">{h.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-brand">
                    <Bell size={11} /> Reminder
                  </div>
                  <div className="truncate text-sm font-semibold">Time for {h.name}</div>
                </div>
                <button
                  aria-label={`Mark ${h.name} done`}
                  title="Done"
                  onClick={async () => {
                    await setHabitDone(h.id, dayKey(), true)
                    close(h.id)
                    toast(`${h.emoji} ${h.name} — done. Nice!`, { tone: 'success' })
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white transition hover:brightness-110"
                >
                  <Check size={17} />
                </button>
                <button
                  aria-label={`Remind me about ${h.name} in 15 minutes`}
                  title="Later (15 min)"
                  onClick={() => {
                    later.current.set(h.id, Date.now() + LATER_MS)
                    close(h.id)
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
                >
                  <Clock size={16} />
                </button>
                <button
                  aria-label={`Dismiss ${h.name} reminder`}
                  title="Dismiss"
                  onClick={() => close(h.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-faint transition hover:bg-surface-2 hover:text-ink"
                >
                  <X size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </>
  )
}
