import { Download, KeyRound, Lock, ShieldCheck, Smartphone, Trash2, Upload, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Card, Field, Input, Modal, PageHeader, Segmented, Toggle } from '../components/ui'
import { downloadJSON, eraseEverything, exportBackup, importBackup, isBackup } from '../db/backup'
import { ensureWorkoutPlan } from '../db/actions'
import { updateSettings, useSettings } from '../db/settings'
import type { ThemePref } from '../db/types'
import { cryptoAvailable } from '../lib/crypto'
import { dayKey } from '../lib/dates'
import { useOnline } from '../lib/hooks'
import { useDiary } from '../state/diaryLock'
import { useToast } from '../state/toast'
import { useInstallPrompt } from '../pwa'

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24">
      <h2 className="mb-1 font-bold">{title}</h2>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  )
}

function PasscodeModal({ mode, onClose }: { mode: 'enable' | 'change' | 'disable' | null; onClose: () => void }) {
  const diary = useDiary()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setError('')
  }, [mode])

  const submit = async () => {
    setError('')
    if (mode !== 'disable') {
      if (next.length < 4) return setError('Use at least 4 characters.')
      if (next !== confirm) return setError("Passcodes don't match.")
    }
    setBusy(true)
    try {
      if (mode === 'enable') {
        await diary.enable(next)
        toast('Diary encrypted and protected 🔒', { tone: 'success' })
      } else if (mode === 'change') {
        if (!(await diary.changePasscode(current, next))) {
          setBusy(false)
          return setError('Current passcode is incorrect.')
        }
        toast('Passcode changed', { tone: 'success' })
      } else if (mode === 'disable') {
        if (!(await diary.unlock(current))) {
          setBusy(false)
          return setError('Passcode is incorrect.')
        }
        await diary.disable()
        toast('Passcode removed. Entries are stored unencrypted on this device.')
      }
      onClose()
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  const title = mode === 'enable' ? 'Protect your diary' : mode === 'change' ? 'Change passcode' : 'Remove passcode'
  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={mode === 'disable' ? 'danger' : 'primary'} disabled={busy} onClick={submit}>
            {busy ? 'Working…' : mode === 'disable' ? 'Remove passcode' : 'Save passcode'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {mode === 'enable' && (
          <p className="rounded-2xl bg-warn-soft px-3 py-2 text-xs text-warn">
            Your entries will be encrypted with this passcode. If you forget it, they can't be recovered — not even by us, since nothing leaves your device.
          </p>
        )}
        {(mode === 'change' || mode === 'disable') && (
          <Field label="Current passcode">
            {(id) => <Input id={id} type="password" autoFocus autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
        )}
        {mode !== 'disable' && (
          <>
            <Field label="New passcode" hint="At least 4 characters. A short phrase is stronger than a PIN.">
              {(id) => <Input id={id} type="password" autoFocus={mode === 'enable'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
            </Field>
            <Field label="Confirm passcode">
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
            </Field>
          </>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

export default function SettingsPage() {
  const s = useSettings()
  const diary = useDiary()
  const toast = useToast()
  const online = useOnline()
  const install = useInstallPrompt()
  const fileRef = useRef<HTMLInputElement>(null)
  const [passMode, setPassMode] = useState<'enable' | 'change' | 'disable' | null>(null)
  const [eraseOpen, setEraseOpen] = useState(false)
  const [eraseText, setEraseText] = useState('')
  const [name, setName] = useState(s.name)
  const [storage, setStorage] = useState<string>('')

  useEffect(() => setName(s.name), [s.name])
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setStorage(`${(e.usage / 1e6).toFixed(1)} MB used on this device`)
    })
  }, [])

  const requestNotifications = async (on: boolean) => {
    if (on && 'Notification' in window) {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        toast('Notifications were blocked by the browser', { tone: 'error' })
        return
      }
    }
    await updateSettings({ notifications: on })
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Make Elvora yours. Everything is saved on this device." />
      <div className="mx-auto max-w-3xl space-y-6">
        <Section title="Profile & appearance">
          <Row title="Your name" hint="Used for greetings">
            <Input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} onBlur={() => void updateSettings({ name: name.trim() })} className="w-48" placeholder="Optional" />
          </Row>
          <Row title="Theme">
            <Segmented<ThemePref>
              value={s.theme}
              onChange={(theme) => void updateSettings({ theme })}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
          <Row title="Week starts on">
            <Segmented
              value={String(s.weekStartsOn) as '0' | '1'}
              onChange={(v) => void updateSettings({ weekStartsOn: Number(v) as 0 | 1 })}
              options={[
                { value: '1', label: 'Monday' },
                { value: '0', label: 'Sunday' },
              ]}
            />
          </Row>
        </Section>

        <Section title="Goals & reminders">
          <Row title="Daily focus goal" hint="Shown in Today's Mission. 0 hides it.">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={600}
                step={5}
                value={s.dailyFocusGoal}
                onChange={(e) => void updateSettings({ dailyFocusGoal: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })}
                className="w-24"
                aria-label="Daily focus goal in minutes"
              />
              <span className="text-sm text-muted">min</span>
            </div>
          </Row>
          <Row title="Never miss twice" hint="Missing one planned day won't break a streak — only two in a row will.">
            <Toggle label="Never miss twice" checked={s.streakGrace} onChange={(v) => void updateSettings({ streakGrace: v })} />
          </Row>
          <Row title="Evening reflection prompt" hint="A gentle nudge on the dashboard — never a nag.">
            <Toggle label="Evening reflection prompt" checked={s.reflectionPrompt} onChange={(v) => void updateSettings({ reflectionPrompt: v })} />
          </Row>
          <Row title="Reflection time" hint="When the evening prompt appears">
            <select
              value={s.reflectionHour}
              aria-label="Reflection time"
              onChange={(e) => void updateSettings({ reflectionHour: Number(e.target.value) })}
              className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm"
            >
              {Array.from({ length: 10 }, (_, i) => i + 15).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </Row>
          <Row title="Timer notifications" hint="Get notified when a focus session or timer ends while the app is in the background.">
            <Toggle label="Timer notifications" checked={s.notifications} onChange={(v) => void requestNotifications(v)} />
          </Row>
        </Section>

        <Section id="privacy" title="Privacy & diary protection">
          <div className="py-3 text-sm text-muted">
            <ShieldCheck size={16} className="mr-1.5 inline text-good" />
            Elvora has no accounts and no servers — your habits, diary and progress never leave this device unless you export them.
          </div>
          <Row
            title="Diary passcode"
            hint={diary.enabled ? 'Entries are encrypted with AES-256-GCM.' : cryptoAvailable() ? 'Encrypt your diary and lock it with a passcode.' : 'Requires a secure connection (https).'}
          >
            {diary.enabled ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={<KeyRound size={15} />} onClick={() => setPassMode('change')}>
                  Change
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPassMode('disable')}>
                  Remove
                </Button>
              </div>
            ) : (
              <Button size="sm" icon={<Lock size={15} />} disabled={!cryptoAvailable()} onClick={() => setPassMode('enable')}>
                Set passcode
              </Button>
            )}
          </Row>
          {diary.enabled && (
            <>
              <Row title="Auto-lock after inactivity">
                <select
                  value={s.autoLockMinutes}
                  aria-label="Auto-lock"
                  onChange={(e) => void updateSettings({ autoLockMinutes: Number(e.target.value) })}
                  className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm"
                >
                  {[1, 2, 5, 10, 15, 30].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                  <option value={0}>Never (until reload)</option>
                </select>
              </Row>
              <Row title="Lock now">
                <Button variant="secondary" size="sm" disabled={diary.locked} onClick={diary.lock} icon={<Lock size={15} />}>
                  {diary.locked ? 'Locked' : 'Lock diary'}
                </Button>
              </Row>
            </>
          )}
        </Section>

        <Section title="Your data">
          <Row title="Export backup" hint={diary.enabled ? 'Diary entries stay encrypted in the backup.' : 'Includes diary entries in readable form — keep the file safe.'}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={15} />}
              onClick={async () => {
                downloadJSON(await exportBackup(), `elvora-backup-${dayKey()}.json`)
                toast('Backup downloaded', { tone: 'success' })
              }}
            >
              Export
            </Button>
          </Row>
          <Row title="Restore from backup" hint="Replaces current data with the backup's contents.">
            <>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  try {
                    const data: unknown = JSON.parse(await f.text())
                    if (!isBackup(data)) throw new Error('bad file')
                    await importBackup(data)
                    await ensureWorkoutPlan()
                    diary.lock()
                    toast('Backup restored', { tone: 'success' })
                  } catch {
                    toast("That file isn't a valid Elvora backup", { tone: 'error' })
                  }
                }}
              />
              <Button variant="secondary" size="sm" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
                Import
              </Button>
            </>
          </Row>
          <Row title="Erase everything" hint="Permanently deletes all data on this device.">
            <Button variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={() => setEraseOpen(true)}>
              Erase
            </Button>
          </Row>
          {storage && <div className="py-3 text-xs text-faint">{storage}</div>}
        </Section>

        <Section title="App">
          <Row title="Connection" hint="Everything works offline except online music.">
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${online ? 'text-good' : 'text-warn'}`}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />} {online ? 'Online' : 'Offline'}
            </span>
          </Row>
          <Row title="Install Elvora" hint={install.installed ? 'Installed — open it from your home screen or apps.' : 'Add it to your home screen or desktop like a native app.'}>
            {install.canInstall ? (
              <Button size="sm" icon={<Smartphone size={15} />} onClick={install.prompt}>
                Install
              </Button>
            ) : (
              <span className="max-w-56 text-right text-xs text-muted">
                {install.installed ? '✓ Installed' : 'Use your browser menu → “Install app” or “Add to Home Screen”.'}
              </span>
            )}
          </Row>
          <div className="py-3 text-xs text-faint">Elvora · Progress with purpose.</div>
        </Section>
      </div>

      <PasscodeModal mode={passMode} onClose={() => setPassMode(null)} />
      <Modal
        open={eraseOpen}
        onClose={() => setEraseOpen(false)}
        title="Erase all data?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEraseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={eraseText !== 'ERASE'}
              onClick={async () => {
                await eraseEverything()
                try {
                  localStorage.removeItem('elvora.timers.v1')
                } catch {
                  // ignore
                }
                window.location.assign(import.meta.env.BASE_URL)
              }}
            >
              Erase everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Habits, missions, diary, workouts, counters, music and settings will be deleted from this device. Consider exporting a backup first.</p>
        <Field label='Type "ERASE" to confirm'>{(id) => <Input id={id} value={eraseText} onChange={(e) => setEraseText(e.target.value)} className="mt-2" />}</Field>
      </Modal>
    </>
  )
}
