import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { LogoMark } from '../components/Logo'
import { Button, Input } from '../components/ui'
import { createHabit } from '../db/actions'
import { updateSettings } from '../db/settings'
import { HABIT_SUGGESTIONS } from '../lib/colors'

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [goal, setGoal] = useState(50)
  const [busy, setBusy] = useState(false)

  const finish = async () => {
    setBusy(true)
    for (const s of HABIT_SUGGESTIONS.filter((x) => picked.has(x.name))) {
      await createHabit({ name: s.name, emoji: s.emoji, color: s.color, days: [0, 1, 2, 3, 4, 5, 6] })
    }
    await updateSettings({ name: name.trim(), dailyFocusGoal: goal, onboarded: true })
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg px-4 py-10">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-violet-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[30rem] w-[30rem] rounded-full bg-fuchsia-400/15 blur-3xl" />
      <div className="relative w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}>
            {step === 0 && (
              <div className="text-center">
                <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }} className="mx-auto w-fit">
                  <LogoMark size={88} />
                </motion.div>
                <h1 className="mt-6 text-4xl font-extrabold tracking-tight">
                  Welcome to <span className="brand-text">Elvora</span>
                </h1>
                <p className="mt-2 text-lg text-muted">Progress with purpose.</p>
                <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-muted">
                  A calm companion for your habits, focus, workouts and reflections. Build consistency gradually — no pressure to be perfect.
                </p>
                <div className="mt-8 space-y-3 text-left">
                  <label className="block text-sm font-medium" htmlFor="ob-name">
                    What should we call you?
                  </label>
                  <Input id="ob-name" autoFocus value={name} maxLength={30} placeholder="Your name (optional)" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setStep(1)} />
                  <Button size="lg" className="w-full" onClick={() => setStep(1)}>
                    Continue <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-2xl font-extrabold">Pick a few habits to start</h2>
                <p className="mt-1 text-sm text-muted">Start small — two or three is perfect. You can change these anytime.</p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {HABIT_SUGGESTIONS.map((s) => {
                    const on = picked.has(s.name)
                    return (
                      <motion.button
                        key={s.name}
                        whileTap={{ scale: 0.95 }}
                        aria-pressed={on}
                        onClick={() => {
                          const next = new Set(picked)
                          if (on) next.delete(s.name)
                          else next.add(s.name)
                          setPicked(next)
                        }}
                        className={clsx(
                          'flex items-center gap-2 rounded-2xl border px-3 py-3 text-left text-sm font-medium transition',
                          on ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface hover:bg-surface-2',
                        )}
                      >
                        <span className="text-xl">{s.emoji}</span>
                        {s.name}
                      </motion.button>
                    )
                  })}
                </div>
                {picked.size > 4 && <p className="mt-3 text-xs text-warn">That's ambitious! Fewer habits done consistently beat many done occasionally.</p>}
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" onClick={() => setStep(0)}>
                    Back
                  </Button>
                  <Button className="flex-1" onClick={() => setStep(2)}>
                    {picked.size ? `Continue with ${picked.size}` : 'Skip for now'}
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-2xl font-extrabold">How much focus time per day?</h2>
                <p className="mt-1 text-sm text-muted">A gentle daily target for deep work, study or practice.</p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {[
                    [25, 'Light', 'One session'],
                    [50, 'Steady', 'Two sessions'],
                    [100, 'Committed', 'Four sessions'],
                    [0, 'No goal', 'Just track'],
                  ].map(([m, label, hint]) => (
                    <button
                      key={label}
                      onClick={() => setGoal(m as number)}
                      className={clsx('rounded-2xl border px-4 py-3 text-left transition', goal === m ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-2')}
                    >
                      <div className={clsx('font-bold', goal === m && 'text-brand')}>{m ? `${m} min` : label}</div>
                      <div className="text-xs text-muted">{m ? `${label} · ${hint}` : hint}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-6 rounded-2xl bg-surface-2 p-4 text-sm text-muted">
                  🔒 Everything stays on this device. Elvora works offline — only online music needs a connection.
                </div>
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button className="flex-1" size="lg" disabled={busy} onClick={finish}>
                    Let's begin ✨
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="mt-8 flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={clsx('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-brand' : 'w-1.5 bg-line')} />
          ))}
        </div>
      </div>
    </div>
  )
}
