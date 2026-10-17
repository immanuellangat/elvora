import type { DayKey, Habit, HabitLog, Mood, Session, Task, WorkoutDay, WorkoutLog } from '../db/types'
import { WEEKDAY_SHORT, dayKey, parseDay, weekdayOf } from './dates'
import { isPlannedOn } from './streaks'

export type CellState = 'done' | 'skip' | 'miss' | 'rest' | 'pending' | 'future' | 'before'

export interface DayStat {
  date: DayKey
  future: boolean
  focusMin: number
  habitsDone: number
  habitsPlanned: number
  tasksDone: number
  tasksTotal: number
  workoutPlanned: boolean
  workoutDone: boolean
  mood?: Mood
  /** Rough "how much got done" score used to pick the best day. */
  score: number
}

export interface HabitRow {
  habit: Habit
  cells: CellState[]
  done: number
  planned: number
  rate: number | null
}

export interface WeekStats {
  days: DayStat[]
  habitRate: number | null
  habitsDone: number
  habitsPlanned: number
  focusMin: number
  tasksDone: number
  tasksTotal: number
  workoutsDone: number
  workoutsPlanned: number
  reflections: number
  avgMood: number | null
  habitRows: HabitRow[]
  bestDay: DayStat | null
}

export interface ReviewData {
  today: DayKey
  habits: Habit[]
  logs: HabitLog[]
  tasks: Task[]
  sessions: Session[]
  workoutDays: WorkoutDay[]
  workoutLogs: WorkoutLog[]
  moods: Map<DayKey, Mood>
  reflectedDates: Set<DayKey>
}

export function weekStats(data: ReviewData, days: DayKey[]): WeekStats {
  const { today } = data
  const logIndex = new Map(data.logs.map((l) => [`${l.habitId}:${l.date}`, l]))
  const plan = new Map(data.workoutDays.map((d) => [d.weekday, d]))
  const workoutByDate = new Map(data.workoutLogs.map((w) => [w.date, w]))
  const habits = data.habits.filter((h) => !h.archived)

  const habitRows: HabitRow[] = habits.map((habit) => {
    const created = dayKey(habit.createdAt)
    let done = 0
    let planned = 0
    const cells = days.map<CellState>((d) => {
      const log = logIndex.get(`${habit.id}:${d}`)
      if (log && log.kind !== 'skip') {
        done++
        if (isPlannedOn(habit.days, d)) planned++
        return 'done'
      }
      if (d > today) return 'future'
      if (d < created) return 'before'
      if (log?.kind === 'skip') return 'skip'
      if (!isPlannedOn(habit.days, d)) return 'rest'
      if (d === today) return 'pending'
      planned++
      return 'miss'
    })
    return { habit, cells, done, planned, rate: planned ? Math.min(1, done / planned) : null }
  })

  const dayStats: DayStat[] = days.map((d, i) => {
    const future = d > today
    const focusMin = data.sessions.filter((s) => s.date === d).reduce((a, s) => a + s.durationSec, 0) / 60
    const dayTasks = data.tasks.filter((t) => t.date === d && !t.dismissed)
    const tasksDone = dayTasks.filter((t) => t.done).length
    const habitsDone = habitRows.filter((r) => r.cells[i] === 'done').length
    const habitsPlanned = habitRows.filter((r) => r.cells[i] === 'done' || r.cells[i] === 'miss' || r.cells[i] === 'pending').length
    const wd = plan.get(weekdayOf(d))
    const workoutPlanned = Boolean(wd && !wd.rest && wd.exercises.length)
    const workoutDone = Boolean(workoutByDate.get(d)?.done)
    return {
      date: d,
      future,
      focusMin,
      habitsDone,
      habitsPlanned,
      tasksDone,
      tasksTotal: dayTasks.length,
      workoutPlanned,
      workoutDone,
      mood: data.moods.get(d),
      score: habitsDone + tasksDone + (workoutDone ? 2 : 0) + focusMin / 25,
    }
  })

  const past = dayStats.filter((d) => !d.future)
  const habitsDone = habitRows.reduce((a, r) => a + r.done, 0)
  const habitsPlanned = habitRows.reduce((a, r) => a + r.planned, 0)
  const moods = past.map((d) => d.mood).filter((m): m is Mood => m !== undefined)
  const best = past.reduce<DayStat | null>((b, d) => (d.score > 0 && (!b || d.score > b.score) ? d : b), null)

  return {
    days: dayStats,
    habitRate: habitsPlanned ? Math.min(1, habitsDone / habitsPlanned) : null,
    habitsDone,
    habitsPlanned,
    focusMin: past.reduce((a, d) => a + d.focusMin, 0),
    tasksDone: past.reduce((a, d) => a + d.tasksDone, 0),
    tasksTotal: past.reduce((a, d) => a + d.tasksTotal, 0),
    workoutsDone: past.filter((d) => d.workoutDone).length,
    workoutsPlanned: past.filter((d) => d.workoutPlanned).length,
    reflections: days.filter((d) => data.reflectedDates.has(d)).length,
    avgMood: moods.length ? moods.reduce((a, m) => a + m, 0) / moods.length : null,
    habitRows,
    bestDay: best,
  }
}

