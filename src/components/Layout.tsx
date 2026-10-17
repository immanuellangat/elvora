import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookHeart,
  CalendarCheck2,
  Dumbbell,
  Hourglass,
  LayoutDashboard,
  Moon,
  MoreHorizontal,
  Settings as SettingsIcon,
  Sun,
  Target,
  Timer,
  Waves,
} from 'lucide-react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { updateSettings, useSettings } from '../db/settings'
import { formatClock } from '../lib/dates'
import { useNow } from '../lib/hooks'
import { PHASE_LABEL, countdownRemaining, pomodoroRemaining, stopwatchElapsed, useTimers } from '../state/timers'
import { Logo, LogoMark } from './Logo'
import { useIsDark } from './Theme'

interface NavItem {
  to: string
  label: string
  icon: typeof Target
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/mission', label: "Today's Mission", icon: Target },
  { to: '/habits', label: 'Habits', icon: CalendarCheck2 },
  { to: '/focus', label: 'Focus Mode', icon: Waves },
  { to: '/timer', label: 'Timers & Alarms', icon: Timer },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/counters', label: 'Day Counters', icon: Hourglass },
  { to: '/diary', label: 'Diary', icon: BookHeart },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

const MOBILE_MAIN = ['/', '/mission', '/habits', '/focus']
const MOBILE_SHORT: Record<string, string> = { '/': 'Home', '/mission': 'Mission', '/habits': 'Habits', '/focus': 'Focus' }

function ThemeToggle() {
  const settings = useSettings()
  const dark = useIsDark()
  return (
    <button
      onClick={() => void updateSettings({ theme: dark ? 'light' : 'dark' })}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={`Theme: ${settings.theme}`}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={dark ? 'moon' : 'sun'}
          initial={{ rotate: -60, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 60, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {dark ? <Moon size={18} /> : <Sun size={18} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

/** Small pill showing any running timer, so it's never forgotten. */
function RunningTimerPill({ className }: { className?: string }) {
  const { pomodoro, stopwatch, countdown } = useTimers()
  const running = pomodoro.running || stopwatch.running || countdown.running
  const now = useNow(running, 500)
  const navigate = useNavigate()
  if (!running) return null
  let text = ''
  let to = '/timer'
  if (pomodoro.running) {
    text = `${PHASE_LABEL[pomodoro.phase]} ${formatClock(pomodoroRemaining(pomodoro, now))}`
    to = '/focus'
  } else if (countdown.running) text = `Timer ${formatClock(countdownRemaining(countdown, now))}`
  else text = `Stopwatch ${formatClock(stopwatchElapsed(stopwatch, now))}`
  return (
    <button
      onClick={() => navigate(to)}
      className={clsx(
        'tabular inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand',
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
      </span>
      {text}
    </button>
  )
}

export function Layout() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = !MOBILE_MAIN.some((p) => (p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)))

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/70 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="mb-8 flex items-center justify-between px-2">
          <Logo />
          <ThemeToggle />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition',
                  isActive ? 'text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-2xl bg-brand-soft"
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    />
                  )}
                  <item.icon size={18} className={clsx('relative', isActive && 'text-brand')} />
                  <span className="relative">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <RunningTimerPill className="mx-2 mt-4 justify-center" />
        <p className="mt-4 px-2 text-xs leading-relaxed text-faint">
          Your data stays on this device. Small steps, every day.
        </p>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-bg/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
        <NavLink to="/" className="flex items-center gap-2">
          <LogoMark size={30} />
          <span className="font-display text-lg font-extrabold">Elvora</span>
        </NavLink>
        <div className="flex items-center gap-1">
          <RunningTimerPill />
          <ThemeToggle />
        </div>
      </header>

      <main className="lg:pl-64">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10"
        >
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </motion.div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_MAIN.map((to) => {
            const item = NAV.find((n) => n.to === to)!
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  clsx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-brand' : 'text-muted')
                }
              >
                <item.icon size={21} />
                {MOBILE_SHORT[to]}
              </NavLink>
            )
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={clsx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', moreActive ? 'text-brand' : 'text-muted')}
          >
            <MoreHorizontal size={21} />
            More
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-surface p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
              <div className="grid grid-cols-3 gap-2">
                {NAV.filter((n) => !MOBILE_MAIN.includes(n.to)).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        'flex flex-col items-center gap-2 rounded-2xl p-4 text-center text-xs font-medium',
                        isActive ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-ink',
                      )
                    }
                  >
                    <item.icon size={22} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}
