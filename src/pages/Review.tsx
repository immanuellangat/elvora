import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Lock, Minus, Pause, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { moodEmoji, useDecryptedEntries } from '../components/diary'
import { Card, PageHeader, SectionTitle } from '../components/ui'
import { db } from '../db/db'
import { useReflectedDates } from '../db/queries'
import { useSettings } from '../db/settings'
import type { DayKey, Mood } from '../db/types'
import { HABIT_COLORS } from '../lib/colors'
import { formatDuration, shiftDay, weekOf } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { parseTomorrowGoals } from '../lib/mission'
import { shortDay, weekInsights, weekLabel, weekStats, weekSummary, type CellState, type ReviewData, type WeekStats } from '../lib/review'
import { useDiary } from '../state/diaryLock'

function Delta({ cur, prev, format }: { cur: number; prev: number; format: (n: number) => string }) {
  if (prev <= 0 && cur <= 0) return <span className="text-xs text-faint">—</span>
  const diff = cur - prev
  if (Math.abs(diff) < 0.005 * Math.max(1, prev)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted">
        <Minus size={12} /> same as last week
      </span>
    )
  }
  // Gains are celebrated in green; dips stay neutral — never alarming red.
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-xs', diff > 0 ? 'text-good' : 'text-muted')}>
      {diff > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {diff > 0 ? '+' : '−'}
      {format(Math.abs(diff))} vs last week
    </span>
  )
}

function Tile({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-extrabold sm:text-3xl">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      <div className="mt-1">{children}</div>
    </Card>
  )
}

function FocusChart({ stats, today }: { stats: WeekStats; today: DayKey }) {
  const max = Math.max(25, ...stats.days.map((d) => d.focusMin))
  return (
    <Card>
      <SectionTitle>Focus time by day</SectionTitle>
      <div className="flex items-end gap-2" role="list" aria-label="Focus minutes per day">
        {stats.days.map((d) => {
          const best = stats.bestDay?.date === d.date
          const label = `${shortDay(d.date)}: ${d.future ? 'upcoming' : formatDuration(d.focusMin * 60)}`
          return (
            <div key={d.date} role="listitem" aria-label={label} title={label} className="group flex flex-1 flex-col items-center gap-1.5">
              <span className="tabular h-4 text-[10px] text-muted">{d.focusMin >= 1 ? formatDuration(d.focusMin * 60) : ''}</span>
              <div className="relative h-32 w-full rounded-lg bg-surface-2/60">
                <motion.div
                  className={clsx('absolute inset-x-0 bottom-0 rounded-t-[4px] group-hover:brightness-110', best ? 'brand-gradient' : 'bg-brand/50')}
                  initial={{ height: 0 }}
                  animate={{ height: d.focusMin >= 1 ? `${Math.max(4, (d.focusMin / max) * 100)}%` : 0 }}
                  transition={{ type: 'spring', stiffness: 90, damping: 18 }}
                />
              </div>
              <span className={clsx('text-[11px] font-medium', d.date === today ? 'text-brand' : 'text-faint')}>
                {best && <span aria-label="strongest day">★ </span>}
                {shortDay(d.date)}
              </span>
            </div>
          )
        })}
      </div>
      {stats.bestDay && <p className="mt-3 text-xs text-muted">★ marks your strongest day overall — habits, missions, workouts and focus combined.</p>}
    </Card>
  )
}

const CELL_LABEL: Record<CellState, string> = {
  done: 'done',
  skip: 'skipped',
  miss: 'missed',
  rest: 'rest day',
  pending: 'not yet',
  future: 'upcoming',
  before: 'not started yet',
}

