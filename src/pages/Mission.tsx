import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRightCircle, ChevronLeft, ChevronRight, Moon, Pencil, Plus, Trash2, Undo2, Waves } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Menu } from '../components/Menu'
import { MissionRow, PRIORITY_STYLE, useMission } from '../components/mission'
import { Button, Card, Field, Input, Modal, PageHeader, ProgressRing, Segmented } from '../components/ui'
import { addTask, deleteTask, letGoTasks, moveTasks, updateTask } from '../db/actions'
import { usePendingBefore, useReflectedDates } from '../db/queries'
import { useSettings } from '../db/settings'
import type { Priority, Task } from '../db/types'
import { prettyDay, shiftDay } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { COMFORTABLE_TASKS, encouragement } from '../lib/mission'
import { useTimers } from '../state/timers'
import { useToast } from '../state/toast'

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

function AddTaskForm({ date }: { date: string }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const submit = async () => {
    if (!title.trim()) return
    await addTask({ title, date, priority })
    setTitle('')
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a mission… e.g. Finish chapter 3"
        aria-label="New mission"
        maxLength={140}
        className="sm:flex-1"
      />
      <div className="flex gap-2">
        <Segmented value={priority} onChange={setPriority} options={PRIORITIES} className="flex-1 sm:flex-none" />
        <Button type="submit" icon={<Plus size={16} />} disabled={!title.trim()}>
          Add
        </Button>
      </div>
    </form>
  )
}

function EditTaskModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Task | null>(task)
  if (task && draft?.id !== task.id) setDraft(task)
  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      title="Edit mission"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!draft?.title.trim()}
            onClick={async () => {
              if (!draft) return
              await updateTask(draft.id, {
                title: draft.title.trim(),
                priority: draft.priority,
                focusMinutes: draft.focusMinutes || undefined,
                date: draft.date,
              })
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {draft && (
        <div className="space-y-4">
          <Field label="Mission">
            {(id) => <Input id={id} value={draft.title} maxLength={140} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}
          </Field>
          <Field label="Priority">
            {() => <Segmented value={draft.priority} options={PRIORITIES} onChange={(p) => setDraft({ ...draft, priority: p })} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              {(id) => (
                <Input id={id} type="date" value={draft.date} onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })} />
              )}
            </Field>
            <Field label="Planned focus (min)" hint="Optional">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={600}
                  value={draft.focusMinutes ?? ''}
                  onChange={(e) => setDraft({ ...draft, focusMinutes: e.target.value ? Number(e.target.value) : undefined })}
                />
              )}
            </Field>
          </div>
        </div>
      )}
    </Modal>
  )
}

function CarryForwardModal({ open, onClose, tasks, today }: { open: boolean; onClose: () => void; tasks: Task[]; today: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toast = useToast()
  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id))
  const ids = [...selected].filter((id) => tasks.some((t) => t.id === id))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unfinished from earlier"
      footer={
        <>
          <Button
            variant="ghost"
            disabled={!ids.length}
            onClick={async () => {
              await letGoTasks(ids)
              toast(`Let go of ${ids.length} task${ids.length > 1 ? 's' : ''}. That's okay.`)
              setSelected(new Set())
            }}
          >
            Let go
          </Button>
          <Button
            disabled={!ids.length}
            icon={<ArrowRightCircle size={16} />}
            onClick={async () => {
              await moveTasks(ids, today)
              toast(`Brought ${ids.length} into today`, { tone: 'success' })
              setSelected(new Set())
            }}
          >
            Bring to today
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Unfinished doesn't mean failed. Choose what still matters — bring it into today, or let it go with no guilt.
      </p>
      <button
        className="mb-2 text-sm font-medium text-brand"
        onClick={() => setSelected(allSelected ? new Set() : new Set(tasks.map((t) => t.id)))}
      >
        {allSelected ? 'Clear selection' : 'Select all'}
      </button>
      <div className="space-y-2">
        {tasks.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line px-3 py-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={selected.has(t.id)}
              onChange={(e) => {
                const next = new Set(selected)
                if (e.target.checked) next.add(t.id)
                else next.delete(t.id)
                setSelected(next)
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.title}</div>
              <div className="text-xs text-muted">
                {prettyDay(t.date, today)} · <span className={PRIORITY_STYLE[t.priority].text}>{PRIORITY_STYLE[t.priority].label}</span>
                {t.carryCount > 1 && ` · carried ${t.carryCount}×`}
              </div>
            </div>
          </label>
        ))}
      </div>
    </Modal>
  )
}

