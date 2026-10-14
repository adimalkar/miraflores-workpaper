import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  LayoutDashboard, GitBranch, FileStack, ShieldAlert, MessagesSquare, Table2, History, Send, Building2, Search,
  ChevronDown, Check, Lock, Undo2, Users, Eye,
} from 'lucide-react'
import { useStore } from '../store/store'
import { useFindingState, useModel, usePerms, useWork } from '../store/context'
import { ROLE_LABEL, initials, personName } from '../store/permissions'
import { Avatar, Chip, Kbd, cx } from './ui'
import { TracePanel } from './TracePanel'
import { DocViewer } from './DocViewer'
import { CommandPalette } from './CommandPalette'
import { Overview } from '../views/Overview'
import { ReturnView } from '../views/ReturnView'
import { Documents } from '../views/Documents'
import { Checks } from '../views/Checks'
import { Review } from '../views/Review'
import { Schedules } from '../views/Schedules'
import { Season } from '../views/Season'
import { Filing } from '../views/Filing'
import { Firm } from '../views/Firm'
import { ClientPortal } from '../views/ClientPortal'
import { ago } from '../lib/format'

const NAV = [
  { route: '/overview', label: 'Overview', icon: LayoutDashboard },
  { route: '/return', label: 'Return', icon: GitBranch },
  { route: '/documents', label: 'Documents', icon: FileStack },
  { route: '/checks', label: 'Checks', icon: ShieldAlert },
  { route: '/review', label: 'Review', icon: MessagesSquare },
  { route: '/schedules', label: 'Schedules', icon: Table2 },
  { route: '/season', label: 'Season', icon: History },
  { route: '/filing', label: 'Filing', icon: Send },
  { route: '/firm', label: 'Firm', icon: Building2 },
] as const

