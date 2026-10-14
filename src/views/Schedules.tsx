import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, ArrowRight } from 'lucide-react'
import { useModel, useWork, useFindingState } from '../store/context'
import { useStore } from '../store/store'
import { useAllProofs, STATUS_META } from '../store/lineState'
import { Card, Chip, PageHeader, cx, Button } from '../components/ui'
import { TickMark } from '../components/TickMark'
import { JudgmentDialog, useStandards } from '../components/actions'
import { lineValue, money, pct, signed, date } from '../lib/format'
import { variances } from '../data/checks'

const TABS = [
  ['summary', 'Return vs last year'], ['computation', 'Tax computation'], ['depreciation', 'Depreciation'], ['sales', 'Sales detail'],
  ['books', 'Books to tax'], ['rentals', 'Rentals & passive'], ['k1', 'K-1 lines'], ['retirement', 'Retirement & foreign'],
  ['deductions', 'Deductions & credits'], ['payments', 'Payments'], ['state', 'State split'], ['carryovers', 'Carryovers'],
  ['basis', 'Basis by year'], ['prior', 'Prior preparer vs us'],
] as const

export function Schedules({ tab }: { tab?: string }) {
  const navigate = useStore((s) => s.navigate)
  const t = tab || 'summary'
  const title = TABS.find((x) => x[0] === t)?.[1] ?? 'Schedules'
  return (
    <div>
      <PageHeader eyebrow="Records a CPA expects" title={title} sub="Every figure below is live: click it to open its proof." />
      <div className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => navigate(`/schedules/${id}`)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', t === id ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-600 ring-ink-200 hover:ring-ink-300')}>{label}</button>
        ))}
      </div>
      {t === 'summary' && <SummaryVsPrior />}
      {t === 'computation' && <LineTable keys={['F1040.11', 'F1040.12', 'F1040.13', 'F1040.14', 'F1040.15', 'F1040.16', 'F6251.4', 'F6251.5', 'F6251.9', 'F6251.11', 'F1040.18', 'F1040.19', 'F1040.20', 'F1040.22', 'Sch2.4', 'Sch2.11', 'Sch2.12', 'F1040.23', 'F1040.24']} note="Regular tax uses the Schedule D tax worksheet. AMT arises from the July ISO exercise (1,000 sh × (52 − 12) = 40,000) and creates a minimum tax credit for 2026." />}
      {t === 'depreciation' && <Depreciation />}
      {t === 'sales' && <Sales />}
      {t === 'books' && <BooksToTax />}
      {t === 'rentals' && <Rentals />}
      {t === 'k1' && <K1s />}
      {t === 'retirement' && <Retirement />}
      {t === 'deductions' && <Deductions />}
      {t === 'payments' && <Payments />}
      {t === 'state' && <StateSplit />}
      {t === 'carryovers' && <Carryovers />}
      {t === 'basis' && <Basis />}
      {t === 'prior' && <PriorVsUs />}
    </div>
  )
}

