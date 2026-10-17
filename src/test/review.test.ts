import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog, Session, Task } from '../db/types'
import { weekOf } from '../lib/dates'
import { weekInsights, weekStats, weekSummary, type ReviewData } from '../lib/review'

// Week of Mon 12 – Sun 18 Oct 2026; "today" is Saturday the 17th.
const TODAY = '2026-10-17'
const WEEK = weekOf(TODAY, 1)
const PREV = weekOf('2026-10-10', 1)

const habit = (id: string, p: Partial<Habit> = {}): Habit => ({
  id,
  name: id,
  emoji: '✅',
  color: 'violet',
  days: [0, 1, 2, 3, 4, 5, 6],
  createdAt: new Date(2026, 8, 1).getTime(),
  archived: false,
  order: 0,
  ...p,
})
const log = (habitId: string, date: string, kind?: 'skip'): HabitLog => ({ id: `${habitId}:${date}`, habitId, date, createdAt: 0, kind })
const session = (date: string, min: number): Session => ({ id: `${date}-${min}`, kind: 'focus', label: 'x', start: 0, end: 0, durationSec: min * 60, date })
const task = (date: string, done: boolean, priority: Task['priority'] = 'medium'): Task => ({
  id: `${date}-${Math.random()}`,
  title: `t ${date}`,
  date,
  priority,
  done,
  createdAt: 0,
  order: 0,
  carryCount: 0,
})

const base = (p: Partial<ReviewData> = {}): ReviewData => ({
  today: TODAY,
  habits: [],
  logs: [],
  tasks: [],
  sessions: [],
  workoutDays: [],
  workoutLogs: [],
  moods: new Map(),
  reflectedDates: new Set(),
  ...p,
})

describe('weekly review', () => {
  it('counts planned check-ins up to today, excluding skipped days and today-pending', () => {
    const data = base({
      habits: [habit('read')],
      logs: [log('read', '2026-10-12'), log('read', '2026-10-13'), log('read', '2026-10-14', 'skip'), log('read', '2026-10-16')],
    })
    const s = weekStats(data, WEEK)
    // Planned: Mon, Tue, Thu, Fri (Wed skipped, Sat pending, Sun future) → 3 done of 4
    expect(s.habitsDone).toBe(3)
    expect(s.habitsPlanned).toBe(4)
    expect(s.habitRate).toBeCloseTo(0.75)
    expect(s.habitRows[0].cells).toEqual(['done', 'done', 'skip', 'miss', 'done', 'pending', 'future'])
  })

  it('sums focus, missions and picks the strongest day', () => {
    const data = base({
      sessions: [session('2026-10-13', 50), session('2026-10-15', 25), session('2026-10-15', 25), session('2026-10-16', 10)],
      tasks: [task('2026-10-15', true), task('2026-10-15', true), task('2026-10-16', false)],
    })
    const s = weekStats(data, WEEK)
    expect(s.focusMin).toBe(110)
    expect(s.tasksDone).toBe(2)
    expect(s.tasksTotal).toBe(3)
    expect(s.bestDay?.date).toBe('2026-10-15')
  })

  it('writes gentle insights comparing with last week', () => {
    const data = base({
      habits: [habit('walk'), habit('code')],
      logs: [...['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((d) => log('walk', d)), log('code', '2026-10-12')],
      sessions: [session('2026-10-13', 90), session('2026-10-06', 30)],
    })
    const insights = weekInsights(weekStats(data, WEEK), weekStats(data, PREV)).map((i) => i.text)
    expect(insights.some((t) => t.includes('1h more focus time'))).toBe(true)
    expect(insights.some((t) => t.startsWith('walk was your most consistent'))).toBe(true)
    expect(insights.some((t) => t.startsWith('code could use a little love'))).toBe(true)
  })

  it('relates mood to focus only when there is enough data', () => {
    const moods = new Map([
      ['2026-10-12', 5],
      ['2026-10-13', 4],
      ['2026-10-14', 2],
      ['2026-10-15', 2],
    ] as const)
    const data = base({ moods: new Map(moods), sessions: [session('2026-10-12', 40), session('2026-10-13', 45)] })
    const texts = weekInsights(weekStats(data, WEEK), weekStats(data, PREV)).map((i) => i.text)
    expect(texts.some((t) => t.includes('mood was higher on days you focused'))).toBe(true)
  })

  it('summarises a week kindly', () => {
    const empty = weekStats(base(), WEEK)
    expect(weekSummary(empty, true)).toMatch(/fresh week/)
    expect(weekSummary(empty, false)).toMatch(/quiet week/)
  })
})
