import { AnimatePresence, motion } from 'framer-motion'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  tone: 'default' | 'success' | 'error'
  action?: { label: string; onClick: () => void }
}

type ToastFn = (message: string, opts?: { tone?: Toast['tone']; action?: Toast['action'] }) => void

const ToastContext = createContext<ToastFn>(() => {})

export function useToast(): ToastFn {
  return useContext(ToastContext)
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback<ToastFn>(
    (message, opts) => {
      const id = nextId++
      setToasts((t) => [...t.slice(-2), { id, message, tone: opts?.tone ?? 'default', action: opts?.action }])
      window.setTimeout(() => dismiss(id), opts?.action ? 6000 : 3200)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-soft"
            >
              <span
                className={
                  t.tone === 'success' ? 'text-good' : t.tone === 'error' ? 'text-bad' : 'text-ink'
                }
              >
                {t.message}
              </span>
              {t.action && (
                <button
                  className="font-semibold text-brand"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
