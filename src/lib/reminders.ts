import type { Habit } from '../db/types'
import { dayKey } from './dates'
import { isPlannedOn } from './streaks'

/** Reminders stay relevant for a while: opening the app 20 minutes late still nudges. */
export const REMINDER_WINDOW_MS = 60 * 60_000

/**
 * Returns a key for today's reminder when it should be shown, otherwise null.
 * Reminders only appear on planned days, from the reminder time until an hour later,
 * and never once the habit is done or skipped.
 */
export function habitReminderDue(
  habit: Pick<Habit, 'id' | 'days' | 'reminder' | 'archived'>,
  now: Date,
  state: { handled: boolean; lastKey?: string },
): string | null {
  if (!habit.reminder || habit.archived || state.handled) return null
  const today = dayKey(now)
  if (!isPlannedOn(habit.days, today)) return null
  const [h, m] = habit.reminder.split(':').map(Number)
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime()
  const t = now.getTime()
  if (t < at || t - at >= REMINDER_WINDOW_MS) return null
  const key = `${habit.id}:${today}`
  return state.lastKey === key ? null : key
}
