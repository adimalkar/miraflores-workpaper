import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, CalendarClock, Play, CornerDownRight, Sparkles } from 'lucide-react'
import { useFindingState, useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { useAllProofs, STATUS_META, type ProofStatus } from '../store/lineState'
import { useReadiness } from '../store/readiness'
import { useWorkQueue, type WorkItem } from '../store/queue'
import { AREAS } from '../data/areas'
import { areaBlurb, extensionInfo, householdNames, moveSummary, returnForms } from '../data/derived'
import { AnimatedNumber, Avatar, Chip, Kbd, cx } from '../components/ui'
import { money, signed, date, ago } from '../lib/format'
import { initials, personName, ROLE_LABEL } from '../store/permissions'
import { describeEvent } from './Season'
import { proposalEvents } from './Checks'

// Today: the home of the product. It answers three questions in order: what should I do next,
// where does the return stand, and what has the team done.

const TONE_DOT: Record<WorkItem['tone'], string> = { pencil: 'bg-pencil', amber: 'bg-amber', blue: 'bg-slateblue', tick: 'bg-tick', neutral: 'bg-ink-300' }

export function Overview() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const r = useReadiness()
  const queue = useWorkQueue()
  const navigate = useStore((s) => s.navigate)
  const names = householdNames(m)
  const ext = extensionInfo(m)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const findings = queue.filter((q) => q.kind === 'finding')
  const client = m.packet.packet.name.split(/ household| - /)[0]
  const status = sentence(r.stage, findings.length, queue.length)

  return (
    <div>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-3xl">
          <div className="eyebrow mb-3">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {ROLE_LABEL[perms.role]}</div>
          <h1 className="display text-[38px] font-bold leading-[1.05] text-ink">{greeting}, {perms.name.split(' ')[0]}.</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-600">
            The <b className="font-semibold text-ink">{client}</b> {m.packet.household.tax_year} return is <StageWord stage={r.stage} />. {status}
          </p>
          <p className="mt-1 text-sm text-ink-400">
            {[names.taxpayer?.name, names.spouse?.name].filter(Boolean).join(' & ')} · {returnForms(m)} · {moveSummary(m)}{ext.extendedTo ? ` · extended to ${date(ext.extendedTo)}` : ''}
          </p>
        </div>
        {queue.length > 0 && perms.canEdit && (
          <motion.button
            whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/focus')}
            className="group flex items-center gap-3 rounded-xl bg-ink px-5 py-3.5 text-left text-white shadow-pop"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-hilite text-ink"><Play size={16} className="translate-x-px" /></span>
            <span>
              <span className="block text-sm font-semibold">Start focus mode</span>
              <span className="block text-2xs text-ink-300">Work the queue with the keyboard</span>
            </span>
            <span className="ml-2 hidden sm:block"><Kbd>F</Kbd></span>
          </motion.button>
        )}
      </header>

      {w.events.length === 0 && <FirstVisit />}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-12">
          <section>
            <SectionHead title="Up next" count={queue.length} hint={queue.length ? 'Ordered by what blocks filing and by tax effect' : undefined} />
            <Queue items={queue} />
          </section>
          <section>
            <ProofMapSection />
          </section>
          <section>
            <SectionHead title="Areas" hint="Who owns each part of the return, and how far it has got" />
            <AreaList />
          </section>
        </div>
        <aside className="space-y-8 xl:sticky xl:top-6 xl:self-start">
          <BottomLine />
          <FilingPath />
          <Activity />
          <Deadlines />
        </aside>
      </div>
    </div>
  )
}

function sentence(stage: string, findings: number, total: number) {
  if (stage === 'Filed') return 'It was accepted and is frozen; anything new goes into an amendment.'
  if (!total) return 'Nothing is waiting on you right now.'
  const rest = total - findings
  if (findings) return `${findings} check${findings > 1 ? 's' : ''} need${findings === 1 ? 's' : ''} a fix or a decision${rest ? `, and ${rest} other item${rest === 1 ? '' : 's'} need${rest === 1 ? 's' : ''} you` : ''}.`
  return `${total} item${total > 1 ? 's' : ''} need${total === 1 ? 's' : ''} you.`
}

function StageWord({ stage }: { stage: string }) {
  const tone = stage === 'Filed' ? 'text-tick-deep' : stage === 'Preparation' ? 'text-amber' : 'text-slateblue'
  return <b className={cx('font-semibold', tone)}>{stage.toLowerCase().replace(/^in /, 'in ')}</b>
}

function SectionHead({ title, count, hint, right }: { title: string; count?: number; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b border-ink-200/80 pb-2.5">
      <div className="flex items-baseline gap-2.5">
        <h2 className="display text-lg font-semibold text-ink">{title}</h2>
        {count != null && <span className="num text-sm text-ink-400">{count}</span>}
        {hint && <span className="hidden text-xs text-ink-400 md:inline">{hint}</span>}
      </div>
      {right}
    </div>
  )
}

