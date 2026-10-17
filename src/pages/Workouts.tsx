import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Info, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, CheckButton, Field, Input, Modal, PageHeader, ProgressBar, SectionTitle, Toggle } from '../components/ui'
import { resetWorkoutPlan, saveWorkoutDay, setWorkoutDone, toggleExercise } from '../db/actions'
import { db, uid } from '../db/db'
import { useSettings } from '../db/settings'
import type { Exercise, WorkoutDay } from '../db/types'
import { WEEKDAY_SHORT, parseDay, weekOf } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { EXERCISE_LIBRARY, exerciseAmount, tipFor } from '../lib/workouts'
import { useToast } from '../state/toast'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function EditDayModal({ day, onClose }: { day: WorkoutDay | null; onClose: () => void }) {
  const [draft, setDraft] = useState<WorkoutDay | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  if (day && draft?.weekday !== day.weekday) setDraft(structuredClone(day))
  if (!day && draft) setDraft(null)

  const setEx = (i: number, patch: Partial<Exercise>) =>
    draft && setDraft({ ...draft, exercises: draft.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const move = (i: number, dir: -1 | 1) => {
    if (!draft) return
    const list = [...draft.exercises]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setDraft({ ...draft, exercises: list })
  }

  return (
    <Modal
      open={Boolean(day)}
      onClose={onClose}
      title={day ? `Edit ${DAY_NAMES[day.weekday]}` : ''}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!draft) return
              await saveWorkoutDay({
                ...draft,
                title: draft.title.trim() || (draft.rest ? 'Rest & recharge' : 'Workout'),
                exercises: draft.exercises.filter((e) => e.name.trim()),
              })
              onClose()
            }}
          >
            Save day
          </Button>
        </>
      }
    >
      {draft && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Rest day</div>
              <div className="text-xs text-muted">Recovery is part of the plan, not a break from it.</div>
            </div>
            <Toggle label="Rest day" checked={draft.rest} onChange={(rest) => setDraft({ ...draft, rest, title: rest ? 'Rest & recharge' : draft.title === 'Rest & recharge' ? 'Workout' : draft.title })} />
          </div>
          <Field label="Title">{(id) => <Input id={id} value={draft.title} maxLength={40} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}</Field>
          {!draft.rest && (
            <>
              <div className="space-y-2">
                {draft.exercises.map((e, i) => (
                  <div key={e.id} className="rounded-2xl border border-line p-3">
                    <div className="flex items-center gap-2">
                      <Input value={e.name} aria-label="Exercise name" onChange={(ev) => setEx(i, { name: ev.target.value })} className="h-9 flex-1" />
                      <button aria-label="Move up" className="p-1.5 text-faint hover:text-ink" onClick={() => move(i, -1)}>
                        <ArrowUp size={15} />
                      </button>
                      <button aria-label="Move down" className="p-1.5 text-faint hover:text-ink" onClick={() => move(i, 1)}>
                        <ArrowDown size={15} />
                      </button>
                      <button
                        aria-label="Remove exercise"
                        className="p-1.5 text-faint hover:text-bad"
                        onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((_, j) => j !== i) })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <label className="flex items-center gap-1">
                        Sets
                        <input type="number" min={1} max={10} value={e.sets} onChange={(ev) => setEx(i, { sets: Math.max(1, Number(ev.target.value) || 1) })} className="h-8 w-14 rounded-lg bg-surface-2 px-2 text-ink outline-none" />
                      </label>
                      <select
                        aria-label="Measure"
                        value={e.seconds ? 'time' : 'reps'}
                        onChange={(ev) => setEx(i, ev.target.value === 'time' ? { seconds: e.seconds ?? 30, reps: undefined } : { reps: e.reps ?? 10, seconds: undefined })}
                        className="h-8 rounded-lg bg-surface-2 px-2 text-ink outline-none"
                      >
                        <option value="reps">Reps</option>
                        <option value="time">Seconds</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={3600}
                        aria-label={e.seconds ? 'Seconds' : 'Reps'}
                        value={e.seconds ?? e.reps ?? 10}
                        onChange={(ev) => {
                          const n = Math.max(1, Number(ev.target.value) || 1)
                          setEx(i, e.seconds ? { seconds: n } : { reps: n })
                        }}
                        className="h-8 w-20 rounded-lg bg-surface-2 px-2 text-ink outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="soft" size="sm" icon={<Plus size={15} />} onClick={() => setLibOpen((o) => !o)}>
                  From library
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={15} />}
                  onClick={() => setDraft({ ...draft, exercises: [...draft.exercises, { id: uid(), name: 'New exercise', sets: 3, reps: 10 }] })}
                >
                  Custom
                </Button>
              </div>
              {libOpen && (
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-2xl bg-surface-2 p-3">
                  {(['Lower body', 'Upper body', 'Core', 'Cardio', 'Mobility'] as const).map((area) => (
                    <div key={area}>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{area}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {EXERCISE_LIBRARY.filter((x) => x.area === area).map((x) => (
                          <button
                            key={x.name}
                            title={x.tip}
                            onClick={() =>
                              setDraft({ ...draft, exercises: [...draft.exercises, { id: uid(), name: x.name, sets: x.sets, reps: x.reps, seconds: x.seconds }] })
                            }
                            className="rounded-full border border-line bg-surface px-3 py-1 text-xs hover:border-brand hover:text-brand"
                          >
                            + {x.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function WorkoutsPage() {
  const today = useToday()
  const settings = useSettings()
  const toast = useToast()
  const plan = useLiveQuery(() => db.workoutDays.toArray(), [])
  const logs = useLiveQuery(() => db.workoutLogs.toArray(), [])
  const [editing, setEditing] = useState<WorkoutDay | null>(null)
  const [tipOpen, setTipOpen] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  if (!plan || !logs) return null
  const week = weekOf(today, settings.weekStartsOn)
  const byWeekday = new Map(plan.map((d) => [d.weekday, d]))
  const logByDate = new Map(logs.map((l) => [l.date, l]))
  const todayDay = byWeekday.get(parseDay(today).getDay())
  const todayLog = logByDate.get(today)
  const planned = week.filter((d) => {
    const wd = byWeekday.get(parseDay(d).getDay())
    return wd && !wd.rest && wd.exercises.length > 0
  })
  const doneThisWeek = planned.filter((d) => logByDate.get(d)?.done).length
  const totalDone = logs.filter((l) => l.done).length

  return (
    <>
      <PageHeader
        title="Workouts"
        subtitle="A gentle, beginner-friendly week. Rest days are built in — consistency beats intensity."
        actions={
          <Button variant="ghost" size="sm" icon={<RotateCcw size={15} />} onClick={() => setConfirmReset(true)}>
            Reset plan
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          {!todayDay || todayDay.rest || todayDay.exercises.length === 0 ? (
            <div className="py-8 text-center">
              <div className="text-5xl">🌿</div>
              <h2 className="mt-3 text-xl font-bold">Rest day</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Muscles grow while you rest. A short walk or a few minutes of stretching is plenty — or nothing at all.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-brand">Today</div>
                  <h2 className="text-xl font-bold">{todayDay.title}</h2>
                  <p className="text-sm text-muted">
                    {todayLog?.completed.length ?? 0} of {todayDay.exercises.length} done · rest 30–60s between sets
                  </p>
                </div>
                <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(todayDay)}>
                  Edit
                </Button>
              </div>
              <ProgressBar value={(todayLog?.completed.length ?? 0) / todayDay.exercises.length} className="mb-4" tone={todayLog?.done ? 'good' : 'brand'} />
              <div className="space-y-2">
                {todayDay.exercises.map((e) => {
                  const done = todayLog?.completed.includes(e.id) ?? false
                  const tip = tipFor(e.name)
                  return (
                    <div key={e.id} className={clsx('rounded-2xl border border-line px-3 py-3 transition', done && 'bg-surface-2/50')}>
                      <div className="flex items-center gap-3">
                        <CheckButton
                          checked={done}
                          label={`${done ? 'Undo' : 'Complete'} ${e.name}`}
                          onClick={async () => {
                            const next = await toggleExercise(today, todayDay, e.id)
                            if (next.done && !todayLog?.done) toast('Workout complete! 💪 Great job showing up.', { tone: 'success' })
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={clsx('text-sm font-medium', done && 'text-muted line-through')}>{e.name}</div>
                          <div className="text-xs text-muted">{exerciseAmount(e)}</div>
                        </div>
                        {tip && (
                          <button aria-label={`How to do ${e.name}`} className="p-1.5 text-faint hover:text-brand" onClick={() => setTipOpen(tipOpen === e.id ? null : e.id)}>
                            <Info size={16} />
                          </button>
                        )}
                      </div>
                      {tipOpen === e.id && tip && (
                        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="ml-10 mt-2 text-xs text-muted">
                          {tip}
                        </motion.p>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant={todayLog?.done ? 'secondary' : 'primary'}
                  onClick={async () => {
                    await setWorkoutDone(today, todayDay, !todayLog?.done)
                    if (!todayLog?.done) toast('Workout complete! 💪', { tone: 'success' })
                  }}
                >
                  {todayLog?.done ? 'Mark as not done' : 'Mark whole workout done'}
                </Button>
              </div>
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle>This week</SectionTitle>
            <div className="text-3xl font-extrabold">
              {doneThisWeek}
              <span className="text-lg text-muted"> / {planned.length}</span>
            </div>
            <p className="text-sm text-muted">workouts completed</p>
            <ProgressBar value={planned.length ? doneThisWeek / planned.length : 0} className="mt-3" />
            <p className="mt-4 text-xs text-muted">All-time: {totalDone} workout{totalDone === 1 ? '' : 's'} 🏅</p>
          </Card>
          <Card className="text-sm text-muted">
            <b className="text-ink">Beginner tips</b>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Warm up for 3–5 minutes first.</li>
              <li>Good form matters more than reps.</li>
              <li>Mild effort is fine; sharp pain means stop.</li>
              <li>Missed a day? Just continue with the next one.</li>
            </ul>
          </Card>
        </div>
      </div>

      <section className="mt-8">
        <SectionTitle>Weekly plan</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {week.map((d) => {
            const wd = parseDay(d).getDay()
            const day = byWeekday.get(wd)
            const log = logByDate.get(d)
            const isRest = !day || day.rest || day.exercises.length === 0
            const status = isRest ? 'rest' : log?.done ? 'done' : d < today ? 'missed' : d === today ? 'today' : 'upcoming'
            return (
              <button
                key={d}
                onClick={() => day && setEditing(day)}
                className={clsx(
                  'flex flex-col rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft',
                  d === today ? 'border-brand/50 bg-brand-soft/40' : 'border-line bg-surface',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">{WEEKDAY_SHORT[wd]}</span>
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      status === 'done' && 'bg-good-soft text-good',
                      status === 'rest' && 'bg-surface-2 text-muted',
                      status === 'missed' && 'bg-surface-2 text-faint',
                      (status === 'today' || status === 'upcoming') && 'bg-brand-soft text-brand',
                    )}
                  >
                    {status === 'done' ? '✓ Done' : status === 'rest' ? 'Rest' : status === 'missed' ? 'Skipped' : status === 'today' ? 'Today' : 'Planned'}
                  </span>
                </div>
                <div className="mt-2 font-semibold">{day?.title ?? 'Rest'}</div>
                <div className="mt-1 text-xs text-muted">{isRest ? 'Recover & recharge' : `${day!.exercises.length} exercises`}</div>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-faint">Tap a day to customize it.</p>
      </section>

      <EditDayModal day={editing} onClose={() => setEditing(null)} />
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset to the beginner plan?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await resetWorkoutPlan()
                setConfirmReset(false)
                toast('Plan reset')
              }}
            >
              Reset plan
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Your customizations will be replaced. Workout history is kept.</p>
      </Modal>
    </>
  )
}
