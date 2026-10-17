import type { DayKey } from '../db/types'
import { daysBetween, shiftDay, weekdayOf } from './dates'

export interface StreakStats {
  current: number
  best: number
  total: number
  /** Completion rate (0–1) of planned days over the last 30 days. */
  rate30: number
  /**
   * True when the streak is alive only thanks to "never miss twice": the last planned
   * day was missed, so checking in today keeps it going.
   */
  atRisk: boolean
}

export interface StreakOptions {
  /** Days the user marked as skipped (sick, travel, rest). They never count or break. */
  skipped?: Iterable<DayKey>
  /** "Never miss twice": a single missed planned day doesn't break the streak. */
  grace?: boolean
}

/**
 * Streaks count completed days. Days the habit isn't planned for, skipped days and today
 * (until it's over) never break a streak. With `grace`, one missed planned day in a row
 * is forgiven; two in a row end the streak.
 */
export function computeStreak(
  scheduledDays: number[],
  doneDates: Iterable<DayKey>,
  today: DayKey,
  createdOn?: DayKey,
  opts: StreakOptions = {},
): StreakStats {
  const done = new Set(doneDates)
  const skipped = new Set(opts.skipped ?? [])
  for (const d of done) skipped.delete(d)
  const grace = Boolean(opts.grace)
  const scheduled = new Set(scheduledDays.length ? scheduledDays : [0, 1, 2, 3, 4, 5, 6])
  const total = done.size

  let earliest = createdOn ?? today
  for (const d of done) if (d < earliest) earliest = d
  const span = Math.max(0, Math.min(daysBetween(earliest, today), 365 * 5))
  const isMiss = (d: DayKey) => !done.has(d) && !skipped.has(d) && scheduled.has(weekdayOf(d))

  // Current streak: walk backwards from today.
  let current = 0
  let missesInRow = 0
  let atRisk = false
  let seenPlannedBeforeToday = false
  for (let i = 0; i <= span; i++) {
    const d = shiftDay(today, -i)
    if (done.has(d)) {
      current++
      missesInRow = 0
      if (i > 0) seenPlannedBeforeToday = true
      continue
    }
    if (i === 0 || !isMiss(d)) continue
    // The most recent planned day (before today) was missed.
    if (!seenPlannedBeforeToday) atRisk = true
    seenPlannedBeforeToday = true
    missesInRow++
    if (!grace || missesInRow >= 2) break
  }
  if (current === 0 || done.has(today)) atRisk = false

  // Best streak: walk forwards from the earliest relevant date.
  let best = 0
  let run = 0
  let misses = 0
  for (let i = span; i >= 0; i--) {
    const d = shiftDay(today, -i)
    if (done.has(d)) {
      run++
      misses = 0
      best = Math.max(best, run)
    } else if (i !== 0 && isMiss(d)) {
      misses++
      if (!grace || misses >= 2) run = 0
    }
  }

  // 30-day completion rate over planned, non-skipped days (today counts only once done).
  let planned = 0
  let hit = 0
  const windowStart = createdOn && daysBetween(createdOn, today) < 29 ? createdOn : shiftDay(today, -29)
  const windowLen = Math.max(0, daysBetween(windowStart, today))
  for (let i = 0; i <= windowLen; i++) {
    const d = shiftDay(windowStart, i)
    if (!scheduled.has(weekdayOf(d)) || skipped.has(d)) continue
    if (d === today && !done.has(d)) continue
    planned++
    if (done.has(d)) hit++
  }

  return { current, best, total, rate30: planned ? hit / planned : 0, atRisk }
}

export function isPlannedOn(days: number[], key: DayKey): boolean {
  return days.length === 0 || days.includes(weekdayOf(key))
}
