import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, CheckCheck, Headphones, Maximize, Minimize, Pause, Play, RotateCcw, SkipForward, SlidersHorizontal, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SoundPanel } from '../components/SoundPanel'
import { BIG_STEP_MS, STEP_MS, TimeStepper } from '../components/TimeStepper'
import { Button, Field, Input, Modal, Segmented, Toggle } from '../components/ui'
import { useHabits, useSessionsOn, useTasksOn } from '../db/queries'
import { updateSettings, useSettings } from '../db/settings'
import { formatClock, formatDuration } from '../lib/dates'
import { useNow, useToday } from '../lib/hooks'
import { useSound } from '../state/sound'
import { MAX_TIMER_MS, MIN_STEP_MS, PHASE_LABEL, pomodoroRemaining, useTimers, type Phase } from '../state/timers'

function NumberField({ label, value, onChange, min = 1, max = 180 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value))
            if (Number.isFinite(n) && e.target.value !== '') onChange(Math.min(max, Math.max(min, n)))
          }}
        />
      )}
    </Field>
  )
}

function FocusSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings()
  return (
    <Modal open={open} onClose={onClose} title="Focus settings" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField label="Focus (min)" value={s.focusMinutes} onChange={(v) => void updateSettings({ focusMinutes: v })} />
          <NumberField label="Short break" value={s.shortBreakMinutes} max={60} onChange={(v) => void updateSettings({ shortBreakMinutes: v })} />
          <NumberField label="Long break" value={s.longBreakMinutes} max={90} onChange={(v) => void updateSettings({ longBreakMinutes: v })} />
          <NumberField label="Rounds" value={s.cyclesBeforeLongBreak} max={12} onChange={(v) => void updateSettings({ cyclesBeforeLongBreak: v })} />
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              [25, 5, 'Classic 25/5'],
              [50, 10, 'Deep 50/10'],
              [15, 3, 'Gentle 15/3'],
              [90, 20, 'Flow 90/20'],
            ] as const
          ).map(([f, b, label]) => (
            <button
              key={label}
              onClick={() => void updateSettings({ focusMinutes: f, shortBreakMinutes: b })}
              className={clsx(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                s.focusMinutes === f && s.shortBreakMinutes === b ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span>Start breaks automatically</span>
            <Toggle label="Start breaks automatically" checked={s.autoStartBreaks} onChange={(v) => void updateSettings({ autoStartBreaks: v })} />
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span>Start next focus automatically</span>
            <Toggle label="Start next focus automatically" checked={s.autoStartFocus} onChange={(v) => void updateSettings({ autoStartFocus: v })} />
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span>Chime volume</span>
            <input
              type="range"
              aria-label="Chime volume"
              min={0}
              max={1}
              step={0.1}
              value={s.chimeVolume}
              onChange={(e) => void updateSettings({ chimeVolume: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function FocusPage() {
  const t = useTimers()
  const p = t.pomodoro
  const settings = useSettings()
  const sound = useSound()
  const navigate = useNavigate()
  const today = useToday()
  const habits = useHabits() ?? []
  const tasks = (useTasksOn(today) ?? []).filter((x) => !x.done && !x.dismissed)
  const sessions = useSessionsOn(today) ?? []
  const now = useNow(p.running, 250)
  const remaining = pomodoroRemaining(p, now)
  const progress = 1 - remaining / p.phaseMs
  const [soundOpen, setSoundOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const focusSessions = sessions.filter((s) => s.kind === 'focus')
  const todayFocusSec = focusSessions.reduce((a, s) => a + s.durationSec, 0)
  const isBreak = p.phase !== 'focus'

  useEffect(() => {
    const fn = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Space toggles the timer; ↑/↓ add or remove a minute (Shift: 5 minutes).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input,textarea,select,[role="dialog"],[role="spinbutton"]')) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const step = e.shiftKey ? BIG_STEP_MS : STEP_MS
        t.adjustPomodoro(e.key === 'ArrowUp' ? step : -step)
        return
      }
      if (e.code !== 'Space' || target.closest('button')) return
      e.preventDefault()
      if (p.running) t.pausePomodoro()
      else t.startFocus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.running, t])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // not supported
    }
  }

  const exit = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  const linkValue = p.taskId ? `task:${p.taskId}` : p.habitId ? `habit:${p.habitId}` : ''
  const r = 46
  const c = 2 * Math.PI * r
  const rounds = Math.max(1, settings.cyclesBeforeLongBreak)
  const inRound = p.completedFocus % rounds

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg">
      {/* Calm moving background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className={clsx('absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full blur-3xl transition-colors duration-1000', isBreak ? 'bg-emerald-400/15' : 'bg-violet-500/20')}
          animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={clsx('absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full blur-3xl transition-colors duration-1000', isBreak ? 'bg-sky-400/15' : 'bg-fuchsia-400/15')}
          animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-2 px-3 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={exit} aria-label="Exit focus mode">
          <span className="hidden sm:inline">Exit</span>
        </Button>
        <Segmented
          value={p.phase}
          onChange={(ph: Phase) => !p.running && t.setPhase(ph)}
          options={[
            { value: 'focus', label: 'Focus' },
            { value: 'short', label: 'Short' },
            { value: 'long', label: 'Long' },
          ]}
        />
        <div className="flex items-center">
          <button
            aria-label="Sounds & music"
            onClick={() => setSoundOpen(true)}
            className={clsx('rounded-xl p-2.5 transition hover:bg-surface-2', sound.anyAmbient || sound.music ? 'text-brand' : 'text-muted')}
          >
            <Headphones size={18} />
          </button>
          <button aria-label="Focus settings" onClick={() => setSettingsOpen(true)} className="rounded-xl p-2.5 text-muted transition hover:bg-surface-2">
            <SlidersHorizontal size={18} />
          </button>
          <button
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={toggleFullscreen}
            className="hidden rounded-xl p-2.5 text-muted transition hover:bg-surface-2 sm:block"
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-28 pt-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={`${p.phase}-${p.label}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={clsx('mb-6 max-w-xs truncate text-center text-sm font-semibold uppercase tracking-[0.25em]', isBreak ? 'text-good' : 'text-brand')}
          >
            {isBreak ? `${PHASE_LABEL[p.phase]} · breathe` : p.label || 'Focus'}
          </motion.p>
        </AnimatePresence>

        <motion.div
          className="relative h-[min(78vw,21rem)] w-[min(78vw,21rem)]"
          animate={p.running ? { scale: [1, 1.015, 1] } : { scale: 1 }}
          transition={p.running ? { duration: isBreak ? 8 : 5, repeat: Infinity, ease: 'easeInOut' } : {}}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id="focus-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={isBreak ? '#34d399' : '#a78bfa'} />
                <stop offset="60%" stopColor={isBreak ? '#22d3ee' : '#7c5cff'} />
                <stop offset="100%" stopColor={isBreak ? '#a7f3d0' : '#e879f9'} />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="2.5" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="url(#focus-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
              style={{ transition: 'stroke-dashoffset 0.3s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <TimeStepper
              size="lg"
              label={`${PHASE_LABEL[p.phase]} length`}
              minutes={Math.round(p.phaseMs / 60_000)}
              onAdjust={t.adjustPomodoro}
              canDecrease={remaining > MIN_STEP_MS}
              canIncrease={p.phaseMs < MAX_TIMER_MS}
            >
              <div className="tabular font-display text-6xl font-extrabold tracking-tight sm:text-7xl" role="timer" aria-live="off">
                {formatClock(remaining)}
              </div>
            </TimeStepper>
            <div className="mt-1 flex gap-1.5" aria-label={`Round ${inRound + 1} of ${rounds}`}>
              {Array.from({ length: rounds }, (_, i) => (
                <span key={i} className={clsx('h-1.5 w-5 rounded-full', i < inRound ? 'bg-brand' : 'bg-line')} />
              ))}
            </div>
          </div>
        </motion.div>

        {!p.running && p.phase === 'focus' && (
          <div className="mt-8 w-full max-w-sm space-y-2">
            <Input
              value={p.label}
              onChange={(e) => t.setPomodoroMeta({ label: e.target.value })}
              placeholder="What will you focus on?"
              aria-label="Focus intention"
              maxLength={80}
              className="text-center"
            />
            <select
              aria-label="Link to habit or mission"
              value={linkValue}
              onChange={(e) => {
                const [kind, id] = e.target.value.split(':')
                if (kind === 'habit') {
                  const h = habits.find((x) => x.id === id)
                  t.setPomodoroMeta({ habitId: id, taskId: undefined, label: p.label || h?.name || '' })
                } else if (kind === 'task') {
                  const task = tasks.find((x) => x.id === id)
                  t.setPomodoroMeta({ taskId: id, habitId: undefined, label: task?.title ?? p.label })
                } else t.setPomodoroMeta({ habitId: undefined, taskId: undefined })
              }}
              className="h-11 w-full rounded-2xl border border-line bg-surface-2/60 px-4 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="">Not linked</option>
              {tasks.length > 0 && (
                <optgroup label="Today's missions">
                  {tasks.map((x) => (
                    <option key={x.id} value={`task:${x.id}`}>
                      {x.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {habits.length > 0 && (
                <optgroup label="Habits (checked off when a session completes)">
                  {habits.map((h) => (
                    <option key={h.id} value={`habit:${h.id}`}>
                      {h.emoji} {h.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          <button
            aria-label="Reset timer"
            title="Reset"
            onClick={t.resetPomodoro}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted transition hover:text-ink"
          >
            <RotateCcw size={18} />
          </button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            aria-label={p.running ? 'Pause' : 'Start'}
            onClick={() => (p.running ? t.pausePomodoro() : t.startFocus())}
            className={clsx(
              'flex h-20 w-20 items-center justify-center rounded-full text-white shadow-glow transition hover:brightness-110',
              isBreak ? 'bg-gradient-to-br from-emerald-400 to-cyan-500' : 'brand-gradient',
            )}
          >
            {p.running ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="ml-1" />}
          </motion.button>
          {p.phase === 'focus' ? (
            <button
              aria-label="Finish session early and log it"
              title="Finish & log"
              disabled={p.remainingMs === p.phaseMs && !p.running}
              onClick={t.finishFocusEarly}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted transition hover:text-ink disabled:opacity-40"
            >
              <CheckCheck size={18} />
            </button>
          ) : (
            <button
              aria-label="Skip break"
              title="Skip break"
              onClick={t.skipPhase}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted transition hover:text-ink"
            >
              <SkipForward size={18} />
            </button>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
          <span>
            Today: <b className="text-ink">{formatDuration(todayFocusSec)}</b> focused
          </span>
          <span>
            Sessions: <b className="text-ink">{focusSessions.length}</b>
          </span>
          {p.completedFocus > 0 && (
            <button className="inline-flex items-center gap-1 text-xs text-faint hover:text-bad" onClick={t.endPomodoro}>
              <Square size={11} /> End cycle
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-faint">Space starts or pauses · ↑/↓ adjust time (Shift for 5 min). Sessions under a minute aren't logged.</p>
      </main>

      <Modal open={soundOpen} onClose={() => setSoundOpen(false)} title="Sounds & music" wide>
        <SoundPanel />
      </Modal>
      <FocusSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