export function Shell() {
  const route = useStore((s) => s.route)
  const perms = usePerms()
  const trace = useStore((s) => s.trace)
  const doc = useStore((s) => s.doc)
  const setPalette = useStore((s) => s.setPalette)
  const w = useWork()

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
      if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) { e.preventDefault(); setPalette(true) }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement).closest('input,textarea')) {
        e.preventDefault()
        const s = useStore.getState()
        const mine = [...s.events].reverse().find((x) => x.actor === s.actor && x.kind !== 'undo' && x.kind !== 'seen' && x.kind !== 'view.sensitive' && !w.events.some((u) => u.kind === 'undo' && u.eventIds.includes(x.id)))
        if (!mine) return
        const ids = mine.batch ? s.events.filter((x) => x.batch === mine.batch).map((x) => x.id) : [mine.id]
        s.undo(ids, mine.batch ? `${ids.length} changes` : mine.kind.replace('.', ' '))
      }
      if (e.key === 'Escape') {
        const s = useStore.getState()
        if (s.palette) return
        if (s.doc) s.openDoc(null)
        else if (s.trace) s.openTrace(null)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [setPalette, w.events])

  if (perms.isClient) {
    return (
      <div className="flex h-full flex-col">
        <ClientTopBar />
        <main className="scroll-thin flex-1 overflow-y-auto"><ClientPortal /></main>
        <Toasts />
        <DocViewer />
      </div>
    )
  }

  const view = route.split('/')[1]
  return (
    <div className="flex h-full overflow-hidden">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <MobileNav />
        {w.frozenAt && (
          <div className="no-print flex items-center gap-2 bg-ink-800 px-6 py-1.5 text-xs text-ink-100">
            <Lock size={13} className="text-hilite" /> Frozen at filing on {new Date(w.frozenAt).toLocaleDateString()}. Changes now go into an amendment layered on top.
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <main className="scroll-thin relative min-w-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto max-w-[1280px] px-6 pb-24 pt-7 lg:px-10"
              >
                <ViewFor route={route} />
              </motion.div>
            </AnimatePresence>
          </main>
          <AnimatePresence>{trace && <TracePanel key="trace" lineKey={trace} />}</AnimatePresence>
        </div>
      </div>
      <AnimatePresence>{doc && <DocViewer key="doc" />}</AnimatePresence>
      <CommandPalette />
      <Toasts />
    </div>
  )
}

function MobileNav() {
  const route = useStore((s) => s.route)
  const navigate = useStore((s) => s.navigate)
  return (
    <nav className="no-print scroll-thin flex gap-1 overflow-x-auto border-b border-ink-200 bg-ink px-3 py-2 md:hidden" aria-label="Workpaper sections">
      {NAV.map((n) => {
        const Icon = n.icon
        const active = route.startsWith(n.route)
        return (
          <button key={n.route} onClick={() => navigate(n.route)} className={cx('flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium', active ? 'bg-white/15 text-white' : 'text-ink-300')}>
            <Icon size={13} />{n.label}
          </button>
        )
      })}
    </nav>
  )
}

function ViewFor({ route }: { route: string }) {
  const [, view, sub] = route.split('/')
  switch (view) {
    case 'return': return <ReturnView focus={sub} />
    case 'documents': return <Documents focus={sub} />
    case 'checks': return <Checks focus={sub} />
    case 'review': return <Review tab={sub} />
    case 'schedules': return <Schedules tab={sub} />
    case 'season': return <Season tab={sub} />
    case 'filing': return <Filing />
    case 'firm': return <Firm tab={sub} />
    default: return <Overview />
  }
}

function Rail() {
  const { m } = useModel()
  const route = useStore((s) => s.route)
  const navigate = useStore((s) => s.navigate)
  const fs = useFindingState()
  const w = useWork()
  const openChecks = fs.filter((x) => x.status === 'open').length
  const openNotes = [...w.notes.values()].filter((n) => !n.resolved).length + [...w.questions.values()].filter((q) => !q.answer).length
  const counts: Record<string, ReactNode> = {
    '/documents': m.docs.length,
    '/checks': openChecks || undefined,
    '/review': openNotes || undefined,
  }
  return (
    <nav className="no-print hidden w-[228px] shrink-0 flex-col bg-ink text-ink-200 shadow-rail md:flex" aria-label="Workpaper sections">
      <div className="px-5 pb-5 pt-5">
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 20 20"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#F7E463" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="display text-[17px] font-bold text-white">Proof</span>
          <span className="ml-auto text-2xs text-ink-400">Miraflores</span>
        </div>
        <div className="mt-5 rounded-lg bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/10">
          <div className="text-2xs uppercase tracking-[0.14em] text-ink-400">Client · {m.packet.packet.client_id}</div>
          <div className="display mt-0.5 text-[15px] font-semibold leading-snug text-white">Okafor-Lindqvist</div>
          <div className="text-xs text-ink-300">2025 · MFJ · 1040 + CA 540NR</div>
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 px-3">
        {NAV.map((n) => {
          const active = route.startsWith(n.route)
          const Icon = n.icon
          return (
            <li key={n.route}>
              <button
                onClick={() => navigate(n.route)}
                className={cx('group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors', active ? 'text-white' : 'text-ink-300 hover:bg-white/[0.05] hover:text-white')}
                aria-current={active ? 'page' : undefined}
              >
                {active && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-lg bg-white/[0.1] ring-1 ring-white/10" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                {active && <motion.span layoutId="rail-tick" className="absolute -left-3 top-2 h-5 w-[3px] rounded-r bg-hilite" />}
                <Icon size={16} className="relative" />
                <span className="relative font-medium">{n.label}</span>
                {counts[n.route] != null && (
                  <span className={cx('num relative ml-auto rounded-full px-1.5 text-2xs', n.route === '/checks' ? 'bg-pencil text-white' : 'bg-white/10 text-ink-200')}>{counts[n.route]}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-white/10 p-3"><RoleSwitcher dark /></div>
    </nav>
  )
}

export function RoleSwitcher({ dark }: { dark?: boolean }) {
  const { m } = useModel()
  const perms = usePerms()
  const setActor = useStore((s) => s.setActor)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [])
  const people = [
    ...m.packet.firm.staff.map((s) => ({ id: s.id, name: s.name, role: ROLE_LABEL[s.role as keyof typeof ROLE_LABEL] ?? s.role, note: !s.sensitive_data_clearance ? 'No sensitive-data clearance' : s.credential ?? '' })),
    ...m.packet.firm.client_users.map((c) => ({ id: c.id, name: c.name, role: 'Client', note: 'Client portal' })),
  ]
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors', dark ? 'hover:bg-white/[0.06]' : 'hover:bg-ink-100 ring-1 ring-ink-200')}
        aria-haspopup="menu" aria-expanded={open}
      >
        <Avatar name={perms.name} initials={perms.initials} size={30} />
        <span className={cx('min-w-0 flex-1', !dark && 'hidden sm:block')}>
          <span className={cx('block truncate text-sm font-medium', dark ? 'text-white' : 'text-ink')}>{perms.name}</span>
          <span className={cx('block truncate text-2xs', dark ? 'text-ink-400' : 'text-ink-500')}>Acting as {ROLE_LABEL[perms.role]}</span>
        </span>
        <ChevronDown size={14} className={cx(dark ? 'text-ink-400' : 'text-ink-500', !dark && 'hidden sm:block')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={cx('absolute z-50 w-72 overflow-hidden rounded-xl bg-white p-1.5 text-ink shadow-pop ring-1 ring-ink-200', dark ? 'bottom-full left-0 mb-2' : 'left-0 top-full mt-2 sm:left-auto sm:right-0')}
          >
            <div className="eyebrow px-2.5 pb-1.5 pt-1">Switch role (this tab)</div>
            {people.map((p) => (
              <button
                key={p.id} role="menuitem"
                onClick={() => { setActor(p.id); setOpen(false) }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-ink-50"
              >
                <Avatar name={p.name} initials={initials(p.name)} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-2xs text-ink-500">{p.role}{p.note ? ` · ${p.note}` : ''}</span>
                </span>
                {perms.actor === p.id && <Check size={14} className="text-tick" />}
              </button>
            ))}
            <div className="mt-1 border-t border-ink-100 px-2.5 py-2 text-2xs text-ink-500">Open another tab as someone else to work side by side. Changes appear live.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TopBar() {
  const { m } = useModel()
  const setPalette = useStore((s) => s.setPalette)
  const presence = useStore((s) => s.presence)
  const actor = useStore((s) => s.actor)
  const record = useStore((s) => s.record)
  const navigate = useStore((s) => s.navigate)
  const w = useWork()
  const lastSeen = w.lastSeen.get(actor)
  const since = useMemo(() => w.active.filter((e) => e.actor !== actor && e.kind !== 'seen' && e.kind !== 'view.sensitive' && (!lastSeen || e.at > lastSeen)), [w.active, actor, lastSeen])
  const others = Object.values(presence).filter((p) => p.actor !== actor || true)
  return (
    <div className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-ink-200/70 bg-white/80 px-4 backdrop-blur lg:px-6">
      <div className="md:hidden"><RoleSwitcher /></div>
      <button
        onClick={() => setPalette(true)}
        className="group flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg bg-ink-50 px-3 text-sm text-ink-400 ring-1 ring-ink-200/80 transition hover:bg-white hover:ring-ink-300"
      >
        <Search size={15} />
        <span className="truncate"><span className="sm:hidden">Search</span><span className="hidden sm:inline">Search a number, line, document, person…</span></span>
        <span className="ml-auto hidden items-center gap-1 sm:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => { navigate('/season/changes') }}
          className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100"
          title="What changed since you last looked"
        >
          <Eye size={14} />
          <span className="hidden lg:inline">Since you last looked</span>
          {since.length > 0 && <span className="num rounded-full bg-hilite px-1.5 text-2xs font-semibold text-ink">{since.length}</span>}
        </button>
        {lastSeen !== undefined || since.length ? null : null}
        <div className="flex items-center -space-x-1.5" aria-label="People in this workpaper now">
          {others.slice(0, 5).map((p) => (
            <span key={p.tab} className="relative" title={`${personName(m, p.actor)} · ${p.view}`}>
              <Avatar name={personName(m, p.actor)} initials={initials(personName(m, p.actor))} size={26} ring />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-tick ring-2 ring-white" />
            </span>
          ))}
          {others.length === 0 && <span className="hidden items-center gap-1 text-2xs text-ink-400 sm:flex"><Users size={13} /> Only you</span>}
        </div>
        {since.length > 0 && (
          <button onClick={() => record({ kind: 'seen', view: 'all' })} className="hidden text-2xs text-ink-400 hover:text-ink lg:block">Mark seen</button>
        )}
      </div>
    </div>
  )
}

function ClientTopBar() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-200/70 bg-white px-6">
      <svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#14213D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="display font-bold">Miraflores</span>
      <Chip tone="neutral">Client portal</Chip>
      <div className="ml-auto w-64"><RoleSwitcher /></div>
    </div>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const undo = useStore((s) => s.undo)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id} layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            className="pointer-events-auto flex items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-white shadow-pop"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" className="tick-draw"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#F7E463" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>{t.text}</span>
            {t.undo && (
              <button onClick={() => { undo(t.undo!, t.text); dismiss(t.id) }} className="ml-1 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium hover:bg-white/20">
                <Undo2 size={12} /> Undo
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export { ago }
