import clsx from 'clsx'
import { motion } from 'framer-motion'
import { Flame, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HabitForm } from '../components/HabitForm'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { toggleHabit } from '../db/actions'
import { habitStreak, logsByHabit, useHabitLogs, useHabits } from '../db/queries'
import { useSettings } from '../db/settings'
import type { Habit } from '../db/types'
import { HABIT_COLORS } from '../lib/colors'
import { WEEKDAY_LETTER, parseDay, weekOf } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { isPlannedOn } from '../lib/streaks'

function HabitCard({ habit, dates, today, week }: { habit: Habit; dates: Set<string>; today: string; week: string[] }) {
  const stats = habitStreak(habit, dates, today)
  const color = HABIT_COLORS[habit.color]
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5">
      <div className="flex items-start gap-3">
        <Link to={`/habits/${habit.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ background: `${color}22` }}>
            {habit.emoji}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{habit.name}</div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
              <span className={clsx('inline-flex items-center gap-1', stats.current > 0 && 'font-semibold text-warn')}>
                <Flame size={13} /> {stats.current} day{stats.current === 1 ? '' : 's'}
              </span>
              <span>Best {stats.best}</span>
              <span>{Math.round(stats.rate30 * 100)}% · 30d</span>
            </div>
          </div>
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {week.map((d) => {
          const done = dates.has(d)
          const future = d > today
          const planned = isPlannedOn(habit.days, d)
          const day = parseDay(d)
          return (
            <button
              key={d}
              disabled={future}
              onClick={() => void toggleHabit(habit.id, d)}
              aria-label={`${habit.name} on ${d}: ${done ? 'done' : 'not done'}`}
              aria-pressed={done}
              className="flex flex-col items-center gap-1 disabled:opacity-40"
            >
              <span className={clsx('text-[10px] font-semibold', d === today ? 'text-brand' : 'text-faint')}>{WEEKDAY_LETTER[day.getDay()]}</span>
              <motion.span
                whileTap={{ scale: 0.85 }}
                className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-xl text-xs font-semibold transition-colors',
                  done ? 'text-white' : planned ? 'bg-surface-2 text-muted hover:bg-line' : 'border border-dashed border-line text-faint',
                  d === today && !done && 'ring-2 ring-brand/40',
                )}
                style={done ? { background: color } : undefined}
              >
                {done ? '✓' : day.getDate()}
              </motion.span>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}

export default function HabitsPage() {
  const habits = useHabits()
  const archived = (useHabits(true) ?? []).filter((h) => h.archived)
  const logs = useHabitLogs()
  const settings = useSettings()
  const today = useToday()
  const [open, setOpen] = useState(false)
  const week = weekOf(today, settings.weekStartsOn)

  if (!habits || !logs) return null
  const byHabit = logsByHabit(logs)
  const doneToday = habits.filter((h) => byHabit.get(h.id)?.has(today)).length

  return (
    <>
      <PageHeader
        title="Habits"
        subtitle={habits.length ? `${doneToday} of ${habits.length} checked off today. Tap a day to mark it.` : 'Build consistency one small day at a time.'}
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            New habit
          </Button>
        }
      />
      {habits.length === 0 ? (
        <EmptyState
          emoji="🌱"
          title="No habits yet"
          text="Start with one or two tiny habits. Consistency grows from small, repeatable wins."
          action={<Button onClick={() => setOpen(true)}>Create your first habit</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {habits.map((h) => (
            <HabitCard key={h.id} habit={h} dates={byHabit.get(h.id) ?? new Set()} today={today} week={week} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Archived ({archived.length})</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {archived.map((h) => (
              <Link key={h.id} to={`/habits/${h.id}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted hover:text-ink">
                {h.emoji} {h.name}
              </Link>
            ))}
          </div>
        </details>
      )}
      <HabitForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
