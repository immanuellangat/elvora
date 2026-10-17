import clsx from 'clsx'
import { Link2, Music, Play, Plus, Radio, Trash2, Upload, Volume2, WifiOff, Wind } from 'lucide-react'
import { useRef, useState } from 'react'
import { db, uid } from '../db/db'
import { updateSettings, useSettings } from '../db/settings'
import { AMBIENT_SOUNDS } from '../lib/audio'
import { useOnline } from '../lib/hooks'
import { STATIONS, isLikelyAudioUrl, parseYouTube } from '../lib/music'
import { useSound } from '../state/sound'
import { useToast } from '../state/toast'
import { Button, Input, Segmented } from './ui'

type Tab = 'ambient' | 'online' | 'mine'

function formatSize(bytes: number) {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`
}

export function SoundPanel() {
  const [tab, setTab] = useState<Tab>('ambient')
  const sound = useSound()
  const online = useOnline()
  const settings = useSettings()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    let added = 0
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|webm)$/i.test(f.name)) continue
      await db.tracks.add({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), type: f.type, size: f.size, blob: f, addedAt: Date.now() })
      added++
    }
    try {
      await navigator.storage?.persist?.()
    } catch {
      // best effort
    }
    toast(added ? `Added ${added} track${added > 1 ? 's' : ''} — available offline` : 'No audio files found', { tone: added ? 'success' : 'error' })
  }

  const addLink = async () => {
    const url = linkUrl.trim()
    if (!parseYouTube(url) && !isLikelyAudioUrl(url)) {
      toast('Paste a YouTube link or a direct audio/stream URL', { tone: 'error' })
      return
    }
    const name = linkName.trim() || (parseYouTube(url) ? 'YouTube mix' : 'My stream')
    await updateSettings({ links: [...settings.links, { id: uid(), name, url }] })
    setLinkName('')
    setLinkUrl('')
    sound.playLink(name, url)
  }

  return (
    <div className="space-y-4">
      <Segmented
        value={tab}
        onChange={setTab}
        className="w-full"
        options={[
          { value: 'ambient', label: <span className="inline-flex items-center gap-1.5"><Wind size={14} />Ambient</span> },
          { value: 'online', label: <span className="inline-flex items-center gap-1.5"><Radio size={14} />Online</span> },
          { value: 'mine', label: <span className="inline-flex items-center gap-1.5"><Music size={14} />My music</span> },
        ]}
      />

      {tab === 'ambient' && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Generated on your device — works offline. Mix as many as you like.</p>
          {AMBIENT_SOUNDS.map((s) => {
            const ch = sound.ambient[s.id]
            return (
              <div
                key={s.id}
                className={clsx('flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition', ch.on ? 'border-brand/50 bg-brand-soft/60' : 'border-line')}
              >
                <button
                  onClick={() => sound.toggleAmbient(s.id)}
                  aria-pressed={ch.on}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="text-xl">{s.emoji}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{s.name}</span>
                    <span className="block truncate text-xs text-muted">{s.hint}</span>
                  </span>
                </button>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={ch.volume}
                  aria-label={`${s.name} volume`}
                  onChange={(e) => sound.setAmbientVolume(s.id, Number(e.target.value))}
                  className={clsx('w-24', !ch.on && 'opacity-40')}
                />
              </div>
            )
          })}
          {sound.anyAmbient && (
            <Button variant="ghost" size="sm" onClick={sound.stopAmbient}>
              Stop all ambient
            </Button>
          )}
        </div>
      )}

      {tab === 'online' && (
        <div className="space-y-3">
          {!online && (
            <div className="flex items-center gap-2 rounded-2xl bg-warn-soft px-3 py-2 text-xs text-warn">
              <WifiOff size={14} /> You're offline. Ambient sounds and My music still work.
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {STATIONS.map((s) => {
              const active = sound.music?.id === s.id
              return (
                <button
                  key={s.id}
                  disabled={!online}
                  onClick={() => (active ? sound.stopMusic() : sound.playStation(s))}
                  className={clsx(
                    'rounded-2xl border px-3 py-2.5 text-left transition disabled:opacity-40',
                    active ? 'border-brand/50 bg-brand-soft/60' : 'border-line hover:bg-surface-2',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {active ? <Volume2 size={14} className="text-brand" /> : <Play size={14} className="text-muted" />}
                    {s.name}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{s.description}</div>
                </button>
              )
            })}
          </div>

          <div className="rounded-2xl border border-line p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Link2 size={14} /> Your own link
            </div>
            <div className="space-y-2">
              <Input placeholder="YouTube video/playlist link or stream URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <div className="flex gap-2">
                <Input placeholder="Name (optional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} className="flex-1" />
                <Button disabled={!linkUrl.trim() || !online} onClick={addLink} icon={<Plus size={15} />}>
                  Save & play
                </Button>
              </div>
            </div>
            {settings.links.length > 0 && (
              <div className="mt-3 space-y-1">
                {settings.links.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <button disabled={!online} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm disabled:opacity-40" onClick={() => sound.playLink(l.name, l.url)}>
                      <Play size={13} className="shrink-0 text-muted" />
                      <span className="truncate">{l.name}</span>
                    </button>
                    <button
                      aria-label={`Remove ${l.name}`}
                      className="p-1 text-faint hover:text-bad"
                      onClick={() => void updateSettings({ links: settings.links.filter((x) => x.id !== l.id) })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Add audio files from your device. They're stored privately in the app and play offline.</p>
          <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
          <Button variant="soft" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
            Add music files
          </Button>
          {sound.tracks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No tracks yet.</p>
          ) : (
            <div className="space-y-1">
              {sound.tracks.map((t) => {
                const active = sound.music?.type === 'track' && sound.music.id === t.id
                return (
                  <div key={t.id} className={clsx('flex items-center gap-2 rounded-xl px-2 py-2', active ? 'bg-brand-soft/60' : 'hover:bg-surface-2')}>
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => sound.playTrack(t.id)}>
                      {active ? <Volume2 size={14} className="shrink-0 text-brand" /> : <Play size={14} className="shrink-0 text-muted" />}
                      <span className="truncate text-sm">{t.name}</span>
                      <span className="shrink-0 text-xs text-faint">{formatSize(t.size)}</span>
                    </button>
                    <button
                      aria-label={`Delete ${t.name}`}
                      className="p-1 text-faint hover:text-bad"
                      onClick={async () => {
                        if (active) sound.stopMusic()
                        await db.tracks.delete(t.id)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {sound.music && sound.music.type !== 'youtube' && (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2">
          <Volume2 size={15} className="text-muted" />
          <span className="text-xs text-muted">Music</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sound.volume}
            aria-label="Music volume"
            onChange={(e) => sound.setVolume(Number(e.target.value))}
            className="flex-1"
          />
        </div>
      )}
    </div>
  )
}
