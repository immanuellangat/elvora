import { describe, expect, it } from 'vitest'
import { MAX_TIMER_MS, adjustTimer } from '../state/timers'

const MIN = 60_000

describe('adjustTimer', () => {
  it('lengthens and shortens a timer that has not started', () => {
    const t = { running: false, endsAt: null, remainingMs: 25 * MIN, totalMs: 25 * MIN }
    expect(adjustTimer(t, MIN, 0)).toEqual({ endsAt: null, remainingMs: 26 * MIN, totalMs: 26 * MIN })
    expect(adjustTimer(t, -5 * MIN, 0)).toEqual({ endsAt: null, remainingMs: 20 * MIN, totalMs: 20 * MIN })
  })

  it('keeps elapsed time when adjusting a paused timer', () => {
    // 25 min timer, 10 min elapsed, paused
    const r = adjustTimer({ running: false, endsAt: null, remainingMs: 15 * MIN, totalMs: 25 * MIN }, 2 * MIN, 0)
    expect(r.remainingMs).toBe(17 * MIN)
    expect(r.totalMs).toBe(27 * MIN)
  })

  it('moves the end time of a running timer', () => {
    const now = 1_000_000
    const r = adjustTimer({ running: true, endsAt: now + 10 * MIN, remainingMs: 0, totalMs: 25 * MIN }, -3 * MIN, now)
    expect(r.endsAt).toBe(now + 7 * MIN)
    expect(r.remainingMs).toBe(7 * MIN)
    expect(r.totalMs).toBe(22 * MIN)
  })

  it('never leaves less than a minute or exceeds the maximum', () => {
    const low = adjustTimer({ running: false, endsAt: null, remainingMs: 1 * MIN, totalMs: 1 * MIN }, -MIN, 0)
    expect(low.remainingMs).toBe(MIN)
    const high = adjustTimer({ running: false, endsAt: null, remainingMs: MAX_TIMER_MS, totalMs: MAX_TIMER_MS }, MIN, 0)
    expect(high.totalMs).toBe(MAX_TIMER_MS)
  })
})