export default function MissionPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? today
  const isToday = date === today
  const mission = useMission(date)
  const pending = usePendingBefore(today) ?? []
  const reflected = useReflectedDates()
  const settings = useSettings()
  const navigate = useNavigate()
  const timers = useTimers()
  const toast = useToast()
  const [editing, setEditing] = useState<Task | null>(null)
  const [carryOpen, setCarryOpen] = useState(false)

  const go = (d: string) => setParams(d === today ? {} : { date: d })
  const title = isToday ? "Today's Mission" : date === shiftDay(today, 1) ? "Tomorrow's Mission" : `Mission · ${prettyDay(date, today)}`

  if (!mission) return null
  const { items, progress, tasks } = mission
  const taskItems = items.filter((i) => i.kind === 'task')
  const habitItems = items.filter((i) => i.kind === 'habit')
  const otherItems = items.filter((i) => i.kind === 'workout' || i.kind === 'focus')
  const openTasks = tasks.filter((t) => !t.done && !t.dismissed).length
  const eveningNow = new Date().getHours() >= settings.reflectionHour
  const hasReflected = reflected?.has(date)

  const taskById = (id?: string) => tasks.find((t) => t.id === id)

  return (
    <>
      <PageHeader
        title={title}
        subtitle={isToday ? 'Your command center for today — small steps count.' : 'Plan ahead, gently. You can always adjust.'}
        actions={
          <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface p-1">
            <button aria-label="Previous day" className="rounded-xl p-2 text-muted hover:bg-surface-2" onClick={() => go(shiftDay(date, -1))}>
              <ChevronLeft size={16} />
            </button>
            <button className="min-w-24 rounded-xl px-2 py-1.5 text-sm font-semibold" onClick={() => go(today)}>
              {prettyDay(date, today)}
            </button>
            <button aria-label="Next day" className="rounded-xl p-2 text-muted hover:bg-surface-2" onClick={() => go(shiftDay(date, 1))}>
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <AnimatePresence>
            {isToday && pending.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-warn/30 bg-warn-soft px-4 py-3">
                  <Undo2 size={18} className="text-warn" />
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{pending.length} unfinished</span> from earlier days. Bring them forward or let them go.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => setCarryOpen(true)}>
                    Review
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Card className="space-y-4">
            <AddTaskForm date={date} />
            {openTasks > COMFORTABLE_TASKS && (
              <p className="rounded-2xl bg-surface-2 px-4 py-2.5 text-xs text-muted">
                That's a full plate ({openTasks} open). Consider marking your top 3 as <b>High</b> and moving the rest to tomorrow — progress
                beats pressure.
              </p>
            )}
          </Card>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Missions</h2>
            {taskItems.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                No missions yet. What's one thing that would make {isToday ? 'today' : 'that day'} feel good?
              </p>
            ) : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {taskItems.map((item) => {
                    const t = taskById(item.refId)
                    return (
                      <MissionRow
                        key={item.key}
                        item={item}
                        date={date}
                        trailing={
                          t && (
                            <Menu
                              actions={[
                                { label: 'Edit', icon: <Pencil size={15} />, onClick: () => setEditing(t) },
                                {
                                  label: 'Focus on this',
                                  icon: <Waves size={15} />,
                                  onClick: () => {
                                    if (!timers.pomodoro.running) timers.setPomodoroMeta({ label: t.title, taskId: t.id, habitId: undefined })
                                    navigate('/focus')
                                  },
                                },
                                {
                                  label: isToday ? 'Move to tomorrow' : 'Move to next day',
                                  icon: <ArrowRightCircle size={15} />,
                                  onClick: async () => {
                                    await moveTasks([t.id], shiftDay(date, 1))
                                    toast('Moved — future you has it covered.', {
                                      action: { label: 'Undo', onClick: () => void updateTask(t.id, { date: t.date, carriedFrom: t.carriedFrom, carryCount: t.carryCount }) },
                                    })
                                  },
                                },
                                {
                                  label: 'Delete',
                                  icon: <Trash2 size={15} />,
                                  danger: true,
                                  onClick: async () => {
                                    await deleteTask(t.id)
                                    toast('Mission deleted')
                                  },
                                },
                              ]}
                            />
                          )
                        }
                      />
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </section>

          {habitItems.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Habits</h2>
              <div className="space-y-2">
                {habitItems.map((item) => (
                  <MissionRow key={item.key} item={item} date={date} />
                ))}
              </div>
            </section>
          )}

          {otherItems.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Body & mind</h2>
              <div className="space-y-2">
                {otherItems.map((item) => (
                  <MissionRow key={item.key} item={item} date={date} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-10 lg:self-start">
          <Card className="flex flex-col items-center text-center">
            <ProgressRing value={progress.ratio} size={150} stroke={12}>
              <span className="tabular text-3xl font-extrabold">{Math.round(progress.ratio * 100)}%</span>
              <span className="text-xs text-muted">
                {progress.done} of {progress.total} done
              </span>
            </ProgressRing>
            <p className="mt-4 text-sm text-muted">{encouragement(progress.ratio, progress.total)}</p>
          </Card>

          {isToday && (
            <Card className={clsx('relative overflow-hidden', eveningNow && !hasReflected && 'border-brand/40')}>
              <div className="brand-gradient pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                  <Moon size={18} />
                </div>
                <div>
                  <h3 className="font-bold">{hasReflected ? 'Reflected today ✓' : 'Evening reflection'}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {hasReflected
                      ? 'You can revisit or add to it anytime.'
                      : 'Three gentle questions to close the day and shape tomorrow. Optional, always.'}
                  </p>
                  <Link to="/reflect" className="mt-3 inline-block">
                    <Button size="sm" variant={eveningNow && !hasReflected ? 'primary' : 'soft'}>
                      {hasReflected ? 'Open reflection' : 'Reflect on today'}
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {isToday && (
            <button
              onClick={() => go(shiftDay(today, 1))}
              className="w-full rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted transition hover:border-brand hover:text-brand"
            >
              Plan tomorrow →
            </button>
          )}
        </aside>
      </div>

      <EditTaskModal task={editing} onClose={() => setEditing(null)} />
      <CarryForwardModal open={carryOpen && pending.length > 0} onClose={() => setCarryOpen(false)} tasks={pending} today={today} />
    </>
  )
}

