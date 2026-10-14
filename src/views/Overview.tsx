import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Check, Circle, CalendarClock, AlertOctagon } from 'lucide-react'
import { useFindingState, useModel, useWork } from '../store/context'
import { useStore } from '../store/store'
import { useAllProofs, STATUS_META, type ProofStatus } from '../store/lineState'
import { useReadiness } from '../store/readiness'
import { AREAS } from '../data/areas'
import { areaForLine } from '../data/areas'
import { Card, Chip, cx, Meter, SectionTitle } from '../components/ui'
import { money, signed, date } from '../lib/format'
import { personName } from '../store/permissions'

export function Overview() {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const r = useReadiness()
  const navigate = useStore((s) => s.navigate)
  const proofs = useAllProofs()
  const fed = m.current.summary.federal
  const ca = m.current.summary.california
  const e = w.effectTotal
  const py = m.priorLines
  const adjCount = [...w.adjustments.values()].filter((a) => !a.reverted).length
  const counts = useMemo(() => {
    const c: Record<ProofStatus, number> = { flagged: 0, adjusted: 0, verified: 0, supported: 0, open: 0 }
    for (const p of proofs.values()) c[p.status]++
    return c
  }, [proofs])
  const total = proofs.size

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow mb-2">2025 Form 1040 + California 540NR · {m.packet.household.filing_status.replace(/_/g, ' ')}</div>
          <h1 className="display text-[34px] font-bold leading-[1.05] text-ink">Ngozi Okafor <span className="text-ink-300">&</span> Erik Lindqvist</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Moved Sacramento → Austin on 7/14. Engine version {m.current.version} ({date(m.current.computed_at)}) plus {adjCount} workpaper adjustment{adjCount === 1 ? '' : 's'}.
            Prior year prepared by {m.packet.prior_years.return_2024.prepared_by}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={r.ready ? 'tick' : 'amber'} className="!text-xs !px-3 !py-1">{r.stage}</Chip>
          <Chip tone="neutral" className="!text-xs !px-3 !py-1">Extended to Oct 15, 2026</Chip>
        </div>
      </div>

      {w.events.length === 0 && <FirstVisit />}

      {/* Signature: every number on the return, as a tick in the proof map */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-3 pt-5">
          <div>
            <div className="eyebrow mb-1">Proof map</div>
            <div className="display text-xl font-semibold">
              <span className="num">{counts.verified}</span> of <span className="num">{total}</span> numbers verified
              <span className="text-ink-400"> · </span><span className="num text-pencil">{counts.flagged}</span> <span className="text-pencil">flagged</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-2xs text-ink-500">
            {(['flagged', 'adjusted', 'verified', 'supported', 'open'] as ProofStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-[3px]', STATUS_META[s].dot)} />{STATUS_META[s].label} <span className="num text-ink-400">{counts[s]}</span></span>
            ))}
          </div>
        </div>
        <ProofMap />
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <SectionTitle eyebrow="Return summary" title="Where the return stands" right={<button onClick={() => navigate('/schedules/summary')} className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink">vs last year <ArrowRight size={12} /></button>} />
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <Figures title="Federal" rows={[
              ['Adjusted gross income', fed.agi, py['F1040.11'] as number, (w.value('F1040.11') ?? fed.agi) - fed.agi, 'F1040.11'],
              ['Taxable income', fed.taxable_income, py['F1040.15'] as number, (w.value('F1040.15') ?? fed.taxable_income) - fed.taxable_income, 'F1040.15'],
              ['Total tax', fed.total_tax, py['F1040.24'] as number, e.federalTax, 'F1040.24'],
              ['Payments', fed.payments, py['F1040.33'] as number, e.federalTax - e.federalBalance, 'F1040.33'],
            ]} bottom={['Balance due', fed.balance_due, e.federalBalance, 'F1040.37']} />
            <Figures title="California (540NR)" rows={[
              ['Total AGI (CA law)', ca.total_agi, undefined, (w.value('F540NR.17') ?? ca.total_agi) - ca.total_agi, 'F540NR.17'],
              ['California AGI', ca.ca_agi, undefined, (w.value('F540NR.32') ?? ca.ca_agi) - ca.ca_agi, 'F540NR.32'],
              ['Total tax', ca.total_tax, Number(py['CA540.64'] ?? 12520), e.californiaTax, 'F540NR.64'],
              ['Payments', ca.payments, undefined, e.californiaTax - e.californiaBalance, 'F540NR.78'],
            ]} bottom={['', ca.balance_due, e.californiaBalance, 'F540NR.97']} />
          </div>
          {adjCount > 0 && (
            <p className="mt-5 rounded-lg bg-hilite-soft/60 px-3 py-2 text-xs text-ink-600 ring-1 ring-hilite-deep/20">
              Income lines carry the adjustments exactly. Tax is estimated with {m.current.version}'s per-dollar rates: federal <b className="num">{signed(e.federalTax)}</b>, California <b className="num">{signed(e.californiaTax)}</b>. {w.pendingCount} lines that apply tax rules are marked for the engine to recompute.
            </p>
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle eyebrow="Filing readiness" title={r.ready ? 'Ready to file' : 'What stands between this return and filing'} />
          <ul className="mt-4 space-y-1">
            {r.blockers.map((b, i) => (
              <motion.li key={b.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                <button onClick={() => navigate(b.route)} className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-ink-50">
                  {b.done ? <span className="grid h-5 w-5 place-items-center rounded-full bg-tick-soft"><Check size={12} className="text-tick" /></span> : <Circle size={20} className="text-pencil/70" strokeWidth={1.6} />}
                  <span className="flex-1 text-sm text-ink">{b.label}</span>
                  <span className={cx('text-xs', b.done ? 'text-ink-400' : 'font-medium text-pencil')}>{b.detail}</span>
                  <ArrowRight size={13} className="text-ink-300 opacity-0 transition group-hover:opacity-100" />
                </button>
              </motion.li>
            ))}
          </ul>
          <div className="mt-4 border-t border-ink-100 pt-4">
            <div className="eyebrow mb-2 flex items-center gap-1.5"><CalendarClock size={12} /> Deadlines</div>
            <ul className="space-y-1 text-xs">
              {m.packet.firm.deadlines.map((d) => (
                <li key={d.what} className="flex gap-3"><span className="num w-20 shrink-0 text-ink-500">{d.date}</span><span className="text-ink-700">{d.what}</span></li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {fs.some((x) => x.status === 'open' && x.f.severity !== 'info') && (
        <Card className="mb-6 p-6">
          <SectionTitle eyebrow="Independent checks" title="Errors the engine did not catch" right={<button onClick={() => navigate('/checks')} className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink">All checks <ArrowRight size={12} /></button>} />
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {fs.filter((x) => x.status === 'open' && x.f.severity !== 'info').slice(0, 6).map(({ f }) => (
              <button key={f.id} onClick={() => navigate(`/checks/${f.id}`)} className="group flex items-start gap-3 rounded-lg p-3 text-left ring-1 ring-ink-200 transition hover:shadow-sheet">
                <AlertOctagon size={16} className={cx('mt-0.5 shrink-0', f.severity === 'blocking' || f.severity === 'error' ? 'text-pencil' : 'text-amber')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{f.title}</span>
                  <span className="line-clamp-2 text-xs text-ink-500">{f.summary}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <SectionTitle eyebrow="Areas" title="Area summaries" className="mb-4" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {AREAS.map((a, i) => <AreaCard key={a.id} areaId={a.id} i={i} />)}
      </div>
    </div>
  )
}

function Figures({ title, rows, bottom }: { title: string; rows: [string, number, number | undefined, number, string][]; bottom: [string, number, number, string] }) {
  const openTrace = useStore((s) => s.openTrace)
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      <table className="w-full text-sm">
        <thead><tr className="text-2xs text-ink-400"><th className="pb-1 text-left font-normal" /><th className="pb-1 text-right font-normal">2024</th><th className="pb-1 text-right font-normal">2025</th></tr></thead>
        <tbody>
          {rows.map(([l, v, p, d, k]) => (
            <tr key={l} className="group cursor-pointer" onClick={() => openTrace(k)}>
              <td className="whitespace-nowrap py-1 pr-2 text-ink-600 group-hover:text-ink">{l}</td>
              <td className="num py-1 text-right text-xs text-ink-400">{p == null ? '' : money(p)}</td>
              <td className="num py-1 text-right font-medium">{money(v + d)}{d !== 0 && <span className="block text-[10px] font-normal leading-3 text-slateblue">{signed(d)}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink pt-2">
        <button onClick={() => openTrace(bottom[3])} className="text-sm font-semibold text-ink hover:underline">{bottom[1] + bottom[2] > 0 ? 'Balance due' : 'Refund'}</button>
        <span className="num text-xl font-semibold">{money(Math.abs(bottom[1] + bottom[2]))}</span>
      </div>
      {bottom[2] !== 0 && <div className="num text-right text-2xs text-ink-400">engine {money(bottom[1])} · workpaper {signed(bottom[2])}</div>}
    </div>
  )
}

function ProofMap() {
  const { m } = useModel()
  const w = useWork()
  const proofs = useAllProofs()
  const openTrace = useStore((s) => s.openTrace)
  const [hover, setHover] = useState<string | null>(null)
  const groups = AREAS.map((a) => ({ a, lines: m.linesByArea.get(a.id)! }))
  let idx = 0
  const hl = hover ? w.line(hover) : null
  return (
    <div className="px-6 pb-5">
      <div className="space-y-2">
        {groups.map(({ a, lines }) => (
          <div key={a.id} className="flex items-center gap-3">
            <div className="w-36 shrink-0 truncate text-2xs text-ink-500">{a.short}</div>
            <div className="flex flex-1 flex-wrap gap-[3px]">
              {lines.map((l) => {
                const p = proofs.get(l.key)!
                const delay = Math.min(1.2, (idx++) * 0.0018)
                return (
                  <motion.button
                    key={l.key}
                    initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, duration: 0.25 }}
                    onMouseEnter={() => setHover(l.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(l.key)}
                    onClick={() => openTrace(l.key)}
                    aria-label={`${l.key} ${l.label}: ${STATUS_META[p.status].label}`}
                    className={cx('h-3 w-3 rounded-[3px] transition-transform hover:scale-150 hover:z-10', STATUS_META[p.status].dot)}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-5 text-xs text-ink-500">
        {hl ? <><span className="num text-ink-700">{hl.key}</span> · {hl.label} · <span className="num font-medium text-ink">{typeof hl.value === 'number' ? money(hl.value) : String(hl.value)}</span> · {STATUS_META[proofs.get(hl.key)!.status].label}</> : 'Each square is one number on the return. Click any square to see its proof.'}
      </div>
      {void areaForLine}
    </div>
  )
}

function AreaCard({ areaId, i }: { areaId: (typeof AREAS)[number]['id']; i: number }) {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const r = useReadiness()
  const proofs = useAllProofs()
  const navigate = useStore((s) => s.navigate)
  const a = AREAS.find((x) => x.id === areaId)!
  const lines = m.linesByArea.get(a.id)!
  const ps = lines.map((l) => proofs.get(l.key)!)
  const verified = ps.filter((p) => p.status === 'verified').length
  const flagged = ps.filter((p) => p.status === 'flagged').length
  const open = fs.filter((x) => x.f.area === a.id && x.status === 'open').length
  const budget = a.budgetKey ? m.packet.firm.budget_hours[a.budgetKey] : undefined
  const spent = w.time.get(a.id) ?? 0
  const assignee = w.assignments.get(a.id)?.staffId ?? m.packet.firm.assignment_at_start.preparer
  const signs = r.areaSign.get(a.id)!
  const anchor = w.line(a.anchor)
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
      onClick={() => navigate(`/return/${a.id}`)}
      className="group rounded-xl bg-white p-5 text-left ring-1 ring-ink-200/70 transition hover:-translate-y-0.5 hover:shadow-sheet"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="display text-[15px] font-semibold text-ink">{a.name}</div>
          <div className="mt-0.5 text-xs text-ink-500">{a.blurb}</div>
        </div>
        {open > 0 && <Chip tone="pencil">{open} open</Chip>}
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-2xs text-ink-400">{anchor?.label}</span>
        <span className="num text-lg font-semibold">{typeof anchor?.value === 'number' ? money(anchor.value) : '—'}</span>
      </div>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-ink-100">
        <span className="bg-tick" style={{ width: `${(verified / lines.length) * 100}%` }} />
        <span className="bg-pencil" style={{ width: `${(flagged / lines.length) * 100}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-2xs text-ink-500">
        <span>{verified}/{lines.length} verified</span>
        <span className="flex items-center gap-1">
          {(['P', 'R', 'Pt'] as const).map((lv, j) => {
            const s = signs[j]
            return <span key={lv} title={['Preparer', 'Reviewer', 'Partner'][j] + (s ? (s.stale.length ? ' sign-off reopened' : ` signed by ${personName(m, s.by)}`) : ' not signed')} className={cx('num grid h-5 min-w-5 place-items-center rounded px-1 text-[9px] font-semibold', !s ? 'bg-ink-100 text-ink-400' : s.stale.length ? 'bg-pencil-soft text-pencil' : 'bg-tick-soft text-tick-deep')}>{lv}</span>
          })}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-2xs text-ink-500">
        <span>{personName(m, assignee)}</span>
        {budget != null ? <span className="flex w-28 items-center gap-2"><Meter value={spent} max={budget} tone={spent > budget ? 'pencil' : 'ink'} className="flex-1" /><span className="num">{spent}/{budget}h</span></span> : <span />}
      </div>
    </motion.button>
  )
}

function FirstVisit() {
  const navigate = useStore((s) => s.navigate)
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-center gap-4 rounded-xl bg-ink px-5 py-4 text-sm text-ink-100">
      <svg width="22" height="22" viewBox="0 0 20 20" className="tick-draw shrink-0"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#F7E463" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="min-w-0 flex-1 basis-[240px]">This workpaper starts exactly where the pipeline stopped: nothing verified, nothing signed. Begin with the checks the engine didn't run, or load a day of sample team activity.</span>
      <button onClick={() => navigate('/checks')} className="rounded-lg bg-hilite px-3 py-1.5 text-xs font-semibold text-ink hover:brightness-95">Open the checks</button>
      <button onClick={() => navigate('/firm/record')} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/25 hover:bg-white/10">Sample activity</button>
    </motion.div>
  )
}
