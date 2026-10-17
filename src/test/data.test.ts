import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import {
  addTask,
  counterDays,
  createCounter,
  createHabit,
  ensureWorkoutPlan,
  letGoTasks,
  markReflected,
  moveTasks,
  resetCounter,
  toggleExercise,
  toggleHabit,
  toggleHabitSkip,
} from '../db/actions'
import { exportBackup, importBackup, isBackup } from '../db/backup'
import { getSettings, updateSettings } from '../db/settings'
import { createLock, decryptJSON, encryptJSON, unlockWith } from '../lib/crypto'
import { loadDaySummary } from '../db/queries'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('habits & tasks', () => {
  it('toggles habit check-ins', async () => {
    const id = await createHabit({ name: 'Read', emoji: '📚', color: 'amber', days: [0, 1, 2, 3, 4, 5, 6] })
    expect(await toggleHabit(id, '2026-10-17')).toBe(true)
    expect(await db.habitLogs.count()).toBe(1)
    expect(await toggleHabit(id, '2026-10-17')).toBe(false)
    expect(await db.habitLogs.count()).toBe(0)
  })

  it('skips a day and switches between skipped and done', async () => {
    const id = await createHabit({ name: 'Run', emoji: '🏃', color: 'teal', days: [0, 1, 2, 3, 4, 5, 6] })
    expect(await toggleHabitSkip(id, '2026-10-17')).toBe(true)
    expect((await db.habitLogs.get(`${id}:2026-10-17`))?.kind).toBe('skip')
    expect(await toggleHabit(id, '2026-10-17')).toBe(true) // skipped → done
    expect((await db.habitLogs.get(`${id}:2026-10-17`))?.kind).toBeUndefined()
    expect(await toggleHabitSkip(id, '2026-10-17')).toBe(true) // done → skipped
    expect(await toggleHabitSkip(id, '2026-10-17')).toBe(false) // skipped → cleared
    expect(await db.habitLogs.count()).toBe(0)
  })

  it('carries tasks forward and remembers the origin', async () => {
    const id = await addTask({ title: 'Write report', date: '2026-10-15', priority: 'high' })
    await moveTasks([id], '2026-10-16')
    await moveTasks([id], '2026-10-17')
    expect(await db.tasks.get(id)).toMatchObject({ date: '2026-10-17', carriedFrom: '2026-10-15', carryCount: 2 })
    await letGoTasks([id])
    expect((await db.tasks.get(id))?.dismissed).toBe(true)
  })

  it('summarizes a day for reflection', async () => {
    const h = await createHabit({ name: 'Walk', emoji: '🚶', color: 'emerald', days: [6] })
    await toggleHabit(h, '2026-10-17')
    const t = await addTask({ title: 'A', date: '2026-10-17' })
    await addTask({ title: 'B', date: '2026-10-17' })
    await db.tasks.update(t, { done: true })
    await db.sessions.add({ id: 's', kind: 'focus', label: 'Study', start: 0, end: 1, durationSec: 1500, date: '2026-10-17' })
    const s = await loadDaySummary('2026-10-17')
    expect(s.tasks).toHaveLength(2)
    expect(s.tasksDone).toHaveLength(1)
    expect(s.habitsDone.map((x) => x.name)).toEqual(['Walk'])
    expect(s.focusSec).toBe(1500)
  })
})

describe('workouts', () => {
  it('seeds a beginner plan with rest days and completes a workout when all exercises are done', async () => {
    await ensureWorkoutPlan()
    const plan = await db.workoutDays.toArray()
    expect(plan).toHaveLength(7)
    expect(plan.filter((d) => d.rest).length).toBeGreaterThanOrEqual(2)
    const monday = plan.find((d) => d.weekday === 1)!
    let log = await toggleExercise('2026-10-12', monday, monday.exercises[0].id)
    for (const e of monday.exercises.slice(1)) log = await toggleExercise('2026-10-12', monday, e.id)
    expect(log.done).toBe(true)
    log = await toggleExercise('2026-10-12', monday, monday.exercises[0].id)
    expect(log.done).toBe(false)
  })
})

describe('counters', () => {
  it('counts the start day as day 1 and keeps the best run on reset', async () => {
    const id = await createCounter({ title: 'No sugar', emoji: '🍬', startDate: '2026-10-01' })
    expect(counterDays((await db.counters.get(id))!, '2026-10-17')).toBe(17)
    await resetCounter(id, '2026-10-17')
    const after = (await db.counters.get(id))!
    expect(after.best).toBe(17)
    expect(after.startDate).toBe('2026-10-17')
    expect(counterDays(after, '2026-10-17')).toBe(1)
  })
})

describe('settings & backup', () => {
  it('persists settings with defaults', async () => {
    expect((await getSettings()).focusMinutes).toBe(25)
    await updateSettings({ focusMinutes: 50, name: 'Sam' })
    expect(await getSettings()).toMatchObject({ focusMinutes: 50, name: 'Sam', shortBreakMinutes: 5 })
  })

  it('round-trips a backup', async () => {
    await createHabit({ name: 'Code', emoji: '💻', color: 'indigo', days: [1] })
    await addTask({ title: 'Ship it', date: '2026-10-17' })
    await markReflected('2026-10-16')
    const backup = JSON.parse(JSON.stringify(await exportBackup()))
    expect(isBackup(backup)).toBe(true)
    await db.habits.clear()
    await db.tasks.clear()
    await importBackup(backup)
    expect(await db.habits.count()).toBe(1)
    expect((await db.tasks.toArray())[0].title).toBe('Ship it')
    expect((await db.settings.get('reflectedDates'))?.value).toEqual(['2026-10-16'])
    expect(isBackup({ app: 'other' })).toBe(false)
  })
})

describe('diary encryption', () => {
  it('encrypts and only decrypts with the right passcode', async () => {
    const { meta, key } = await createLock('correct horse', 1000)
    const payload = await encryptJSON(key, { body: 'secret thoughts' })
    expect(atob(payload.data)).not.toContain('secret')
    expect(await unlockWith('wrong', meta)).toBeNull()
    const k2 = await unlockWith('correct horse', meta)
    expect(k2).not.toBeNull()
    expect(await decryptJSON<{ body: string }>(k2!, payload)).toEqual({ body: 'secret thoughts' })
  })
})
