import Dexie, { type EntityTable } from 'dexie'
import type {
  Alarm,
  Counter,
  DiaryEntry,
  Habit,
  HabitLog,
  Session,
  SettingRow,
  Task,
  Track,
  WorkoutDay,
  WorkoutLog,
} from './types'

export type ElvoraDB = Dexie & {
  habits: EntityTable<Habit, 'id'>
  habitLogs: EntityTable<HabitLog, 'id'>
  tasks: EntityTable<Task, 'id'>
  sessions: EntityTable<Session, 'id'>
  workoutDays: EntityTable<WorkoutDay, 'weekday'>
  workoutLogs: EntityTable<WorkoutLog, 'date'>
  counters: EntityTable<Counter, 'id'>
  diary: EntityTable<DiaryEntry, 'id'>
  settings: EntityTable<SettingRow, 'key'>
  tracks: EntityTable<Track, 'id'>
  alarms: EntityTable<Alarm, 'id'>
}

export const db = new Dexie('elvora') as ElvoraDB

db.version(1).stores({
  habits: 'id, order',
  habitLogs: 'id, habitId, date',
  tasks: 'id, date',
  sessions: 'id, date, kind',
  workoutDays: 'weekday',
  workoutLogs: 'date',
  counters: 'id',
  diary: 'id, &date',
  settings: 'key',
  tracks: 'id',
})

db.version(2).stores({
  alarms: 'id',
})

/** Tables included in backups (music files are excluded to keep backups small). */
export const BACKUP_TABLES = [
  'habits',
  'habitLogs',
  'tasks',
  'sessions',
  'workoutDays',
  'workoutLogs',
  'counters',
  'diary',
  'settings',
  'alarms',
] as const

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // randomUUID is unavailable outside secure contexts
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
