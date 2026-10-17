import { db, uid } from './db'
import type { Alarm, Counter, DayKey, Habit, HabitDayState, Priority, Session, Task, WorkoutDay, WorkoutLog } from './types'
import { dayKey, daysBetween, weekdayOf } from '../lib/dates'
import { defaultPlan } from '../lib/workouts'

/* ---------------- Habits ---------------- */

export async function createHabit(input: Pick<Habit, 'name' | 'emoji' | 'color' | 'days'> & { note?: string }): Promise<string> {
  const id = uid()
  const order = (await db.habits.count()) + 1
  await db.habits.add({ ...input, id, createdAt: Date.now(), archived: false, order })
  return id
}

export async function updateHabit(id: string, patch: Partial<Habit>): Promise<void> {
  await db.habits.update(id, patch)
}

export async function deleteHabit(id: string): Promise<void> {
  await db.transaction('rw', db.habits, db.habitLogs, async () => {
    await db.habitLogs.where('habitId').equals(id).delete()
    await db.habits.delete(id)
  })
}

export async function setHabitState(habitId: string, date: DayKey, state: HabitDayState): Promise<void> {
  const id = `${habitId}:${date}`
  if (state === null) await db.habitLogs.delete(id)
  else await db.habitLogs.put({ id, habitId, date, createdAt: Date.now(), ...(state === 'skip' ? { kind: 'skip' as const } : {}) })
}

export async function setHabitDone(habitId: string, date: DayKey, done: boolean): Promise<void> {
  await setHabitState(habitId, date, done ? 'done' : null)
}

/** Done → cleared; skipped or empty → done. Returns whether the day is now done. */
export async function toggleHabit(habitId: string, date: DayKey): Promise<boolean> {
  const existing = await db.habitLogs.get(`${habitId}:${date}`)
  const nowDone = !existing || existing.kind === 'skip'
  await setHabitState(habitId, date, nowDone ? 'done' : null)
  return nowDone
}

/** Skipped → cleared; anything else → skipped. Returns whether the day is now skipped. */
export async function toggleHabitSkip(habitId: string, date: DayKey): Promise<boolean> {
  const existing = await db.habitLogs.get(`${habitId}:${date}`)
  const nowSkipped = existing?.kind !== 'skip'
  await setHabitState(habitId, date, nowSkipped ? 'skip' : null)
  return nowSkipped
}

/* ---------------- Tasks / missions ---------------- */

export async function addTask(input: {
  title: string
  date: DayKey
  priority?: Priority
  focusMinutes?: number
  source?: Task['source']
}): Promise<string> {
  const id = uid()
  const order = await db.tasks.where('date').equals(input.date).count()
  await db.tasks.add({
    id,
    title: input.title.trim(),
    date: input.date,
    priority: input.priority ?? 'medium',
    focusMinutes: input.focusMinutes,
    source: input.source ?? 'manual',
    done: false,
    createdAt: Date.now(),
    order,
    carryCount: 0,
  })
  return id
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  await db.tasks.update(id, patch)
}

export async function toggleTask(id: string): Promise<void> {
  const t = await db.tasks.get(id)
  if (!t) return
  await db.tasks.update(id, { done: !t.done, doneAt: !t.done ? Date.now() : undefined })
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

/** Move tasks to another day, remembering where they came from. */
export async function moveTasks(ids: string[], to: DayKey): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    for (const id of ids) {
      const t = await db.tasks.get(id)
      if (!t || t.date === to) continue
      await db.tasks.update(id, {
        date: to,
        carriedFrom: t.carriedFrom ?? t.date,
        carryCount: t.carryCount + 1,
        dismissed: false,
      })
    }
  })
}

export async function letGoTasks(ids: string[]): Promise<void> {
  await db.tasks.bulkUpdate(ids.map((id) => ({ key: id, changes: { dismissed: true } })))
}

/* ---------------- Sessions ---------------- */

export async function logSession(s: Omit<Session, 'id' | 'date'> & { date?: DayKey }): Promise<string> {
  const id = uid()
  await db.sessions.add({ ...s, id, date: s.date ?? dayKey(s.start) })
  return id
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id)
}

/* ---------------- Workouts ---------------- */

