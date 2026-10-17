import { addDays, differenceInCalendarDays, format, parse } from 'date-fns'
import type { DayKey } from '../db/types'

export function dayKey(d: Date | number = new Date()): DayKey {
  return format(d, 'yyyy-MM-dd')
}

export function parseDay(key: DayKey): Date {
  return parse(key, 'yyyy-MM-dd', new Date())
}

export function shiftDay(key: DayKey, amount: number): DayKey {
  return dayKey(addDays(parseDay(key), amount))
}

export function daysBetween(from: DayKey, to: DayKey): number {
  return differenceInCalendarDays(parseDay(to), parseDay(from))
}

export function weekdayOf(key: DayKey): number {
  return parseDay(key).getDay()
}

/** Keys for the 7 days of the week containing `key`. */
export function weekOf(key: DayKey, weekStartsOn: 0 | 1 = 1): DayKey[] {
  const wd = weekdayOf(key)
  const offset = (wd - weekStartsOn + 7) % 7
  const start = shiftDay(key, -offset)
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i))
}

export function prettyDay(key: DayKey, today: DayKey = dayKey()): string {
  const diff = daysBetween(key, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  return format(parseDay(key), 'EEE, MMM d')
}

export function greeting(hour = new Date().getHours()): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return `${s}s`
}

export function formatClock(ms: number, showHours = false): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 || showHours ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function orderedWeekdays(weekStartsOn: 0 | 1): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)
}
