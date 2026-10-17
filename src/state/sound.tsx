import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db } from '../db/db'
import type { Track } from '../db/types'
import { AMBIENT_SOUNDS, setAmbient, stopAllAmbient, type AmbientId } from '../lib/audio'
import { parseYouTube, youTubeEmbedUrl, type Station } from '../lib/music'

export type MusicSource =
  | { type: 'stream'; id: string; name: string; url: string }
  | { type: 'youtube'; id: string; name: string; embedUrl: string }
  | { type: 'track'; id: string; name: string }

interface AmbientChannel {
  on: boolean
  volume: number
}

interface SoundApi {
  ambient: Record<AmbientId, AmbientChannel>
  toggleAmbient: (id: AmbientId) => void
  setAmbientVolume: (id: AmbientId, volume: number) => void
  stopAmbient: () => void
  anyAmbient: boolean
  music: MusicSource | null
  playing: boolean
  loading: boolean
  error: string | null
  volume: number
  setVolume: (v: number) => void
  playStation: (s: Station) => void
  playLink: (name: string, url: string) => boolean
  playTrack: (id: string) => void
  togglePlay: () => void
  stopMusic: () => void
  nextTrack: () => void
  prevTrack: () => void
  tracks: Track[]
}

const SoundContext = createContext<SoundApi | null>(null)

export function useSound(): SoundApi {
  const ctx = useContext(SoundContext)
  if (!ctx) throw new Error('useSound must be used inside SoundProvider')
  return ctx
}

const PREFS_KEY = 'elvora.sound.v1'

function loadPrefs(): { volumes: Partial<Record<AmbientId, number>>; musicVolume: number } {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { volumes: {}, musicVolume: 0.7 }
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [prefs] = useState(loadPrefs)
  const [ambient, setAmbientState] = useState<Record<AmbientId, AmbientChannel>>(() => {
    const out = {} as Record<AmbientId, AmbientChannel>
    for (const s of AMBIENT_SOUNDS) out[s.id] = { on: false, volume: prefs.volumes[s.id] ?? 0.5 }
    return out
  })
  const [music, setMusic] = useState<MusicSource | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolumeState] = useState(prefs.musicVolume)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrl = useRef<string | null>(null)
  const tracks = useLiveQuery(() => db.tracks.toArray().then((t) => t.sort((a, b) => a.addedAt - b.addedAt)), []) ?? []
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks
  const musicRef = useRef(music)
  musicRef.current = music
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  useEffect(() => {
    try {
      const volumes: Partial<Record<AmbientId, number>> = {}
      for (const [id, ch] of Object.entries(ambient)) volumes[id as AmbientId] = ch.volume
      localStorage.setItem(PREFS_KEY, JSON.stringify({ volumes, musicVolume: volume }))
    } catch {
      // ignore
    }
  }, [ambient, volume])

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'none'
      a.addEventListener('playing', () => {
        setPlaying(true)
        setLoading(false)
        setError(null)
      })
      a.addEventListener('pause', () => setPlaying(false))
      a.addEventListener('waiting', () => setLoading(true))
      a.addEventListener('error', () => {
        setLoading(false)
        setPlaying(false)
        if (a.getAttribute('src')) {
          setError(navigator.onLine ? "Couldn't play this source. Try another one." : "You're offline — online music needs a connection.")
        }
      })
      a.addEventListener('ended', () => {
        const m = musicRef.current
        if (m?.type === 'track') next(1)
      })
      audioRef.current = a
    }
    return audioRef.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const releaseObjectUrl = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = null
    }
  }

  const playSrc = useCallback(
    (src: string, source: MusicSource) => {
      const a = getAudio()
      setError(null)
      setLoading(true)
      setMusic(source)
      a.src = src
      a.volume = volumeRef.current
      a.play().catch((e: unknown) => {
        setLoading(false)
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(navigator.onLine || source.type === 'track' ? "Couldn't start playback." : "You're offline — online music needs a connection.")
      })
    },
    [getAudio],
  )

  const playTrackById = useCallback(
    async (id: string) => {
      const t = await db.tracks.get(id)
      if (!t) return
      releaseObjectUrl()
      objectUrl.current = URL.createObjectURL(t.blob)
      playSrc(objectUrl.current, { type: 'track', id: t.id, name: t.name })
    },
    [playSrc],
  )

  function next(dir: 1 | -1) {
    const m = musicRef.current
    const list = tracksRef.current
    if (m?.type !== 'track' || list.length === 0) return
    const idx = list.findIndex((t) => t.id === m.id)
    const target = list[(idx + dir + list.length) % list.length]
    void playTrackById(target.id)
  }

  const stopAudioElement = () => {
    const a = audioRef.current
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }
    releaseObjectUrl()
  }

  const api = useMemo<SoundApi>(
    () => ({
      ambient,
      anyAmbient: Object.values(ambient).some((c) => c.on),
      toggleAmbient: (id) => {
        setAmbientState((prev) => {
          const ch = prev[id]
          const on = !ch.on
          setAmbient(id, on ? ch.volume : null)
          return { ...prev, [id]: { ...ch, on } }
        })
      },
      setAmbientVolume: (id, v) => {
        setAmbientState((prev) => {
          const ch = prev[id]
          if (ch.on) setAmbient(id, v)
          return { ...prev, [id]: { ...ch, volume: v } }
        })
      },
      stopAmbient: () => {
        stopAllAmbient()
        setAmbientState((prev) => {
          const out = { ...prev }
          for (const k of Object.keys(out) as AmbientId[]) out[k] = { ...out[k], on: false }
          return out
        })
      },
      music,
      playing: music?.type === 'youtube' ? true : playing,
      loading,
      error,
      volume,
      setVolume: (v) => {
        setVolumeState(v)
        if (audioRef.current) audioRef.current.volume = v
      },
      playStation: (s) => {
        if (s.kind === 'youtube') {
          const ref = parseYouTube(s.url)
          if (!ref) return
          stopAudioElement()
          setError(null)
          setMusic({ type: 'youtube', id: s.id, name: s.name, embedUrl: youTubeEmbedUrl(ref) })
        } else {
          releaseObjectUrl()
          playSrc(s.url, { type: 'stream', id: s.id, name: s.name, url: s.url })
        }
      },
      playLink: (name, url) => {
        const yt = parseYouTube(url)
        if (yt) {
          stopAudioElement()
          setError(null)
          setMusic({ type: 'youtube', id: url, name, embedUrl: youTubeEmbedUrl(yt) })
          return true
        }
        try {
          new URL(url)
        } catch {
          return false
        }
        releaseObjectUrl()
        playSrc(url, { type: 'stream', id: url, name, url })
        return true
      },
      playTrack: (id) => void playTrackById(id),
      togglePlay: () => {
        const a = audioRef.current
        if (!a || !music || music.type === 'youtube') return
        if (a.paused) {
          setLoading(true)
          a.play().catch(() => setLoading(false))
        } else a.pause()
      },
      stopMusic: () => {
        stopAudioElement()
        setMusic(null)
        setPlaying(false)
        setLoading(false)
        setError(null)
      },
      nextTrack: () => next(1),
      prevTrack: () => next(-1),
      tracks,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ambient, music, playing, loading, error, volume, tracks, playSrc, playTrackById],
  )

  return <SoundContext.Provider value={api}>{children}</SoundContext.Provider>
}
