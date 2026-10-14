import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, ArrowRight, FileText } from 'lucide-react'
import { useModel, useWork, useFindingState, usePerms } from '../store/context'
import { useStore } from '../store/store'
import { useAllProofs, STATUS_META } from '../store/lineState'
import { Button, Card, Chip, Empty, PageHeader, cx } from '../components/ui'
import { TickMark } from '../components/TickMark'
import { JudgmentDialog, useStandards } from '../components/actions'
import { lineValue, money, pct, signed, date } from '../lib/format'
import { variances } from '../data/checks'
import {
  booksToTax, receiptsRecon, brokerRecon, paymentsRecon, scorpBasis, partnershipCapital, k1Cards,
  linesOfForm, rentalProperties, priorOpenItems,
} from '../data/derived'
import type { ReturnLine } from '../data/types'

// Every schedule is assembled from the return's own lines, documents and the event log.
// Line selections are by form and line number (the form's layout), never by amount or name.

const TABS = [
  ['summary', 'Return vs last year'], ['computation', 'Tax computation'], ['depreciation', 'Depreciation'], ['sales', 'Sales detail'],
  ['books', 'Books to tax'], ['rentals', 'Rentals & passive'], ['k1', 'K-1 lines'], ['retirement', 'Retirement & foreign'],
  ['deductions', 'Deductions & credits'], ['payments', 'Payments'], ['state', 'State split'], ['carryovers', 'Carryovers'],
  ['basis', 'Basis by year'], ['prior', 'Prior preparer vs us'],
] as const

const lineNo = (k: string) => Number(k.split('.')[1]?.match(/^\d+/)?.[0] ?? 999)
const byForm = (...forms: string[]) => (l: ReturnLine) => forms.includes(l.form)
const f1040 = (from: number, to: number) => (l: ReturnLine) => l.form === 'F1040' && lineNo(l.key) >= from && lineNo(l.key) <= to

