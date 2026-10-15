import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, ListFilter, CheckSquare, Square, Pencil } from 'lucide-react'
import { useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { useAllProofs, STATUS_META, type LineProof } from '../store/lineState'
import { AREAS, AREA_BY_ID, areaForLine, type AreaId } from '../data/areas'
import { areaBlurb } from '../data/derived'
import { Button, Card, Chip, PageHeader, Tabs, cx } from '../components/ui'
import { TickMark } from '../components/TickMark'
import { lineValue, money, pct, VERIFICATION_LABEL } from '../lib/format'
import { useStandards } from '../components/actions'
import type { ReturnLine } from '../data/types'

type Filter = 'all' | 'flagged' | 'unverified' | 'adjusted' | 'variance'
const BIG = 18

export function ReturnView({ focus }: { focus?: string }) {
  const { m } = useModel()
  const navigate = useStore((s) => s.navigate)
  const tab = (focus as AreaId | 'federal' | 'california-flow') || 'federal'
  const [filter, setFilter] = useState<Filter>('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const items = [
    { id: 'federal', label: 'Form 1040' },
    ...AREAS.map((a) => ({ id: a.id, label: a.short })),
  ]
  const roots = useMemo(() => {
    if (tab === 'federal') {
      // The form itself, in line order: each line opens into what it was built from.
      const ln = (k: string) => { const x = k.split('.')[1]; return [Number(x.match(/^\d+/)?.[0] ?? 0), x] as const }
      return m.current.lines.filter((l) => l.form === 'F1040').map((l) => l.key).sort((a, b) => ln(a)[0] - ln(b)[0] || ln(a)[1].localeCompare(ln(b)[1]))
    }
    const lines = m.linesByArea.get(tab as AreaId) ?? []
    const keys = new Set(lines.map((l) => l.key))
    const size = (k: string, seen = new Set<string>()): number => {
      if (seen.has(k)) return 0
      seen.add(k)
      const l = m.lineMaps.get(m.current.version)!.get(k)
      return 1 + (l?.inputs ?? []).reduce((s, c) => s + size(c, seen), 0)
    }
    return lines.filter((l) => !(m.parents.get(l.key) ?? []).some((p) => keys.has(p))).map((l) => ({ k: l.key, n: size(l.key) })).sort((a, b) => b.n - a.n).map((x) => x.k)
  }, [m, tab])
  const area = AREA_BY_ID.get(tab as AreaId)

  return (
    <div>
      <PageHeader
        eyebrow="Return"
        title={area ? area.name : 'How the return was built'}
        sub={area ? areaBlurb(m, area.id) : 'Form 1040 line by line. Open any line to see what it was built from, down to the document field. Each line carries its own proof.'}
      />
      <Tabs value={tab} onChange={(v) => { setSel(new Set()); navigate(`/return/${v}`) }} items={items as { id: string; label: string }[]} className="mb-4 rounded-xl bg-ink-100/60 p-1" />
      <Toolbar filter={filter} setFilter={setFilter} sel={sel} setSel={setSel} />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_110px_120px] items-center gap-3 border-b border-ink-100 bg-ink-50/70 px-4 py-2 text-2xs font-medium uppercase tracking-wider text-ink-400 sm:grid-cols-[minmax(0,1fr)_100px_220px_120px]">
          <span>Line</span><span className="hidden text-right sm:block">{m.packet.household.tax_year - 1}</span><span className="text-right">{m.packet.household.tax_year}</span><span className="text-right">Proof</span>
        </div>
        <div>
          {roots.map((k, i) => <Node key={`${tab}-${k}`} k={k} depth={0} filter={filter} sel={sel} setSel={setSel} defaultOpen={tab !== 'federal' && (i === 0 || roots.length < 3)} />)}
        </div>
      </Card>
    </div>
  )
}

