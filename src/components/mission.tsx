import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarCheck2, Dumbbell, Flag, Pause, Waves } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toggleHabit, toggleHabitSkip, toggleTask } from '../db/actions'
import { db } from '../db/db'
import { useHabits, useSessionsOn, useTasksOn, useWorkoutFor } from '../db/queries'
import { useSettings } from '../db/settings'
import type { DayKey, Priority } from '../db/types'
import { buildMission, missionProgress, type MissionItem } from '../lib/mission'
import { CheckButton } from './ui'

export function useMission(date: DayKey) {
  const settings = useSettings()
  const habits = useHabits()
  const logs = useLiveQuery(() => db.habitLogs.where('date').equals(date).toArray(), [date])
  const tasks = useTasksOn(date)
  const workout = useWorkoutFor(date)
  const sessions = useSessionsOn(date)
  if (!habits || !logs || !tasks || !workout || !sessions) return undefined
  const focusMinutes = sessions.reduce((a, s) => a + s.durationSec, 0) / 60
  const items = buildMission({
    today: date,
    habits,
    doneHabitIds: new Set(logs.filter((l) => l.kind !== 'skip').map((l) => l.habitId)),
    skippedHabitIds: new Set(logs.filter((l) => l.kind === 'skip').map((l) => l.habitId)),
    tasks,
    workoutDay: workout.day,
    workoutLog: workout.log,
    focusMinutes,
    focusGoal: settings.dailyFocusGoal,
  })
  return { items, progress: missionProgress(items), tasks, focusMinutes }
}

export const PRIORITY_STYLE: Record<Priority, { label: string; dot: string; text: string }> = {
  high: { label: 'High', dot: 'bg-bad', text: 'text-bad' },
  medium: { label: 'Medium', dot: 'bg-warn', text: 'text-warn' },
  low: { label: 'Low', dot: 'bg-good', text: 'text-good' },
}

const KIND_ICON = {
  habit: CalendarCheck2,
  task: Flag,
  workout: Dumbbell,
  focus: Waves,
}

/** One mission row; habits and tasks toggle in place, workouts and focus link to their pages. */
export function MissionRow({ item, date, trailing }: { item: MissionItem; date: DayKey; trailing?: ReactNode }) {
  const navigate = useNavigate()
  const Icon = KIND_ICON[item.kind]
  const toggle = () => {
    if (item.kind === 'task' && item.refId) void toggleTask(item.refId)
    else if (item.kind === 'habit' && item.refId) void toggleHabit(item.refId, date)
    else if (item.kind === 'workout') navigate('/workouts')
    else navigate('/focus')
  }
  const linkOnly = item.kind === 'workout' || item.kind === 'focus'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={clsx(
        'group flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 transition sm:px-4',
        item.done && 'bg-surface-2/50',
      )}
    >
      {item.skipped && item.refId ? (
        <button
          onClick={() => void toggleHabitSkip(item.refId!, date)}
          aria-label={`Undo skip for ${item.title}`}
          title="Skipped today — tap to undo"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"
        >
          <Pause size={13} />
        </button>
      ) : linkOnly && !item.done ? (
        <button
          onClick={toggle}
          aria-label={item.kind === 'workout' ? 'Open workout' : 'Start focus'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
        >
          <Icon size={14} />
        </button>
      ) : (
        <CheckButton checked={item.done} onClick={toggle} label={`${item.done ? 'Undo' : 'Complete'} ${item.title}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.emoji && <span className="text-base leading-none">{item.emoji}</span>}
          <span className={clsx('truncate text-sm font-medium', item.done && !item.skipped && 'text-muted line-through decoration-faint', item.skipped && 'text-muted')}>
            {item.title}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1 capitalize">
            <Icon size={11} />
            {item.kind}
          </span>
          {item.priority && (
            <span className={clsx('inline-flex items-center gap-1', PRIORITY_STYLE[item.priority].text)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', PRIORITY_STYLE[item.priority].dot)} />
              {PRIORITY_STYLE[item.priority].label}
            </span>
          )}
          {item.detail && <span>{item.detail}</span>}
        </div>
        {(item.kind === 'workout' || item.kind === 'focus') && !item.done && item.progress > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="brand-gradient h-full rounded-full" style={{ width: `${item.progress * 100}%` }} />
          </div>
        )}
      </div>
      {trailing}
      {linkOnly && (
        <button onClick={toggle} aria-label="Open" className="rounded-lg p-1.5 text-faint hover:text-ink">
          <ArrowRight size={16} />
        </button>
      )}
    </motion.div>
  )
}
