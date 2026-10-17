import clsx from 'clsx'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { ArrowRight, Dumbbell, Flame, Moon, Play, Trophy, Waves } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Heatmap } from '../components/Heatmap'
import { MissionRow, useMission } from '../components/mission'
import { Button, Card, CheckButton, ProgressBar, ProgressRing, SectionTitle } from '../components/ui'
import { counterDays, toggleHabit } from '../db/actions'
import { db } from '../db/db'
import { habitStreak, logsByHabit, useActivity, useAchievementStats, useHabitLogs, useHabits, useReflectedDates, useWorkoutFor } from '../db/queries'
import { useSettings } from '../db/settings'
import { evaluateAchievements, nextAchievements } from '../lib/achievements'
import { HABIT_COLORS } from '../lib/colors'
import { greeting, parseDay } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { encouragement } from '../lib/mission'
import { isPlannedOn } from '../lib/streaks'
import { useTimers } from '../state/timers'

const QUOTES = [
  'Small steps every day add up to big changes.',
  "You don't have to be perfect — just consistent.",
  'Progress, not perfection.',
  'Motivation gets you started. Habit keeps you going.',
  "Rest is part of the work, not a break from it.",
  'What you do every day matters more than what you do once in a while.',
  'Be gentle with yourself. You are doing better than you think.',
  'The best time to start was yesterday. The next best time is now.',
  'Focus on the next right step, not the whole staircase.',
  'Discipline is choosing what you want most over what you want now.',
]

const fade = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.05, duration: 0.3 } })

