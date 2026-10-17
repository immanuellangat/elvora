export interface AchievementStats {
  habitChecks: number
  bestStreak: number
  focusMinutes: number
  workouts: number
  tasksDone: number
  diaryEntries: number
  reflections: number
  longestCounter: number
}

export interface Achievement {
  id: string
  title: string
  description: string
  emoji: string
  metric: keyof AchievementStats
  target: number
}

export interface AchievementStatus extends Achievement {
  value: number
  earned: boolean
  progress: number
}

const tiers = (
  metric: keyof AchievementStats,
  emoji: string,
  levels: [number, string, string][],
): Achievement[] =>
  levels.map(([target, title, description]) => ({ id: `${metric}-${target}`, metric, target, emoji, title, description }))

export const ACHIEVEMENTS: Achievement[] = [
  ...tiers('habitChecks', '🌱', [
    [1, 'First step', 'Checked off a habit for the first time'],
    [25, 'Taking root', '25 habit check-ins'],
    [100, 'Rooted', '100 habit check-ins'],
    [365, 'Evergreen', '365 habit check-ins'],
  ]),
  ...tiers('bestStreak', '🔥', [
    [3, 'Spark', 'A 3-day streak'],
    [7, 'One full week', 'A 7-day streak'],
    [21, 'Three weeks strong', 'A 21-day streak'],
    [66, 'Habit formed', 'A 66-day streak — the average time to build a habit'],
    [100, 'Centurion', 'A 100-day streak'],
  ]),
  ...tiers('focusMinutes', '🎯', [
    [25, 'First focus', 'Completed 25 minutes of focus'],
    [300, 'Deep worker', '5 hours of focused time'],
    [1500, 'Flow state', '25 hours of focused time'],
    [6000, 'Master of focus', '100 hours of focused time'],
  ]),
  ...tiers('workouts', '💪', [
    [1, 'Moving', 'Completed your first workout'],
    [10, 'Getting stronger', '10 workouts completed'],
    [50, 'Athlete in progress', '50 workouts completed'],
  ]),
  ...tiers('tasksDone', '✅', [
    [10, 'On a mission', '10 mission tasks completed'],
    [100, 'Mission veteran', '100 mission tasks completed'],
  ]),
  ...tiers('reflections', '🌙', [
    [1, 'Looking inward', 'Completed your first evening reflection'],
    [7, 'Reflective week', '7 evening reflections'],
    [30, 'Self-aware', '30 evening reflections'],
  ]),
  ...tiers('diaryEntries', '📖', [[10, 'Storyteller', '10 diary entries']]),
  ...tiers('longestCounter', '📅', [
    [30, 'A month in', 'A day counter reached 30 days'],
    [100, '100 days', 'A day counter reached 100 days'],
    [365, 'A whole year', 'A day counter reached 365 days'],
  ]),
]

export function evaluateAchievements(stats: AchievementStats): AchievementStatus[] {
  return ACHIEVEMENTS.map((a) => {
    const value = stats[a.metric]
    return { ...a, value, earned: value >= a.target, progress: Math.min(1, value / a.target) }
  })
}

/** Next unearned achievements, closest to completion first. */
export function nextAchievements(list: AchievementStatus[], count = 3): AchievementStatus[] {
  return list
    .filter((a) => !a.earned)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, count)
}

export const COUNTER_MILESTONES = [1, 3, 7, 14, 21, 30, 50, 60, 90, 100, 150, 180, 200, 250, 300, 365, 500, 730, 1000]

export function nextMilestone(days: number): number {
  return COUNTER_MILESTONES.find((m) => m > days) ?? Math.ceil((days + 1) / 365) * 365
}