function HabitMatrix({ stats, today }: { stats: WeekStats; today: DayKey }) {
  if (stats.habitRows.length === 0)
    return (
      <Card>
        <SectionTitle>Habits this week</SectionTitle>
        <p className="py-4 text-center text-sm text-muted">
          No habits yet. <Link to="/habits" className="font-medium text-brand">Create one</Link>
        </p>
      </Card>
    )
  return (
    <Card>
      <SectionTitle>Habits this week</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-separate border-spacing-y-1.5 text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-faint" scope="col">
                Habit
              </th>
              {stats.days.map((d) => (
                <th key={d.date} scope="col" className={clsx('w-9 text-center text-[11px] font-medium', d.date === today ? 'text-brand' : 'text-faint')}>
                  {shortDay(d.date).slice(0, 2)}
                </th>
              ))}
              <th className="w-12 text-right text-xs font-medium text-faint" scope="col">
                Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.habitRows.map((r) => (
              <tr key={r.habit.id}>
                <th scope="row" className="max-w-[9rem] truncate pr-2 text-left font-medium">
                  <Link to={`/habits/${r.habit.id}`} className="hover:text-brand">
                    {r.habit.emoji} {r.habit.name}
                  </Link>
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} className="text-center">
                    <span
                      title={`${stats.days[i].date}: ${CELL_LABEL[c]}`}
                      aria-label={`${r.habit.name} ${shortDay(stats.days[i].date)}: ${CELL_LABEL[c]}`}
                      className={clsx(
                        'mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold',
                        c === 'done' && 'text-white',
                        c === 'skip' && 'bg-surface-2 text-faint',
                        c === 'miss' && 'border-2 border-line',
                        c === 'pending' && 'border-2 border-dashed border-brand/40',
                        c === 'rest' && 'border border-dashed border-line',
                        (c === 'future' || c === 'before') && 'bg-surface-2/40',
                      )}
                      style={c === 'done' ? { background: HABIT_COLORS[r.habit.color] } : undefined}
                    >
                      {c === 'done' ? '✓' : c === 'skip' ? <Pause size={11} /> : ''}
                    </span>
                  </td>
                ))}
                <td className="tabular text-right text-xs font-semibold text-muted">{r.rate === null ? '—' : `${Math.round(r.rate * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-brand" /> Done
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="flex h-3 w-3 items-center justify-center rounded bg-surface-2">
            <Pause size={8} />
          </span>
          Skipped
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded border-2 border-line" /> Missed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-dashed border-line" /> Rest day
        </span>
      </div>
    </Card>
  )
}

function MoodChart({ stats, locked }: { stats: WeekStats; locked: boolean }) {
  const points = stats.days.map((d, i) => ({ i, d })).filter((p) => p.d.mood !== undefined)
  const w = 300
  const h = 110
  const x = (i: number) => 16 + (i * (w - 32)) / 6
  const y = (m: number) => h - 14 - ((m - 1) / 4) * (h - 34)
  return (
    <Card>
      <SectionTitle>Mood</SectionTitle>
      {points.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {locked ? (
            <>
              <Lock size={13} className="mr-1 inline" />
              <Link to="/diary" className="font-medium text-brand">Unlock your diary</Link> to include mood.
            </>
          ) : (
            'Log your mood in the diary or evening reflection to see it here.'
          )}
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" role="img" aria-label={`Mood this week, average ${stats.avgMood?.toFixed(1)} out of 5`}>
            <defs>
              <linearGradient id="review-mood" x1="0" x2="1">
                <stop offset="0" stopColor="#a78bfa" />
                <stop offset="1" stopColor="#e879f9" />
              </linearGradient>
            </defs>
            {[1, 3, 5].map((m) => (
              <line key={m} x1={8} x2={w - 8} y1={y(m)} y2={y(m)} stroke="var(--line)" strokeDasharray="3 4" strokeWidth={1} />
            ))}
            {points.length > 1 && (
              <path
                d={points.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.d.mood!)}`).join(' ')}
                fill="none"
                stroke="url(#review-mood)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {points.map((p) => (
              <g key={p.i}>
                <title>{`${shortDay(p.d.date)}: ${p.d.mood}/5`}</title>
                <circle cx={x(p.i)} cy={y(p.d.mood!)} r={11} fill="var(--surface)" stroke="var(--line)" strokeWidth={2} />
                <text x={x(p.i)} y={y(p.d.mood!) + 4.5} textAnchor="middle" fontSize="12">
                  {moodEmoji(p.d.mood)}
                </text>
              </g>
            ))}
          </svg>
          <div className="flex justify-between px-1 text-[10px] text-faint">
            {stats.days.map((d) => (
              <span key={d.date}>{shortDay(d.date).slice(0, 2)}</span>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

export default function ReviewPage() {
  const today = useToday()
  const settings = useSettings()
  const diary = useDiary()
  const [offset, setOffset] = useState(0)
  const thisWeek = weekOf(today, settings.weekStartsOn)
  const days = thisWeek.map((d) => shiftDay(d, offset * 7))
  const prevDays = days.map((d) => shiftDay(d, -7))
  const from = prevDays[0]
  const to = days[6]
  const isCurrent = offset === 0

  const raw = useLiveQuery(async () => {
    const [habits, logs, tasks, sessions, workoutDays, workoutLogs] = await Promise.all([
      db.habits.toArray(),
      db.habitLogs.where('date').between(from, to, true, true).toArray(),
      db.tasks.where('date').between(from, to, true, true).toArray(),
      db.sessions.where('date').between(from, to, true, true).toArray(),
      db.workoutDays.toArray(),
      db.workoutLogs.where('date').between(from, to, true, true).toArray(),
    ])
    return { habits, logs, tasks, sessions, workoutDays, workoutLogs }
  }, [from, to])
  const entries = useDecryptedEntries()
  const reflected = useReflectedDates()

  const result = useMemo(() => {
    if (!raw || !reflected) return null
    const moods = new Map<DayKey, Mood>()
    for (const e of entries ?? []) if (e.content.mood) moods.set(e.entry.date, e.content.mood)
    const data: ReviewData = { today, ...raw, moods, reflectedDates: reflected }
    const cur = weekStats(data, days)
    const prev = weekStats(data, prevDays)
    const wins = [
      ...raw.tasks.filter((t) => t.done && t.priority === 'high' && days.includes(t.date)).map((t) => t.title),
      ...(entries ?? [])
        .filter((e) => days.includes(e.entry.date))
        .flatMap((e) => parseTomorrowGoals(e.content.accomplished))
        .slice(0, 8),
    ]
    return { cur, prev, insights: weekInsights(cur, prev), wins: [...new Set(wins)].slice(0, 8) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, entries, reflected, today, days.join()])

  if (!result) return null
  const { cur, prev, insights, wins } = result
  const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`)

  return (
    <>
      <PageHeader
        title="Weekly Review"
        subtitle="See how your week really went — and what to carry into the next."
        actions={
          <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface p-1">
            <button aria-label="Previous week" className="rounded-xl p-2 text-muted hover:bg-surface-2" onClick={() => setOffset(offset - 1)}>
              <ChevronLeft size={16} />
            </button>
            <button className="min-w-32 rounded-xl px-2 py-1.5 text-sm font-semibold" onClick={() => setOffset(0)}>
              {isCurrent ? 'This week' : offset === -1 ? 'Last week' : weekLabel(days)}
            </button>
            <button aria-label="Next week" disabled={isCurrent} className="rounded-xl p-2 text-muted hover:bg-surface-2 disabled:opacity-30" onClick={() => setOffset(offset + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-3xl border border-brand/20 bg-brand-soft/50 p-4 sm:p-5">
        <Sparkles size={20} className="mt-0.5 shrink-0 text-brand" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-brand">{weekLabel(days)}</div>
          <p className="mt-0.5 font-medium">{weekSummary(cur, isCurrent)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Habit consistency" value={pct(cur.habitRate)} sub={`${cur.habitsDone} of ${cur.habitsPlanned} planned check-ins`}>
          {cur.habitRate !== null && prev.habitRate !== null && <Delta cur={cur.habitRate * 100} prev={prev.habitRate * 100} format={(n) => `${Math.round(n)}%`} />}
        </Tile>
        <Tile label="Focus time" value={formatDuration(cur.focusMin * 60)}>
          <Delta cur={cur.focusMin} prev={prev.focusMin} format={(n) => formatDuration(n * 60)} />
        </Tile>
        <Tile label="Missions done" value={cur.tasksDone} sub={cur.tasksTotal ? `of ${cur.tasksTotal} planned` : undefined}>
          <Delta cur={cur.tasksDone} prev={prev.tasksDone} format={(n) => String(n)} />
        </Tile>
        <Tile label="Workouts" value={`${cur.workoutsDone}/${cur.workoutsPlanned}`} sub={`${cur.reflections} evening reflection${cur.reflections === 1 ? '' : 's'}`}>
          <Delta cur={cur.workoutsDone} prev={prev.workoutsDone} format={(n) => String(n)} />
        </Tile>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FocusChart stats={cur} today={today} />
        <MoodChart stats={cur} locked={diary.locked} />
      </div>

      <div className="mt-6">
        <HabitMatrix stats={cur} today={today} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Insights</SectionTitle>
          {insights.length === 0 ? (
            <p className="py-4 text-sm text-muted">Insights appear as you check in, focus and reflect during the week.</p>
          ) : (
            <ul className="space-y-3">
              {insights.map((i, k) => (
                <motion.li key={k} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.05 }} className="flex gap-3 text-sm">
                  <span className="text-lg leading-5">{i.emoji}</span>
                  <span>{i.text}</span>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <SectionTitle>Wins this week</SectionTitle>
          {wins.length === 0 ? (
            <p className="py-4 text-sm text-muted">
              {diary.locked ? (
                <>
                  <Lock size={13} className="mr-1 inline" />
                  <Link to="/diary" className="font-medium text-brand">Unlock your diary</Link> to include wins from your reflections.
                </>
              ) : (
                <>
                  Complete high-priority missions or write what you accomplished in your{' '}
                  <Link to="/reflect" className="font-medium text-brand">evening reflection</Link> — your wins will gather here.
                </>
              )}
            </p>
          ) : (
            <ul className="space-y-2">
              {wins.map((w) => (
                <li key={w} className="flex gap-2 text-sm">
                  <span className="text-good">✓</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
