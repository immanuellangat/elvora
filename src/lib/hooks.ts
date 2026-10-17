import { useEffect, useState } from 'react'
import { dayKey } from './dates'
import type { DayKey } from '../db/types'

/** Today's key, updating automatically after midnight. */
export function useToday(): DayKey {
  const [today, setToday] = useState(dayKey)
  useEffect(() => {
    const check = () => setToday((prev) => (prev === dayKey() ? prev : dayKey()))
    const id = window.setInterval(check, 30_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Current timestamp that refreshes while `active` is true. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])
  return now
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setMatches(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return matches
}
