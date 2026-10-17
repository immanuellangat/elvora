import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { LockMeta, Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  theme: 'system',
  weekStartsOn: 1,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  dailyFocusGoal: 50,
  reflectionHour: 19,
  reflectionPrompt: true,
  chimeVolume: 0.6,
  notifications: false,
  autoLockMinutes: 5,
  links: [],
  onboarded: false,
  alarmSound: 'chime',
  alarmVolume: 0.8,
  alarmGentleStart: true,
  snoozeMinutes: 9,
  timerAlarm: true,
}

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('app')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await getSettings()
    await db.settings.put({ key: 'app', value: { ...current, ...patch } })
  })
  if (patch.theme) {
    try {
      localStorage.setItem('elvora.theme', patch.theme)
    } catch {
      // storage may be unavailable
    }
  }
}

/** Live settings; `loaded` is false until the database has answered. */
export function useSettingsState(): { settings: Settings; loaded: boolean } {
  const row = useLiveQuery(() => db.settings.get('app').then((r) => r ?? null), [])
  if (row === undefined) return { settings: DEFAULT_SETTINGS, loaded: false }
  return { settings: { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }, loaded: true }
}

export function useSettings(): Settings {
  return useSettingsState().settings
}

export async function getLockMeta(): Promise<LockMeta | undefined> {
  return (await db.settings.get('lock'))?.value as LockMeta | undefined
}
