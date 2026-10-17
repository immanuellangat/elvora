/** Local calendar date in `yyyy-MM-dd` form. */
export type DayKey = string

export type HabitColor = 'violet' | 'indigo' | 'sky' | 'teal' | 'emerald' | 'amber' | 'rose' | 'pink'

export interface Habit {
  id: string
  name: string
  emoji: string
  color: HabitColor
  /** Weekdays the habit is planned for (0 = Sunday … 6 = Saturday). */
  days: number[]
  note?: string
  /** Optional daily reminder time `HH:mm`, on planned days only. */
  reminder?: string
  createdAt: number
  archived: boolean
  order: number
}

export interface HabitLog {
  id: string // `${habitId}:${date}`
  habitId: string
  date: DayKey
  createdAt: number
  /** Missing means the habit was done; 'skip' pauses the day (sick, travel, rest). */
  kind?: 'skip'
}

export type HabitDayState = 'done' | 'skip' | null

export type Priority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  date: DayKey
  priority: Priority
  done: boolean
  doneAt?: number
  createdAt: number
  order: number
  /** Original date if the task was carried forward. */
  carriedFrom?: DayKey
  carryCount: number
  /** Task the user chose to let go of instead of carrying forward. */
  dismissed?: boolean
  /** Optional planned focus time for this task. */
  focusMinutes?: number
  source?: 'manual' | 'reflection'
}

export type SessionKind = 'focus' | 'stopwatch' | 'timer'

export interface Session {
  id: string
  kind: SessionKind
  label: string
  habitId?: string
  taskId?: string
  start: number
  end: number
  durationSec: number
  date: DayKey
}

export interface Exercise {
  id: string
  name: string
  sets: number
  reps?: number
  seconds?: number
  note?: string
}

export interface WorkoutDay {
  weekday: number
  rest: boolean
  title: string
  exercises: Exercise[]
}

export interface WorkoutLog {
  date: DayKey
  weekday: number
  title: string
  completed: string[]
  total: number
  done: boolean
  doneAt?: number
}

export interface Counter {
  id: string
  title: string
  emoji: string
  startDate: DayKey
  goalDays?: number
  createdAt: number
  best: number
  resets: { date: DayKey; days: number }[]
}

export type Mood = 1 | 2 | 3 | 4 | 5

export interface DiaryContent {
  mood?: Mood
  title?: string
  body: string
  accomplished: string
  challenges: string
  tomorrow: string
  learned: string
  improve: string
  /** Whether this entry went through the guided evening reflection. */
  reflected?: boolean
}

export interface EncryptedPayload {
  iv: string
  data: string
}

export interface DiaryEntry {
  id: string
  date: DayKey
  createdAt: number
  updatedAt: number
  /** Plain content when the diary lock is off. */
  content?: DiaryContent
  /** Encrypted content when the diary lock is on. */
  enc?: EncryptedPayload
}

export interface Track {
  id: string
  name: string
  type: string
  size: number
  blob: Blob
  addedAt: number
}

export interface SavedLink {
  id: string
  name: string
  url: string
}

export type ThemePref = 'system' | 'light' | 'dark'

export interface Settings {
  name: string
  theme: ThemePref
  weekStartsOn: 0 | 1
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  cyclesBeforeLongBreak: number
  autoStartBreaks: boolean
  autoStartFocus: boolean
  dailyFocusGoal: number
  reflectionHour: number
  reflectionPrompt: boolean
  chimeVolume: number
  notifications: boolean
  autoLockMinutes: number
  links: SavedLink[]
  onboarded: boolean
  alarmSound: AlarmSound
  alarmVolume: number
  /** Start alarms quietly and grow louder over ~30 seconds. */
  alarmGentleStart: boolean
  snoozeMinutes: number
  /** Countdown timers ring until stopped instead of a single chime. */
  timerAlarm: boolean
  /** "Never miss twice": one missed planned day doesn't break a streak. */
  streakGrace: boolean
}

export type AlarmSound = 'chime' | 'rise' | 'birds' | 'beep' | 'digital'

export interface Alarm {
  id: string
  /** Local time of day, `HH:mm`. */
  time: string
  label: string
  /** Repeat weekdays (0 = Sunday). Empty means ring once. */
  days: number[]
  enabled: boolean
  sound: AlarmSound
  createdAt: number
  /** When the alarm was last switched on or edited; one-time alarms only ring after this. */
  armedAt: number
  /** `yyyy-MM-ddTHH:mm` of the last occurrence that rang, to avoid ringing twice. */
  lastFiredKey?: string
  snoozeUntil?: number
}

export interface LockMeta {
  salt: string
  iterations: number
  verifier: EncryptedPayload
}

export interface SettingRow {
  key: string
  value: unknown
}
