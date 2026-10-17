import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-3xl border border-line bg-surface p-5 shadow-soft', className)} {...rest}>
      {children}
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  icon,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-11 px-4 text-sm',
        size === 'lg' && 'h-14 px-6 text-base',
        variant === 'primary' && 'brand-gradient text-white shadow-glow hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-surface-2',
        variant === 'soft' && 'bg-brand-soft text-brand hover:brightness-95 dark:hover:brightness-125',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'bg-bad-soft text-bad hover:brightness-95',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-11 w-full rounded-2xl border border-line bg-surface-2/60 px-4 text-sm text-ink outline-none transition placeholder:text-faint focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/15',
        className,
      )}
      {...rest}
    />
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        'w-full resize-y rounded-2xl border border-line bg-surface-2/60 px-4 py-3 text-sm leading-relaxed text-ink outline-none transition placeholder:text-faint focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/15',
        className,
      )}
      {...rest}
    />
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition',
        checked ? 'bg-brand' : 'bg-line',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={clsx('h-5 w-5 rounded-full bg-white shadow', checked ? 'ml-6' : 'ml-1')}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={clsx('inline-flex rounded-2xl bg-surface-2 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'relative flex-1 rounded-xl px-3 py-1.5 text-sm font-medium transition',
            value === o.value ? 'text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-xl bg-surface shadow-soft"
              transition={{ type: 'spring', stiffness: 450, damping: 35 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  children,
  className,
}: {
  value: number
  size?: number
  stroke?: number
  children?: ReactNode
  className?: string
}) {
  const gid = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={clsx('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="55%" stopColor="#7c5cff" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'good' }) {
  return (
    <div className={clsx('h-2 overflow-hidden rounded-full bg-surface-2', className)}>
      <motion.div
        className={clsx('h-full rounded-full', tone === 'brand' ? 'brand-gradient' : 'bg-good')}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 20 }}
      />
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={clsx(
              'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl',
              wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
            )}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
              <h2 className="text-lg font-bold">{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </div>
            <div className="overflow-y-auto px-5 pb-5 pt-1">{children}</div>
            {footer && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ emoji, title, text, action }: { emoji: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-3 text-4xl">{emoji}</div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted', className)}>
      {children}
    </span>
  )
}

/** Animated round check button. */
export function CheckButton({
  checked,
  onClick,
  label,
  size = 28,
  color,
}: {
  checked: boolean
  onClick: () => void
  label: string
  size?: number
  color?: string
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        checked ? 'border-transparent text-white' : 'border-line text-transparent hover:border-brand',
      )}
      style={{ width: size, height: size, background: checked ? (color ?? 'var(--brand)') : undefined }}
    >
      <AnimatePresence initial={false}>
        {checked && (
          <motion.svg
            key="tick"
            viewBox="0 0 24 24"
            width={size * 0.6}
            height={size * 0.6}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.25 }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
