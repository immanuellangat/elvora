import type { DayKey, Habit, Priority, Task, WorkoutDay, WorkoutLog } from '../db/types'
import { isPlannedOn } from './streaks'

export type MissionKind = 'habit' | 'task' | 'workout' | 'focus'

export interface MissionItem {
  key: string
  kind: MissionKind
  title: string
  done: boolean
  /** 0–1 partial progress, used by focus time and workouts. */
  progress: number
  priority?: Priority
  refId?: string
  emoji?: string
  detail?: string
}

export interface MissionInput {
  today: DayKey
  habits: Habit[]
  doneHabitIds: Set<string>
  tasks: Task[]
  workoutDay?: WorkoutDay
  workoutLog?: WorkoutLog
  focusMinutes: number
  focusGoal: number
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.order - b.order ||
      a.createdAt - b.createdAt,
  )
}

export function buildMission(input: MissionInput): MissionItem[] {
  const items: MissionItem[] = []

  for (const t of sortTasks(input.tasks.filter((t) => t.date === input.today && !t.dismissed))) {
    items.push({
      key: `task:${t.id}`,
      kind: 'task',
      title: t.title,
      done: t.done,
      progress: t.done ? 1 : 0,
      priority: t.priority,
      refId: t.id,
      detail: t.carriedFrom ? 'Carried forward' : undefined,
    })
  }

  for (const h of input.habits) {
    if (h.archived || !isPlannedOn(h.days, input.today)) continue
    const done = input.doneHabitIds.has(h.id)
    items.push({
      key: `habit:${h.id}`,
      kind: 'habit',
      title: h.name,
      emoji: h.emoji,
      done,
      progress: done ? 1 : 0,
      refId: h.id,
    })
  }

  const wd = input.workoutDay
  if (wd && !wd.rest && wd.exercises.length > 0) {
    const completed = input.workoutLog?.completed.length ?? 0
    const done = Boolean(input.workoutLog?.done)
    items.push({
      key: 'workout',
      kind: 'workout',
      title: wd.title || 'Workout',
      done,
      progress: done ? 1 : Math.min(1, completed / wd.exercises.length),
      detail: `${completed}/${wd.exercises.length} exercises`,
    })
  }

  if (input.focusGoal > 0) {
    const progress = Math.min(1, input.focusMinutes / input.focusGoal)
    items.push({
      key: 'focus',
      kind: 'focus',
      title: `Focus for ${input.focusGoal} min`,
      done: progress >= 1,
      progress,
      detail: `${Math.round(input.focusMinutes)} / ${input.focusGoal} min`,
    })
  }

  return items
}

export function missionProgress(items: MissionItem[]): { done: number; total: number; ratio: number } {
  const total = items.length
  const done = items.filter((i) => i.done).length
  const sum = items.reduce((acc, i) => acc + i.progress, 0)
  return { done, total, ratio: total ? sum / total : 0 }
}

/** Unfinished tasks from earlier days that are still waiting for a decision. */
export function pendingFromBefore(tasks: Task[], today: DayKey): Task[] {
  return tasks.filter((t) => t.date < today && !t.done && !t.dismissed)
}

export function encouragement(ratio: number, total: number): string {
  if (total === 0) return 'A blank page. Add one small thing that would make today feel good.'
  if (ratio >= 1) return 'Mission complete. Take a moment to enjoy it — you earned it.'
  if (ratio >= 0.75) return 'Almost there. Finish gently — no rush.'
  if (ratio >= 0.5) return 'Over halfway. Steady progress is real progress.'
  if (ratio > 0) return 'Good start. One step at a time is how habits grow.'
  return 'Start with the smallest thing on the list. Momentum will follow.'
}

/** Gentle nudge when a day looks overloaded. */
export const COMFORTABLE_TASKS = 6

/** Split reflection "tomorrow" text into separate mission ideas. */
export function parseTomorrowGoals(text: string): string[] {
  return text
    .split(/\r?\n|;/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?\])\s*/, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 10)
}