export function LineTable({ keys, title, note, compare }: { keys: string[]; title?: string; note?: ReactNode; compare?: boolean }) {
  const { m } = useModel()
  const w = useWork()
  const proofs = useAllProofs()
  const openTrace = useStore((s) => s.openTrace)
  return (
    <Card className="overflow-hidden">
      {title && <div className="border-b border-ink-100 px-4 py-3 display text-sm font-semibold">{title}</div>}
      <table className="w-full text-sm">
        <tbody>
          {keys.map((k) => {
            const l = w.line(k)
            if (!l) return null
            const p = proofs.get(k)
            const prior = m.priorLines[k]
            return (
              <tr key={k} onClick={() => openTrace(k)} className="cursor-pointer border-b border-ink-100 last:border-0 hover:bg-ink-50/70">
                <td className="num w-28 py-2 pl-4 text-2xs text-ink-400">{k}</td>
                <td className="py-2 text-ink-700">{l.label}</td>
                {compare && <td className="num py-2 text-right text-xs text-ink-400">{typeof prior === 'number' ? money(prior) : ''}</td>}
                <td className={cx('num py-2 pr-3 text-right font-medium', l.adjusted && 'text-slateblue')}>{lineValue(l.value)}</td>
                <td className="w-10 py-2 pr-4 text-right">{p?.verification ? <TickMark method={p.verification.method} size={14} /> : <span className={cx('inline-block h-2 w-2 rounded-full', STATUS_META[p?.status ?? 'open'].dot)} />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {note && <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-xs text-ink-600">{note}</div>}
    </Card>
  )
}

function SummaryVsPrior() {
  const { m } = useModel()
  const w = useWork()
  const std = useStandards().variance_review
  const openTrace = useStore((s) => s.openTrace)
  const [explain, setExplain] = useState<string | null>(null)
  const vs = useMemo(() => variances(m, w.value, std), [m, w, std])
  const explained = new Set(w.judgments.filter((j) => j.category === 'variance').map((j) => j.target))
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">Firm standard: flag any line that moved more than {std.flag_if_change_over_percent}% and more than {money(std.and_over_amount)} from {std.compare_to.replace('_', ' ')}. {vs.length} lines need an explanation; {vs.filter((v) => explained.has(v.key)).length} have one.</p>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Line</th><th className="text-right font-medium">2024</th><th className="text-right font-medium">2025</th><th className="text-right font-medium">Change</th><th className="pr-4 text-right font-medium">Explanation</th></tr></thead>
          <tbody>
            {vs.map((v) => (
              <tr key={v.key} className="border-t border-ink-100 hover:bg-ink-50/60">
                <td className="py-2 pl-4"><button onClick={() => openTrace(v.key)} className="text-left"><span className="num mr-2 text-2xs text-ink-400">{v.key}</span>{v.label}</button></td>
                <td className="num text-right text-ink-500">{money(v.prior)}</td>
                <td className="num text-right font-medium">{money(v.current)}</td>
                <td className="num text-right"><span className={v.change > 0 ? 'text-ink' : 'text-ink'}>{signed(v.change)}</span> <span className="text-2xs text-amber">{pct(v.pct)}</span></td>
                <td className="py-2 pr-4 text-right">
                  {explained.has(v.key) ? <Chip tone="tick">Explained</Chip> : <button onClick={() => setExplain(v.key)} className="text-xs font-medium text-ink-600 hover:text-ink hover:underline">Explain</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {explain && <JudgmentDialog open onClose={() => setExplain(null)} target={explain} topic={`Variance on ${explain}`} category="variance" />}
    </div>
  )
}

function Depreciation() {
  const { m } = useModel()
  const openTrace = useStore((s) => s.openTrace)
  const prior = new Map(m.packet.prior_years.asset_records.map((a) => [a.asset_id, a]))
  const rows = m.current.assets
  const sum = (f: (a: (typeof rows)[number]) => number) => rows.reduce((s, a) => s + f(a), 0)
  return (
    <div className="space-y-4">
      <Card className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400">
            <tr><th className="py-2 pl-4 text-left font-medium">Asset</th><th className="text-left font-medium">In service</th><th className="text-left font-medium">Method · life</th><th className="text-right font-medium">Cost</th><th className="text-right font-medium">Fed prior</th><th className="text-right font-medium">Fed 2025</th><th className="text-right font-medium">CA 2025</th><th className="text-right font-medium">AMT diff</th><th className="pr-4 text-right font-medium">Disposed</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.asset_id} className="border-t border-ink-100 align-top hover:bg-ink-50/60">
                <td className="py-2.5 pl-4"><div className="font-medium">{a.description}</div><div className="num text-2xs text-ink-400">{a.asset_id} · {a.activity}</div>{prior.get(a.asset_id) && <div className="text-2xs text-ink-400">Prior-year schedule: {Object.entries(prior.get(a.asset_id)!.federal).map(([y, v]) => `${y} ${money(v)}`).join(', ')}</div>}</td>
                <td className="num py-2.5 text-xs">{a.placed_in_service}</td>
                <td className="py-2.5 text-xs">{a.method} · {a.life_years}y</td>
                <td className="num py-2.5 text-right">{money(a.cost)}{a.land_value_not_depreciated ? <div className="text-2xs text-ink-400">land {money(a.land_value_not_depreciated)}</div> : null}</td>
                <td className="num py-2.5 text-right text-ink-500">{money(a.federal.prior_accumulated, { cents: true })}</td>
                <td className="num py-2.5 text-right font-medium">{money(a.federal.depreciation_2025, { cents: true })}</td>
                <td className={cx('num py-2.5 text-right', a.california.depreciation_2025 !== a.federal.depreciation_2025 && 'text-amber')}>{money(a.california.depreciation_2025, { cents: true })}</td>
                <td className="num py-2.5 text-right">{money(a.amt.difference_from_regular, { dash: true })}</td>
                <td className="num py-2.5 pr-4 text-right text-xs">{a.disposed ? String(typeof a.disposed === 'string' ? a.disposed : JSON.stringify(a.disposed)) : ''}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-semibold"><td className="py-2 pl-4">Total</td><td /><td /><td className="num text-right">{money(sum((a) => a.cost))}</td><td className="num text-right">{money(sum((a) => a.federal.prior_accumulated))}</td><td className="num text-right">{money(sum((a) => a.federal.depreciation_2025))}</td><td className="num text-right">{money(sum((a) => a.california.depreciation_2025))}</td><td /><td /></tr>
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <LineTable title="Where it lands" keys={['F4562-C.14', 'F4562-C.22', 'SchC.13', 'F4562-E.total-A', 'F4562-E.total-B', 'F4797.23', 'SchD.19']} />
        <LineTable title="California differences" keys={['SchCA540NR.12.C', 'SchCA540NR.17.B', 'FTB3885A.STU-PRINTER', 'FTB3885A.STU-CAMERA', 'FTB3885A.STU-WORKST', 'FTB3885A.SAC-APPL']} note="California does not allow federal bonus depreciation. The 2021 appliances still have California basis left, and the 2025 studio equipment builds a new federal/California basis difference that carries forward." />
      </div>
      <button onClick={() => openTrace('F4797.25')} className="flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink">Condo sale: gain and recapture on Form 4797 <ArrowRight size={12} /></button>
    </div>
  )
}

function Sales() {
  const { m } = useModel()
  const w = useWork()
  const proofs = useAllProofs()
  const openTrace = useStore((s) => s.openTrace)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'exceptions'>('exceptions')
  const lots = useMemo(() => {
    const base = m.current.lines.filter((l) => /^F8949\.[A-L]\.(?!total)/.test(l.key)).map((l) => l.key)
    const added = [...w.adjustments.values()].filter((a) => a.isNew && !a.reverted && a.lineKey.startsWith('F8949')).map((a) => a.lineKey)
    return [...base, ...added].map((k) => w.line(k)!).filter(Boolean)
  }, [m, w])
  const boxes = useMemo(() => {
    const g = new Map<string, { n: number; gain: number; key: string }>()
    for (const l of lots) {
      const b = l.key.split('.')[1]
      const x = g.get(b) ?? { n: 0, gain: 0, key: `F8949.${b}.total` }
      x.n++; x.gain += Number(l.value); g.set(b, x)
    }
    return [...g.entries()].sort()
  }, [lots])
  const rows = lots.filter((l) => {
    const s = proofs.get(l.key)?.status
    if (only === 'exceptions' && !(s === 'flagged' || s === 'adjusted' || l.adjusted)) return false
    return !q || (l.key + l.label).toLowerCase().includes(q.toLowerCase())
  })
  const parent = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 40, overscan: 12 })
  const BOX: Record<string, string> = { A: 'ST covered', B: 'ST noncovered', D: 'LT covered', E: 'LT noncovered', F: 'LT other', H: 'ST digital (basis not reported)', K: 'LT digital (basis not reported)' }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {boxes.map(([b, x]) => (
          <button key={b} onClick={() => openTrace(x.key)} className="rounded-xl bg-white p-3 text-left ring-1 ring-ink-200 hover:shadow-sheet">
            <div className="eyebrow">Box {b}</div>
            <div className="text-2xs text-ink-500">{BOX[b] ?? ''}</div>
            <div className="num mt-1 font-semibold">{money(x.gain)}</div>
            <div className="num text-2xs text-ink-400">{x.n} lots</div>
          </button>
        ))}
      </div>
      <Card className="p-4 text-xs text-ink-600">
        <b>Broker summaries vs detail.</b> Brightpath: summary short-term proceeds 139,615.96 and long-term 195,112.56, matching the 260 extracted lots. Meridian: summary 71,965.00 vs detail 71,715.00. The 250.00 gap is lot M18 on page 32, which the pipeline never read (see Checks).
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-ink-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a security or lot…" className="h-8 w-64 rounded-lg pl-8 pr-3 text-xs ring-1 ring-ink-200" /></div>
        {(['exceptions', 'all'] as const).map((o) => <button key={o} onClick={() => setOnly(o)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1', only === o ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink-200')}>{o === 'exceptions' ? 'Exceptions only' : `All ${lots.length} sales`}</button>)}
        <span className="text-2xs text-ink-400">{rows.length} shown</span>
      </div>
      <Card className="overflow-hidden">
        <div ref={parent} className="scroll-thin h-[520px] overflow-y-auto">
          {rows.length === 0 && <div className="p-8 text-center text-sm text-ink-500">No exceptions. Every lot is either verified or carries no flag.</div>}
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map((it) => {
              const l = rows[it.index]
              const p = proofs.get(l.key)
              return (
                <button key={l.key} onClick={() => openTrace(l.key)} style={{ position: 'absolute', top: 0, transform: `translateY(${it.start}px)`, height: it.size }} className="grid w-full grid-cols-[120px_minmax(0,1fr)_110px_28px] items-center gap-3 border-b border-ink-100 px-4 text-left text-sm hover:bg-ink-50/70">
                  <span className="num text-2xs text-ink-400">{l.key}</span>
                  <span className="truncate text-xs text-ink-700">{l.label}</span>
                  <span className={cx('num text-right font-medium', l.adjusted && 'text-slateblue')}>{lineValue(l.value)}</span>
                  <span>{p?.verification ? <TickMark method={p.verification.method} size={13} /> : <span className={cx('inline-block h-2 w-2 rounded-full', STATUS_META[p?.status ?? 'open'].dot)} />}</span>
                </button>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}

function BooksToTax() {
  const { m } = useModel()
  const w = useWork()
  const openDoc = useStore((s) => s.openDoc)
  const openTrace = useStore((s) => s.openTrace)
  const books = m.evByDoc.get('D14') ?? []
  const val = (f: string) => Number(books.find((e) => e.field === f)?.value ?? 0)
  const net = val('net_income') || 89834
  const schc = w.value('SchC.31') ?? 0
  const steps: { label: string; amt: number; key?: string; ev?: string }[] = [
    { label: 'Books net income (QuickBooks, cash basis)', amt: net, ev: books.find((e) => e.field === 'net_income')?.id },
    { label: 'Add back book depreciation (straight-line, booked by client)', amt: 7600, key: 'SchC.13' },
    { label: 'Tax depreciation: 100% special depreciation on 38,000 of equipment', amt: -(w.value('F4562-C.22') ?? 38000), key: 'F4562-C.22' },
    { label: 'Add back health insurance (moves to Schedule 1, if allowed at all)', amt: 14400, key: 'Sch1.17' },
    { label: 'Add back fuel (replaced by standard mileage)', amt: 3100, key: 'SchC.9' },
    { label: 'Standard mileage', amt: -(w.value('SchC.9') ?? 0), key: 'SchC.9' },
    { label: 'Meals: 50% not deductible', amt: 1980, key: 'SchC.24b' },
    { label: 'Home office (simplified method)', amt: -(w.value('SchC.30') ?? 0), key: 'SchC.30' },
    { label: 'Gross receipts adjustment vs books', amt: (w.value('SchC.1') ?? 0) - 151300, key: 'SchC.1' },
    { label: 'Utilities / software adjustments vs books', amt: (3480 - (w.value('SchC.25') ?? 3480)) + (6850 - (w.value('SchC.27a.1') ?? 6850)), key: 'SchC.25' },
  ]
  const computed = steps.reduce((s, x) => s + x.amt, 0)
  const necs = m.docs.filter((d) => d.document_type === '1099-NEC').map((d) => ({ d, v: Number((m.evByDoc.get(d.id) ?? []).find((e) => e.field === 'box1')?.value ?? 0) }))
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3 display text-sm font-semibold">Books to Schedule C</div>
        <table className="w-full text-sm">
          <tbody>
            {steps.map((s, i) => (
              <tr key={i} className="border-b border-ink-100 hover:bg-ink-50/60">
                <td className="py-2 pl-4 text-ink-700">{s.ev ? <button onClick={() => openDoc({ docId: 'D14', evId: s.ev })} className="text-left hover:underline">{s.label}</button> : s.key ? <button onClick={() => openTrace(s.key!)} className="text-left hover:underline">{s.label}</button> : s.label}</td>
                <td className={cx('num py-2 pr-4 text-right', i === 0 ? 'font-semibold' : '')}>{i === 0 ? money(s.amt) : signed(s.amt)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-semibold"><td className="py-2 pl-4">Rebuilt net profit</td><td className="num py-2 pr-4 text-right">{money(computed)}</td></tr>
            <tr><td className="py-2 pl-4"><button onClick={() => openTrace('SchC.31')} className="hover:underline">Schedule C line 31 (workpaper)</button></td><td className="num py-2 pr-4 text-right">{money(schc)}</td></tr>
            <tr className="bg-ink-50/70"><td className="py-2 pl-4 text-xs text-ink-600">Unreconciled</td><td className={cx('num py-2 pr-4 text-right text-xs font-semibold', Math.abs(computed - schc) > 2 ? 'text-pencil' : 'text-tick')}>{money(computed - schc)}</td></tr>
          </tbody>
        </table>
      </Card>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="display mb-2 text-sm font-semibold">Receipts vs information returns</div>
          <ul className="space-y-1 text-sm">
            {necs.map(({ d, v }) => <li key={d.id} className="flex justify-between"><button onClick={() => openDoc({ docId: d.id })} className="text-ink-700 hover:underline">{d.issuer}</button><span className="num">{money(v)}</span></li>)}
            <li className="flex justify-between border-t border-ink-100 pt-1 font-medium"><span>1099-NEC total</span><span className="num">{money(necs.reduce((s, x) => s + x.v, 0))}</span></li>
            <li className="flex justify-between text-ink-600"><span>Clients who issued no 1099 (11)</span><span className="num">9,300</span></li>
            <li className="flex justify-between border-t-2 border-ink pt-1 font-semibold"><span>Books revenue</span><span className="num">{money(necs.reduce((s, x) => s + x.v, 0) + 9300)}</span></li>
            <li className="flex justify-between text-ink-600"><span>1099-K (Paywell): inside Atlas's 41,200</span><span className="num">12,400</span></li>
          </ul>
          <p className="mt-2 text-2xs text-ink-500">This is the reconciliation the IRS asks for in the 2028 Letter 566. Keep it with the file.</p>
        </Card>
        <LineTable title="Schedule C as filed" keys={['SchC.1', 'SchC.8', 'SchC.9', 'SchC.11', 'SchC.13', 'SchC.15', 'SchC.17', 'SchC.18', 'SchC.22', 'SchC.24a', 'SchC.24b', 'SchC.25', 'SchC.27a.1', 'SchC.27a.2', 'SchC.28', 'SchC.30', 'SchC.31']} />
      </div>
    </div>
  )
}

function Rentals() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <LineTable compare title="1450 Fremont Way, Sacramento (all year)" keys={['SchE.3A', 'SchE.9A', 'SchE.11A', 'SchE.12A', 'SchE.14A', 'SchE.16A', 'SchE.18A', 'SchE.20A', 'SchE.21A', 'SchE.22A']} note="Insurance 1,850 rests on the client's answer (qa-36). Ask for the declarations page. HVAC 11,000 is inside repairs; see Checks." />
      <LineTable compare title="1200 Barton Hills Dr 4C, Austin (sold 10/15)" keys={['SchE.3B', 'SchE.9B', 'SchE.12B', 'SchE.14B', 'SchE.16B', 'SchE.18B', 'SchE.19B', 'SchE.20B', 'SchE.21B', 'SchE.22B']} />
      <LineTable title="Passive activity losses (Form 8582)" keys={['F8582.1a', 'F8582.1b', 'F8582.1c', 'F8582.3a', 'F8582.4', 'SchE.26', 'SchE.41']} note="The condo's fully taxable sale frees its suspended losses, and net passive income is positive. All 16,150 of 2024 unallowed losses are used." />
      <LineTable title="Condo sale (Form 4797)" keys={['F4797.20', 'F4797.21', 'F4797.22', 'F4797.23', 'F4797.24', 'F4797.25', 'SchD.19']} />
    </div>
  )
}

function K1s() {
  const { m } = useModel()
  const openDoc = useStore((s) => s.openDoc)
  const openTrace = useStore((s) => s.openTrace)
  const card = (docId: string, title: string, rows: { box: string; field: string; to: string[] }[]) => {
    const evs = m.evByDoc.get(docId) ?? []
    return (
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3"><span className="display text-sm font-semibold">{title}</span><button onClick={() => openDoc({ docId })} className="num text-2xs text-ink-500 hover:underline">{docId}</button></div>
        <table className="w-full text-sm"><tbody>
          {rows.map((r) => {
            const e = evs.find((x) => x.field === r.field)
            return (
              <tr key={r.box} className="border-b border-ink-100 last:border-0">
                <td className="py-2 pl-4 text-xs text-ink-500">{r.box}</td>
                <td className="py-2"><button onClick={() => e && openDoc({ docId, evId: e.id })} className="text-ink-700 hover:underline">{e?.label ?? r.field}</button></td>
                <td className="num py-2 text-right font-medium">{e ? (typeof e.value === 'number' ? money(e.value) : String(e.value)) : '—'}</td>
                <td className="py-2 pr-4 text-right">{r.to.map((k) => <button key={k} onClick={() => openTrace(k)} className="num ml-1 rounded bg-ink-50 px-1.5 py-0.5 text-2xs ring-1 ring-ink-200">{k}</button>)}</td>
              </tr>
            )
          })}
        </tbody></table>
      </Card>
    )
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {card('D39', 'Lindqvist Family Woodworks, Inc. · 1120-S · 20%', [
        { box: '1', field: 'box1', to: ['SchE.28A', 'F7203.3a'] }, { box: '4', field: 'box4', to: ['SchB.1.7', 'F7203.3c'] },
        { box: '16D', field: 'box16d', to: ['F7203.6'] }, { box: '17V', field: 'qbi', to: ['F8995.2.2'] }, { box: 'OR', field: 'or_tax', to: ['ScheduleS.credit'] },
      ])}
      {card('D37', 'Ridgeline Real Estate Fund III LP · 1065 · arrived 6/22', [
        { box: '2', field: 'box2', to: ['SchE.28B'] }, { box: '5', field: 'box5', to: ['SchB.1.8'] }, { box: '9a', field: 'box9a', to: ['SchD.12'] },
        { box: '19A', field: 'box19a', to: [] }, { box: '21', field: 'box21', to: ['Sch3.1'] },
      ])}
      <Card className="p-4 text-xs text-ink-600 lg:col-span-2">Ridgeline's state supplement (D38) allocates box 2: California 22%, Texas 31%, Arizona 27% (composite filed), Nevada 20%. Woodworks filed an Oregon composite return and paid 1,580 for Erik. No Oregon or Arizona return is due from the household; both are listed under Filing › outside filings.</Card>
    </div>
  )
}

function Retirement() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <LineTable title="Backdoor Roth (Form 8606)" keys={['F8606.1', 'F8606.2', 'F8606.3', 'F8606.6', 'F8606.8', 'F8606.10', 'F8606.11', 'F8606.17', 'F8606.18', 'F8606.14', 'F1040.4b']} note="Basis 7,000 from the 2024 contribution (made 02/12/2025) plus the 2025 contribution of 7,000. The client's questionnaire said there was no prior basis; the documents govern." />
      <LineTable title="SEP & HSA" keys={['Sch1.16', 'F8889.3', 'F8889.9', 'F8889.13', 'F8889.14a', 'F8889.16']} note="SEP 18,000 deposited 04/10/2026; deductible 15,214; the 2,786 excess carries a 6% excise unless withdrawn." />
      <LineTable title="Foreign items" keys={['SchB.1.6', 'SchB.7a', 'SchB.7b', 'F8938.1.max', 'F8938.1.ye', 'F8938.req', 'Sch3.1']} note="FBAR (FinCEN 114) is due separately and is outside the engagement. A 2023 Form 3520 for the inheritance may never have been filed; see Checks." />
    </div>
  )
}

function Deductions() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <LineTable title="Taxes (with the cap)" keys={['SchA.5a', 'SchA.5b', 'SchA.5d', 'SchA.5e']} note="Cap 40,000 at this AGI (phase-down starts at 500,000)." />
      <LineTable title="Interest" keys={['SchA.8a', 'SchA.8c', 'SchA.8e']} note="Purchase points (4,800) deductible in full; refinance points (3,200) amortized over 360 months." />
      <LineTable title="Charity" keys={['SchA.11', 'F8283.A1.stock', 'F8283.A1.vehicle', 'SchA.12', 'SchA.14', 'SchA.17']} note="Stock to a donor-advised fund at FMV (held since 2019). Vehicle limited to gross proceeds when the charity sells it." />
      <LineTable title="Credits and their limits" keys={['F8812.1', 'F8812.8', 'F8812.11', 'F8812.12', 'F8863.27', 'F8863.30', 'F8863.7', 'F2441.2', 'F2441.12', 'F2441.31', 'F8867.status']} />
    </div>
  )
}

function Payments() {
  const { m } = useModel()
  const tr = m.packet.tax_agency_records
  const openTrace = useStore((s) => s.openTrace)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <div className="display mb-3 text-sm font-semibold">Federal estimates: three sources</div>
        <table className="w-full text-xs">
          <thead className="text-2xs uppercase tracking-wider text-ink-400"><tr><th className="text-left font-medium">Due</th><th className="text-right font-medium">EFTPS (D67)</th><th className="text-right font-medium">Client (qa-41)</th><th className="text-right font-medium">IRS transcript</th></tr></thead>
          <tbody>
            {['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15'].map((d, i) => {
              const t = tr.irs_account_transcript_2025[0].transactions.find((x) => x.date === d)
              return (
                <tr key={d} className="border-t border-ink-100">
                  <td className="num py-1.5">{d}</td>
                  <td className="num text-right">{i < 3 ? '3,000' : '—'}</td>
                  <td className={cx('num text-right', i === 3 && 'text-pencil')}>{i < 3 ? '' : '4,000 (01/14)'}</td>
                  <td className="num text-right font-medium">{t ? money(Number(t.amount)) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <button onClick={() => openTrace('F1040.26')} className="mt-3 text-xs font-medium hover:underline">F1040.26 on the return →</button>
      </Card>
      <Card className="p-4">
        <div className="display mb-3 text-sm font-semibold">California estimates vs FTB account</div>
        <ul className="space-y-1 text-xs">
          {tr.ftb_account.tax_year_2025_payments.map((p) => <li key={p.date} className="flex justify-between"><span className="num">{p.date}</span><span className="num">{money(p.amount)}</span></li>)}
          {tr.ftb_account.tax_year_2024_payments_after_filing.map((p) => <li key={p.date} className="flex justify-between text-pencil"><span className="num">{p.date} · held as 2024 credit</span><span className="num">{money(p.amount)}</span></li>)}
        </ul>
        <button onClick={() => openTrace('F540NR.72')} className="mt-3 text-xs font-medium hover:underline">F540NR.72 on the return →</button>
      </Card>
      <LineTable title="Federal payments" keys={['F1040.25a', 'F1040.26', 'Sch3.10', 'Sch3.11', 'F1040.33', 'F1040.37', 'F2210.8', 'F1040.38']} />
      <LineTable title="California payments" keys={['F540NR.71', 'F540NR.72', 'F540NR.73', 'F540NR.78', 'F540NR.97']} note="Halvorsen withheld California tax after the move by mistake. It is refundable through the 540NR." />
      <Card className="p-4 text-xs text-ink-600 lg:col-span-2">Extension: Form 4868 filed 04/14/2026 with 36,000 (estimate from v2: 35,728 rounded up). FTB 3519 with 0 (v2 showed a refund). An extension of time to file is not an extension of time to pay: interest at 7% and a failure-to-pay penalty of 0.5% a month apply to any balance paid after April 15 ({date('2026-04-15')}).</Card>
    </div>
  )
}

function StateSplit() {
  const { m } = useModel()
  const w = useWork()
  const openTrace = useStore((s) => s.openTrace)
  const rows = ['1', '2', '3', '4', '7', '12', '17', '22', '26']
  const cols = ['A', 'B', 'C', 'D', 'E']
  const lab = (r: string) => m.current.lines.find((l) => l.key.startsWith(`SchCA540NR.${r}.`))?.label.split(' - ')[0] ?? r
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">Part-year resident: California through 07/14 (195 days), Texas after. Column E is California-source income. Wages here follow box 16; see the check on Texas wages.</p>
      <Card className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Line</th><th className="text-right font-medium">A Federal</th><th className="text-right font-medium">B Subtract</th><th className="text-right font-medium">C Add</th><th className="text-right font-medium">D CA law</th><th className="pr-4 text-right font-medium">E CA source</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className="border-t border-ink-100">
                <td className="py-2 pl-4 text-ink-700"><span className="num mr-2 text-2xs text-ink-400">{r}</span>{lab(r)}</td>
                {cols.map((c) => {
                  const k = `SchCA540NR.${r}.${c}`
                  const l = w.line(k)
                  return <td key={c} className={cx('num py-2 text-right', c === 'E' && 'pr-4 font-medium', l?.adjusted && 'text-slateblue')}>{l ? <button onClick={() => openTrace(k)} className="hover:underline">{lineValue(l.value)}</button> : ''}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <LineTable title="540NR tax" keys={['F540NR.13', 'F540NR.17', 'F540NR.18', 'F540NR.19', 'F540NR.31', 'F540NR.32', 'F540NR.34', 'F540NR.35', 'F540NR.36', 'F540NR.37', 'F540NR.39', 'F540NR.40', 'ScheduleS.credit', 'F540NR.61', 'F540NR.64']} note="California AMT (Schedule P) is not computed by the engine. The ISO was granted in 2022 while Ngozi was a California resident and exercised after the move, so a partner decision on California-source AMT is needed." />
    </div>
  )
}

function Carryovers() {
  const { m } = useModel()
  const inn = m.packet.prior_years.carryovers_into_2025 as Record<string, unknown>
  const out = m.current.carryovers_out
  const fmtV = (v: unknown) => (typeof v === 'number' ? money(v, { cents: !Number.isInteger(v) }) : typeof v === 'object' ? JSON.stringify(v) : String(v))
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4"><div className="display mb-2 text-sm font-semibold">Into 2025 (from the 2024 return)</div>
        <ul className="space-y-1 text-sm">{Object.entries(inn).filter(([k]) => !['california', 'sources'].includes(k)).map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span className="text-ink-600">{k.replace(/_/g, ' ')}</span><span className="num">{fmtV(v)}</span></li>)}</ul>
        <p className="mt-2 text-2xs text-ink-500">Agreed to D06 pages 6 & 9 and the prior preparer's carryover worksheet (D07 p6).</p>
      </Card>
      <Card className="p-4"><div className="display mb-2 text-sm font-semibold">Out to 2026</div>
        <ul className="space-y-1 text-sm">{Object.entries(out.federal).map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span className="text-ink-600">{k.replace(/_/g, ' ')}</span><span className="num">{fmtV(v)}</span></li>)}</ul>
        <div className="mt-3 border-t border-ink-100 pt-2 text-2xs text-ink-500">California: {fmtV(out.california)}</div>
      </Card>
    </div>
  )
}

function Basis() {
  const { m } = useModel()
  const w = useWork()
  const openDoc = useStore((s) => s.openDoc)
  const openTrace = useStore((s) => s.openTrace)
  const rows = [
    { y: 2022, beg: null as number | null, inc: null as number | null, dist: null as number | null, end: 21300, src: "Client's 2022 worksheet (in prior file)", doc: 'D07' },
    { y: 2023, beg: 21300, inc: 14100, dist: 20000, end: 15400, src: '2023 K-1, found by Erik in June 2026', doc: 'D40' },
    { y: 2024, beg: 15400, inc: 16900, dist: 30000, end: 2300, src: '2024 K-1 (prior return). Prior preparer "assumed basis sufficient": it was, barely.', doc: 'D06' },
    { y: 2025, beg: 2300, inc: 18485, dist: 42000, end: 0, src: '2025 K-1: distributions exceed basis by 21,215, taxed as long-term gain', doc: 'D39' },
  ]
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3 display text-sm font-semibold">Woodworks S corporation stock basis (Form 7203)</div>
        <table className="w-full text-sm">
          <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Year</th><th className="text-right font-medium">Beginning</th><th className="text-right font-medium">Income</th><th className="text-right font-medium">Distributions</th><th className="text-right font-medium">Ending</th><th className="pr-4 text-left font-medium pl-6">Source</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.y} className={cx('border-t border-ink-100', r.y === 2023 && 'bg-hilite-soft/40')}>
                <td className="num py-2 pl-4 font-medium">{r.y}</td>
                <td className="num text-right">{money(r.beg)}</td><td className="num text-right">{money(r.inc)}</td><td className="num text-right">{r.dist == null ? '—' : `(${money(r.dist)})`}</td>
                <td className="num text-right font-medium">{money(r.end)}</td>
                <td className="py-2 pl-6 pr-4 text-xs text-ink-600"><button onClick={() => openDoc({ docId: r.doc })} className="num mr-1 rounded bg-ink-50 px-1 ring-1 ring-ink-200">{r.doc}</button>{r.src}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-xs text-ink-600">v2 assumed no change in 2023 (rule R-SCORP-BASIS-ROLLFORWARD) and started 2025 at 8,200. The 2023 K-1 closed the gap: the beginning basis is 2,300 and the excess distribution is 21,215. <button onClick={() => openTrace('F7203.excess')} className="font-medium underline">F7203.excess</button></div>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 text-sm"><div className="display mb-1 font-semibold">Ridgeline capital account</div><div className="text-ink-600">2024 ending 60,000 → 2025 ending <span className="num">63,660</span> (income 9,870, distributions 6,000, foreign tax 210). Outside basis has never been computed: <span className="text-pencil">a basis gap to close before any sale.</span></div></Card>
        <Card className="p-4 text-sm"><div className="display mb-1 font-semibold">IRA basis (Ngozi)</div><div className="text-ink-600">2024: 7,000 → 2025: +7,000 contributed, 14,000 used in the 14,026 conversion → <span className="num">0</span> carried to 2026.</div></Card>
        <Card className="p-4 text-sm"><div className="display mb-1 font-semibold">Home · 7709 Barton Ridge</div><div className="text-ink-600">Purchased 07/08/2025 for <span className="num">685,000</span> (D54). Points 4,800 deducted. Refinanced 11/20/2025.</div></Card>
      </div>
      {void w}{void m}
    </div>
  )
}

function PriorVsUs() {
  const { m } = useModel()
  const fs = useFindingState()
  const w = useWork()
  const pw = m.packet.prior_years.prior_preparer_workpaper
  const navigate = useStore((s) => s.navigate)
  const resolution: Record<string, string> = {
    'Obtain 2023 Woodworks K-1 to roll basis forward.': 'Closed: 2023 K-1 received 06/05/2026 (D40); basis rolled forward in v3.',
    'Confirm 2024 Form 5498 for IRA basis.': 'Closed: Form 5498 for 2024 in file (D42) agrees to 7,000.',
    'Client to confirm home office square footage.': 'Closed: measured 220 sq ft (D24). The 2024 return used 300.',
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <div className="eyebrow mb-1">{m.packet.prior_years.return_2024.prepared_by} · filed {m.packet.prior_years.return_2024.filed}</div>
        <h3 className="display font-semibold">What the prior preparer did</h3>
        <p className="mt-2 text-sm text-ink-700">{pw.summary_memo}</p>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-600">{pw.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
        <div className="mt-3 rounded-lg bg-ink-50 p-3 text-xs text-ink-600"><b>2024 notes on the return:</b> {Object.entries(m.packet.prior_years.return_2024.notes).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
      </Card>
      <Card className="p-5">
        <h3 className="display font-semibold">Open items they left, and what we did</h3>
        <ul className="mt-3 space-y-3">
          {pw.open_items_left_by_prior_preparer.map((o) => {
            const r = resolution[o]
            const f = /3520/.test(o) ? fs.find((x) => x.f.id === 'form-3520-2023') : undefined
            return (
              <li key={o} className="rounded-lg p-3 ring-1 ring-ink-200">
                <div className="text-sm font-medium">{o}</div>
                {r ? <div className="mt-1 text-xs text-tick-deep">{r}</div> : f ? <button onClick={() => navigate(`/checks/${f.f.id}`)} className="mt-1 text-left text-xs text-pencil hover:underline">Still open. Carried into this year's checks: {f.f.title} →</button> : null}
              </li>
            )
          })}
        </ul>
        <h3 className="display mt-6 font-semibold">What we changed this year</h3>
        <ul className="mt-2 space-y-1 text-sm text-ink-600">
          <li>• Self-employed health insurance: 2024 correctly took none; the 2025 engine took 14,400 under the same facts.</li>
          <li>• Home office: 300 → 220/260 sq ft measured; simplified method kept.</li>
          <li>• Dependent SSN for Theo: the 2024 return had it right; the 2025 organizer transposed it.</li>
          <li>• {[...w.adjustments.values()].filter((a) => !a.reverted).length} workpaper adjustments posted this season (see Review › Adjustments).</li>
        </ul>
        <Button className="mt-4" size="sm" onClick={() => navigate('/schedules/summary')}>Line-by-line vs 2024</Button>
      </Card>
    </div>
  )
}