function Queue({ items }: { items: WorkItem[] }) {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const perms = usePerms()
  const navigate = useStore((s) => s.navigate)
  const openTrace = useStore((s) => s.openTrace)
  const record = useStore((s) => s.record)
  const [all, setAll] = useState(false)
  if (!items.length) return (
    <div className="flex items-center gap-3 py-6 text-sm text-ink-500">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-tick-soft"><Check size={15} className="text-tick" /></span>
      You're clear. New work shows up here as soon as someone needs you.
    </div>
  )
  const shown = all ? items : items.slice(0, 7)
  const open = (it: WorkItem) => it.route ? navigate(it.route) : it.lineKey ? openTrace(it.lineKey) : undefined
  return (
    <div>
      <ul className="divide-y divide-ink-100">
        <AnimatePresence initial={false}>
          {shown.map((it, i) => {
            const f = it.findingId ? fs.find((x) => x.f.id === it.findingId)?.f : undefined
            const canApply = f && f.proposals.length > 0 && f.kind !== 'judgment' && perms.canEdit && !w.frozenAt
            return (
              <motion.li key={it.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24, height: 0 }} transition={{ duration: 0.22, delay: i * 0.02 }}>
                <div className="group flex items-center gap-4 py-3.5">
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', TONE_DOT[it.tone])} />
                  <button onClick={() => open(it)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[15px] font-medium text-ink group-hover:underline group-hover:decoration-ink-300 group-hover:underline-offset-4">{it.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-500">{it.detail}</span>
                  </button>
                  {canApply ? (
                    <button onClick={() => record(proposalEvents(f!, m, w), { toast: `Applied: ${f!.title}` })} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink-200 transition hover:bg-ink hover:text-white hover:ring-ink">Apply fix</button>
                  ) : (
                    <button onClick={() => open(it)} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink">Open <ArrowRight size={12} className="inline" /></button>
                  )}
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      {items.length > 7 && <button onClick={() => setAll(!all)} className="mt-2 text-xs font-medium text-ink-500 hover:text-ink">{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </div>
  )
}

function ProofMapSection() {
  const proofs = useAllProofs()
  const counts = useMemo(() => {
    const c: Record<ProofStatus, number> = { flagged: 0, adjusted: 0, verified: 0, supported: 0, open: 0 }
    for (const p of proofs.values()) c[p.status]++
    return c
  }, [proofs])
  const total = proofs.size
  const pctDone = Math.round(((counts.verified + counts.supported) / Math.max(1, total)) * 100)
  return (
    <>
      <SectionHead title="Proof map" hint="One square per number on the return" right={
        <div className="flex items-baseline gap-1.5 text-sm text-ink-500"><AnimatedNumber value={counts.verified} format={(n) => String(n)} className="num font-semibold text-ink" /> of {total} verified · <span className="num">{pctDone}%</span> supported</div>
      } />
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-2xs text-ink-500">
        {(['flagged', 'adjusted', 'verified', 'supported', 'open'] as ProofStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-[3px]', STATUS_META[s].dot)} />{STATUS_META[s].label} <span className="num text-ink-400">{counts[s]}</span></span>
        ))}
      </div>
      <ProofMap />
    </>
  )
}

function ProofMap() {
  const { m } = useModel()
  const w = useWork()
  const proofs = useAllProofs()
  const openTrace = useStore((s) => s.openTrace)
  const [hover, setHover] = useState<string | null>(null)
  let idx = 0
  const hl = hover ? w.line(hover) : null
  return (
    <div>
      <div className="space-y-2">
        {AREAS.map((a) => (
          <div key={a.id} className="flex items-center gap-3">
            <div className="w-28 shrink-0 truncate text-2xs text-ink-500">{a.short}</div>
            <div className="flex flex-1 flex-wrap gap-[3px]">
              {m.linesByArea.get(a.id)!.map((l) => {
                const p = proofs.get(l.key)!
                const delay = Math.min(1.1, (idx++) * 0.0016)
                return (
                  <motion.button
                    key={l.key}
                    initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, duration: 0.25 }}
                    onMouseEnter={() => setHover(l.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(l.key)}
                    onClick={() => openTrace(l.key)}
                    aria-label={`${l.key} ${l.label}: ${STATUS_META[p.status].label}`}
                    className={cx('h-3 w-3 rounded-[3px] transition-[transform,background-color] duration-300 hover:z-10 hover:scale-150', STATUS_META[p.status].dot)}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-5 truncate text-xs text-ink-500">
        {hl ? <><span className="num text-ink-700">{hl.key}</span> · {hl.label} · <span className="num font-medium text-ink">{typeof hl.value === 'number' ? money(hl.value) : String(hl.value)}</span> · {STATUS_META[proofs.get(hl.key)!.status].label}</> : 'Hover a square to see the number; click to open its proof.'}
      </div>
    </div>
  )
}

function AreaList() {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const r = useReadiness()
  const proofs = useAllProofs()
  const navigate = useStore((s) => s.navigate)
  return (
    <ul className="divide-y divide-ink-100">
      {AREAS.map((a) => {
        const lines = m.linesByArea.get(a.id)!
        const ps = lines.map((l) => proofs.get(l.key)!)
        const verified = ps.filter((p) => p.status === 'verified').length
        const supported = ps.filter((p) => p.status === 'supported').length
        const flagged = ps.filter((p) => p.status === 'flagged').length
        const open = fs.filter((x) => x.f.area === a.id && x.status === 'open').length
        const assignee = w.assignments.get(a.id)?.staffId ?? m.packet.firm.assignment_at_start.preparer
        const signs = r.areaSign.get(a.id)!
        const anchor = w.line(a.anchor)
        return (
          <li key={a.id}>
            <button onClick={() => navigate(`/return/${a.id}`)} className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 text-left md:grid-cols-[minmax(0,1.4fr)_140px_110px_90px_auto]">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">{a.name}{open > 0 && <Chip tone="pencil">{open}</Chip>}</span>
                <span className="block truncate text-xs text-ink-500">{areaBlurb(m, a.id)}</span>
              </span>
              <span className="hidden md:block">
                <span className="flex h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <span className="bg-tick transition-all duration-500" style={{ width: `${(verified / lines.length) * 100}%` }} />
                  <span className="bg-ink-300 transition-all duration-500" style={{ width: `${(supported / lines.length) * 100}%` }} />
                  <span className="bg-pencil transition-all duration-500" style={{ width: `${(flagged / lines.length) * 100}%` }} />
                </span>
                <span className="mt-1 block text-2xs text-ink-400">{verified + supported}/{lines.length} supported</span>
              </span>
              <span className="num hidden text-right text-sm font-medium md:block">{typeof anchor?.value === 'number' ? money(anchor.value) : ''}</span>
              <span className="hidden items-center gap-0.5 md:flex">
                {(['P', 'R', 'Pt'] as const).map((lv, j) => {
                  const s = signs[j]
                  return <span key={lv} title={['Preparer', 'Reviewer', 'Partner'][j] + (s ? (s.stale.length ? ' sign-off reopened' : ` signed by ${personName(m, s.by)}`) : ' not signed')} className={cx('num grid h-5 min-w-5 place-items-center rounded px-1 text-[9px] font-semibold', !s ? 'bg-ink-100 text-ink-400' : s.stale.length ? 'bg-pencil-soft text-pencil' : 'bg-tick-soft text-tick-deep')}>{lv}</span>
                })}
              </span>
              <span className="flex items-center gap-2 justify-self-end">
                <Avatar name={personName(m, assignee)} initials={initials(personName(m, assignee))} size={22} />
                <ArrowRight size={13} className="text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function BottomLine() {
  const { m } = useModel()
  const w = useWork()
  const openTrace = useStore((s) => s.openTrace)
  const fed = m.current.summary.federal.balance_due + w.effectTotal.federalBalance
  const st = m.current.summary.california.balance_due + w.effectTotal.californiaBalance
  const moved = w.effectTotal.federalBalance !== 0 || w.effectTotal.californiaBalance !== 0
  const row = (label: string, v: number, engine: number, key: string) => (
    <button onClick={() => openTrace(key)} className="group block w-full py-3 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-600 group-hover:text-ink">{label} {v > 0 ? 'balance due' : 'refund'}</span>
        <AnimatedNumber value={Math.abs(v)} format={(n) => money(n)} className="num text-[26px] font-semibold leading-none text-ink" />
      </div>
      {v !== engine && <div className="num mt-1 text-right text-2xs text-ink-400">engine {engine > 0 ? 'due' : 'refund'} {money(Math.abs(engine))} · workpaper {signed(v - engine)}</div>}
    </button>
  )
  return (
    <section className="sheet rounded-xl px-5 pb-3 pt-5 shadow-sheet ring-1 ring-ink-200/70">
      <div className="eyebrow">The bottom line</div>
      <div className="divide-y divide-ink-100">
        {row('Federal', fed, m.current.summary.federal.balance_due, 'F1040.37')}
        {row('State', st, m.current.summary.california.balance_due, 'F540NR.97')}
      </div>
      {moved && <p className="mt-1 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-500"><Sparkles size={11} className="mt-0.5 shrink-0 text-amber" /> Income flows exactly; tax is estimated at {m.current.version} rates until the engine recomputes ({w.pendingCount} lines pending).</p>}
    </section>
  )
}

function FilingPath() {
  const r = useReadiness()
  const navigate = useStore((s) => s.navigate)
  const stages = ['Preparation', 'In review', 'Partner review', 'Ready to send', 'With client', 'Ready to file', 'Filed']
  const at = Math.max(0, stages.indexOf(r.stage))
  const next = r.blockers.find((b) => !b.done)
  return (
    <section>
      <div className="eyebrow mb-3">Path to filing</div>
      <ol className="relative ml-1 space-y-0 border-l border-ink-200 pl-5">
        {stages.map((s, i) => (
          <li key={s} className="relative py-1">
            <span className={cx('absolute -left-[26px] top-2 grid h-3 w-3 place-items-center rounded-full ring-4 ring-paper', i < at ? 'bg-tick' : i === at ? 'bg-ink' : 'bg-ink-200')}>
              {i === at && <motion.span layoutId="stage-pulse" className="absolute h-3 w-3 animate-ping rounded-full bg-ink/40" />}
            </span>
            <span className={cx('text-sm', i === at ? 'font-semibold text-ink' : i < at ? 'text-ink-500 line-through decoration-ink-300' : 'text-ink-400')}>{s}</span>
          </li>
        ))}
      </ol>
      {next && (
        <button onClick={() => navigate(next.route)} className="mt-3 flex w-full items-start gap-2 rounded-lg bg-amber-soft/70 px-3 py-2 text-left text-xs text-ink-700 ring-1 ring-amber/20 hover:ring-amber/40">
          <CornerDownRight size={13} className="mt-0.5 shrink-0 text-amber" />
          <span><b>Next gate:</b> {next.label}. {next.detail}.</span>
        </button>
      )}
    </section>
  )
}

function Activity() {
  const { m } = useModel()
  const w = useWork()
  const openTrace = useStore((s) => s.openTrace)
  const evs = w.active.filter((e) => !['seen', 'view.sensitive', 'time', 'step'].includes(e.kind)).slice(-7).reverse()
  return (
    <section>
      <div className="eyebrow mb-3">Recent activity</div>
      {evs.length === 0 ? <p className="text-xs text-ink-400">Nothing yet. Every verification, adjustment, note and sign-off lands here with who and when.</p> : (
        <ul className="space-y-3">
          {evs.map((e) => {
            const target = ('lineKey' in e ? e.lineKey : 'target' in e ? e.target : undefined) as string | undefined
            return (
              <li key={e.id} className="flex gap-2.5">
                <Avatar name={personName(m, e.actor)} initials={initials(personName(m, e.actor))} size={22} />
                <div className="min-w-0 text-xs leading-relaxed">
                  <span className="font-medium text-ink">{personName(m, e.actor).split(' ')[0]}</span>{' '}
                  <span className="text-ink-600">{describeEvent(e).slice(0, 90)}</span>
                  {target && w.line(target) && <button onClick={() => openTrace(target)} className="num ml-1 rounded bg-ink-50 px-1 text-2xs text-ink-500 ring-1 ring-ink-200 hover:text-ink">{target}</button>}
                  <div className="text-2xs text-ink-400">{ago(e.at)}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Deadlines() {
  const { m } = useModel()
  const today = new Date().toISOString().slice(0, 10)
  const ds = [...m.packet.firm.deadlines].sort((a, b) => a.date.localeCompare(b.date))
  return (
    <section>
      <div className="eyebrow mb-3 flex items-center gap-1.5"><CalendarClock size={12} /> Deadlines</div>
      <ul className="space-y-1.5 text-xs">
        {ds.map((d) => (
          <li key={d.what} className={cx('flex gap-3', d.date < today && 'text-ink-400')}>
            <span className="num w-20 shrink-0">{d.date}</span><span className={d.date < today ? 'line-through decoration-ink-200' : 'text-ink-700'}>{d.what}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FirstVisit() {
  const navigate = useStore((s) => s.navigate)
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-10 flex flex-wrap items-center gap-4 rounded-xl bg-hilite-soft px-5 py-4 text-sm text-ink-700 ring-1 ring-hilite-deep/30">
      <svg width="22" height="22" viewBox="0 0 20 20" className="tick-draw shrink-0"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#14213D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="min-w-0 flex-1 basis-[240px]">This workpaper starts exactly where the pipeline stopped: nothing verified, nothing signed. Start with focus mode, or load a day of sample team activity to see the review in motion.</span>
      <button onClick={() => navigate('/firm/record')} className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink-300 hover:bg-white">Sample activity</button>
    </motion.div>
  )
}
