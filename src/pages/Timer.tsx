import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { Flag, Pause, Play, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { AlarmsSection } from '../components/Alarms'
import { TimeStepper } from '../components/TimeStepper'
import { Button, Card, Input, PageHeader, SectionTitle, Toggle } from '../components/ui'
import { updateSettings, useSettings } from '../db/settings'
import { deleteSession } from '../db/actions'
import { db } from '../db/db'
import { useHabits } from '../db/queries'
import type { Habit, Session } from '../db/types'
import { formatClock, formatDuration, parseDay, shiftDay, WEEKDAY_SHORT } from '../lib/dates'
import { useNow, useToday } from '../lib/hooks'
import { MAX_TIMER_MS, MIN_STEP_MS, countdownRemaining, stopwatchElapsed, useTimers } from '../state/timers'
import { useToast } from '../state/toast'
import { format } from 'date-fns'

const PRESETS = [1, 5, 10, 15, 20, 30, 45, 60]

function ActivityPicker({
  label,
  habitId,
  habits,
  onChange,
  disabled,
}: {
  label: string
  habitId?: string
  habits: Habit[]
  onChange: (meta: { label?: string; habitId?: string }) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Input value={label} disabled={disabled} maxLength={60} placeholder="Activity (e.g. Reading)" aria-label="Activity name" onChange={(e) => onChange({ label: e.target.value })} />
      <select
        aria-label="Link to habit"
        disabled={disabled}
        value={habitId ?? ''}
        onChange={(e) => {
          const h = habits.find((x) => x.id === e.target.value)
          onChange({ habitId: e.target.value || undefined, label: label || h?.name })
        }}
        className="h-11 rounded-2xl border border-line bg-surface-2/60 px-4 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
      >
        <option value="">No habit link</option>
        {habits.map((h) => (
          <option key={h.id} value={h.id}>
            {h.emoji} {h.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function StopwatchCard({ habits }: { habits: Habit[] }) {
  const t = useTimers()
  const sw = t.stopwatch
  const now = useNow(sw.running, 50)
  const elapsed = stopwatchElapsed(sw, now)
  const toast = useToast()
  const cs = Math.floor((elapsed % 1000) / 10)

  return (
    <Card className="flex flex-col">
      <SectionTitle>Stopwatch</SectionTitle>
      <div className="my-6 text-center">
        <span className="tabular font-display text-5xl font-extrabold sm:text-6xl">{formatClock(elapsed, elapsed >= 3_600_000)}</span>
        <span className="tabular ml-1 text-2xl font-bold text-faint">.{String(cs).padStart(2, '0')}</span>
      </div>
      <ActivityPicker label={sw.label} habitId={sw.habitId} habits={habits} onChange={t.swMeta} />
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {sw.running ? (
          <Button onClick={t.swPause} icon={<Pause size={16} />}>
            Pause
          </Button>
        ) : (
          <Button onClick={t.swStart} icon={<Play size={16} />}>
            {elapsed > 0 ? 'Resume' : 'Start'}
          </Button>
        )}
        <Button variant="secondary" onClick={t.swLap} disabled={!sw.running} icon={<Flag size={16} />}>
          Lap
        </Button>
        <Button variant="secondary" onClick={t.swReset} disabled={elapsed === 0} icon={<RotateCcw size={16} />}>
          Reset
        </Button>
        <Button
          variant="soft"
          disabled={elapsed < 1000}
          icon={<Save size={16} />}
          onClick={async () => {
            const sec = await t.swSave()
            toast(`Saved ${formatDuration(sec)}${sw.habitId ? ' · habit checked off' : ''}`, { tone: 'success' })
          }}
        >
          Save session
        </Button>
      </div>
      {sw.laps.length > 0 && (
        <ol className="mt-4 max-h-40 space-y-1 overflow-y-auto text-sm">
          {sw.laps
            .map((lap, i) => ({ lap, i, split: lap - (sw.laps[i - 1] ?? 0) }))
            .reverse()
            .map(({ lap, i, split }) => (
              <li key={i} className="tabular flex justify-between rounded-xl bg-surface-2 px-3 py-1.5">
                <span className="text-muted">Lap {i + 1}</span>
                <span>+{formatClock(split)}</span>
                <span className="font-semibold">{formatClock(lap)}</span>
              </li>
            ))}
        </ol>
      )}
    </Card>
  )
}

function CountdownCard({ habits }: { habits: Habit[] }) {
  const t = useTimers()
  const settings = useSettings()
  const cd = t.countdown
  const now = useNow(cd.running, 250)
  const remaining = countdownRemaining(cd, now)
  const [custom, setCustom] = useState('')
  const started = cd.running || remaining < cd.durationMs

  return (
    <Card className="flex flex-col">
      <SectionTitle>Timer</SectionTitle>
      <div className="my-2 text-center">
        <TimeStepper
          label="Timer length"
          minutes={Math.round(cd.durationMs / 60_000)}
          onAdjust={t.cdAdjust}
          canDecrease={Boolean(cd.finishedAt) || remaining > MIN_STEP_MS}
          canIncrease={cd.durationMs < MAX_TIMER_MS}
        >
          <span className={clsx('tabular font-display text-5xl font-extrabold sm:text-6xl', cd.finishedAt && 'text-good')}>
            {cd.finishedAt ? 'Done!' : formatClock(remaining, cd.durationMs >= 3_600_000)}
          </span>
        </TimeStepper>
        <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-surface-2">
          <div className="brand-gradient h-full rounded-full transition-[width] duration-300" style={{ width: `${(1 - remaining / cd.durationMs) * 100}%` }} />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap justify-center gap-1.5">
        {PRESETS.map((m) => (
          <button
            key={m}
            disabled={cd.running}
            onClick={() => t.cdSet(m * 60_000)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-40',
              cd.durationMs === m * 60_000 ? 'bg-brand text-white' : 'bg-surface-2 text-muted hover:text-ink',
            )}
          >
            {m}m
          </button>
        ))}
        <form
          className="flex"
          onSubmit={(e) => {
            e.preventDefault()
            const m = Number(custom)
            if (m > 0 && m <= 600) {
              t.cdSet(Math.round(m * 60_000))
              setCustom('')
            }
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))}
            disabled={cd.running}
            placeholder="min"
            aria-label="Custom minutes"
            className="h-7 w-14 rounded-full bg-surface-2 px-3 text-center text-xs outline-none focus:ring-2 focus:ring-brand/40"
          />
        </form>
      </div>
      <ActivityPicker label={cd.label} habitId={cd.habitId} habits={habits} onChange={t.cdMeta} disabled={cd.running} />
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {cd.running ? (
          <Button onClick={t.cdPause} icon={<Pause size={16} />}>
            Pause
          </Button>
        ) : (
          <Button onClick={t.cdStart} icon={<Play size={16} />}>
            {cd.finishedAt ? 'Restart' : started ? 'Resume' : 'Start'}
          </Button>
        )}
        <Button variant="secondary" onClick={t.cdReset} disabled={!started && !cd.finishedAt} icon={<RotateCcw size={16} />}>
          Reset
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted">
        <span>Ring until stopped</span>
        <Toggle label="Ring until stopped" checked={settings.timerAlarm} onChange={(v) => void updateSettings({ timerAlarm: v })} />
      </div>
      <p className="mt-3 text-center text-xs text-faint">Use the arrows (or ↑/↓ on the time) to adjust · finished timers are logged automatically.</p>
    </Card>
  )
}

function WeekBreakdown({ sessions, today }: { sessions: Session[]; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6))
  const perDay = days.map((d) => sessions.filter((s) => s.date === d).reduce((a, s) => a + s.durationSec, 0))
  const max = Math.max(1, ...perDay)
  const byLabel = new Map<string, number>()
  sessions.forEach((s) => byLabel.set(s.label, (byLabel.get(s.label) ?? 0) + s.durationSec))
  const top = [...byLabel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const total = perDay.reduce((a, b) => a + b, 0)

  return (
    <Card>
      <SectionTitle>Last 7 days · {formatDuration(total)}</SectionTitle>
      <div className="flex items-end gap-2">
        {days.map((d, i) => (
          <div key={d} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="tabular h-4 text-[10px] text-muted">{perDay[i] ? formatDuration(perDay[i]) : ''}</span>
            <div className="relative h-24 w-full overflow-hidden rounded-lg bg-surface-2/60">
              <div
                className={clsx('absolute inset-x-0 bottom-0 rounded-lg transition-all', d === today ? 'brand-gradient' : 'bg-brand/40')}
                style={{ height: perDay[i] ? `${Math.max(6, (perDay[i] / max) * 100)}%` : 0 }}
                title={`${d}: ${formatDuration(perDay[i])}`}
              />
            </div>
            <span className={clsx('text-[11px] font-medium', d === today ? 'text-brand' : 'text-faint')}>{WEEKDAY_SHORT[parseDay(d).getDay()]}</span>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <div className="mt-5 space-y-2">
          {top.map(([label, sec]) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              <span className="w-28 truncate text-muted sm:w-40">{label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="brand-gradient h-full rounded-full" style={{ width: `${(sec / top[0][1]) * 100}%` }} />
              </div>
              <span className="tabular w-14 text-right text-xs font-semibold">{formatDuration(sec)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function TimerPage() {
  const habits = useHabits() ?? []
  const today = useToday()
  const toast = useToast()
  const sessions = useLiveQuery(() => db.sessions.where('date').between(shiftDay(today, -6), today, true, true).toArray(), [today]) ?? []
  const todays = sessions.filter((s) => s.date === today).sort((a, b) => b.start - a.start)

  return (
    <>
      <PageHeader title="Timers & Alarms" subtitle="Track time spent on anything and set alarms. Timers keep running even if you switch pages or close the app." />
      <div className="grid gap-6 lg:grid-cols-2">
        <StopwatchCard habits={habits} />
        <CountdownCard habits={habits} />
      </div>
      <div className="mt-6">
        <AlarmsSection />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <WeekBreakdown sessions={sessions} today={today} />
        <Card>
          <SectionTitle>Today's sessions</SectionTitle>
          {todays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No sessions yet today.</p>
          ) : (
            <ul className="space-y-1.5">
              {todays.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-surface-2/60 px-3 py-2 text-sm">
                  <span className="rounded-lg bg-brand-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">{s.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <span className="text-xs text-muted">{format(s.start, 'HH:mm')}</span>
                  <span className="tabular w-14 text-right font-semibold">{formatDuration(s.durationSec)}</span>
                  <button
                    aria-label="Delete session"
                    className="p-1 text-faint hover:text-bad"
                    onClick={async () => {
                      await deleteSession(s.id)
                      toast('Session removed', { action: { label: 'Undo', onClick: () => void db.sessions.add(s) } })
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
