import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { MiniPlayer } from './components/MiniPlayer'
import { ThemeController } from './components/Theme'
import { ensureWorkoutPlan } from './db/actions'
import { useSettingsState } from './db/settings'
import Dashboard from './pages/Dashboard'
import Onboarding from './pages/Onboarding'
import { AlarmProvider } from './state/alarms'
import { DiaryProvider } from './state/diaryLock'
import { ReminderProvider } from './state/reminders'
import { SoundProvider } from './state/sound'
import { TimerProvider } from './state/timers'
import { ToastProvider } from './state/toast'

const Counters = lazy(() => import('./pages/Counters'))
const Diary = lazy(() => import('./pages/Diary'))
const DiaryEntry = lazy(() => import('./pages/DiaryEntry'))
const Focus = lazy(() => import('./pages/Focus'))
const HabitDetail = lazy(() => import('./pages/HabitDetail'))
const Habits = lazy(() => import('./pages/Habits'))
const Mission = lazy(() => import('./pages/Mission'))
const Reflect = lazy(() => import('./pages/Reflect'))
const Review = lazy(() => import('./pages/Review'))
const Settings = lazy(() => import('./pages/Settings'))
const Timer = lazy(() => import('./pages/Timer'))
const Workouts = lazy(() => import('./pages/Workouts'))

function AppRoutes() {
  const { settings, loaded } = useSettingsState()
  if (!loaded) return null
  if (!settings.onboarded) return <Onboarding />
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/focus" element={<Focus />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="mission" element={<Mission />} />
          <Route path="habits" element={<Habits />} />
          <Route path="habits/:id" element={<HabitDetail />} />
          <Route path="timer" element={<Timer />} />
          <Route path="workouts" element={<Workouts />} />
          <Route path="counters" element={<Counters />} />
          <Route path="diary" element={<Diary />} />
          <Route path="diary/:date" element={<DiaryEntry />} />
          <Route path="reflect" element={<Reflect />} />
          <Route path="review" element={<Review />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <MiniPlayer />
    </Suspense>
  )
}

export default function App() {
  useEffect(() => {
    void ensureWorkoutPlan()
    // Ask the browser to keep our data even under storage pressure.
    void navigator.storage?.persist?.().catch(() => {})
  }, [])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ThemeController />
      <ToastProvider>
        <DiaryProvider>
          <AlarmProvider>
            <ReminderProvider>
              <TimerProvider>
                <SoundProvider>
                  <AppRoutes />
                </SoundProvider>
              </TimerProvider>
            </ReminderProvider>
          </AlarmProvider>
        </DiaryProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
