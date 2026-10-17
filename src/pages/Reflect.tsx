import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CalendarCheck2, CheckCircle2, Circle, Dumbbell, Flag, ListPlus, Moon, Sparkles, Waves } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DiaryGate, MoodPicker } from '../components/diary'
import { PRIORITY_STYLE } from '../components/mission'
import { Button, Card, Segmented, Textarea } from '../components/ui'
import { addTask, markReflected, moveTasks } from '../db/actions'
import { db } from '../db/db'
import { useDaySummary, useTasksOn, type DaySummary } from '../db/queries'
import type { DiaryContent, Priority } from '../db/types'
import { formatDuration, prettyDay, shiftDay } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { parseTomorrowGoals } from '../lib/mission'
import { EMPTY_CONTENT, useDiary } from '../state/diaryLock'
import { useToast } from '../state/toast'

function summaryLine(s: DaySummary): string {
  const parts: string[] = []
  if (s.tasksDone.length) parts.push(`${s.tasksDone.length} mission${s.tasksDone.length > 1 ? 's' : ''}`)
  if (s.habitsDone.length) parts.push(`${s.habitsDone.length} habit${s.habitsDone.length > 1 ? 's' : ''}`)
  if (s.workout?.log?.done) parts.push('a workout')
  if (s.focusSec >= 60) parts.push(`${formatDuration(s.focusSec)} of focus`)
  if (!parts.length) return 'Quiet days are part of the journey too. Showing up to reflect is a win.'
  const last = parts.pop()
  return `You completed ${parts.length ? `${parts.join(', ')} and ${last}` : last}. That's real progress.`
}

