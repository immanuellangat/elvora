import type { Alarm, AlarmSound } from '../db/types'
import { WEEKDAY_SHORT, dayKey } from './dates'

/** How late an alarm may still ring (covers throttled background tabs). */
export const ALARM_GRACE_MS = 5 * 60_000

export const ALARM_SOUNDS: { id: AlarmSound; name: string; hint: string }[] = [
  { id: 'chime', name: 'Gentle chime', hint: 'Soft bells' },
  { id: 'rise', name: 'Sunrise', hint: 'Slow rising tones' },
  { id: 'birds', name: 'Morning birds', hint: 'Light chirps' },
  { id: 'digital', name: 'Digital', hint: 'Two-tone alert' },
  { id: 'beep', name: 'Classic beep', hint: 'Hard to sleep through' },
]

function atTime(base: Date, time: string, dayOffset = 0): Date {
  const [h, m] = time.split(':').map(Number)
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, m, 0, 0)
}

function floorMinute(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000
}

function ringsOn(a: Pick<Alarm, 'days'>, d: Date): boolean {
  return a.days.length === 0 || a.days.includes(d.getDay())
}

export function occurrenceKey(d: Date, time: string): string {
  return `${dayKey(d)}T${time}`
}

/**
 * If the alarm should ring at `now`, returns the key of that occurrence; otherwise null.
 * An occurrence is due from its minute until ALARM_GRACE_MS later, once.
 */
export function dueOccurrence(a: Alarm, now: Date): string | null {
  if (!a.enabled) return null
  const t = now.getTime()
  for (const offset of [0, -1]) {
    const occ = atTime(now, a.time, offset)
    const at = occ.getTime()
    if (t < at || t - at >= ALARM_GRACE_MS) continue
    if (!ringsOn(a, occ)) continue
    // One-time alarms must have been set before the occurrence.
    if (a.days.length === 0 && at < floorMinute(a.armedAt)) continue
    const key = occurrenceKey(occ, a.time)
    if (a.lastFiredKey === key) continue
    return key
  }
  return null
}

export function snoozeDue(a: Alarm, now: Date): boolean {
  return Boolean(a.snoozeUntil && now.getTime() >= a.snoozeUntil)
}

/** The next time this alarm will ring, or null when it is off. */
export function nextOccurrence(a: Alarm, now: Date): Date | null {
  if (a.snoozeUntil && a.snoozeUntil > now.getTime()) return new Date(a.snoozeUntil)
  if (!a.enabled) return null
  for (let i = 0; i <= 7; i++) {
    const occ = atTime(now, a.time, i)
    if (occ.getTime() <= now.getTime() - 0) continue
    if (!ringsOn(a, occ)) continue
    if (a.lastFiredKey === occurrenceKey(occ, a.time)) continue
    return occ
  }
  return null
}

export function describeDays(days: number[]): string {
  const set = [...new Set(days)].sort()
  if (set.length === 0) return 'Once'
  if (set.length === 7) return 'Every day'
  if (set.join() === '1,2,3,4,5') return 'Weekdays'
  if (set.join() === '0,6') return 'Weekends'
  // Monday-first order reads more naturally.
  return [...set].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_SHORT[d]).join(', ')
}

export function formatIn(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  if (d > 0) return `in ${d}d ${h}h`
  if (h > 0) return `in ${h}h ${m}m`
  if (m > 0) return `in ${m} min`
  return 'in less than a minute'
}

export function formatAlarmTime(time: string): { main: string; suffix: string } {
  const [h, m] = time.split(':').map(Number)
  const uses12h = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12
  if (!uses12h) return { main: time, suffix: '' }
  return { main: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, suffix: h < 12 ? 'AM' : 'PM' }
}
