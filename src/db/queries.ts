import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { DayKey, Habit, HabitLog, Session, Task, WorkoutDay, WorkoutLog } from './types'
import { computeStreak, type StreakStats } from '../lib/streaks'
import { dayKey, shiftDay, weekdayOf } from '../lib/dates'
import { counterDays } from './actions'
import type { AchievementStats } from '../lib/achievements'
import { getSettings } from './settings'

export function useHabits(includeArchived = false): Habit[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.habits.orderBy('order').toArray()
    return includeArchived ? all : all.filter((h) => !h.archived)
  }, [includeArchived])
}

export function useHabitLogs(): HabitLog[] | undefined {
  return useLiveQuery(() => db.habitLogs.toArray(), [])
}

export interface HabitDays {
  done: Set<DayKey>
  skipped: Set<DayKey>
}

export const EMPTY_HABIT_DAYS: HabitDays = { done: new Set(), skipped: new Set() }

export function logsByHabit(logs: HabitLog[]): Map<string, HabitDays> {
  const map = new Map<string, HabitDays>()
  for (const l of logs) {
    let entry = map.get(l.habitId)
    if (!entry) map.set(l.habitId, (entry = { done: new Set(), skipped: new Set() }))
    ;(l.kind === 'skip' ? entry.skipped : entry.done).add(l.date)
  }
  return map
}

export function habitStreak(h: Habit, days: HabitDays | undefined, today: DayKey, grace: boolean): StreakStats {
  return computeStreak(h.days, days?.done ?? [], today, dayKey(h.createdAt), { skipped: days?.skipped, grace })
}

export function useTasksOn(date: DayKey): Task[] | undefined {
  return useLiveQuery(() => db.tasks.where('date').equals(date).toArray(), [date])
}

export function usePendingBefore(today: DayKey): Task[] | undefined {
  return useLiveQuery(
    () =>
      db.tasks
        .where('date')
        .below(today)
        .filter((t) => !t.done && !t.dismissed)
        .toArray(),
    [today],
  )
}

export function useSessionsOn(date: DayKey): Session[] | undefined {
  return useLiveQuery(() => db.sessions.where('date').equals(date).toArray(), [date])
}

export function useWorkoutFor(date: DayKey): { day?: WorkoutDay; log?: WorkoutLog } | undefined {
  return useLiveQuery(async () => {
    const [day, log] = await Promise.all([db.workoutDays.get(weekdayOf(date)), db.workoutLogs.get(date)])
    return { day, log }
  }, [date])
}

export interface DaySummary {
  date: DayKey
  tasks: Task[]
  tasksDone: Task[]
  habitsPlanned: Habit[]
  habitsDone: Habit[]
  workout?: { day: WorkoutDay; log?: WorkoutLog }
  sessions: Session[]
  focusSec: number
}

export async function loadDaySummary(date: DayKey): Promise<DaySummary> {
  const wd = weekdayOf(date)
  const [tasks, habits, logs, day, log, sessions] = await Promise.all([
    db.tasks.where('date').equals(date).toArray(),
    db.habits.toArray(),
    db.habitLogs.where('date').equals(date).toArray(),
    db.workoutDays.get(wd),
    db.workoutLogs.get(date),
    db.sessions.where('date').equals(date).toArray(),
  ])
  const doneIds = new Set(logs.filter((l) => l.kind !== 'skip').map((l) => l.habitId))
  const skippedIds = new Set(logs.filter((l) => l.kind === 'skip').map((l) => l.habitId))
  const active = habits.filter((h) => !h.archived && !skippedIds.has(h.id))
  return {
    date,
    tasks: tasks.filter((t) => !t.dismissed),
    tasksDone: tasks.filter((t) => t.done),
    habitsPlanned: active.filter((h) => h.days.length === 0 || h.days.includes(wd) || doneIds.has(h.id)),
    habitsDone: habits.filter((h) => doneIds.has(h.id)),
    workout: day && !day.rest && day.exercises.length ? { day, log } : undefined,
    sessions: sessions.sort((a, b) => a.start - b.start),
    focusSec: sessions.reduce((acc, s) => acc + s.durationSec, 0),
  }
}

export function useDaySummary(date: DayKey): DaySummary | undefined {
  return useLiveQuery(() => loadDaySummary(date), [date])
}

/** Activity count per day (habits + tasks + workouts + sessions), for heatmaps. */
export function useActivity(days: number, today: DayKey): Map<DayKey, number> | undefined {
  return useLiveQuery(async () => {
    const from = shiftDay(today, -days + 1)
    const [logs, tasks, workouts, sessions] = await Promise.all([
      db.habitLogs.where('date').between(from, today, true, true).toArray(),
      db.tasks.where('date').between(from, today, true, true).filter((t) => t.done).toArray(),
      db.workoutLogs.where('date').between(from, today, true, true).filter((w) => w.done).toArray(),
      db.sessions.where('date').between(from, today, true, true).toArray(),
    ])
    const map = new Map<DayKey, number>()
    const bump = (d: DayKey, n = 1) => map.set(d, (map.get(d) ?? 0) + n)
    logs.filter((l) => l.kind !== 'skip').forEach((l) => bump(l.date))
    tasks.forEach((t) => bump(t.date))
    workouts.forEach((w) => bump(w.date))
    sessions.forEach((s) => bump(s.date))
    return map
  }, [days, today])
}

export async function loadAchievementStats(today: DayKey): Promise<AchievementStats> {
  const [habits, logs, sessions, workouts, tasks, diary, counters] = await Promise.all([
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.sessions.toArray(),
    db.workoutLogs.toArray(),
    db.tasks.toArray(),
    db.diary.toArray(),
    db.counters.toArray(),
  ])
  const byHabit = logsByHabit(logs)
  const grace = (await getSettings()).streakGrace
  let bestStreak = 0
  for (const h of habits) bestStreak = Math.max(bestStreak, habitStreak(h, byHabit.get(h.id), today, grace).best)
  return {
    habitChecks: logs.filter((l) => l.kind !== 'skip').length,
    bestStreak,
    focusMinutes: Math.floor(sessions.filter((s) => s.kind === 'focus').reduce((a, s) => a + s.durationSec, 0) / 60),
    workouts: workouts.filter((w) => w.done).length,
    tasksDone: tasks.filter((t) => t.done).length,
    diaryEntries: diary.length,
    reflections: ((await db.settings.get('reflectedDates'))?.value as DayKey[] | undefined)?.length ?? 0,
    longestCounter: counters.reduce((m, c) => Math.max(m, c.best, counterDays(c, today)), 0),
  }
}

export function useAchievementStats(today: DayKey): AchievementStats | undefined {
  return useLiveQuery(() => loadAchievementStats(today), [today])
}

export function useReflectedDates(): Set<DayKey> | undefined {
  return useLiveQuery(async () => new Set(((await db.settings.get('reflectedDates'))?.value as DayKey[] | undefined) ?? []), [])
}
