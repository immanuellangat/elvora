import { useEffect, useState } from 'react'
import { useSettingsState } from '../db/settings'

function readStoredTheme(): string {
  try {
    return localStorage.getItem('elvora.theme') ?? 'system'
  } catch {
    return 'system'
  }
}

/** Keeps the `dark` class on <html> in sync with the theme setting and the OS. */
export function ThemeController() {
  const { settings, loaded } = useSettingsState()
  const pref = loaded ? settings.theme : readStoredTheme()

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0b16' : '#f6f5fb')
    }
    apply()
    try {
      localStorage.setItem('elvora.theme', pref)
    } catch {
      // ignore
    }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])

  return null
}

export function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}
