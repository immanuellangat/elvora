import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db, uid } from '../db/db'
import { useSettings } from '../db/settings'
import type { DayKey, DiaryContent, DiaryEntry, LockMeta } from '../db/types'
import { createLock, decryptJSON, encryptJSON, unlockWith } from '../lib/crypto'

export const EMPTY_CONTENT: DiaryContent = {
  body: '',
  accomplished: '',
  challenges: '',
  tomorrow: '',
  learned: '',
  improve: '',
}

interface DiaryApi {
  /** Lock metadata loaded from the database (undefined while loading). */
  ready: boolean
  enabled: boolean
  locked: boolean
  unlock: (passcode: string) => Promise<boolean>
  lock: () => void
  enable: (passcode: string) => Promise<void>
  disable: () => Promise<void>
  changePasscode: (current: string, next: string) => Promise<boolean>
  read: (entry: DiaryEntry) => Promise<DiaryContent | null>
  save: (date: DayKey, content: DiaryContent) => Promise<void>
  remove: (date: DayKey) => Promise<void>
}

const DiaryContext = createContext<DiaryApi | null>(null)

export function useDiary(): DiaryApi {
  const ctx = useContext(DiaryContext)
  if (!ctx) throw new Error('useDiary must be used inside DiaryProvider')
  return ctx
}

export function DiaryProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const metaRow = useLiveQuery(() => db.settings.get('lock').then((r) => r ?? null), [])
  const meta = (metaRow?.value as LockMeta | undefined) ?? undefined
  const [key, setKey] = useState<CryptoKey | null>(null)
  const keyRef = useRef(key)
  keyRef.current = key
  const metaRef = useRef(meta)
  metaRef.current = meta

  const enabled = Boolean(meta)
  const locked = enabled && !key

  // If the lock was removed elsewhere (e.g. backup restore), forget the key.
  useEffect(() => {
    if (metaRow !== undefined && !meta && key) setKey(null)
  }, [metaRow, meta, key])

  // Auto-lock after inactivity.
  useEffect(() => {
    if (!key || settings.autoLockMinutes <= 0) return
    const limit = settings.autoLockMinutes * 60_000
    let last = Date.now()
    const bump = () => {
      last = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const id = window.setInterval(() => {
      if (Date.now() - last >= limit) setKey(null)
    }, 5_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump))
      window.clearInterval(id)
    }
  }, [key, settings.autoLockMinutes])

  const read = useCallback(async (entry: DiaryEntry): Promise<DiaryContent | null> => {
    if (entry.content) return { ...EMPTY_CONTENT, ...entry.content }
    if (entry.enc) {
      const k = keyRef.current
      if (!k) return null
      try {
        return { ...EMPTY_CONTENT, ...(await decryptJSON<DiaryContent>(k, entry.enc)) }
      } catch {
        return null
      }
    }
    return { ...EMPTY_CONTENT }
  }, [])

  const save = useCallback(async (date: DayKey, content: DiaryContent) => {
    const existing = await db.diary.where('date').equals(date).first()
    const now = Date.now()
    const base: DiaryEntry = existing ?? { id: uid(), date, createdAt: now, updatedAt: now }
    if (metaRef.current) {
      const k = keyRef.current
      if (!k) throw new Error('Diary is locked')
      const enc = await encryptJSON(k, content)
      await db.diary.put({ id: base.id, date, createdAt: base.createdAt, updatedAt: now, enc })
    } else {
      await db.diary.put({ id: base.id, date, createdAt: base.createdAt, updatedAt: now, content })
    }
  }, [])

  const api = useMemo<DiaryApi>(
    () => ({
      ready: metaRow !== undefined,
      enabled,
      locked,
      unlock: async (passcode) => {
        const m = metaRef.current
        if (!m) return true
        const k = await unlockWith(passcode, m)
        if (k) setKey(k)
        return Boolean(k)
      },
      lock: () => setKey(null),
      enable: async (passcode) => {
        const { meta: newMeta, key: newKey } = await createLock(passcode)
        const entries = await db.diary.toArray()
        const encrypted: DiaryEntry[] = []
        for (const e of entries) {
          const content = e.content ?? EMPTY_CONTENT
          encrypted.push({ id: e.id, date: e.date, createdAt: e.createdAt, updatedAt: e.updatedAt, enc: await encryptJSON(newKey, content) })
        }
        await db.transaction('rw', db.diary, db.settings, async () => {
          await db.diary.bulkPut(encrypted)
          await db.settings.put({ key: 'lock', value: newMeta })
        })
        setKey(newKey)
      },
      disable: async () => {
        const k = keyRef.current
        if (!k) throw new Error('Unlock the diary first')
        const entries = await db.diary.toArray()
        const plain: DiaryEntry[] = []
        for (const e of entries) {
          const content = e.enc ? await decryptJSON<DiaryContent>(k, e.enc) : (e.content ?? EMPTY_CONTENT)
          plain.push({ id: e.id, date: e.date, createdAt: e.createdAt, updatedAt: e.updatedAt, content })
        }
        await db.transaction('rw', db.diary, db.settings, async () => {
          await db.diary.bulkPut(plain)
          await db.settings.delete('lock')
        })
        setKey(null)
      },
      changePasscode: async (current, next) => {
        const m = metaRef.current
        if (!m) return false
        const oldKey = await unlockWith(current, m)
        if (!oldKey) return false
        const { meta: newMeta, key: newKey } = await createLock(next)
        const entries = await db.diary.toArray()
        const re: DiaryEntry[] = []
        for (const e of entries) {
          const content = e.enc ? await decryptJSON<DiaryContent>(oldKey, e.enc) : (e.content ?? EMPTY_CONTENT)
          re.push({ id: e.id, date: e.date, createdAt: e.createdAt, updatedAt: e.updatedAt, enc: await encryptJSON(newKey, content) })
        }
        await db.transaction('rw', db.diary, db.settings, async () => {
          await db.diary.bulkPut(re)
          await db.settings.put({ key: 'lock', value: newMeta })
        })
        setKey(newKey)
        return true
      },
      read,
      save,
      remove: async (date) => {
        await db.diary.where('date').equals(date).delete()
      },
    }),
    [metaRow, enabled, locked, read, save],
  )

  return <DiaryContext.Provider value={api}>{children}</DiaryContext.Provider>
}
