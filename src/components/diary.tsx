import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { Lock, ShieldAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db/db'
import type { DiaryContent, DiaryEntry, Mood } from '../db/types'
import { cryptoAvailable } from '../lib/crypto'
import { useDiary } from '../state/diaryLock'
import { Button, Card, Input } from './ui'

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Meh' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
]

export function moodEmoji(m?: Mood): string {
  return MOODS.find((x) => x.value === m)?.emoji ?? '·'
}

export function MoodPicker({ value, onChange }: { value?: Mood; onChange: (m: Mood | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mood">
      {MOODS.map((m) => (
        <motion.button
          key={m.value}
          role="radio"
          aria-checked={value === m.value}
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(value === m.value ? undefined : m.value)}
          className={clsx(
            'flex w-16 flex-col items-center gap-1 rounded-2xl border py-2 text-xs font-medium transition',
            value === m.value ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:bg-surface-2',
          )}
        >
          <span className={clsx('text-2xl transition', value !== undefined && value !== m.value && 'opacity-50 grayscale')}>{m.emoji}</span>
          {m.label}
        </motion.button>
      ))}
    </div>
  )
}

/** Shows an unlock screen when the diary is locked; renders children otherwise. */
export function DiaryGate({ children }: { children: ReactNode }) {
  const diary = useDiary()
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!diary.ready) return null
  if (!diary.locked) return <>{children}</>

  if (!cryptoAvailable())
    return (
      <Card className="mx-auto max-w-md text-center">
        <ShieldAlert className="mx-auto text-warn" />
        <p className="mt-3 text-sm text-muted">Encryption is only available over a secure connection (https or localhost). Open Elvora from a secure address to unlock your diary.</p>
      </Card>
    )

  return (
    <div className="mx-auto max-w-sm py-10 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="brand-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-glow"
      >
        <Lock size={26} />
      </motion.div>
      <h1 className="mt-5 text-2xl font-extrabold">Your diary is locked</h1>
      <p className="mt-1 text-sm text-muted">Entries are encrypted on this device. Enter your passcode to open them.</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!pass) return
          setBusy(true)
          const ok = await diary.unlock(pass)
          setBusy(false)
          if (!ok) setError("That passcode didn't match. Try again.")
          setPass('')
        }}
      >
        <Input type="password" autoFocus autoComplete="current-password" value={pass} placeholder="Passcode" aria-label="Passcode" onChange={(e) => (setPass(e.target.value), setError(''))} className="text-center" />
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button type="submit" className="w-full" disabled={!pass || busy}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>
      </form>
    </div>
  )
}

export interface DecryptedEntry {
  entry: DiaryEntry
  content: DiaryContent
}

/** All diary entries, decrypted when unlocked (newest first). */
export function useDecryptedEntries(): DecryptedEntry[] | undefined {
  const diary = useDiary()
  const entries = useLiveQuery(() => db.diary.orderBy('date').reverse().toArray(), [])
  const [result, setResult] = useState<DecryptedEntry[] | undefined>(undefined)

  useEffect(() => {
    if (!entries) return
    let cancelled = false
    void (async () => {
      const out: DecryptedEntry[] = []
      for (const entry of entries) {
        const content = await diary.read(entry)
        if (content) out.push({ entry, content })
      }
      if (!cancelled) setResult(out)
    })()
    return () => {
      cancelled = true
    }
  }, [entries, diary])

  return result
}

export function entryPreview(c: DiaryContent): string {
  const text = c.title || c.body || c.accomplished || c.learned || c.challenges || c.tomorrow
  return text.replace(/\s+/g, ' ').trim()
}
