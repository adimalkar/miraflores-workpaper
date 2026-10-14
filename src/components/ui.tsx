import { forwardRef, type ButtonHTMLAttributes, type ReactNode, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { X } from 'lucide-react'

export const cx = clsx

type Tone = 'neutral' | 'ink' | 'tick' | 'pencil' | 'amber' | 'hilite' | 'blue'
const TONE: Record<Tone, string> = {
  neutral: 'bg-ink-50 text-ink-600 ring-ink-200',
  ink: 'bg-ink text-white ring-ink',
  tick: 'bg-tick-soft text-tick-deep ring-tick/25',
  pencil: 'bg-pencil-soft text-pencil-deep ring-pencil/25',
  amber: 'bg-amber-soft text-amber ring-amber/25',
  hilite: 'bg-hilite-soft text-ink-700 ring-hilite-deep/30',
  blue: 'bg-slateblue-soft text-slateblue ring-slateblue/25',
}

export function Chip({ tone = 'neutral', children, className, title, icon }: { tone?: Tone; children: ReactNode; className?: string; title?: string; icon?: ReactNode }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset whitespace-nowrap', TONE[tone], className)}>
      {icon}{children}
    </span>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'tick'; size?: 'sm' | 'md'; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background,box-shadow,transform,color] duration-150 active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none select-none',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink-700 shadow-sm',
        variant === 'secondary' && 'bg-white text-ink ring-1 ring-ink-200 hover:ring-ink-300 hover:bg-ink-50',
        variant === 'ghost' && 'text-ink-600 hover:bg-ink-100 hover:text-ink',
        variant === 'danger' && 'bg-pencil text-white hover:bg-pencil-deep',
        variant === 'tick' && 'bg-tick text-white hover:bg-tick-deep shadow-sm',
        className,
      )}
    >
      {icon}{children}
    </button>
  )
})

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num rounded border border-ink-200 border-b-2 bg-white px-1.5 py-px text-2xs text-ink-500">{children}</kbd>
}

export function Avatar({ name, initials, size = 24, ring, tone }: { name: string; initials: string; size?: number; ring?: boolean; tone?: string }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span
      title={name}
      className={cx('inline-grid shrink-0 place-items-center rounded-full font-display font-semibold text-white', ring && 'ring-2 ring-white')}
      style={{ width: size, height: size, fontSize: size * 0.4, background: tone ?? `hsl(${hue} 38% 38%)` }}
    >
      {initials}
    </span>
  )
}

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('rounded-xl bg-white ring-1 ring-ink-200/70 shadow-[0_1px_0_rgba(20,33,61,0.03)]', className)}>{children}</As>
}

export function SectionTitle({ eyebrow, title, right, className }: { eyebrow?: string; title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="display text-lg font-semibold text-ink">{title}</h2>
      </div>
      {right}
    </div>
  )
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="display text-[28px] font-bold leading-tight text-ink">{title}</h1>
        {sub && <p className="mt-1.5 max-w-3xl text-sm text-ink-500">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-ink-200 px-6 py-10 text-center">
      <div className="display text-sm font-semibold text-ink-700">{title}</div>
      {children && <div className="mt-1 max-w-sm text-xs text-ink-500">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 520, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink-900/35 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ y: 12, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 8, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="relative max-h-[86vh] w-full overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-ink-200"
            style={{ maxWidth: width }}
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
              <div className="display text-base font-semibold">{title}</div>
              <button onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink" aria-label="Close"><X size={16} /></button>
            </div>
            <div className="scroll-thin max-h-[64vh] overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-ink-400">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full rounded-lg bg-white px-3 py-2 text-sm text-ink ring-1 ring-ink-200 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-slateblue/60 transition-shadow'

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cx('relative flex gap-1 overflow-x-auto scroll-thin', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}
          className={cx('relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors', value === it.id ? 'text-ink' : 'text-ink-500 hover:text-ink')}
        >
          {value === it.id && <motion.span layoutId={`tab-${items.map((i) => i.id).join('')}`} className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-ink-200" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative flex items-center gap-1.5 font-medium">
            {it.label}
            {it.count != null && <span className={cx('num rounded-full px-1.5 text-2xs', value === it.id ? 'bg-ink text-white' : 'bg-ink-100 text-ink-500')}>{it.count}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

export function Meter({ value, max, tone = 'tick', className }: { value: number; max: number; tone?: 'tick' | 'pencil' | 'amber' | 'ink'; className?: string }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0))
  const bg = { tick: 'bg-tick', pencil: 'bg-pencil', amber: 'bg-amber', ink: 'bg-ink' }[tone]
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-ink-100', className)}>
      <motion.div className={cx('h-full rounded-full', bg)} initial={{ width: 0 }} animate={{ width: `${p * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  )
}
