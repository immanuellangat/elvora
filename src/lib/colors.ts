import type { HabitColor } from '../db/types'

export const HABIT_COLORS: Record<HabitColor, string> = {
  violet: '#8b5cf6',
  indigo: '#6366f1',
  sky: '#0ea5e9',
  teal: '#14b8a6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  pink: '#ec4899',
}

export const HABIT_EMOJIS = ['💪', '📚', '💻', '🧘', '🏃', '💧', '✍️', '🎸', '🥗', '😴', '🧠', '🌿', '🎨', '🙏', '📵', '🚶', '🗣️', '💊', '🧹', '💰']

export const HABIT_SUGGESTIONS: { name: string; emoji: string; color: HabitColor }[] = [
  { name: 'Work out', emoji: '💪', color: 'violet' },
  { name: 'Read 10 pages', emoji: '📚', color: 'amber' },
  { name: 'Code', emoji: '💻', color: 'indigo' },
  { name: 'Study', emoji: '🧠', color: 'sky' },
  { name: 'Meditate', emoji: '🧘', color: 'teal' },
  { name: 'Drink water', emoji: '💧', color: 'sky' },
  { name: 'Journal', emoji: '✍️', color: 'pink' },
  { name: 'Walk outside', emoji: '🚶', color: 'emerald' },
]