export default function Dashboard() {
  const today = useToday()
  const settings = useSettings()
  const mission = useMission(today)
  const habits = useHabits()
  const logs = useHabitLogs()
  const workout = useWorkoutFor(today)
  const activity = useActivity(26 * 7, today)
  const stats = useAchievementStats(today)
  const reflected = useReflectedDates()
  const counters = useLiveQuery(() => db.counters.toArray(), [])
  const timers = useTimers()
  const navigate = useNavigate()

  const date = parseDay(today)
  const quote = QUOTES[(date.getFullYear() * 400 + date.getMonth() * 31 + date.getDate()) % QUOTES.length]
  const byHabit = logs ? logsByHabit(logs) : new Map<string, Set<string>>()
  const todaysHabits = (habits ?? []).filter((h) => isPlannedOn(h.days, today))
  const achievements = stats ? evaluateAchievements(stats) : []
  const earned = achievements.filter((a) => a.earned)
  const upcoming = nextAchievements(achievements, 3)
  const eveningNow = new Date().getHours() >= settings.reflectionHour
  const showReflect = settings.reflectionPrompt && eveningNow && reflected && !reflected.has(today)
  const focusMin = mission?.focusMinutes ?? 0
  const wd = workout?.day
  const wl = workout?.log

  return (
    <div className="space-y-6">
      <motion.div {...fade(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{format(date, 'EEEE, MMMM d')}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {greeting()}
            {settings.name ? <span className="brand-text">, {settings.name}</span> : ''}
          </h1>
          <p className="mt-2 max-w-xl text-sm italic text-muted">“{quote}”</p>
        </div>
        <Button size="lg" icon={<Play size={18} fill="currentColor" />} onClick={() => navigate('/focus')}>
          {timers.pomodoro.running ? 'Back to focus' : 'Start focusing'}
        </Button>
      </motion.div>

      {showReflect && (
        <motion.div {...fade(1)} className="min-w-0">
          <Link to="/reflect" className="group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-brand/30 bg-brand-soft/50 p-4 sm:p-5">
            <div className="brand-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white">
              <Moon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold">Ready to wind down?</div>
              <div className="text-sm text-muted">Take two minutes to reflect on today and set up tomorrow.</div>
            </div>
            <ArrowRight className="text-brand transition group-hover:translate-x-1" />
          </Link>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's mission */}
        <motion.div {...fade(2)} className="min-w-0 lg:col-span-2">
          <Card className="h-full">
            <SectionTitle
              action={
                <Link to="/mission" className="text-sm font-medium text-brand">
                  Open →
                </Link>
              }
            >
              Today's mission
            </SectionTitle>
            {mission && (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="flex flex-col items-center sm:w-40">
                  <ProgressRing value={mission.progress.ratio} size={128} stroke={11}>
                    <span className="tabular text-2xl font-extrabold">{Math.round(mission.progress.ratio * 100)}%</span>
                    <span className="text-[11px] text-muted">
                      {mission.progress.done}/{mission.progress.total} done
                    </span>
                  </ProgressRing>
                  <p className="mt-3 text-center text-xs text-muted">{encouragement(mission.progress.ratio, mission.progress.total)}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {mission.items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
                      Nothing planned yet.{' '}
                      <Link to="/mission" className="font-medium text-brand">
                        Add your first mission
                      </Link>
                    </div>
                  ) : (
                    <>
                      {[...mission.items]
                        .sort((a, b) => Number(a.done) - Number(b.done))
                        .slice(0, 5)
                        .map((item) => (
                          <MissionRow key={item.key} item={item} date={today} />
                        ))}
                      {mission.items.length > 5 && (
                        <Link to="/mission" className="block pt-1 text-center text-xs font-medium text-muted hover:text-brand">
                          +{mission.items.length - 5} more
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Focus + workout */}
        <motion.div {...fade(3)} className="grid min-w-0 gap-6">
          <Card>
            <SectionTitle>Focus today</SectionTitle>
            <div className="flex items-baseline gap-1">
              <span className="tabular text-4xl font-extrabold">{Math.round(focusMin)}</span>
              <span className="text-muted">/ {settings.dailyFocusGoal} min</span>
            </div>
            <ProgressBar value={settings.dailyFocusGoal ? focusMin / settings.dailyFocusGoal : 0} className="mt-3" />
            <Link to="/focus" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
              <Waves size={15} /> Enter focus mode
            </Link>
          </Card>
          <Card>
            <SectionTitle>Workout</SectionTitle>
            {!wd || wd.rest || wd.exercises.length === 0 ? (
              <p className="text-sm text-muted">🌿 Rest day — recovery is progress too.</p>
            ) : (
              <>
                <div className="flex items-center gap-2 font-semibold">
                  <Dumbbell size={16} className="text-brand" /> {wd.title}
                </div>
                <p className="mt-1 text-sm text-muted">{wl?.done ? 'Completed ✓ Nice work!' : `${wl?.completed.length ?? 0} of ${wd.exercises.length} exercises`}</p>
                <ProgressBar value={wl?.done ? 1 : (wl?.completed.length ?? 0) / wd.exercises.length} className="mt-3" tone={wl?.done ? 'good' : 'brand'} />
                <Link to="/workouts" className="mt-4 inline-block text-sm font-medium text-brand">
                  {wl?.done ? 'View plan →' : "Let's move →"}
                </Link>
              </>
            )}
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Habit streaks */}
        <motion.div {...fade(4)} className="min-w-0">
          <Card className="h-full">
            <SectionTitle
              action={
                <Link to="/habits" className="text-sm font-medium text-brand">
                  All →
                </Link>
              }
            >
              Habit streaks
            </SectionTitle>
            {habits && habits.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted">
                No habits yet.{' '}
                <Link to="/habits" className="font-medium text-brand">
                  Create one
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {(habits ?? []).slice(0, 6).map((h) => {
                  const dates = byHabit.get(h.id)
                  const s = habitStreak(h, dates, today)
                  const done = dates?.has(today) ?? false
                  const planned = todaysHabits.includes(h)
                  return (
                    <li key={h.id} className="flex items-center gap-3">
                      <CheckButton checked={done} color={HABIT_COLORS[h.color]} label={`${done ? 'Undo' : 'Complete'} ${h.name}`} onClick={() => void toggleHabit(h.id, today)} />
                      <Link to={`/habits/${h.id}`} className="min-w-0 flex-1">
                        <div className={clsx('truncate text-sm font-medium', !planned && !done && 'text-muted')}>
                          {h.emoji} {h.name}
                        </div>
                        {!planned && <div className="text-[11px] text-faint">Rest day</div>}
                      </Link>
                      <span className={clsx('inline-flex items-center gap-1 text-sm font-semibold', s.current > 0 ? 'text-warn' : 'text-faint')}>
                        <Flame size={14} />
                        {s.current}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </motion.div>

        {/* Activity calendar */}
        <motion.div {...fade(5)} className="min-w-0 lg:col-span-2">
          <Card className="h-full">
            <SectionTitle>Consistency calendar</SectionTitle>
            {activity && <Heatmap data={activity} today={today} weeks={26} weekStartsOn={settings.weekStartsOn} />}
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Day counters */}
        <motion.div {...fade(6)} className="min-w-0">
          <Card className="h-full">
            <SectionTitle
              action={
                <Link to="/counters" className="text-sm font-medium text-brand">
                  All →
                </Link>
              }
            >
              Day counters
            </SectionTitle>
            {counters && counters.length > 0 ? (
              <ul className="space-y-3">
                {counters.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="text-2xl">{c.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                    <span className="tabular rounded-xl bg-brand-soft px-2.5 py-1 text-sm font-bold text-brand">Day {counterDays(c, today)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center text-sm text-muted">
                Count days toward a goal.{' '}
                <Link to="/counters" className="font-medium text-brand">
                  Start one
                </Link>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Milestones */}
        <motion.div {...fade(7)} className="min-w-0 lg:col-span-2">
          <Card className="h-full">
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5">
                <Trophy size={14} /> Milestones · {earned.length}/{achievements.length}
              </span>
            </SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold text-muted">Earned</div>
                {earned.length === 0 ? (
                  <p className="text-sm text-muted">Your first badge is one check-in away.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {earned.slice(-8).map((a) => (
                      <span key={a.id} title={a.description} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
                        {a.emoji} {a.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-muted">Up next</div>
                <ul className="space-y-3">
                  {upcoming.map((a) => (
                    <li key={a.id}>
                      <div className="flex justify-between text-sm">
                        <span>
                          {a.emoji} {a.title}
                        </span>
                        <span className="tabular text-xs text-muted">
                          {Math.min(a.value, a.target)}/{a.target}
                        </span>
                      </div>
                      <ProgressBar value={a.progress} className="mt-1.5" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