function Toolbar({ filter, setFilter, sel, setSel }: { filter: Filter; setFilter: (f: Filter) => void; sel: Set<string>; setSel: (s: Set<string>) => void }) {
  const std = useStandards()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const w = useWork()
  const [method, setMethod] = useState(std.verification_types[1] ?? std.verification_types[0])
  const opts: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Everything' }, { id: 'flagged', label: 'Flagged' }, { id: 'unverified', label: 'Not verified' },
    { id: 'adjusted', label: 'Adjusted' }, { id: 'variance', label: 'Swings vs prior year' },
  ]
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <ListFilter size={14} className="text-ink-400" />
      {opts.map((o) => (
        <button key={o.id} onClick={() => setFilter(o.id)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', filter === o.id ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-600 ring-ink-200 hover:ring-ink-300')}>{o.label}</button>
      ))}
      <AnimatePresence>
        {sel.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="ml-auto flex items-center gap-2 rounded-xl bg-ink px-3 py-1.5 text-xs text-white shadow-pop">
            <span className="num">{sel.size} selected</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-md bg-white/10 px-2 py-1 text-xs text-white ring-1 ring-white/20">
              {std.verification_types.map((t) => <option key={t} value={t} className="text-ink">{VERIFICATION_LABEL[t]}</option>)}
            </select>
            <Button size="sm" variant="tick" disabled={!perms.canEdit || !!w.frozenAt} onClick={() => {
              record([...sel].map((k) => ({ kind: 'verify' as const, target: k, method, value: w.value(k) ?? w.line(k)?.value })), { toast: `Verified ${sel.size} lines` })
              setSel(new Set())
            }}>Verify all</Button>
            <button onClick={() => setSel(new Set())} className="text-ink-300 hover:text-white">Clear</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function matches(p: LineProof | undefined, l: ReturnLine, filter: Filter, prior: unknown, std: { flag_if_change_over_percent: number; and_over_amount: number }) {
  if (!p) return true
  if (filter === 'all') return true
  if (filter === 'flagged') return p.status === 'flagged'
  if (filter === 'unverified') return !p.verification
  if (filter === 'adjusted') return !!p.adjustment
  if (filter === 'variance') {
    if (typeof prior !== 'number' || typeof l.value !== 'number') return false
    const ch = l.value - prior
    return Math.abs(ch) > std.and_over_amount && (prior === 0 || Math.abs(ch / prior) * 100 > std.flag_if_change_over_percent)
  }
  return true
}

function Node({ k, depth, filter, sel, setSel, defaultOpen }: { k: string; depth: number; filter: Filter; sel: Set<string>; setSel: (s: Set<string>) => void; defaultOpen?: boolean }) {
  const { m } = useModel()
  const w = useWork()
  const proofs = useAllProofs()
  const std = useStandards().variance_review
  const openTrace = useStore((s) => s.openTrace)
  const trace = useStore((s) => s.trace)
  const navigate = useStore((s) => s.navigate)
  const [open, setOpen] = useState(!!defaultOpen)
  const [showAll, setShowAll] = useState(false)
  const l = w.line(k)
  if (!l) return null
  const p = proofs.get(k)
  const prior = m.priorLines[k]
  const self = matches(p, l, filter, prior, std)
  const kids = l.inputs
  const extra = [...w.adjustments.values()].filter((a) => a.isNew && !a.reverted && kids.length && a.lineKey.split('.').slice(0, 2).join('.') === k.split('.').slice(0, 2).join('.') && k.endsWith('.total')).map((a) => a.lineKey)
  const allKids = [...kids, ...extra]
  const hasKids = allKids.length > 0
  if (filter !== 'all' && !self && !hasKids) return null
  const variance = typeof prior === 'number' && typeof l.value === 'number' && prior !== 0 ? ((l.value - prior) / Math.abs(prior)) * 100 : null
  const bigSwing = typeof prior === 'number' && typeof l.value === 'number' && Math.abs(l.value - prior) > std.and_over_amount && (variance == null || Math.abs(variance) > std.flag_if_change_over_percent)
  const otherArea = depth > 0 ? areaForLine(l) : null
  const meta = p ? STATUS_META[p.status] : STATUS_META.open
  const isSel = sel.has(k)

  let visibleKids = allKids
  let hidden = 0
  if (allKids.length > BIG && !showAll) {
    const important = allKids.filter((c) => { const s = proofs.get(c)?.status; return s === 'flagged' || s === 'adjusted' })
    visibleKids = important.slice(0, BIG)
    hidden = allKids.length - visibleKids.length
  }

  return (
    <div className={cx(depth === 0 && 'border-b border-ink-100 last:border-0')}>
      <div
        className={cx(
          'group grid grid-cols-[minmax(0,1fr)_110px_120px] items-center gap-3 px-4 py-[7px] text-sm transition-colors sm:grid-cols-[minmax(0,1fr)_100px_220px_120px]',
          trace === k ? 'bg-hilite-soft/70' : 'hover:bg-ink-50/80',
          !self && 'opacity-45',
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
          <button onClick={() => { const n = new Set(sel); isSel ? n.delete(k) : n.add(k); setSel(n) }} className={cx('shrink-0 text-ink-300 transition hover:text-ink', isSel ? 'text-slateblue opacity-100' : 'opacity-0 group-hover:opacity-100')} aria-label={`Select ${k}`}>
            {isSel ? <CheckSquare size={14} /> : <Square size={14} />}
          </button>
          {hasKids ? (
            <button onClick={() => setOpen(!open)} className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-400 hover:bg-ink-100 hover:text-ink" aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}>
              <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}><ChevronRight size={14} /></motion.span>
            </button>
          ) : <span className="w-5 shrink-0" />}
          <button onClick={() => openTrace(k)} className="flex min-w-0 items-center gap-2 text-left">
            <span className="num shrink-0 text-2xs text-ink-400">{k}</span>
            <span className={cx('truncate', depth === 0 ? 'font-medium text-ink' : 'text-ink-700')}>{l.label}</span>
            {hasKids && <span className="num shrink-0 text-2xs text-ink-300">{allKids.length}</span>}
            {otherArea && otherArea !== areaForLine(w.line(k) ?? l) ? null : null}
          </button>
        </div>
        <span className="num hidden text-right text-xs text-ink-400 sm:block">
          {typeof prior === 'number' ? money(prior) : ''}
          {bigSwing && <span className="ml-1 rounded bg-amber-soft px-1 text-[10px] text-amber" title="Over the firm's variance threshold">{pct(variance)}</span>}
        </span>
        <span className="num flex items-center justify-end gap-1.5 text-right font-medium">
          {l.adjusted && <Pencil size={11} className="text-slateblue" />}
          {l.pending && <span className="h-1.5 w-1.5 rounded-full bg-amber" title="Awaiting engine recompute" />}
          <span title={typeof l.value === 'string' ? l.value : undefined} className={cx(typeof l.value === 'string' && 'max-w-[220px] truncate text-xs font-normal text-ink-600', l.adjusted && 'text-slateblue', l.flowed && 'text-slateblue/80')}>{lineValue(l.value)}</span>
        </span>
        <span className="flex items-center justify-end gap-1.5">
          {p?.verification ? <TickMark method={p.verification.method} size={15} /> : <span className={cx('h-2 w-2 rounded-full', meta.dot)} title={meta.label} />}
          {p && p.status === 'flagged' && <Chip tone="pencil">flag</Chip>}
          {p && p.status !== 'flagged' && p.recalc.status === 'foots' && !p.verification && <span className="text-2xs text-ink-400" title={p.recalc.formula}>foots</span>}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {open && hasKids && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            {visibleKids.map((c) => <Node key={c} k={c} depth={depth + 1} filter={filter} sel={sel} setSel={setSel} />)}
            {hidden > 0 && (
              <div className="flex items-center gap-3 py-2 text-xs text-ink-500" style={{ paddingLeft: (depth + 1) * 18 + 44 }}>
                <span>{hidden} more {k.startsWith('F8949') ? 'sales' : 'lines'}, none flagged or adjusted.</span>
                <button onClick={() => setShowAll(true)} className="font-medium text-ink hover:underline">Show all</button>
                {k.startsWith('F8949') && <button onClick={() => navigate('/schedules/sales')} className="font-medium text-ink hover:underline">Open sales detail</button>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
