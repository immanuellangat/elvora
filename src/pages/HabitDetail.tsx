import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, ArrowLeft, Bell, Pause, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HabitForm } from '../components/HabitForm'
import { MonthCalendar } from '../components/MonthCalendar'
import { Button, Card, Modal, ProgressBar, Segmented } from '../components/ui'
import { deleteHabit, toggleHabit, toggleHabitSkip, updateHabit } from '../db/actions'
import { db } from '../db/db'
import { habitStreak, logsByHabit, EMPTY_HABIT_DAYS } from '../db/queries'
import { useSettings } from '../db/settings'
import { HABIT_COLORS } from '../lib/colors'
import { WEEKDAY_SHORT, formatDuration } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { isPlannedOn } from '../lib/streaks'
import { useToast } from '../state/toast'

const STREAK_BADGES = [3, 7, 14, 21, 30, 66, 100, 200, 365]

export default function HabitDetail() {
  const { id = '' } = useParams()
  const habit = useLiveQuery(() => db.habits.get(id).then((h) => h ?? null), [id])
  const logDays = useLiveQuery(async () => logsByHabit(await db.habitLogs.where('habitId').equals(id).toArray()).get(id) ?? EMPTY_HABIT_DAYS, [id])
  const [tapMode, setTapMode] = useState<'done' | 'skip'>('done')
  const focusSec = useLiveQuery(async () => (await db.sessions.toArray()).filter((s) => s.habitId === id).reduce((a, s) => a + s.durationSec, 0), [id])
  const settings = useSettings()
  const today = useToday()
  const navigate = useNavigate()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (habit === undefined || !logDays) return null
  const dates = logDays.done
  if (habit === null)
    return (
      <div className="py-20 text-center text-muted">
        Habit not found. <Link className="text-brand" to="/habits">Back to habits</Link>
      </div>
    )

  const stats = habitStreak(habit, logDays, today, settings.streakGrace)
  const color = HABIT_COLORS[habit.color]
  const nextBadge = STREAK_BADGES.find((b) => b > stats.best) ?? stats.best + 100

  return (
    <>
      <Link to="/habits" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Habits
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl text-4xl" style={{ background: `${color}22` }}>
          {habit.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{habit.name}</h1>
          <p className="text-sm text-muted">
            {habit.days.length === 7 ? 'Every day' : habit.days.map((d) => WEEKDAY_SHORT[d]).join(' · ')}
            {habit.note && ` — ${habit.note}`}
          </p>
          {habit.reminder && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
              <Bell size={12} /> Reminder at {habit.reminder} on planned days
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={habit.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            onClick={async () => {
              await updateHabit(habit.id, { archived: !habit.archived })
              toast(habit.archived ? 'Habit restored' : 'Habit archived — history kept')
            }}
          >
            {habit.archived ? 'Restore' : 'Archive'}
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Current streak', value: `${stats.current} 🔥` },
          { label: 'Best streak', value: stats.best },
          { label: 'Total check-ins', value: stats.total },
          { label: '30-day rate', value: `${Math.round(stats.rate30 * 100)}%` },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="tabular mt-1 text-2xl font-extrabold">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted">Tap a day to mark it as</span>
            <Segmented
              value={tapMode}
              onChange={setTapMode}
              options={[
                { value: 'done', label: '✓ Done' },
                { value: 'skip', label: <span className="inline-flex items-center gap-1"><Pause size={12} /> Skipped</span> },
              ]}
            />
          </div>
          <MonthCalendar
            weekStartsOn={settings.weekStartsOn}
            renderDay={(key, d) => {
              const done = dates.has(key)
              const skipped = !done && logDays.skipped.has(key)
              const future = key > today
              const planned = isPlannedOn(habit.days, key)
              return (
                <button
                  disabled={future}
                  onClick={() => void (tapMode === 'skip' ? toggleHabitSkip(habit.id, key) : toggleHabit(habit.id, key))}
                  aria-label={`${key}: ${done ? 'done' : skipped ? 'skipped' : 'not done'}`}
                  aria-pressed={done}
                  className={clsx(
                    'mx-auto flex aspect-square w-full max-w-12 items-center justify-center rounded-xl text-sm font-medium transition',
                    done ? 'text-white shadow-sm' : skipped ? 'bg-surface-2 text-faint line-through' : planned ? 'bg-surface-2 hover:bg-line' : 'text-faint hover:bg-surface-2',
                    future && 'opacity-30',
                    key === today && !done && 'ring-2 ring-brand/50',
                  )}
                  style={done ? { background: color } : undefined}
                >
                  {d.getDate()}
                </button>
              )
            }}
          />
          <p className="mt-4 text-xs text-muted">
            Fix a missed check-in anytime. <b>Skipped</b> days (sick, travel, rest) pause your streak instead of breaking it.
            {settings.streakGrace ? ' “Never miss twice” is on: a single missed day is forgiven.' : ''}
          </p>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="font-bold">Next milestone</h3>
            <p className="mt-1 text-sm text-muted">
              A {nextBadge}-day streak. {stats.current > 0 ? `You're on day ${stats.current}.` : 'Every streak starts with day one.'}
            </p>
            <ProgressBar value={stats.current / nextBadge} className="mt-3" />
          </Card>
          <Card>
            <h3 className="mb-3 font-bold">Streak badges</h3>
            <div className="grid grid-cols-3 gap-2">
              {STREAK_BADGES.map((b) => (
                <div
                  key={b}
                  className={clsx(
                    'rounded-2xl px-2 py-3 text-center text-xs font-semibold',
                    stats.best >= b ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-faint',
                  )}
                >
                  <div className="text-lg">{stats.best >= b ? '🔥' : '🔒'}</div>
                  {b} days
                </div>
              ))}
            </div>
          </Card>
          {focusSec ? (
            <Card>
              <h3 className="font-bold">Time invested</h3>
              <p className="mt-1 text-2xl font-extrabold">{formatDuration(focusSec)}</p>
              <p className="text-xs text-muted">From focus sessions and timers linked to this habit.</p>
            </Card>
          ) : null}
        </div>
      </div>

      <HabitForm open={editing} onClose={() => setEditing(false)} habit={habit} />
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete habit?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteHabit(habit.id)
                toast('Habit deleted')
                navigate('/habits')
              }}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This removes “{habit.name}” and all {stats.total} check-ins. If you just want a break, archiving keeps your history.
        </p>
      </Modal>
    </>
  )
}
