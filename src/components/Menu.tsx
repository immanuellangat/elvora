import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { MoreVertical } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuAction {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
}

export function Menu({ actions, label = 'More actions' }: { actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-faint transition hover:bg-surface-2 hover:text-ink"
      >
        <MoreVertical size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 z-30 min-w-48 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-xl"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  a.onClick()
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-2',
                  a.danger ? 'text-bad' : 'text-ink',
                )}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
