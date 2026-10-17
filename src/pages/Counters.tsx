import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Menu } from '../components/Menu'
import { Button, EmptyState, Field, Input, Modal, PageHeader, ProgressRing } from '../components/ui'
import { counterDays, createCounter, deleteCounter, resetCounter, updateCounter } from '../db/actions'
import { db } from '../db/db'
import type { Counter } from '../db/types'
import { nextMilestone } from '../lib/achievements'
import { prettyDay } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { useToast } from '../state/toast'

const EMOJIS = ['🎯', '🚭', '🍬', '🍺', '📵', '🏋️', '📖', '💻', '🧘', '🌅', '💧', '❤️']

interface Draft {
  title: string
  emoji: string
  startDate: string
  goalDays: string
}

function CounterForm({ open, onClose, counter, today }: { open: boolean; onClose: () => void; counter?: Counter; today: string }) {
  const [draft, setDraft] = useState<Draft>({ title: '', emoji: '🎯', startDate: today, goalDays: '' })
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const key = open ? (counter?.id ?? 'new') : null
  if (key !== loadedFor) {
    setLoadedFor(key)
    if (open)
      setDraft(
        counter
          ? { title: counter.title, emoji: counter.emoji, startDate: counter.startDate, goalDays: counter.goalDays ? String(counter.goalDays) : '' }
          : { title: '', emoji: '🎯', startDate: today, goalDays: '' },
      )
  }
  const valid = draft.title.trim() && draft.startDate && draft.startDate <= today

  const save = async () => {
    if (!valid) return
    const payload = {
      title: draft.title.trim(),
      emoji: draft.emoji,
      startDate: draft.startDate,
      goalDays: Number(draft.goalDays) > 0 ? Math.round(Number(draft.goalDays)) : undefined,
    }
    if (counter) await updateCounter(counter.id, payload)
    else await createCounter(payload)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={counter ? 'Edit counter' : 'New day counter'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={save}>
            {counter ? 'Save' : 'Start counting'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What are you counting?">
          {(id) => <Input id={id} autoFocus value={draft.title} maxLength={60} placeholder="e.g. No sugar, Daily coding, Sober" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              aria-label={`Icon ${e}`}
              onClick={() => setDraft({ ...draft, emoji: e })}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${draft.emoji === e ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface-2'}`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Started on" hint="Can be in the past">
            {(id) => <Input id={id} type="date" max={today} value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />}
          </Field>
          <Field label="Goal (days)" hint="Optional">
            {(id) => <Input id={id} type="number" min={1} max={10000} placeholder="e.g. 30" value={draft.goalDays} onChange={(e) => setDraft({ ...draft, goalDays: e.target.value })} />}
          </Field>
        </div>
      </div>
    </Modal>
  )
}

export default function CountersPage() {
  const today = useToday()
  const toast = useToast()
  const counters = useLiveQuery(() => db.counters.toArray().then((c) => c.sort((a, b) => a.createdAt - b.createdAt)), [])
  const [form, setForm] = useState<{ open: boolean; counter?: Counter }>({ open: false })
  const [resetting, setResetting] = useState<Counter | null>(null)
  const [deleting, setDeleting] = useState<Counter | null>(null)

  if (!counters) return null

  return (
    <>
      <PageHeader
        title="Day Counters"
        subtitle="Count the days you've been showing up — or staying away from something."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setForm({ open: true })}>
            New counter
          </Button>
        }
      />
      {counters.length === 0 ? (
        <EmptyState
          emoji="📅"
          title="No counters yet"
          text="Track how long you've kept a goal going: days without sugar, days of learning, days since you started."
          action={<Button onClick={() => setForm({ open: true })}>Start a counter</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {counters.map((c) => {
            const days = counterDays(c, today)
            const target = c.goalDays && days < c.goalDays ? c.goalDays : nextMilestone(days)
            const goalReached = c.goalDays !== undefined && days >= c.goalDays
            return (
              <motion.div key={c.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative rounded-3xl border border-line bg-surface p-5 shadow-soft">
                <div className="absolute right-3 top-3">
                  <Menu
                    actions={[
                      { label: 'Edit', icon: <Pencil size={15} />, onClick: () => setForm({ open: true, counter: c }) },
                      { label: 'Start over', icon: <RotateCcw size={15} />, onClick: () => setResetting(c) },
                      { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => setDeleting(c) },
                    ]}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <ProgressRing value={days / target} size={104} stroke={8}>
                    <span className="text-xs text-muted">Day</span>
                    <span className="tabular -mt-0.5 text-3xl font-extrabold">{days}</span>
                  </ProgressRing>
                  <div className="min-w-0 pr-6">
                    <div className="text-2xl">{c.emoji}</div>
                    <div className="truncate font-bold">{c.title}</div>
                    <div className="text-xs text-muted">Since {prettyDay(c.startDate, today)}</div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl bg-surface-2 px-3 py-2 text-xs text-muted">
                  {goalReached ? (
                    <span className="font-semibold text-good">🎉 Goal of {c.goalDays} days reached! Next milestone: {nextMilestone(days)}.</span>
                  ) : (
                    <>
                      {target - days} day{target - days === 1 ? '' : 's'} to {c.goalDays && days < c.goalDays ? 'your goal' : 'the next milestone'} ({target})
                    </>
                  )}
                  {c.best > 0 && <span className="block">Previous best: {c.best} days</span>}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <CounterForm open={form.open} counter={form.counter} today={today} onClose={() => setForm({ open: false })} />
      <Modal
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title="Start over?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (resetting) await resetCounter(resetting.id, today)
                setResetting(null)
                toast('Day 1 again. Every restart is still progress. 💜')
              }}
            >
              Start from today
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Slips happen. Your {resetting ? counterDays(resetting, today) : 0} days still counted — they'll be saved as your best if it's a record.
        </p>
      </Modal>
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete counter?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (deleting) await deleteCounter(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">“{deleting?.title}” will be removed permanently.</p>
      </Modal>
    </>
  )
}