function DaySummaryCard({ s }: { s: DaySummary }) {
  const rows = [
    {
      icon: Flag,
      label: 'Missions',
      value: `${s.tasksDone.length}/${s.tasks.length}`,
      items: s.tasks.map((t) => ({ text: t.title, done: t.done })),
    },
    {
      icon: CalendarCheck2,
      label: 'Habits',
      value: `${s.habitsDone.length}/${s.habitsPlanned.length}`,
      items: s.habitsPlanned.map((h) => ({ text: `${h.emoji} ${h.name}`, done: s.habitsDone.some((d) => d.id === h.id) })),
    },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Flag, label: 'Missions', value: `${s.tasksDone.length}/${s.tasks.length}` },
          { icon: CalendarCheck2, label: 'Habits', value: `${s.habitsDone.length}/${s.habitsPlanned.length}` },
          { icon: Dumbbell, label: 'Workout', value: s.workout ? (s.workout.log?.done ? 'Done' : `${s.workout.log?.completed.length ?? 0}/${s.workout.day.exercises.length}`) : 'Rest' },
          { icon: Waves, label: 'Focus', value: formatDuration(s.focusSec) },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl bg-surface-2/70 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <x.icon size={13} /> {x.label}
            </div>
            <div className="tabular mt-1 text-xl font-extrabold">{x.value}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(
          (r) =>
            r.items.length > 0 && (
              <div key={r.label}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{r.label}</div>
                <ul className="space-y-1">
                  {r.items.map((it, i) => (
                    <li key={i} className={clsx('flex items-center gap-2 text-sm', !it.done && 'text-muted')}>
                      {it.done ? <CheckCircle2 size={15} className="shrink-0 text-good" /> : <Circle size={15} className="shrink-0 text-faint" />}
                      <span className="truncate">{it.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>
      {s.sessions.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Focus sessions</div>
          <div className="flex flex-wrap gap-1.5">
            {s.sessions.map((x) => (
              <span key={x.id} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand">
                {x.label} · {formatDuration(x.durationSec)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface Goal {
  text: string
  selected: boolean
  priority: Priority
}

function ReflectFlow({ date }: { date: string }) {
  const today = useToday()
  const diary = useDiary()
  const toast = useToast()
  const summary = useDaySummary(date)
  const tomorrow = shiftDay(date, 1)
  const tomorrowTasks = useTasksOn(tomorrow) ?? []
  const [step, setStep] = useState(0)
  const [content, setContent] = useState<DiaryContent | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [carry, setCarry] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ added: number; carried: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entry = await db.diary.where('date').equals(date).first()
      const c = entry ? await diary.read(entry) : { ...EMPTY_CONTENT }
      if (!cancelled) setContent(c ?? { ...EMPTY_CONTENT })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const unfinished = useMemo(() => (summary?.tasks ?? []).filter((t) => !t.done), [summary])

  if (!summary || !content) return null

  const update = (patch: Partial<DiaryContent>) => setContent({ ...content, ...patch })

  const goToPlan = () => {
    const existing = new Set(tomorrowTasks.map((t) => t.title.trim().toLowerCase()))
    const parsed = parseTomorrowGoals(content.tomorrow).filter((g) => !existing.has(g.toLowerCase()))
    setGoals((prev) => parsed.map((text, i) => prev.find((p) => p.text === text) ?? { text, selected: true, priority: i === 0 ? 'high' : 'medium' }))
    setStep(2)
  }

  const finish = async () => {
    setSaving(true)
    try {
      await diary.save(date, { ...content, reflected: true })
      await markReflected(date)
      const chosen = goals.filter((g) => g.selected)
      for (const g of chosen) await addTask({ title: g.text, date: tomorrow, priority: g.priority, source: 'reflection' })
      const carryIds = [...carry].filter((id) => unfinished.some((t) => t.id === id))
      if (carryIds.length) await moveTasks(carryIds, tomorrow)
      setDone({ added: chosen.length, carried: carryIds.length })
    } catch {
      toast("Couldn't save your reflection. Is the diary unlocked?", { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const insertAccomplishments = () => {
    const lines = [
      ...summary.tasksDone.map((t) => `- ${t.title}`),
      ...summary.habitsDone.map((h) => `- ${h.name}`),
      ...(summary.workout?.log?.done ? [`- Workout: ${summary.workout.day.title}`] : []),
      ...(summary.focusSec >= 60 ? [`- ${formatDuration(summary.focusSec)} of focused work`] : []),
    ]
    if (!lines.length) return
    update({ accomplished: [content.accomplished.trim(), lines.join('\n')].filter(Boolean).join('\n') })
  }

  if (done)
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-lg py-10 text-center">
        <div className="brand-gradient mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white shadow-glow">
          <Moon size={32} />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold">Reflection saved</h1>
        <p className="mt-2 text-muted">
          {done.added + done.carried > 0
            ? `Tomorrow is ready with ${done.added + done.carried} mission${done.added + done.carried > 1 ? 's' : ''}. Rest well — you've earned it.`
            : 'Thank you for taking a moment for yourself. Rest well.'}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to={`/mission?date=${tomorrow}`}>
            <Button variant="secondary">See tomorrow's mission</Button>
          </Link>
          <Link to={`/diary/${date}`}>
            <Button>Open in diary</Button>
          </Link>
        </div>
      </motion.div>
    )

  const steps = ['Your day', 'Reflect', 'Tomorrow']

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/mission" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Mission
      </Link>
      <div className="mb-6">
        <div className="text-sm font-semibold text-brand">Evening reflection · {prettyDay(date, today)}</div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{['How did today go?', 'Three gentle questions', 'Shape tomorrow'][step]}</h1>
        <div className="mt-4 flex gap-2">
          {steps.map((s, i) => (
            <button
              key={s}
              onClick={() => (i === 2 ? goToPlan() : setStep(i))}
              className={clsx('flex-1 rounded-full py-1 text-xs font-semibold transition', i === step ? 'brand-gradient text-white' : i < step ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted')}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }} className="space-y-5">
          {step === 0 && (
            <>
              <Card>
                <div className="mb-4 flex items-start gap-3 rounded-2xl bg-brand-soft/60 p-3 text-sm">
                  <Sparkles size={18} className="mt-0.5 shrink-0 text-brand" />
                  <span>{summaryLine(summary)}</span>
                </div>
                <DaySummaryCard s={summary} />
              </Card>
              <Card>
                <div className="mb-3 text-sm font-semibold">How are you feeling?</div>
                <MoodPicker value={content.mood} onChange={(mood) => update({ mood })} />
              </Card>
            </>
          )}

          {step === 1 && (
            <Card className="space-y-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="r-acc" className="text-sm font-semibold">
                    1. What did I accomplish today?
                  </label>
                  {(summary.tasksDone.length > 0 || summary.habitsDone.length > 0 || summary.focusSec >= 60) && (
                    <button onClick={insertAccomplishments} className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                      <ListPlus size={13} /> Insert from today
                    </button>
                  )}
                </div>
                <Textarea id="r-acc" rows={4} value={content.accomplished} onChange={(e) => update({ accomplished: e.target.value })} placeholder="Every step counts, however small." />
              </div>
              <div>
                <label htmlFor="r-ch" className="mb-1.5 block text-sm font-semibold">
                  2. What challenges did I face?
                </label>
                <Textarea id="r-ch" rows={3} value={content.challenges} onChange={(e) => update({ challenges: e.target.value })} placeholder="What got in the way? Be kind to yourself." />
              </div>
              <div>
                <label htmlFor="r-tm" className="mb-1.5 block text-sm font-semibold">
                  3. What do I want to achieve tomorrow?
                </label>
                <Textarea id="r-tm" rows={4} value={content.tomorrow} onChange={(e) => update({ tomorrow: e.target.value })} placeholder={'One goal per line, e.g.\nFinish the report draft\n20-minute walk'} />
                <p className="mt-1 text-xs text-muted">Each line can become a mission for tomorrow in the next step.</p>
              </div>
              <details className="group rounded-2xl bg-surface-2/60 p-3">
                <summary className="cursor-pointer text-sm font-medium text-muted">Optional: what I learned & what I'd improve</summary>
                <div className="mt-3 space-y-3">
                  <Textarea rows={2} aria-label="What I learned" value={content.learned} onChange={(e) => update({ learned: e.target.value })} placeholder="What did I learn?" />
                  <Textarea rows={2} aria-label="What I'd improve" value={content.improve} onChange={(e) => update({ improve: e.target.value })} placeholder="What could I do better tomorrow?" />
                </div>
              </details>
            </Card>
          )}

          {step === 2 && (
            <>
              <Card>
                <h2 className="font-bold">Turn goals into tomorrow's missions</h2>
                <p className="mt-1 text-sm text-muted">Pick what feels doable. Fewer, clearer missions beat a long list.</p>
                {goals.length === 0 ? (
                  <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
                    No new goals from your reflection.{' '}
                    <button className="font-medium text-brand" onClick={() => setStep(1)}>
                      Add some
                    </button>{' '}
                    or simply save.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {goals.map((g, i) => (
                      <div key={g.text} className={clsx('flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2.5', g.selected ? 'border-brand/40' : 'border-line opacity-60')}>
                        <input
                          type="checkbox"
                          aria-label={`Add “${g.text}” to tomorrow`}
                          className="h-4 w-4 accent-[var(--brand)]"
                          checked={g.selected}
                          onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium">{g.text}</span>
                        <Segmented
                          value={g.priority}
                          onChange={(p) => setGoals(goals.map((x, j) => (j === i ? { ...x, priority: p } : x)))}
                          options={(['high', 'medium', 'low'] as Priority[]).map((p) => ({ value: p, label: <span className={PRIORITY_STYLE[p].text}>{PRIORITY_STYLE[p].label}</span> }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {tomorrowTasks.length > 0 && <p className="mt-3 text-xs text-muted">Already planned for tomorrow: {tomorrowTasks.map((t) => t.title).join(', ')}</p>}
              </Card>

              {unfinished.length > 0 && date === today && (
                <Card>
                  <h2 className="font-bold">Unfinished today</h2>
                  <p className="mt-1 text-sm text-muted">Carry any of these into tomorrow? Leaving them is fine too — you can decide later.</p>
                  <div className="mt-3 space-y-2">
                    {unfinished.map((t) => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--brand)]"
                          checked={carry.has(t.id)}
                          onChange={(e) => {
                            const next = new Set(carry)
                            if (e.target.checked) next.add(t.id)
                            else next.delete(t.id)
                            setCarry(next)
                          }}
                        />
                        <span className="text-sm">{t.title}</span>
                      </label>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {step === 0 && (
          <Button onClick={() => setStep(1)}>
            Begin <ArrowRight size={16} />
          </Button>
        )}
        {step === 1 && (
          <Button onClick={goToPlan}>
            Next <ArrowRight size={16} />
          </Button>
        )}
        {step === 2 && (
          <Button onClick={finish} disabled={saving} icon={<Moon size={16} />}>
            {saving ? 'Saving…' : 'Save reflection'}
          </Button>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-faint">Saved privately to your diary{diary.enabled ? ' and encrypted' : ''}. Skip anything you like.</p>
    </div>
  )
}

export default function ReflectPage() {
  const [params] = useSearchParams()
  const today = useToday()
  const raw = params.get('date')
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today
  return (
    <DiaryGate>
      <ReflectFlow key={date} date={date} />
    </DiaryGate>
  )
}