export interface Insight {
  emoji: string
  text: string
}

const fmtMin = (m: number) => (m >= 60 ? `${(m / 60).toFixed(m >= 600 ? 0 : 1).replace(/\.0$/, '')}h` : `${Math.round(m)} min`)

/** Short, kind observations. Declines are stated gently and never as failure. */
export function weekInsights(cur: WeekStats, prev: WeekStats): Insight[] {
  const out: Insight[] = []

  if (cur.bestDay) {
    const name = parseDay(cur.bestDay.date).toLocaleDateString(undefined, { weekday: 'long' })
    out.push({ emoji: '🌟', text: `${name} was your strongest day this week.` })
  }

  if (cur.focusMin >= 1 || prev.focusMin >= 1) {
    const diff = cur.focusMin - prev.focusMin
    if (prev.focusMin < 1) out.push({ emoji: '🎯', text: `You focused for ${fmtMin(cur.focusMin)} this week — a fresh start.` })
    else if (diff >= 5) out.push({ emoji: '📈', text: `${fmtMin(diff)} more focus time than last week.` })
    else if (diff <= -5) out.push({ emoji: '🌱', text: `Focus time was lighter than last week (${fmtMin(cur.focusMin)} vs ${fmtMin(prev.focusMin)}). Rest weeks are part of the rhythm.` })
    else out.push({ emoji: '⚖️', text: `Focus time held steady at ${fmtMin(cur.focusMin)}.` })
  }

  const rated = cur.habitRows.filter((r) => r.rate !== null && r.planned >= 2)
  if (rated.length) {
    const top = [...rated].sort((a, b) => b.rate! - a.rate! || b.done - a.done)[0]
    if (top.rate! >= 0.5) out.push({ emoji: top.habit.emoji, text: `${top.habit.name} was your most consistent habit (${top.done}/${top.planned} days).` })
    const low = [...rated].sort((a, b) => a.rate! - b.rate!)[0]
    if (rated.length > 1 && low !== top && low.rate! < 0.5) {
      out.push({ emoji: '💜', text: `${low.habit.name} could use a little love — try making it smaller next week.` })
    }
  }

  // Mood vs focus, only when there's enough to say something honest.
  const withMood = cur.days.filter((d) => d.mood !== undefined && !d.future)
  const focused = withMood.filter((d) => d.focusMin >= 30)
  const light = withMood.filter((d) => d.focusMin < 30)
  if (focused.length >= 2 && light.length >= 2) {
    const avg = (xs: DayStat[]) => xs.reduce((a, d) => a + (d.mood ?? 0), 0) / xs.length
    const a = avg(focused)
    const b = avg(light)
    if (Math.abs(a - b) >= 0.5) {
      out.push({
        emoji: a > b ? '😊' : '🧘',
        text:
          a > b
            ? `Your mood was higher on days you focused 30+ minutes (${a.toFixed(1)} vs ${b.toFixed(1)}).`
            : `Lighter-focus days felt better this week (${b.toFixed(1)} vs ${a.toFixed(1)}) — balance matters.`,
      })
    }
  }

  if (cur.reflections >= 3) out.push({ emoji: '🌙', text: `You reflected on ${cur.reflections} evenings. That self-awareness compounds.` })
  return out
}

export function weekSummary(s: WeekStats, isCurrent: boolean): string {
  const r = s.habitRate
  if (r === null && s.focusMin < 1 && s.tasksDone === 0) return isCurrent ? 'A fresh week. Every day is a chance to take one small step.' : 'A quiet week — that happens. What matters is coming back.'
  if (r !== null && r >= 0.85) return 'An outstanding week of consistency. Keep it gentle and keep it going.'
  if (r !== null && r >= 0.6) return 'A solid, steady week. This is what real progress looks like.'
  if (r !== null && r >= 0.3) return 'Some good days in there. Small wins add up — build on what worked.'
  return isCurrent ? "The week isn't over. One small check-in today counts." : 'A lighter week. Be kind to yourself and start small again.'
}

export function weekLabel(days: DayKey[]): string {
  const a = parseDay(days[0])
  const b = parseDay(days[6])
  const sameMonth = a.getMonth() === b.getMonth()
  const fa = a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const fb = b.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
  return `${fa} – ${fb}`
}

export const shortDay = (d: DayKey) => WEEKDAY_SHORT[weekdayOf(d)]
