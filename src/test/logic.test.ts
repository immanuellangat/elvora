import { describe, expect, it } from 'vitest'
import { computeStreak } from '../lib/streaks'
import { buildMission, missionProgress, parseTomorrowGoals, pendingFromBefore, sortTasks } from '../lib/mission'
import { daysBetween, formatClock, formatDuration, shiftDay, weekOf } from '../lib/dates'
import { parseYouTube, youTubeEmbedUrl } from '../lib/music'
import { evaluateAchievements, nextMilestone } from '../lib/achievements'
import type { Habit, Task } from '../db/types'

const ALL = [0, 1, 2, 3, 4, 5, 6]
// 2026-10-17 is a Saturday
const TODAY = '2026-10-17'

describe('streaks', () => {
  it('counts consecutive days and does not break on an unfinished today', () => {
    const done = ['2026-10-14', '2026-10-15', '2026-10-16']
    expect(computeStreak(ALL, done, TODAY, '2026-10-01').current).toBe(3)
    expect(computeStreak(ALL, [...done, TODAY], TODAY, '2026-10-01').current).toBe(4)
  })

  it('breaks on a missed planned day', () => {
    const s = computeStreak(ALL, ['2026-10-13', '2026-10-14', '2026-10-16'], TODAY, '2026-10-01')
    expect(s.current).toBe(1)
    expect(s.best).toBe(2)
  })

  it('skips rest days without breaking the streak', () => {
    const weekdays = [1, 2, 3, 4, 5]
    const done = ['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']
    const s = computeStreak(weekdays, done, TODAY, '2026-10-01')
    expect(s.current).toBe(6)
    expect(s.best).toBe(6)
    expect(s.total).toBe(6)
  })

  it('computes 30-day completion rate over planned days', () => {
    const s = computeStreak(ALL, ['2026-10-16', '2026-10-15'], TODAY, '2026-10-14')
    // planned: 14, 15, 16 (today not done, so excluded) → 2/3
    expect(s.rate30).toBeCloseTo(2 / 3)
  })
})

const habit = (id: string, days = ALL): Habit => ({ id, name: id, emoji: '✅', color: 'violet', days, createdAt: 0, archived: false, order: 0 })
const task = (id: string, p: Partial<Task> = {}): Task => ({
  id,
  title: id,
  date: TODAY,
  priority: 'medium',
  done: false,
  createdAt: 0,
  order: 0,
  carryCount: 0,
  ...p,
})

describe('mission', () => {
  it('builds items from tasks, planned habits, workout and focus goal', () => {
    const items = buildMission({
      today: TODAY,
      habits: [habit('read'), habit('weekday-only', [1, 2, 3, 4, 5])],
      doneHabitIds: new Set(['read']),
      tasks: [task('a', { priority: 'low' }), task('b', { priority: 'high' }), task('old', { date: '2026-10-16' })],
      workoutDay: { weekday: 6, rest: false, title: 'Mobility', exercises: [{ id: 'e1', name: 'x', sets: 1 }, { id: 'e2', name: 'y', sets: 1 }] },
      workoutLog: { date: TODAY, weekday: 6, title: 'Mobility', completed: ['e1'], total: 2, done: false },
      focusMinutes: 25,
      focusGoal: 50,
    })
    expect(items.map((i) => i.key)).toEqual(['task:b', 'task:a', 'habit:read', 'workout', 'focus'])
    const p = missionProgress(items)
    expect(p.done).toBe(1)
    expect(p.total).toBe(5)
    // habit 1 + workout 0.5 + focus 0.5, over 5 items
    expect(p.ratio).toBeCloseTo(2 / 5)
  })

  it('sorts done tasks last, then by priority', () => {
    const sorted = sortTasks([task('1', { priority: 'high', done: true }), task('2', { priority: 'low' }), task('3', { priority: 'high' })])
    expect(sorted.map((t) => t.id)).toEqual(['3', '2', '1'])
  })

  it('finds unfinished tasks from earlier days', () => {
    const pending = pendingFromBefore(
      [task('a', { date: '2026-10-16' }), task('b', { date: '2026-10-16', done: true }), task('c', { date: '2026-10-15', dismissed: true }), task('d')],
      TODAY,
    )
    expect(pending.map((t) => t.id)).toEqual(['a'])
  })

  it('parses tomorrow goals from reflection text', () => {
    expect(parseTomorrowGoals('- Finish report\n2) Walk 20 min\n\n• Call mom; read')).toEqual(['Finish report', 'Walk 20 min', 'Call mom', 'read'])
  })
})

describe('dates', () => {
  it('shifts and diffs days across months', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(daysBetween('2026-10-01', TODAY)).toBe(16)
  })
  it('builds weeks for either week start', () => {
    expect(weekOf(TODAY, 1)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
    expect(weekOf(TODAY, 0)[0]).toBe('2026-10-11')
  })
  it('formats durations and clocks', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00')
    expect(formatClock(3_725_000)).toBe('1:02:05')
    expect(formatDuration(5400)).toBe('1h 30m')
    expect(formatDuration(45)).toBe('45s')
  })
})

describe('music', () => {
  it('parses YouTube links', () => {
    expect(parseYouTube('https://www.youtube.com/watch?v=jfKfPfyJRdk')).toEqual({ videoId: 'jfKfPfyJRdk', listId: undefined })
    expect(parseYouTube('https://youtu.be/jfKfPfyJRdk')?.videoId).toBe('jfKfPfyJRdk')
    expect(parseYouTube('https://www.youtube.com/live/jfKfPfyJRdk')?.videoId).toBe('jfKfPfyJRdk')
    expect(parseYouTube('https://youtube.com/playlist?list=PL123')).toEqual({ listId: 'PL123' })
    expect(parseYouTube('https://example.com/stream.mp3')).toBeNull()
    expect(youTubeEmbedUrl({ videoId: 'abcdefghijk' })).toContain('loop=1')
  })
})

describe('achievements', () => {
  it('evaluates progress', () => {
    const list = evaluateAchievements({ habitChecks: 30, bestStreak: 7, focusMinutes: 0, workouts: 0, tasksDone: 0, diaryEntries: 0, reflections: 0, longestCounter: 0 })
    expect(list.find((a) => a.id === 'habitChecks-25')?.earned).toBe(true)
    expect(list.find((a) => a.id === 'bestStreak-7')?.earned).toBe(true)
    expect(list.find((a) => a.id === 'bestStreak-21')?.progress).toBeCloseTo(1 / 3)
    expect(nextMilestone(7)).toBe(14)
  })
})
