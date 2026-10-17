import clsx from 'clsx'
import { AlarmClock, Info, Play, Plus, Settings2, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createAlarm, deleteAlarm, updateAlarm } from '../db/actions'
import { updateSettings, useSettings } from '../db/settings'
import type { Alarm, AlarmSound } from '../db/types'
import { ALARM_SOUNDS, describeDays, formatAlarmTime, formatIn, nextOccurrence } from '../lib/alarms'
import { previewAlarmSound } from '../lib/audio'
import { WEEKDAY_SHORT, orderedWeekdays } from '../lib/dates'
import { useNow } from '../lib/hooks'
import { useAlarms } from '../state/alarms'
import { useToast } from '../state/toast'
import { Button, Card, Field, Input, Modal, SectionTitle, Toggle } from './ui'

const PRESETS: { label: string; days: number[] }[] = [
  { label: 'Once', days: [] },
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [0, 6] },
]

const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x))

/** Plays a short sample; only one preview at a time. */
function usePreview() {
  const stopRef = useRef<(() => void) | null>(null)
  const [playing, setPlaying] = useState<AlarmSound | null>(null)
  useEffect(() => () => stopRef.current?.(), [])
  const toggle = (sound: AlarmSound, volume: number) => {
    stopRef.current?.()
    stopRef.current = null
    if (playing === sound) return setPlaying(null)
    stopRef.current = previewAlarmSound(sound, volume)
    setPlaying(sound)
    window.setTimeout(() => setPlaying((p) => (p === sound ? null : p)), 2800)
  }
  const stop = () => {
    stopRef.current?.()
    stopRef.current = null
    setPlaying(null)
  }
  return { playing, toggle, stop }
}