export async function ensureWorkoutPlan(): Promise<void> {
  if ((await db.workoutDays.count()) === 0) await db.workoutDays.bulkPut(defaultPlan())
}

export async function saveWorkoutDay(day: WorkoutDay): Promise<void> {
  await db.workoutDays.put(day)
}

export async function resetWorkoutPlan(): Promise<void> {
  await db.workoutDays.clear()
  await db.workoutDays.bulkPut(defaultPlan())
}

export async function toggleExercise(date: DayKey, day: WorkoutDay, exerciseId: string): Promise<WorkoutLog> {
  return db.transaction('rw', db.workoutLogs, async () => {
    const log: WorkoutLog = (await db.workoutLogs.get(date)) ?? {
      date,
      weekday: weekdayOf(date),
      title: day.title,
      completed: [],
      total: day.exercises.length,
      done: false,
    }
    const completed = log.completed.includes(exerciseId)
      ? log.completed.filter((x) => x !== exerciseId)
      : [...log.completed, exerciseId]
    const valid = completed.filter((x) => day.exercises.some((e) => e.id === x))
    const done = day.exercises.length > 0 && valid.length >= day.exercises.length
    const next: WorkoutLog = {
      ...log,
      title: day.title,
      total: day.exercises.length,
      completed: valid,
      done,
      doneAt: done ? (log.doneAt ?? Date.now()) : undefined,
    }
    await db.workoutLogs.put(next)
    return next
  })
}

export async function setWorkoutDone(date: DayKey, day: WorkoutDay, done: boolean): Promise<void> {
  const existing = await db.workoutLogs.get(date)
  await db.workoutLogs.put({
    date,
    weekday: weekdayOf(date),
    title: day.title,
    total: day.exercises.length,
    completed: done ? day.exercises.map((e) => e.id) : [],
    done,
    doneAt: done ? (existing?.doneAt ?? Date.now()) : undefined,
  })
}

/* ---------------- Day counters ---------------- */

export function counterDays(c: Pick<Counter, 'startDate'>, today: DayKey = dayKey()): number {
  // The start date itself is day 1.
  return Math.max(0, daysBetween(c.startDate, today) + 1)
}

export async function createCounter(input: Pick<Counter, 'title' | 'emoji' | 'startDate' | 'goalDays'>): Promise<string> {
  const id = uid()
  await db.counters.add({ ...input, id, createdAt: Date.now(), best: 0, resets: [] })
  return id
}

export async function updateCounter(id: string, patch: Partial<Counter>): Promise<void> {
  await db.counters.update(id, patch)
}

export async function resetCounter(id: string, today: DayKey = dayKey()): Promise<void> {
  const c = await db.counters.get(id)
  if (!c) return
  const days = counterDays(c, today)
  await db.counters.update(id, {
    startDate: today,
    best: Math.max(c.best, days),
    resets: [...c.resets, { date: today, days }],
  })
}

export async function deleteCounter(id: string): Promise<void> {
  await db.counters.delete(id)
}

/* ---------------- Reflection ---------------- */

/** Records that a day was reflected on (dates only — reflection text lives in the diary). */
export async function markReflected(date: DayKey): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const list = ((await db.settings.get('reflectedDates'))?.value as DayKey[] | undefined) ?? []
    if (!list.includes(date)) await db.settings.put({ key: 'reflectedDates', value: [...list, date].sort() })
  })
}

/* ---------------- Alarms ---------------- */

export async function createAlarm(input: Pick<Alarm, 'time' | 'label' | 'days' | 'sound'>): Promise<string> {
  const id = uid()
  const now = Date.now()
  await db.alarms.add({ ...input, id, enabled: true, createdAt: now, armedAt: now })
  return id
}

/** Editing or re-enabling re-arms the alarm, so a one-time alarm rings at its next occurrence. */
export async function updateAlarm(id: string, patch: Partial<Alarm>): Promise<void> {
  const rearm = patch.enabled === true || patch.time !== undefined || patch.days !== undefined
  await db.alarms.update(id, {
    ...patch,
    ...(rearm ? { armedAt: Date.now(), lastFiredKey: undefined } : {}),
    ...(patch.enabled === false ? { snoozeUntil: undefined } : {}),
  })
}

export async function deleteAlarm(id: string): Promise<void> {
  await db.alarms.delete(id)
}
