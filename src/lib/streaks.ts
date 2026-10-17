import type { DayKey } from '../db/types'
import { daysBetween, shiftDay, weekdayOf } from './dates'

export interface StreakStats {
  current: number
  best: number
  total: number
  /** Completion rate (0–1) of scheduled days over the last 30 days. */
  rate30: number
}

/**
 * Streaks only count planned days. Missing a day the habit isn't planned for never
 * breaks a streak, and today doesn't break it until the day is over.
 */
export function computeStreak(
  scheduledDays: number[],
  doneDates: Iterable<DayKey>,
  today: DayKey,
  createdOn?: DayKey,
): StreakStats {
  const done = new Set(doneDates)
  const scheduled = new Set(scheduledDays.length ? scheduledDays : [0, 1, 2, 3, 4, 5, 6])
  const total = done.size

  let earliest = createdOn ?? today
  for (const d of done) if (d < earliest) earliest = d
  const span = Math.min(daysBetween(earliest, today), 365 * 5)

  // Current streak: walk backwards from today.
  let current = 0
  for (let i = 0; i <= span; i++) {
    const d = shiftDay(today, -i)
    if (done.has(d)) {
      current++
      continue
    }
    if (i === 0) continue // today still has time
    if (scheduled.has(weekdayOf(d))) break
  }

  // Best streak: walk forwards from the earliest relevant date.
  let best = 0
  let run = 0
  for (let i = span; i >= 0; i--) {
    const d = shiftDay(today, -i)
    if (done.has(d)) {
      run++
      best = Math.max(best, run)
    } else if (i !== 0 && scheduled.has(weekdayOf(d))) {
      run = 0
    }
  }

  // 30-day completion rate over planned days (today counts only once done).
  let planned = 0
  let hit = 0
  const windowStart = createdOn && daysBetween(createdOn, today) < 29 ? createdOn : shiftDay(today, -29)
  const windowLen = daysBetween(windowStart, today)
  for (let i = 0; i <= windowLen; i++) {
    const d = shiftDay(windowStart, i)
    const isToday = d === today
    if (!scheduled.has(weekdayOf(d))) continue
    if (isToday && !done.has(d)) continue
    planned++
    if (done.has(d)) hit++
  }

  return { current, best, total, rate30: planned ? hit / planned : 0 }
}

export function isPlannedOn(days: number[], key: DayKey): boolean {
  return days.length === 0 || days.includes(weekdayOf(key))
}