function SoundPicker({ value, onChange, volume }: { value: AlarmSound; onChange: (s: AlarmSound) => void; volume: number }) {
  const preview = usePreview()
  return (
    <div className="space-y-1.5" role="radiogroup" aria-label="Alarm sound">
      {ALARM_SOUNDS.map((s) => (
        <div
          key={s.id}
          className={clsx('flex items-center gap-2 rounded-2xl border px-3 py-2 transition', value === s.id ? 'border-brand/50 bg-brand-soft/60' : 'border-line')}
        >
          <button type="button" role="radio" aria-checked={value === s.id} onClick={() => onChange(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className={clsx('h-4 w-4 shrink-0 rounded-full border-2', value === s.id ? 'border-brand bg-brand' : 'border-line')} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{s.name}</span>
              <span className="block text-xs text-muted">{s.hint}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label={preview.playing === s.id ? `Stop ${s.name} preview` : `Preview ${s.name}`}
            onClick={() => preview.toggle(s.id, volume)}
            className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-brand"
          >
            {preview.playing === s.id ? <Square size={14} /> : <Play size={14} />}
          </button>
        </div>
      ))}
    </div>
  )
}

interface Draft {
  time: string
  label: string
  days: number[]
  sound: AlarmSound
}

function AlarmForm({ open, onClose, alarm }: { open: boolean; onClose: () => void; alarm?: Alarm }) {
  const settings = useSettings()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft>({ time: '07:00', label: '', days: [], sound: settings.alarmSound })
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const key = open ? (alarm?.id ?? 'new') : null
  if (key !== loadedFor) {
    setLoadedFor(key)
    if (open) setDraft(alarm ? { time: alarm.time, label: alarm.label, days: alarm.days, sound: alarm.sound } : { time: '07:00', label: '', days: [], sound: settings.alarmSound })
  }
  const valid = /^\d{2}:\d{2}$/.test(draft.time)

  const save = async () => {
    if (!valid) return
    const payload = { time: draft.time, label: draft.label.trim(), days: [...draft.days].sort(), sound: draft.sound }
    if (alarm) await updateAlarm(alarm.id, { ...payload, enabled: true })
    else await createAlarm(payload)
    // Count the current minute too: an alarm set for "now" rings right away.
    const tmp = { ...payload, id: '', enabled: true, createdAt: Date.now(), armedAt: Date.now() } as Alarm
    const next = nextOccurrence(tmp, new Date(Math.floor(Date.now() / 60_000) * 60_000 - 1))
    toast(next ? `Alarm set — rings ${formatIn(next.getTime() - Date.now())}` : 'Alarm saved', { tone: 'success' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={alarm ? 'Edit alarm' : 'New alarm'}
      footer={
        <>
          {alarm && (
            <Button
              variant="ghost"
              className="mr-auto text-bad"
              icon={<Trash2 size={15} />}
              onClick={async () => {
                await deleteAlarm(alarm.id)
                toast('Alarm deleted')
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={save}>
            {alarm ? 'Save' : 'Set alarm'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex justify-center">
          <input
            type="time"
            aria-label="Alarm time"
            value={draft.time}
            required
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            className="tabular rounded-3xl border border-line bg-surface-2/60 px-6 py-3 text-center font-display text-5xl font-extrabold text-ink outline-none focus:border-brand"
          />
        </div>
        <Field label="Label">
          {(id) => <Input id={id} value={draft.label} maxLength={60} placeholder="e.g. Wake up, Study time, Take a break" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />}
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-medium">Repeat</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDraft({ ...draft, days: p.days })}
                className={clsx(
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  sameDays(draft.days, p.days) ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-ink',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {orderedWeekdays(settings.weekStartsOn).map((d) => {
              const on = draft.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d] })}
                  className={clsx('rounded-xl py-2 text-xs font-semibold transition', on ? 'bg-brand text-white' : 'bg-surface-2 text-muted hover:text-ink')}
                >
                  {WEEKDAY_SHORT[d]}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted">{describeDays(draft.days)}</p>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">Sound</div>
          <SoundPicker value={draft.sound} onChange={(sound) => setDraft({ ...draft, sound })} volume={settings.alarmVolume} />
        </div>
      </div>
    </Modal>
  )
}

function AlarmSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings()
  return (
    <Modal open={open} onClose={onClose} title="Alarm settings" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span>Volume</span>
          <input
            type="range"
            aria-label="Alarm volume"
            min={0.1}
            max={1}
            step={0.05}
            value={s.alarmVolume}
            onChange={(e) => void updateSettings({ alarmVolume: Number(e.target.value) })}
            className="w-40"
          />
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <div>
            <div>Gentle start</div>
            <div className="text-xs text-muted">Begin softly and grow louder over 30 seconds</div>
          </div>
          <Toggle label="Gentle start" checked={s.alarmGentleStart} onChange={(v) => void updateSettings({ alarmGentleStart: v })} />
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span>Snooze length</span>
          <select
            aria-label="Snooze length"
            value={s.snoozeMinutes}
            onChange={(e) => void updateSettings({ snoozeMinutes: Number(e.target.value) })}
            className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm"
          >
            {[1, 3, 5, 9, 10, 15, 20, 30].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <div>
            <div>Countdown timers ring like an alarm</div>
            <div className="text-xs text-muted">Keeps ringing until you stop it, instead of a single chime</div>
          </div>
          <Toggle label="Countdown timers ring like an alarm" checked={s.timerAlarm} onChange={(v) => void updateSettings({ timerAlarm: v })} />
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">Default sound</div>
          <SoundPicker value={s.alarmSound} onChange={(alarmSound) => void updateSettings({ alarmSound })} volume={s.alarmVolume} />
        </div>
      </div>
    </Modal>
  )
}

export function AlarmsSection() {
  const { alarms } = useAlarms()
  const now = useNow(true, 15_000)
  const [form, setForm] = useState<{ open: boolean; alarm?: Alarm }>({ open: false })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time))
  const upcoming = sorted
    .map((a) => ({ a, next: nextOccurrence(a, new Date(now)) }))
    .filter((x): x is { a: Alarm; next: Date } => x.next !== null)
    .sort((x, y) => x.next.getTime() - y.next.getTime())[0]

  return (
    <Card>
      <SectionTitle
        action={
          <div className="flex items-center gap-1">
            <button aria-label="Alarm settings" onClick={() => setSettingsOpen(true)} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink">
              <Settings2 size={17} />
            </button>
            <Button size="sm" icon={<Plus size={15} />} onClick={() => setForm({ open: true })}>
              New alarm
            </Button>
          </div>
        }
      >
        Alarms
      </SectionTitle>

      {upcoming && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-soft/60 px-4 py-3 text-sm">
          <AlarmClock size={18} className="shrink-0 text-brand" />
          <span>
            Next alarm <b>{formatIn(upcoming.next.getTime() - now)}</b>
            {upcoming.a.label && <span className="text-muted"> · {upcoming.a.label}</span>}
            {upcoming.a.snoozeUntil && upcoming.a.snoozeUntil > now && <span className="text-muted"> (snoozed)</span>}
          </span>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="py-8 text-center">
          <div className="text-4xl">⏰</div>
          <p className="mt-2 text-sm text-muted">No alarms yet. Set one to wake up, start studying, or take a break.</p>
          <Button className="mt-4" variant="soft" icon={<Plus size={15} />} onClick={() => setForm({ open: true })}>
            Set an alarm
          </Button>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sorted.map((a) => {
            const t = formatAlarmTime(a.time)
            const next = nextOccurrence(a, new Date(now))
            return (
              <li key={a.id} className={clsx('flex items-center gap-3 rounded-2xl border border-line px-4 py-3 transition', !a.enabled && 'opacity-60')}>
                <button onClick={() => setForm({ open: true, alarm: a })} className="min-w-0 flex-1 text-left" aria-label={`Edit alarm ${a.time} ${a.label}`}>
                  <div className="tabular font-display text-3xl font-extrabold leading-none">
                    {t.main}
                    {t.suffix && <span className="ml-1 text-sm font-semibold text-muted">{t.suffix}</span>}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted">
                    {[a.label, describeDays(a.days), next && a.enabled ? formatIn(next.getTime() - now) : null].filter(Boolean).join(' · ')}
                  </div>
                </button>
                <Toggle label={`Alarm ${a.time} ${a.enabled ? 'on' : 'off'}`} checked={a.enabled} onChange={(v) => void updateAlarm(a.id, { enabled: v })} />
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-faint">
        <Info size={13} className="mt-0.5 shrink-0" />
        Alarms ring while Elvora is open — a background tab or the installed app is fine. Browsers can't wake a closed web app, so keep it open for
        important alarms, and turn on notifications in Settings.
      </p>

      <AlarmForm open={form.open} alarm={form.alarm} onClose={() => setForm({ open: false })} />
      <AlarmSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Card>
  )
}
