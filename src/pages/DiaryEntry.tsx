import { format } from 'date-fns'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Moon, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DiaryGate, MoodPicker } from '../components/diary'
import { Button, Card, Input, Modal, Textarea } from '../components/ui'
import { db } from '../db/db'
import type { DiaryContent } from '../db/types'
import { parseDay, prettyDay, shiftDay } from '../lib/dates'
import { useToday } from '../lib/hooks'
import { EMPTY_CONTENT, useDiary } from '../state/diaryLock'
import { useToast } from '../state/toast'

const PROMPTS: { key: keyof DiaryContent; label: string; placeholder: string }[] = [
  { key: 'accomplished', label: 'What did I accomplish?', placeholder: 'Big or small — it all counts.' },
  { key: 'challenges', label: 'What challenges did I face?', placeholder: 'What was hard, and how did you handle it?' },
  { key: 'learned', label: 'What did I learn?', placeholder: 'A lesson, an insight, something new…' },
  { key: 'improve', label: 'What could I do better?', placeholder: 'One gentle adjustment for next time.' },
  { key: 'tomorrow', label: 'What do I want to achieve tomorrow?', placeholder: 'One idea per line' },
]

function isEmpty(c: DiaryContent) {
  return !c.mood && !c.title?.trim() && PROMPTS.every((p) => !String(c[p.key] ?? '').trim()) && !c.body.trim()
}

function Editor({ date }: { date: string }) {
  const diary = useDiary()
  const today = useToday()
  const navigate = useNavigate()
  const toast = useToast()
  const [content, setContent] = useState<DiaryContent | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exists, setExists] = useState(false)
  const dirty = useRef(false)
  const latest = useRef<DiaryContent | null>(null)
  const existsRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    dirty.current = false
    void (async () => {
      const entry = await db.diary.where('date').equals(date).first()
      const c = entry ? await diary.read(entry) : { ...EMPTY_CONTENT }
      if (!cancelled) {
        setExists(Boolean(entry))
        existsRef.current = Boolean(entry)
        setContent(c ?? { ...EMPTY_CONTENT })
        latest.current = c
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const persist = async () => {
    const c = latest.current
    if (!c || !dirty.current) return
    dirty.current = false
    if (isEmpty(c) && !existsRef.current) return
    setStatus('saving')
    try {
      await diary.save(date, c)
      setExists(true)
      existsRef.current = true
      setStatus('saved')
    } catch {
      dirty.current = true
      setStatus('idle')
      toast("Couldn't save — unlock your diary and try again", { tone: 'error' })
    }
  }

  // Debounced autosave.
  useEffect(() => {
    if (!content || !dirty.current) return
    const id = window.setTimeout(() => void persist(), 700)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // Save on leave.
  useEffect(() => () => void persist(), // eslint-disable-next-line react-hooks/exhaustive-deps
  [date])

  const update = (patch: Partial<DiaryContent>) => {
    if (!content) return
    const next = { ...content, ...patch }
    dirty.current = true
    latest.current = next
    setStatus('idle')
    setContent(next)
  }

  if (!content) return null

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link to="/diary" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={16} /> Diary
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
          {status === 'saving' && (
            <>
              <Loader2 size={13} className="animate-spin" /> Saving…
            </>
          )}
          {status === 'saved' && (
            <>
              <Check size={13} className="text-good" /> Saved{diary.enabled ? ' · encrypted' : ''}
            </>
          )}
        </span>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-brand">{prettyDay(date, today)}</div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{format(parseDay(date), 'EEEE, MMMM d, yyyy')}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button aria-label="Previous day" className="rounded-xl p-2 text-muted hover:bg-surface-2" onClick={() => navigate(`/diary/${shiftDay(date, -1)}`)}>
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="Next day"
            disabled={date >= today}
            className="rounded-xl p-2 text-muted hover:bg-surface-2 disabled:opacity-30"
            onClick={() => navigate(`/diary/${shiftDay(date, 1)}`)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5">
        <Card>
          <div className="mb-3 text-sm font-semibold">How are you feeling?</div>
          <MoodPicker value={content.mood} onChange={(mood) => update({ mood })} />
        </Card>

        <Card className="space-y-3">
          <Input
            value={content.title ?? ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Give today a title (optional)"
            aria-label="Entry title"
            maxLength={100}
            className="border-none bg-transparent px-0 text-lg font-bold focus:ring-0"
          />
          <Textarea
            value={content.body}
            onChange={(e) => update({ body: e.target.value })}
            placeholder="How did your day go? Write freely — this space is just for you."
            aria-label="Diary entry"
            rows={8}
          />
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Reflection</h2>
            <Link to={`/reflect?date=${date}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand">
              <Moon size={14} /> Guided reflection
            </Link>
          </div>
          {PROMPTS.map((p) => (
            <div key={p.key}>
              <label className="mb-1.5 block text-sm font-medium" htmlFor={`p-${p.key}`}>
                {p.label}
              </label>
              <Textarea id={`p-${p.key}`} rows={3} value={String(content[p.key] ?? '')} placeholder={p.placeholder} onChange={(e) => update({ [p.key]: e.target.value })} />
            </div>
          ))}
        </Card>

        {exists && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" icon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
              Delete entry
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this entry?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                dirty.current = false
                existsRef.current = false
                await diary.remove(date)
                toast('Entry deleted')
                navigate('/diary')
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">This can't be undone.</p>
      </Modal>
    </>
  )
}

export default function DiaryEntryPage() {
  const { date = '' } = useParams()
  const today = useToday()
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today
  if (!valid)
    return (
      <div className="py-20 text-center text-muted">
        That date isn't available. <Link to="/diary" className="text-brand">Back to diary</Link>
      </div>
    )
  return (
    <DiaryGate>
      <Editor key={date} date={date} />
    </DiaryGate>
  )
}
