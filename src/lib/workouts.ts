import type { Exercise, WorkoutDay } from '../db/types'

export interface LibraryExercise {
  name: string
  sets: number
  reps?: number
  seconds?: number
  tip: string
  area: 'Lower body' | 'Upper body' | 'Core' | 'Cardio' | 'Mobility'
}

/** Beginner-friendly movements that need no equipment. */
export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { name: 'Bodyweight squats', sets: 3, reps: 10, area: 'Lower body', tip: 'Feet shoulder-width, sit back like into a chair, chest up.' },
  { name: 'Glute bridges', sets: 3, reps: 12, area: 'Lower body', tip: 'Lie on your back, knees bent, squeeze your glutes to lift your hips.' },
  { name: 'Reverse lunges', sets: 3, reps: 8, area: 'Lower body', tip: 'Step back, lower gently, alternate legs. Hold a wall for balance.' },
  { name: 'Wall sit', sets: 3, seconds: 20, area: 'Lower body', tip: 'Back flat on the wall, knees above ankles. Stop before it burns too much.' },
  { name: 'Calf raises', sets: 3, reps: 15, area: 'Lower body', tip: 'Rise slowly onto your toes, lower with control.' },
  { name: 'Knee push-ups', sets: 3, reps: 8, area: 'Upper body', tip: 'Knees down, body in a straight line from head to knees.' },
  { name: 'Incline push-ups', sets: 3, reps: 10, area: 'Upper body', tip: 'Hands on a table or bench — the higher, the easier.' },
  { name: 'Wall push-ups', sets: 3, reps: 12, area: 'Upper body', tip: 'The gentlest push-up. Great for building up to the floor.' },
  { name: 'Superman hold', sets: 3, seconds: 15, area: 'Upper body', tip: 'Lie face down, lift arms and legs a little, breathe.' },
  { name: 'Plank', sets: 3, seconds: 20, area: 'Core', tip: 'Forearms down, hips level. Drop to knees if needed.' },
  { name: 'Dead bug', sets: 3, reps: 10, area: 'Core', tip: 'Lower back pressed down, extend opposite arm and leg slowly.' },
  { name: 'Bird-dog', sets: 3, reps: 10, area: 'Core', tip: 'On all fours, reach opposite arm and leg, keep hips still.' },
  { name: 'Side plank (knees)', sets: 2, seconds: 15, area: 'Core', tip: 'Each side. Keep a straight line from head to knees.' },
  { name: 'Brisk walk', sets: 1, seconds: 1200, area: 'Cardio', tip: 'A pace where you can talk but not sing.' },
  { name: 'Marching in place', sets: 3, seconds: 60, area: 'Cardio', tip: 'Lift knees and swing arms. Easy on the joints.' },
  { name: 'Step-ups', sets: 3, reps: 10, area: 'Cardio', tip: 'Use a sturdy step, alternate leading leg.' },
  { name: 'Jumping jacks (low impact)', sets: 3, seconds: 30, area: 'Cardio', tip: 'Step out side to side instead of jumping.' },
  { name: 'Cat-cow stretch', sets: 2, reps: 8, area: 'Mobility', tip: 'Slowly round and arch your back with your breath.' },
  { name: 'Hip flexor stretch', sets: 2, seconds: 30, area: 'Mobility', tip: 'Half-kneel, tuck your pelvis, feel the front of the hip open.' },
  { name: "Child's pose", sets: 1, seconds: 60, area: 'Mobility', tip: 'Sit back on heels, arms forward, breathe deeply.' },
  { name: 'Hamstring stretch', sets: 2, seconds: 30, area: 'Mobility', tip: 'Each leg. Hinge at the hips, keep the back long.' },
  { name: 'Shoulder rolls', sets: 2, reps: 10, area: 'Mobility', tip: 'Big slow circles forwards and backwards.' },
]

let counter = 0
function ex(name: string): Exercise {
  const lib = EXERCISE_LIBRARY.find((e) => e.name === name)
  counter++
  return {
    id: `default-${counter}`,
    name,
    sets: lib?.sets ?? 3,
    reps: lib?.reps,
    seconds: lib?.seconds,
  }
}

export function defaultPlan(): WorkoutDay[] {
  counter = 0
  return [
    { weekday: 0, rest: true, title: 'Rest & recharge', exercises: [] },
    {
      weekday: 1,
      rest: false,
      title: 'Full body A',
      exercises: [ex('Bodyweight squats'), ex('Knee push-ups'), ex('Glute bridges'), ex('Plank')],
    },
    { weekday: 2, rest: false, title: 'Easy cardio', exercises: [ex('Brisk walk'), ex('Hamstring stretch'), ex('Shoulder rolls')] },
    { weekday: 3, rest: true, title: 'Rest & recharge', exercises: [] },
    {
      weekday: 4,
      rest: false,
      title: 'Full body B',
      exercises: [ex('Reverse lunges'), ex('Incline push-ups'), ex('Bird-dog'), ex('Wall sit')],
    },
    { weekday: 5, rest: true, title: 'Rest & recharge', exercises: [] },
    {
      weekday: 6,
      rest: false,
      title: 'Mobility & core',
      exercises: [ex('Cat-cow stretch'), ex('Hip flexor stretch'), ex('Dead bug'), ex('Side plank (knees)'), ex("Child's pose")],
    },
  ]
}

export function exerciseAmount(e: Pick<Exercise, 'sets' | 'reps' | 'seconds'>): string {
  const per = e.seconds
    ? e.seconds >= 60
      ? `${Math.round(e.seconds / 60)} min`
      : `${e.seconds}s`
    : `${e.reps ?? 10} reps`
  return e.sets > 1 ? `${e.sets} × ${per}` : per
}

export function tipFor(name: string): string | undefined {
  return EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === name.toLowerCase())?.tip
}
