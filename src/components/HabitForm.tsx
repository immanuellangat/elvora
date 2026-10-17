import clsx from 'clsx'
import { useState } from 'react'
import { createHabit, updateHabit } from '../db/actions'
import type { Habit, HabitColor } from '../db/types'
import { HABIT_COLORS, HABIT_EMOJIS, HABIT_SUGGESTIONS } from '../lib/colors'
import { WEEKDAY_SHORT, orderedWeekdays } from '../lib/dates'
import { useSettings } from '../db/settings'
import { Button, Field, Input, Modal } from './ui'

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const WEEKDAYS = [1, 2, 3, 4, 5]

interface Draft {
  name: string
  emoji: string
  color: HabitColor
  days: number[]
  note: string
}

const empty: Draft = { name: '', emoji: '💪', color: 'violet', days: EVERY_DAY, note: '' }

export function HabitForm({ open, onClose, habit }: { open: boolean; onClose: () => void; habit?: Habit }) {
  const settings = useSettings()
  const [draft, setDraft] = useState<Draft>(empty)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const key = open ? (habit?.id ?? 'new') : null
  if (key !== loadedFor) {
    setLoadedFor(key)
    if (open) setDraft(habit ? { name: habit.name, emoji: habit.emoji, color: habit.color, days: habit.days, note: habit.note ?? '' } : empty)
  }

  const save = async () => {
    const payload = { name: draft.name.trim(), emoji: draft.emoji, color: draft.color, days: [...draft.days].sort(), note: draft.note.trim() || undefined }
    if (!payload.name || payload.days.length === 0) return
    if (habit) await updateHabit(habit.id, payload)
    else await createHabit(payload)
    onClose()
  }

  const preset = (days: number[]) => setDraft({ ...draft, days })
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? 'Edit habit' : 'New habit'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!draft.name.trim() || draft.days.length === 0}>
            {habit ? 'Save changes' : 'Create habit'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!habit && (
          <div className="flex flex-wrap gap-2">
            {HABIT_SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                onClick={() => setDraft({ ...draft, name: s.name, emoji: s.emoji, color: s.color })}
                className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition hover:border-brand hover:text-brand"
              >
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
        )}
        <Field label="Name" hint="Keep it small and specific — “Read 10 pages” beats “Read more”.">
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={draft.name}
              maxLength={60}
              placeholder="e.g. Morning stretch"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
            />
          )}
        </Field>

        <div>
          <div className="mb-1.5 text-sm font-medium">Icon</div>
          <div className="flex flex-wrap gap-1.5">
            {HABIT_EMOJIS.map((e) => (
              <button
                key={e}
                aria-label={`Icon ${e}`}
                onClick={() => setDraft({ ...draft, emoji: e })}
                className={clsx(
                  'flex h-10 w-10 items-center justify-center rounded-xl text-lg transition',
                  draft.emoji === e ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface-2 hover:bg-line',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium">Color</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(HABIT_COLORS) as HabitColor[]).map((c) => (
              <button
                key={c}
                aria-label={`Color ${c}`}
                onClick={() => setDraft({ ...draft, color: c })}
                className={clsx('h-8 w-8 rounded-full transition', draft.color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')}
                style={{ background: HABIT_COLORS[c] }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm font-medium">
            <span>Planned days</span>
            <span className="flex gap-2 text-xs">
              <button className={clsx(same(draft.days, EVERY_DAY) ? 'text-brand' : 'text-muted')} onClick={() => preset(EVERY_DAY)}>
                Every day
              </button>
              <button className={clsx(same(draft.days, WEEKDAYS) ? 'text-brand' : 'text-muted')} onClick={() => preset(WEEKDAYS)}>
                Weekdays
              </button>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {orderedWeekdays(settings.weekStartsOn).map((d) => {
              const on = draft.days.includes(d)
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d] })}
                  className={clsx(
                    'rounded-xl py-2 text-xs font-semibold transition',
                    on ? 'bg-brand text-white' : 'bg-surface-2 text-muted hover:text-ink',
                  )}
                >
                  {WEEKDAY_SHORT[d]}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted">Rest days never break your streak.</p>
        </div>

        <Field label="Why it matters (optional)">
          {(id) => (
            <Input id={id} value={draft.note} maxLength={120} placeholder="A reminder for tough days" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          )}
        </Field>
      </div>
    </Modal>
  )
}
