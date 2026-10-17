import { describe, expect, it } from 'vitest'
import { habitReminderDue } from '../lib/reminders'

// Saturday 17 Oct 2026
const at = (h: number, m: number) => new Date(2026, 9, 17, h, m)
const habit = { id: 'h1', days: [0, 1, 2, 3, 4, 5, 6], reminder: '20:00', archived: false }

describe('habit reminders', () => {
  it('shows from the reminder time for an hour, once per day', () => {
    expect(habitReminderDue(habit, at(19, 59), { handled: false })).toBeNull()
    expect(habitReminderDue(habit, at(20, 0), { handled: false })).toBe('h1:2026-10-17')
    expect(habitReminderDue(habit, at(20, 45), { handled: false })).toBe('h1:2026-10-17')
    expect(habitReminderDue(habit, at(21, 0), { handled: false })).toBeNull()
    expect(habitReminderDue(habit, at(20, 5), { handled: false, lastKey: 'h1:2026-10-17' })).toBeNull()
  })

  it('stays quiet when done/skipped, unplanned, archived or unset', () => {
    expect(habitReminderDue(habit, at(20, 1), { handled: true })).toBeNull()
    expect(habitReminderDue({ ...habit, days: [1, 2, 3, 4, 5] }, at(20, 1), { handled: false })).toBeNull()
    expect(habitReminderDue({ ...habit, archived: true }, at(20, 1), { handled: false })).toBeNull()
    expect(habitReminderDue({ ...habit, reminder: undefined }, at(20, 1), { handled: false })).toBeNull()
  })
})
