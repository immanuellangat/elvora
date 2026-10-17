import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Loader2, Music2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSound } from '../state/sound'

/** Floating player for music; YouTube embeds live here so they keep playing across pages. */
export function MiniPlayer() {
  const sound = useSound()
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const onFocus = location.pathname === '/focus'
  const m = sound.music
  if (!m) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx(
          'fixed right-3 z-40 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-2xl backdrop-blur-xl',
          onFocus ? 'bottom-4' : 'bottom-24 lg:bottom-6',
        )}
      >
        {m.type === 'youtube' && (
          <div className={clsx('transition-all', collapsed ? 'h-0' : 'aspect-video')}>
            <iframe
              key={m.embedUrl}
              src={m.embedUrl}
              title={m.name}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
        <div className="flex items-center gap-2 p-2.5">
          <div className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
            {sound.loading ? <Loader2 size={16} className="animate-spin" /> : <Music2 size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{m.name}</div>
            <div className={clsx('truncate text-xs', sound.error ? 'text-bad' : 'text-muted')}>
              {sound.error ??
                (m.type === 'track' ? 'My music · offline' : m.type === 'youtube' ? 'YouTube · online' : 'Online radio')}
            </div>
          </div>
          {m.type === 'track' && (
            <button aria-label="Previous track" className="rounded-lg p-1.5 text-muted hover:text-ink" onClick={sound.prevTrack}>
              <SkipBack size={16} />
            </button>
          )}
          {m.type !== 'youtube' && (
            <button
              aria-label={sound.playing ? 'Pause music' : 'Play music'}
              className="rounded-lg p-1.5 text-ink hover:bg-surface-2"
              onClick={sound.togglePlay}
            >
              {sound.playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
          )}
          {m.type === 'track' && (
            <button aria-label="Next track" className="rounded-lg p-1.5 text-muted hover:text-ink" onClick={sound.nextTrack}>
              <SkipForward size={16} />
            </button>
          )}
          {m.type === 'youtube' && (
            <button
              aria-label={collapsed ? 'Show video' : 'Hide video'}
              className="rounded-lg p-1.5 text-muted hover:text-ink"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          <button aria-label="Stop music" className="rounded-lg p-1.5 text-muted hover:text-ink" onClick={sound.stopMusic}>
            <X size={16} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
