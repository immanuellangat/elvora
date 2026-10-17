import clsx from 'clsx'
import { format } from 'date-fns'
import { Lock, Moon, PenLine, Search, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DiaryGate, MOODS, entryPreview, moodEmoji, useDecryptedEntries } from '../components/diary'
import { Button, Card, EmptyState, Input, PageHeader, SectionTitle } from '../components/ui'
import { useReflectedDates } from '../db/queries'
import { parseDay, prettyDay } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { useDiary } from '../state/diaryLock'

function MoodTrend({ points }: { points: { date: string; mood: number }[] }) {
  if (points.length < 2) return null
  const w = 300
  const h = 80
  const step = w / (points.length - 1)
  const y = (m: number) => h - ((m - 1) / 4) * (h - 12) - 6
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y(p.mood).toFixed(1)}`).join(' ')
  const avg = points.reduce((a, p) => a + p.mood, 0) / points.length
  return (
    <Card>
      <SectionTitle>Mood · last {points.length} entries</SectionTitle>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Mood trend">
        <defs>
          <linearGradient id="mood-line" x1="0" x2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#e879f9" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="url(#mood-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-2 text-sm text-muted">
        Average mood: <span className="text-lg">{moodEmoji(Math.round(avg) as 1)}</span> {MOODS[Math.round(avg) - 1]?.label}
      </p>
    </Card>
  )
}

function DiaryList() {
  const today = useToday()
  const entries = useDecryptedEntries()
  const reflected = useReflectedDates()
  const diary = useDiary()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!entries) return []
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(({ content }) =>
      [content.title, content.body, content.accomplished, content.challenges, content.tomorrow, content.learned, content.improve]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [entries, query])

  if (!entries) return null
  const moodPoints = entries
    .filter((e) => e.content.mood)
    .slice(0, 14)
    .reverse()
    .map((e) => ({ date: e.entry.date, mood: e.content.mood! }))
  const hasToday = entries.some((e) => e.entry.date === today)

  return (
    <>
      <PageHeader
        title="Diary"
        subtitle="A private space to think, reflect and notice your growth."
        actions={
          <>
            {diary.enabled && (
              <Button variant="ghost" size="sm" icon={<Lock size={15} />} onClick={diary.lock}>
                Lock
              </Button>
            )}
            <Link to="/reflect">
              <Button variant="secondary" icon={<Moon size={16} />}>
                Reflect
              </Button>
            </Link>
            <Link to={`/diary/${today}`}>
              <Button icon={<PenLine size={16} />}>{hasToday ? "Today's entry" : 'Write today'}</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {entries.length > 0 && (
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your entries" aria-label="Search entries" className="pl-10" />
            </div>
          )}
          {entries.length === 0 ? (
            <EmptyState
              emoji="📖"
              title="Your diary is empty"
              text="Write a few lines about your day — what went well, what was hard, what you learned. No pressure to be profound."
              action={
                <Link to={`/diary/${today}`}>
                  <Button>Write your first entry</Button>
                </Link>
              }
            />
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No entries match “{query}”.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(({ entry, content }) => (
                <Link
                  key={entry.id}
                  to={`/diary/${entry.date}`}
                  className="flex items-center gap-4 rounded-3xl border border-line bg-surface px-4 py-3.5 transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="flex w-12 shrink-0 flex-col items-center rounded-2xl bg-surface-2 py-1.5">
                    <span className="text-[10px] font-semibold uppercase text-muted">{format(parseDay(entry.date), 'MMM')}</span>
                    <span className="text-lg font-extrabold leading-none">{format(parseDay(entry.date), 'd')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {prettyDay(entry.date, today)}
                      {reflected?.has(entry.date) && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">Reflection</span>}
                    </div>
                    <p className={clsx('truncate text-sm', entryPreview(content) ? 'text-muted' : 'italic text-faint')}>{entryPreview(content) || 'No text yet'}</p>
                  </div>
                  <span className="text-2xl" aria-label="Mood">
                    {content.mood ? moodEmoji(content.mood) : ''}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <MoodTrend points={moodPoints} />
          <Card>
            <div className="flex items-start gap-3">
              <ShieldCheck className={diary.enabled ? 'text-good' : 'text-muted'} size={20} />
              <div className="text-sm">
                <div className="font-semibold">{diary.enabled ? 'Encrypted & passcode-protected' : 'Stored privately on this device'}</div>
                <p className="mt-1 text-muted">
                  {diary.enabled
                    ? 'Entries are encrypted with AES-256. The diary locks itself after inactivity.'
                    : 'Nothing leaves your device. Add a passcode to encrypt entries and lock the diary.'}
                </p>
                {!diary.enabled && (
                  <Link to="/settings#privacy" className="mt-2 inline-block font-semibold text-brand">
                    Set a passcode →
                  </Link>
                )}
              </div>
            </div>
          </Card>
          <Card className="text-sm text-muted">
            <b className="text-ink">{entries.length}</b> entr{entries.length === 1 ? 'y' : 'ies'} · <b className="text-ink">{reflected?.size ?? 0}</b> evening reflections
          </Card>
        </div>
      </div>
    </>
  )
}

export default function DiaryPage() {
  return (
    <DiaryGate>
      <DiaryList />
    </DiaryGate>
  )
}