export function Schedules({ tab }: { tab?: string }) {
  const navigate = useStore((s) => s.navigate)
  const { m } = useModel()
  const w = useWork()
  const t = tab || 'summary'
  const title = TABS.find((x) => x[0] === t)?.[1] ?? 'Schedules'
  const L = (pred: (l: ReturnLine) => boolean) => linesOfForm(m, w, pred)
  return (
    <div>
      <PageHeader eyebrow="Records a CPA expects" title={title} sub="Built from the return's own lines and documents. Every figure is live: click it to open its proof." />
      <div className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => navigate(`/schedules/${id}`)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', t === id ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-600 ring-ink-200 hover:ring-ink-300')}>{label}</button>
        ))}
      </div>
      {t === 'summary' && <SummaryVsPrior />}
      {t === 'computation' && <div className="grid gap-4 md:grid-cols-2">
        <LineTable compare title="Form 1040 · income to tax" keys={L(f1040(9, 24))} />
        <LineTable title="Schedule 2 · other taxes" keys={L(byForm('Sch2'))} />
        <LineTable title="Form 6251 · alternative minimum tax" keys={L(byForm('F6251'))} />
        <LineTable title="Net investment income & additional Medicare" keys={L(byForm('F8960', 'F8959'))} />
      </div>}
      {t === 'depreciation' && <Depreciation />}
      {t === 'sales' && <Sales />}
      {t === 'books' && <BooksToTax />}
      {t === 'rentals' && <Rentals />}
      {t === 'k1' && <K1s />}
      {t === 'retirement' && <div className="grid gap-4 md:grid-cols-2">
        <LineTable title="IRA basis & conversions (Form 8606)" keys={L(byForm('F8606'))} />
        <LineTable title="HSA (Form 8889) & retirement adjustments" keys={[...L(byForm('F8889')), ...L((l) => /^Sch1\.1[3-6]$/.test(l.key))]} />
        <LineTable title="Foreign accounts & credit" keys={[...L((l) => l.key.startsWith('SchB.7') || l.key === 'SchB.8' || l.sources.some((s) => s.startsWith('ref:fx'))), ...L(byForm('F8938')), ...L((l) => l.key === 'Sch3.1')]} />
      </div>}
      {t === 'deductions' && <div className="grid gap-4 md:grid-cols-2">
        <LineTable title="Taxes" keys={L((l) => l.form === 'SchA' && lineNo(l.key) >= 5 && lineNo(l.key) <= 7)} />
        <LineTable title="Interest" keys={L((l) => l.form === 'SchA' && lineNo(l.key) >= 8 && lineNo(l.key) <= 10)} />
        <LineTable title="Gifts to charity" keys={[...L((l) => l.form === 'SchA' && lineNo(l.key) >= 11 && lineNo(l.key) <= 14), ...L(byForm('F8283'))]} />
        <LineTable title="Credits and their limits" keys={L(byForm('F8812', 'F8863', 'F2441', 'F8867'))} />
      </div>}
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
  const rows = [...new Set(keys)].filter((k) => w.line(k))
  return (
    <Card className="overflow-hidden">
      {title && <div className="display border-b border-ink-100 px-4 py-3 text-sm font-semibold">{title}</div>}
      {rows.length === 0 ? <div className="px-4 py-6 text-sm text-ink-500">No lines on this return.</div> : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((k) => {
              const l = w.line(k)!
              const p = proofs.get(k)
              const prior = m.priorLines[k]
              return (
                <tr key={k} onClick={() => openTrace(k)} className="cursor-pointer border-b border-ink-100 last:border-0 hover:bg-ink-50/70">
                  <td className="num w-28 py-2 pl-4 text-2xs text-ink-400">{k}</td>
                  <td className="py-2 pr-2 text-ink-700">{l.label}</td>
                  {compare && <td className="num py-2 text-right text-xs text-ink-400">{typeof prior === 'number' ? money(prior) : ''}</td>}
                  <td className={cx('num whitespace-nowrap py-2 pr-3 text-right font-medium', (l.adjusted || l.flowed) && 'text-slateblue')}>{lineValue(l.value)}</td>
                  <td className="w-10 py-2 pr-4 text-right">{p?.verification ? <TickMark method={p.verification.method} size={14} /> : <span className={cx('inline-block h-2 w-2 rounded-full', STATUS_META[p?.status ?? 'open'].dot)} />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
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
  const explained = new Map(w.judgments.filter((j) => j.category === 'variance').map((j) => [j.target, j]))
  const py = m.packet.household.tax_year - 1
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">Firm standard: explain any line that moved more than {std.flag_if_change_over_percent}% and more than {money(std.and_over_amount)} from the {std.compare_to.replace('_', ' ')}. {vs.length} lines qualify; {vs.filter((v) => explained.has(v.key)).length} are explained.</p>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Line</th><th className="text-right font-medium">{py}</th><th className="text-right font-medium">{py + 1}</th><th className="text-right font-medium">Change</th><th className="pr-4 text-right font-medium">Explanation</th></tr></thead>
          <tbody>
            {vs.map((v) => (
              <tr key={v.key} className="border-t border-ink-100 align-top hover:bg-ink-50/60">
                <td className="py-2 pl-4"><button onClick={() => openTrace(v.key)} className="text-left"><span className="num mr-2 text-2xs text-ink-400">{v.key}</span>{v.label}</button></td>
                <td className="num py-2 text-right text-ink-500">{money(v.prior)}</td>
                <td className="num py-2 text-right font-medium">{money(v.current)}</td>
                <td className="num py-2 text-right">{signed(v.change)} <span className="text-2xs text-amber">{pct(v.pct)}</span></td>
                <td className="max-w-[260px] py-2 pr-4 text-right">
                  {explained.has(v.key) ? <span className="text-xs text-ink-600">{explained.get(v.key)!.decision}</span> : <button onClick={() => setExplain(v.key)} className="text-xs font-medium text-ink-600 hover:text-ink hover:underline">Explain</button>}
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
  const w = useWork()
  const prior = new Map(m.packet.prior_years.asset_records.map((a) => [a.asset_id, a]))
  const rows = m.current.assets
  const sum = (f: (a: (typeof rows)[number]) => number) => rows.reduce((s, a) => s + f(a), 0)
  const landing = linesOfForm(m, w, (l) => /^F4562/.test(l.form) && /total|22|14|12|19a/.test(l.key) || l.key === 'SchC.13' || /^SchE\.18[A-Z]$/.test(l.key) || l.key === 'F4797.23' || l.key === 'SchD.19')
  return (
    <div className="space-y-4">
      <Card className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400">
            <tr><th className="py-2 pl-4 text-left font-medium">Asset</th><th className="text-left font-medium">In service</th><th className="text-left font-medium">Method · life</th><th className="text-right font-medium">Cost</th><th className="text-right font-medium">Fed prior</th><th className="text-right font-medium">Fed {m.packet.household.tax_year}</th><th className="text-right font-medium">State</th><th className="text-right font-medium">AMT diff</th><th className="pr-4 text-right font-medium">Disposed</th></tr>
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
        <LineTable title="Where depreciation lands" keys={landing} />
        <LineTable title="State depreciation differences" keys={linesOfForm(m, w, (l) => l.jurisdiction !== 'federal' && (l.form.startsWith('FTB') || l.sources.some((s) => s.startsWith('asset:'))))} note={`Assets where state and federal 2025 depreciation differ: ${rows.filter((a) => a.california.depreciation_2025 !== a.federal.depreciation_2025).map((a) => a.asset_id).join(', ') || 'none'}.`} />
      </div>
    </div>
  )
}

const BOX: Record<string, string> = { A: 'ST covered', B: 'ST noncovered', C: 'ST no 1099-B', D: 'LT covered', E: 'LT noncovered', F: 'LT no 1099-B', G: 'ST digital, basis reported', H: 'ST digital, basis not reported', I: 'ST digital, no 1099-DA', J: 'LT digital, basis reported', K: 'LT digital, basis not reported', L: 'LT digital, no 1099-DA' }

function Sales() {
  const { m } = useModel()
  const w = useWork()
  const proofs = useAllProofs()
  const openTrace = useStore((s) => s.openTrace)
  const openDoc = useStore((s) => s.openDoc)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'exceptions'>('exceptions')
  const lots = useMemo(() => linesOfForm(m, w, (l) => /^F8949\.[A-L]\.(?!total)/.test(l.key)).map((k) => w.line(k)!).filter(Boolean), [m, w])
  const boxes = useMemo(() => {
    const g = new Map<string, { n: number; gain: number; key: string }>()
    for (const l of lots) {
      const b = l.key.split('.')[1]
      const x = g.get(b) ?? { n: 0, gain: 0, key: `F8949.${b}.total` }
      x.n++; x.gain += Number(l.value); g.set(b, x)
    }
    return [...g.entries()].sort()
  }, [lots])
  const recon = useMemo(() => brokerRecon(m, w), [m, w])
  const rows = lots.filter((l) => {
    const s = proofs.get(l.key)?.status
    if (only === 'exceptions' && !(s === 'flagged' || s === 'adjusted' || l.adjusted)) return false
    return !q || (l.key + l.label).toLowerCase().includes(q.toLowerCase())
  })
  const parent = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 40, overscan: 12 })
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {boxes.map(([b, x]) => (
          <button key={b} onClick={() => openTrace(x.key)} className="rounded-xl bg-white p-3 text-left ring-1 ring-ink-200 hover:shadow-sheet">
            <div className="eyebrow">Box {b}</div>
            <div className="text-2xs text-ink-500">{BOX[b] ?? ''}</div>
            <div className="num mt-1 font-semibold">{money(x.gain)}</div>
            <div className="num text-2xs text-ink-400">{x.n} lot{x.n === 1 ? '' : 's'}</div>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="display border-b border-ink-100 px-4 py-3 text-sm font-semibold">Broker summaries vs the lots on Form 8949</div>
        <table className="w-full text-sm">
          <thead className="text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Statement</th><th className="text-right font-medium">Summary proceeds</th><th className="text-right font-medium">Lots on 8949</th><th className="pr-4 text-right font-medium">Difference</th></tr></thead>
          <tbody>
            {recon.map((r) => {
              const total = r.summary.reduce((s, x) => s + x.amount, 0)
              const diff = Math.round((total - r.detail) * 100) / 100
              return (
                <tr key={r.doc.id} className="border-t border-ink-100 align-top">
                  <td className="py-2 pl-4"><button onClick={() => openDoc({ docId: r.doc.id })} className="text-left hover:underline">{r.doc.title}</button>{r.summary.length > 0 && <div className="text-2xs text-ink-400">{r.summary.map((x) => x.label).join(' + ')}</div>}{r.unread && <div className="text-2xs text-pencil">{r.unread}</div>}</td>
                  <td className="num py-2 text-right">{r.summary.length ? money(total, { cents: true }) : <span className="text-ink-400">no summary</span>}</td>
                  <td className="num py-2 text-right">{money(r.detail, { cents: true })} <span className="text-2xs text-ink-400">({r.lots})</span></td>
                  <td className={cx('num py-2 pr-4 text-right font-medium', !r.summary.length ? 'text-ink-400' : Math.abs(diff) < 0.01 ? 'text-tick' : 'text-pencil')}>{r.summary.length ? (Math.abs(diff) < 0.01 ? 'ties' : money(diff, { cents: true })) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
  const b = useMemo(() => booksToTax(m, w), [m, w])
  const r = useMemo(() => receiptsRecon(m, w), [m, w])
  if (!b) return <Empty title="No business books in this packet">A books-to-tax reconciliation appears when a profit and loss statement is supplied.</Empty>
  const KIND: Record<string, string> = { start: '', revenue: 'Revenue', removed: 'Not on Schedule C', adjusted: 'Adjusted to tax', 'tax-only': 'Tax only' }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Card className="overflow-hidden">
        <div className="display border-b border-ink-100 px-4 py-3 text-sm font-semibold">{b.books.issuer}: books to Schedule C</div>
        <table className="w-full text-sm">
          <tbody>
            {b.steps.map((s, i) => (
              <tr key={i} className="border-b border-ink-100 hover:bg-ink-50/60">
                <td className="w-28 py-2 pl-4 align-top text-2xs text-ink-400">{KIND[s.kind]}</td>
                <td className="py-2 text-ink-700">{s.evId ? <button onClick={() => openDoc({ docId: b.books.id, evId: s.evId })} className="text-left hover:underline">{s.label}</button> : s.lineKey ? <button onClick={() => openTrace(s.lineKey!)} className="text-left hover:underline">{s.label}</button> : s.label}</td>
                <td className={cx('num whitespace-nowrap py-2 pr-4 text-right', s.kind === 'start' && 'font-semibold')}>{s.kind === 'start' ? money(s.amount) : signed(Math.round(s.amount))}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-semibold"><td /><td className="py-2">Rebuilt net profit</td><td className="num py-2 pr-4 text-right">{money(Math.round(b.rebuilt))}</td></tr>
            <tr><td /><td className="py-2"><button onClick={() => openTrace('SchC.31')} className="hover:underline">Schedule C net profit (workpaper)</button></td><td className="num py-2 pr-4 text-right">{money(b.schc)}</td></tr>
            <tr className="bg-ink-50/70"><td /><td className="py-2 text-xs text-ink-600">Unreconciled</td><td className={cx('num py-2 pr-4 text-right text-xs font-semibold', Math.abs(b.diff) > 2 ? 'text-pencil' : 'text-tick')}>{money(b.diff)}</td></tr>
          </tbody>
        </table>
      </Card>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="display mb-2 text-sm font-semibold">Receipts vs information returns</div>
          <ul className="space-y-1 text-sm">
            {r.necs.map(({ doc, amount }) => <li key={doc.id} className="flex justify-between gap-3"><button onClick={() => openDoc({ docId: doc.id })} className="text-left text-ink-700 hover:underline">{doc.issuer}</button><span className="num">{money(amount)}</span></li>)}
            <li className="flex justify-between border-t border-ink-100 pt-1 font-medium"><span>1099-NEC total</span><span className="num">{money(r.necTotal)}</span></li>
            <li className="flex justify-between gap-3 text-ink-600"><span>{r.noForm ? <button onClick={() => openDoc({ docId: r.detail!.id, evId: r.noForm!.id })} className="text-left hover:underline">{r.noForm.label}</button> : 'Deposits with no 1099 (residual)'}</span><span className="num">{money(r.noFormAmount)}</span></li>
            <li className={cx('flex justify-between border-t-2 border-ink pt-1 font-semibold', r.necTotal + r.noFormAmount !== r.booksRevenue && 'text-pencil')}><span>Books revenue</span><span className="num">{money(r.booksRevenue)}</span></li>
            {r.ks.map(({ doc, amount }) => <li key={doc.id} className="flex justify-between gap-3 text-ink-600"><button onClick={() => openDoc({ docId: doc.id })} className="text-left hover:underline">Form 1099-K · {doc.issuer}{r.kInBooks ? ' (already in books)' : ''}</button><span className="num">{money(amount)}</span></li>)}
            <li className="flex justify-between border-t border-ink-100 pt-1"><button onClick={() => openTrace('SchC.1')} className="hover:underline">Schedule C line 1 (workpaper)</button><span className={cx('num font-medium', r.filed !== r.booksRevenue && 'text-pencil')}>{money(r.filed)}</span></li>
          </ul>
        </Card>
        <LineTable title="Schedule C" keys={linesOfForm(m, w, (l) => l.form === 'SchC' && typeof l.value === 'number' && !/^SchC\.4[3-4]/.test(l.key))} />
      </div>
    </div>
  )
}

function Rentals() {
  const { m } = useModel()
  const w = useWork()
  const props = rentalProperties(m)
  const clientOnly = (keys: string[]) => keys.filter((k) => { const l = w.line(k); return l && l.sources.length > 0 && l.sources.every((s) => /^(qa|msg|call)-/.test(s)) })
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {props.map((p) => {
        const weak = clientOnly(p.keys)
        return <LineTable key={p.letter} compare title={`Property ${p.letter} · ${p.name}${p.days ? ` · ${p.days} days rented/personal` : ''}`} keys={p.keys} note={weak.length ? `Supported only by the client's own answer: ${weak.join(', ')}. Ask for a document.` : undefined} />
      })}
      <LineTable title="Passive activity losses (Form 8582)" keys={[...linesOfForm(m, w, byForm('F8582')), ...linesOfForm(m, w, (l) => /^SchE\.(26|32|41)$/.test(l.key))]} />
      <LineTable title="Sale of business property (Form 4797)" keys={[...linesOfForm(m, w, byForm('F4797')), ...linesOfForm(m, w, (l) => l.key === 'SchD.19')]} />
    </div>
  )
}

function K1s() {
  const { m } = useModel()
  const openDoc = useStore((s) => s.openDoc)
  const openTrace = useStore((s) => s.openTrace)
  const cards = k1Cards(m)
  if (!cards.length) return <Empty title="No K-1s for this year">Schedules K-1 appear here with every box and where it landed.</Empty>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cards.map(({ doc, rows, supplement }) => (
        <Card key={doc.id} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
            <div><div className="display text-sm font-semibold">{doc.issuer}</div><div className="text-2xs text-ink-500">{doc.document_type} · received {date(doc.received_at)}</div></div>
            <button onClick={() => openDoc({ docId: doc.id })} className="num text-2xs text-ink-500 hover:underline">{doc.id}</button>
          </div>
          <table className="w-full text-sm"><tbody>
            {rows.map(({ ev, lines }) => (
              <tr key={ev.id} className="border-b border-ink-100 last:border-0">
                <td className="py-2 pl-4"><button onClick={() => openDoc({ docId: doc.id, evId: ev.id })} className="text-left text-ink-700 hover:underline">{ev.label}</button></td>
                <td className="num whitespace-nowrap py-2 text-right font-medium">{ev.value_type === 'percent' ? `${Number(ev.value) * 100}%` : money(Number(ev.value))}</td>
                <td className="py-2 pr-4 text-right">{lines.length ? lines.map((k) => <button key={k} onClick={() => openTrace(k)} className="num ml-1 rounded bg-ink-50 px-1.5 py-0.5 text-2xs ring-1 ring-ink-200">{k}</button>) : <span className="text-2xs text-ink-400">not on return</span>}</td>
              </tr>
            ))}
          </tbody></table>
          {supplement && <button onClick={() => openDoc({ docId: supplement.id })} className="flex w-full items-center gap-2 border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-left text-xs text-ink-600 hover:bg-ink-50"><FileText size={12} />{supplement.pages[0]?.printed_content}</button>}
        </Card>
      ))}
    </div>
  )
}

function Payments() {
  const { m } = useModel()
  const w = useWork()
  const openDoc = useStore((s) => s.openDoc)
  const fed = paymentsRecon(m, 'federal')
  const ca = paymentsRecon(m, 'california')
  const ty = String(m.packet.household.tax_year)
  const Tbl = ({ data, title }: { data: ReturnType<typeof paymentsRecon>; title: string }) => (
    <Card className="overflow-hidden">
      <div className="display border-b border-ink-100 px-4 py-3 text-sm font-semibold">{title}</div>
      <table className="w-full text-xs">
        <thead className="text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Date</th><th className="text-right font-medium">Confirmations</th>{data.question && <th className="text-right font-medium">Client said</th>}<th className="pr-4 text-right font-medium">{data.agencyLabel}</th></tr></thead>
        <tbody>
          {data.rows.map((r) => {
            const conf = r.confirmations.reduce((s, c) => s + c.amount, 0)
            const wrongYear = r.confirmations.some((c) => c.year && c.year !== ty)
            const disagree = r.agency != null && ((r.confirmations.length && conf !== r.agency) || (r.client != null && r.client !== r.agency))
            return (
              <tr key={r.date} className={cx('border-t border-ink-100', (disagree || (wrongYear && r.agency == null)) && 'bg-pencil-soft/40')}>
                <td className="num py-1.5 pl-4">{r.date}</td>
                <td className="num text-right">{r.confirmations.map((c) => <button key={c.evId} onClick={() => openDoc({ docId: c.docId, evId: c.evId })} className="hover:underline">{money(c.amount)}{c.year && c.year !== ty ? <span className="text-pencil"> (for {c.year})</span> : ''}</button>)}{!r.confirmations.length && '—'}</td>
                {data.question && <td className="num text-right">{r.client != null ? money(r.client) : ''}</td>}
                <td className="num pr-4 text-right font-medium">{r.agency != null ? money(r.agency) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {data.question && <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2 text-2xs text-ink-600">{data.question.id}: “{data.question.answer}”</div>}
      {'heldOtherYear' in data && data.heldOtherYear?.map((h) => <div key={h.date} className="border-t border-ink-100 bg-pencil-soft/40 px-4 py-2 text-2xs text-pencil-deep">{h.date} {money(h.amount)}: {h.note}</div>)}
    </Card>
  )
  const ext = m.packet.timeline.find((t) => /extension/.test(t.event))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tbl data={fed} title="Federal estimated payments: three sources" />
      <Tbl data={ca} title="State estimated payments vs the agency account" />
      <LineTable title="Federal payments" keys={linesOfForm(m, w, (l) => (l.form === 'F1040' && lineNo(l.key) >= 25 && lineNo(l.key) <= 38) || (l.form === 'Sch3' && lineNo(l.key) >= 9) || l.form === 'F2210')} />
      <LineTable title="State payments" keys={linesOfForm(m, w, (l) => l.jurisdiction !== 'federal' && (/^F540NR\.(7\d|9\d)$/.test(l.key) || l.form.startsWith('FTB58')))} note={ext?.detail ? `Extension: ${ext.detail}` : undefined} />
    </div>
  )
}

function StateSplit() {
  const { m } = useModel()
  const w = useWork()
  const openTrace = useStore((s) => s.openTrace)
  const keys = m.current.lines.filter((l) => l.form === 'SchCA540NR' && /^SchCA540NR\.\d+\.[A-E]$/.test(l.key))
  const rows = [...new Set(keys.map((l) => l.key.split('.')[1]))].sort((a, b) => Number(a) - Number(b))
  const cols = ['A', 'B', 'C', 'D', 'E']
  const lab = (r: string) => keys.find((l) => l.key.split('.')[1] === r)?.label.split(' - ')[0] ?? r
  const res = m.packet.household.residency
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">Residency: {res.map((r) => `${r.state} ${r.status} ${r.from} → ${r.to}`).join('; ')}. Column E is state-source income.</p>
      <Card className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Line</th><th className="text-right font-medium">A Federal</th><th className="text-right font-medium">B Subtract</th><th className="text-right font-medium">C Add</th><th className="text-right font-medium">D State law</th><th className="pr-4 text-right font-medium">E State source</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className="border-t border-ink-100">
                <td className="py-2 pl-4 text-ink-700"><span className="num mr-2 text-2xs text-ink-400">{r}</span>{lab(r)}</td>
                {cols.map((c) => {
                  const k = `SchCA540NR.${r}.${c}`
                  const l = w.line(k)
                  return <td key={c} className={cx('num py-2 text-right', c === 'E' && 'pr-4 font-medium', (l?.adjusted || l?.flowed) && 'text-slateblue')}>{l ? <button onClick={() => openTrace(k)} className="hover:underline">{lineValue(l.value)}</button> : ''}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <LineTable title="State tax" keys={linesOfForm(m, w, (l) => (l.form === 'F540NR' && lineNo(l.key) < 70) || l.form === 'ScheduleS' || (l.form === 'SchCA540NR' && !/\.[A-E]$/.test(l.key)))} />
    </div>
  )
}

function Carryovers() {
  const { m } = useModel()
  const inn = m.packet.prior_years.carryovers_into_2025 as Record<string, unknown>
  const out = m.current.carryovers_out
  const fmtV = (v: unknown) => (typeof v === 'number' ? money(v, { cents: !Number.isInteger(v) }) : typeof v === 'object' ? JSON.stringify(v) : String(v))
  const used = (k: string) => m.current.lines.filter((l) => l.sources.some((s) => s.includes(`carryovers_into_2025/${k}`))).map((l) => l.key)
  const openTrace = useStore((s) => s.openTrace)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4"><div className="display mb-2 text-sm font-semibold">Into {m.packet.household.tax_year} (from the prior year)</div>
        <ul className="space-y-1 text-sm">{Object.entries(inn).filter(([k]) => !['california', 'sources'].includes(k)).map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-3"><span className="text-ink-600">{k.replace(/_/g, ' ')}</span><span className="flex items-center gap-2">{used(k).map((x) => <button key={x} onClick={() => openTrace(x)} className="num rounded bg-ink-50 px-1 text-2xs ring-1 ring-ink-200">{x}</button>)}<span className="num">{fmtV(v)}</span></span></li>
        ))}</ul>
        {typeof inn.sources === 'string' && <p className="mt-2 text-2xs text-ink-500">Source: {inn.sources}</p>}
      </Card>
      <Card className="p-4"><div className="display mb-2 text-sm font-semibold">Out to {m.packet.household.tax_year + 1}</div>
        <ul className="space-y-1 text-sm">{Object.entries(out.federal).map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span className="text-ink-600">{k.replace(/_/g, ' ')}</span><span className="num">{fmtV(v)}</span></li>)}</ul>
        <div className="mt-3 border-t border-ink-100 pt-2 text-2xs text-ink-500">State: {fmtV(out.california)}</div>
      </Card>
    </div>
  )
}

function Basis() {
  const { m } = useModel()
  const w = useWork()
  const openDoc = useStore((s) => s.openDoc)
  const s = useMemo(() => scorpBasis(m, w), [m, w])
  const caps = partnershipCapital(m)
  const recs = m.packet.prior_years.basis_records
  const excess = w.value('F7203.excess')
  return (
    <div className="space-y-4">
      {s && (
        <Card className="overflow-hidden">
          <div className="display border-b border-ink-100 px-4 py-3 text-sm font-semibold">{s.name}: S corporation stock basis, rolled forward</div>
          <table className="w-full text-sm">
            <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Year</th><th className="text-right font-medium">Beginning</th><th className="text-right font-medium">Increases</th><th className="text-right font-medium">Distributions</th><th className="text-right font-medium">Ending</th><th className="pl-6 pr-4 text-left font-medium">Source</th></tr></thead>
            <tbody>
              {s.years.map((r) => (
                <tr key={r.year} className={cx('border-t border-ink-100', r.gap && 'bg-pencil-soft/40')}>
                  <td className="num py-2 pl-4 font-medium">{r.year}</td>
                  <td className="num text-right">{money(r.beginning)}</td><td className="num text-right">{money(r.increases)}</td><td className="num text-right">{r.distributions == null ? '—' : `(${money(r.distributions)})`}</td>
                  <td className="num text-right font-medium">{money(r.ending)}</td>
                  <td className="py-2 pl-6 pr-4 text-xs text-ink-600">{r.docId && <button onClick={() => openDoc({ docId: r.docId! })} className="num mr-1 rounded bg-ink-50 px-1 ring-1 ring-ink-200">{r.docId}</button>}{r.gap ? 'Gap: no K-1 or record for this year' : r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {excess != null && excess > 0 && <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-xs text-ink-600">Distributions exceed basis by {money(excess)} in {m.packet.household.tax_year}: taxed as gain (F7203.excess).</div>}
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {caps.map((c) => (
          <Card key={c.doc.id} className="p-4 text-sm">
            <div className="display mb-1 font-semibold">{c.doc.issuer}: capital account</div>
            <div className="text-ink-600">Beginning <span className="num">{money(Number(c.begin))}</span> → ending <span className="num">{money(Number(c.end))}</span> ({c.doc.id}).</div>
            {!c.outsideBasisKnown && <div className="mt-1 text-pencil">Outside basis has never been computed. Close this gap before any sale or loss limitation.</div>}
          </Card>
        ))}
        {Object.entries(recs).filter(([k]) => !k.startsWith('scorp') && !k.startsWith('partnership')).map(([k, v]) => (
          <Card key={k} className="p-4 text-sm">
            <div className="display mb-1 font-semibold">{k.replace(/_/g, ' ')}</div>
            <ul className="space-y-0.5 text-ink-600">{(v as Record<string, unknown>[]).map((r, i) => <li key={i}>{Object.entries(r).filter(([kk]) => kk !== 'source').map(([kk, vv]) => `${kk.replace(/_/g, ' ')} ${typeof vv === 'number' ? money(vv) : vv}`).join(' · ')} <span className="text-2xs text-ink-400">({String(r.source)})</span></li>)}</ul>
          </Card>
        ))}
      </div>
    </div>
  )
}

function PriorVsUs() {
  const { m } = useModel()
  const fs = useFindingState()
  const w = useWork()
  const perms = usePerms()
  const navigate = useStore((s) => s.navigate)
  const openDoc = useStore((s) => s.openDoc)
  const [resolve, setResolve] = useState<number | null>(null)
  const pw = m.packet.prior_years.prior_preparer_workpaper
  const items = useMemo(() => priorOpenItems(m, w, fs), [m, w, fs])
  const pyRefs = fs.filter((x) => x.f.facts.some((f) => f.refs?.some((r) => r.startsWith('py:') || r === pw.source_document || m.docById.get(r)?.document_type === 'prior_year_return')))
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <div className="eyebrow mb-1">{m.packet.prior_years.return_2024.prepared_by} · filed {m.packet.prior_years.return_2024.filed}</div>
        <h3 className="display font-semibold">What the prior preparer did</h3>
        <p className="mt-2 text-sm text-ink-700">{pw.summary_memo}</p>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-600">{pw.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
        <div className="mt-3 rounded-lg bg-ink-50 p-3 text-xs text-ink-600"><b>Notes on the prior return:</b> {Object.entries(m.packet.prior_years.return_2024.notes).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
      </Card>
      <Card className="p-5">
        <h3 className="display font-semibold">Open items they left, and what we did</h3>
        <ul className="mt-3 space-y-3">
          {items.map((it) => (
            <li key={it.i} className="rounded-lg p-3 ring-1 ring-ink-200">
              <div className="text-sm font-medium">{it.text}</div>
              {it.resolution ? <div className="mt-1 text-xs text-tick-deep">Resolved: {it.resolution.decision}</div>
                : it.finding ? <button onClick={() => navigate(`/checks/${it.finding!.f.id}`)} className="mt-1 text-left text-xs text-pencil hover:underline">Carried into this year's checks: {it.finding.f.title} ({it.finding.status}) →</button>
                  : <div className="mt-1 text-xs text-amber">Open</div>}
              {it.docs.length > 0 && !it.resolution && <div className="mt-1.5 flex flex-wrap items-center gap-1 text-2xs text-ink-500">Possible evidence now in file: {it.docs.map((d) => <button key={d.id} onClick={() => openDoc({ docId: d.id })} className="num rounded bg-ink-50 px-1 ring-1 ring-ink-200">{d.id} {d.title.slice(0, 40)}</button>)}</div>}
              {!it.resolution && perms.canEdit && <Button size="sm" variant="ghost" className="mt-1" onClick={() => setResolve(it.i)}>Record resolution</Button>}
            </li>
          ))}
        </ul>
        <h3 className="display mt-6 font-semibold">Where this year differs from the prior preparer</h3>
        <ul className="mt-2 space-y-1 text-sm text-ink-600">
          {pyRefs.map(({ f, status }) => <li key={f.id}>• <button onClick={() => navigate(`/checks/${f.id}`)} className="text-left hover:underline">{f.title}</button> <span className="text-2xs text-ink-400">({status})</span></li>)}
          <li>• {[...w.adjustments.values()].filter((a) => !a.reverted).length} workpaper adjustments posted this season (Review › Adjustments).</li>
        </ul>
        <Button className="mt-4" size="sm" onClick={() => navigate('/schedules/summary')}>Line by line vs the prior year <ArrowRight size={12} /></Button>
      </Card>
      {resolve != null && <JudgmentDialog open onClose={() => setResolve(null)} target={`prior-item:${resolve}`} topic={`Prior preparer open item: ${items[resolve].text}`} />}
    </div>
  )
}
