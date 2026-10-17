import { describe, expect, it } from 'vitest'
import type { Alarm } from '../db/types'
import { describeDays, dueOccurrence, formatIn, nextOccurrence, snoozeDue } from '../lib/alarms'

// Saturday 17 Oct 2026
const at = (h: number, m: number, s = 0, day = 17) => new Date(2026, 9, day, h, m, s)

const alarm = (p: Partial<Alarm> = {}): Alarm => ({
  id: 'a',
  time: '07:30',
  label: '',
  days: [0, 1, 2, 3, 4, 5, 6],
  enabled: true,
  sound: 'chime',
  createdAt: 0,
  armedAt: at(6, 0).getTime(),
  ...p,
})

describe('alarm scheduling', () => {
  it('is due from its minute until the grace window ends, once', () => {
    const a = alarm()
    expect(dueOccurrence(a, at(7, 29, 59))).toBeNull()
    expect(dueOccurrence(a, at(7, 30, 0))).toBe('2026-10-17T07:30')
    expect(dueOccurrence(a, at(7, 34, 30))).toBe('2026-10-17T07:30')
    expect(dueOccurrence(a, at(7, 36))).toBeNull()
    expect(dueOccurrence({ ...a, lastFiredKey: '2026-10-17T07:30' }, at(7, 31))).toBeNull()
  })

  it('respects repeat days and the enabled switch', () => {
    expect(dueOccurrence(alarm({ days: [1, 2, 3, 4, 5] }), at(7, 30))).toBeNull() // Saturday
    expect(dueOccurrence(alarm({ days: [6] }), at(7, 30))).not.toBeNull()
    expect(dueOccurrence(alarm({ enabled: false }), at(7, 30))).toBeNull()
  })

  it('only rings a one-time alarm for occurrences after it was set', () => {
    const once = alarm({ days: [], armedAt: at(7, 32).getTime() })
    expect(dueOccurrence(once, at(7, 33))).toBeNull()
    expect(nextOccurrence(once, at(7, 33))?.getDate()).toBe(18)
  })

  it('handles alarms just before midnight when checked after midnight', () => {
    const late = alarm({ time: '23:58' })
    expect(dueOccurrence(late, new Date(2026, 9, 18, 0, 1))).toBe('2026-10-17T23:58')
  })

  it('finds the next occurrence, including snoozes', () => {
    expect(nextOccurrence(alarm(), at(6, 0))?.getTime()).toBe(at(7, 30).getTime())
    expect(nextOccurrence(alarm({ days: [1] }), at(8, 0))?.getTime()).toBe(new Date(2026, 9, 19, 7, 30).getTime())
    const snoozed = alarm({ enabled: false, snoozeUntil: at(7, 39).getTime() })
    expect(nextOccurrence(snoozed, at(7, 31))?.getTime()).toBe(at(7, 39).getTime())
    expect(snoozeDue(snoozed, at(7, 38))).toBe(false)
    expect(snoozeDue(snoozed, at(7, 39))).toBe(true)
    expect(nextOccurrence(alarm({ enabled: false }), at(6, 0))).toBeNull()
  })

  it('describes repeat days and time remaining', () => {
    expect(describeDays([])).toBe('Once')
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Weekdays')
    expect(describeDays([0, 6])).toBe('Weekends')
    expect(describeDays([0, 1, 3])).toBe('Mon, Wed, Sun')
    expect(formatIn(90 * 60_000)).toBe('in 1h 30m')
    expect(formatIn(5 * 60_000)).toBe('in 5 min')
  })
})
