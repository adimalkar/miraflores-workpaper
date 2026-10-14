import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { FileText, Clock, CircleDashed, CheckCircle2 } from 'lucide-react'
import { useModel, useWork } from '../store/context'
import { useStore } from '../store/store'
import { Card, Chip, Meter, PageHeader, cx } from '../components/ui'
import { date } from '../lib/format'
import type { Doc } from '../data/types'

const GROUPS: { name: string; types: string[] }[] = [
  { name: 'Engagement & identity', types: ['engagement_letter', 'consent_7216', 'irs_ip_pin_notice', 'identity_document'] },
  { name: 'Prior year', types: ['prior_year_return', 'prior_workpaper', 'irs_notice'] },
  { name: 'Wages & stock compensation', types: ['W-2', 'stock_plan_supplement', '3921', '3922', 'paystub'] },
  { name: 'Business', types: ['books_profit_loss', 'books_transaction_detail', '1099-NEC', '1099-K', 'invoice', 'mileage_log', 'client_note', 'insurance_statement', 'retirement_contribution', 'books_report'] },
  { name: 'Investments & crypto', types: ['1099-composite', '1099-INT', '1099-DA', 'transaction_export'] },
  { name: 'Foreign', types: ['foreign_bank_statement'] },
  { name: 'Pass-throughs', types: ['K-1-1065', 'K-1-state-supplement', 'K-1-1120S'] },
  { name: 'Retirement & HSA', types: ['1099-R', '5498', '1099-SA', '5498-SA'] },
  { name: 'Rentals & property', types: ['rental_owner_statement', 'property_tax_bill', 'rental_ledger', 'closing_statement_seller', '1099-S', 'closing_statement_buyer', 'payoff_statement', 'property_tax_receipt', '1098'] },
  { name: 'Deductions & credits', types: ['1098-T', 'letter', 'dependent_care_statement', 'donation_receipt', '1098-C'] },
  { name: 'Payments & agency records', types: ['payment_confirmation', 'irs_transcript'] },
]

type F = 'all' | 'unaccounted' | 'late' | 'corrected' | 'partial'

export function Documents({ focus }: { focus?: string }) {
  const { m } = useModel()
  const w = useWork()
  const openDoc = useStore((s) => s.openDoc)
  const [f, setF] = useState<F>('all')
  useEffect(() => { if (focus && m.docById.has(focus)) openDoc({ docId: focus }) }, [focus, m, openDoc])
  const uploadComplete = m.packet.timeline.find((t) => t.event === 'client_marked_upload_complete')?.at ?? '2026-03-02'
  const status = (d: Doc) => {
    const disp = w.dispositions.get(d.id)
    if (m.current.documents_used.includes(d.id)) return { label: 'Used', tone: 'tick' as const, ok: true, why: undefined as string | undefined }
    if (disp) return { label: disp.status.replace('-', ' '), tone: 'neutral' as const, ok: true, why: disp.reason }
    if (m.current.documents_superseded.includes(d.id)) return { label: 'Superseded', tone: 'neutral' as const, ok: true, why: (() => { const c = m.docs.find((x) => x.marked_corrected && x.issuer === d.issuer && x.id !== d.id); return c ? `Replaced by the corrected document ${c.id}.` : 'Replaced by a later document.' })() }
    return { label: 'Unaccounted', tone: 'pencil' as const, ok: false, why: 'Not used by the engine and no reason recorded.' }
  }
  const accounted = m.docs.filter((d) => status(d).ok).length
  const filtered = (d: Doc) => {
    if (f === 'unaccounted') return !status(d).ok
    if (f === 'late') return d.received_at > uploadComplete
    if (f === 'corrected') return !!d.marked_corrected || m.current.documents_superseded.includes(d.id)
    if (f === 'partial') return d.extraction.status !== 'extracted'
    return true
  }
  const groups = useMemo(() => GROUPS.map((g) => ({ ...g, docs: m.docs.filter((d) => g.types.includes(d.document_type)) })), [m])
  const ungrouped = m.docs.filter((d) => !GROUPS.some((g) => g.types.includes(d.document_type)))

  return (
    <div>
      <PageHeader
        eyebrow="Documents"
        title="Document index"
        sub="Every document the client or firm supplied, where each one landed on the return, and why any that didn't land were set aside."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="eyebrow">Accounted for</div>
          <div className="display mt-1 text-2xl font-semibold"><span className="num">{accounted}</span><span className="text-ink-300"> / {m.docs.length}</span></div>
          <Meter value={accounted} max={m.docs.length} className="mt-2" tone={accounted === m.docs.length ? 'tick' : 'amber'} />
        </Card>
        <Card className="p-4">
          <div className="eyebrow">Extracted values</div>
          <div className="display mt-1 text-2xl font-semibold num">{m.packet.extracted_values.length.toLocaleString()}</div>
          <div className="mt-1 text-2xs text-ink-500">{[...w.verifications.keys()].filter((k) => k.startsWith('ev-')).length} verified at the field level · {w.extractionFix.size} corrected</div>
        </Card>
        <Card className="p-4">
          <div className="eyebrow">Arrived after “upload complete”</div>
          <div className="display mt-1 text-2xl font-semibold num">{m.docs.filter((d) => d.received_at > uploadComplete).length}</div>
          <div className="mt-1 text-2xs text-ink-500">Corrected 1099, late K-1s, SEP, 5498, paystub, SS card, exam letter</div>
        </Card>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {([['all', 'All'], ['unaccounted', 'Unaccounted'], ['late', 'Arrived late'], ['corrected', 'Corrected / superseded'], ['partial', 'Not fully read']] as [F, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setF(id)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', f === id ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-600 ring-ink-200 hover:ring-ink-300')}>{label}</button>
        ))}
      </div>
      <div className="space-y-5">
        {[...groups, { name: 'Other', types: [], docs: ungrouped }].filter((g) => g.docs.some(filtered)).map((g) => (
          <section key={g.name}>
            <h3 className="eyebrow mb-2">{g.name}</h3>
            <Card className="divide-y divide-ink-100">
              {g.docs.filter(filtered).map((d, i) => {
                const st = status(d)
                const landed = m.docToLines.get(d.id) ?? []
                const evs = m.evByDoc.get(d.id) ?? []
                const late = d.received_at > uploadComplete
                const ver = evs.filter((e) => w.verifications.has(e.id)).length
                return (
                  <motion.button
                    key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                    onClick={() => openDoc({ docId: d.id })}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-left transition hover:bg-ink-50/70 md:grid-cols-[auto_minmax(0,1fr)_140px_160px_120px]"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-ink-50 ring-1 ring-ink-200"><FileText size={14} className="text-ink-500" /></span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="num text-2xs text-ink-400">{d.id}</span>
                        <span className="truncate text-sm font-medium text-ink">{d.title}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-ink-500">
                        <span>{d.issuer}</span>·<span>{d.page_count} p</span>
                        {d.marked_corrected && <Chip tone="amber">Corrected</Chip>}
                        {d.extraction.status !== 'extracted' && <Chip tone={d.extraction.status === 'partial' ? 'pencil' : 'neutral'}>{d.extraction.status.replace('_', ' ')}</Chip>}
                        {st.why && <span className="text-ink-400">— {st.why}</span>}
                      </span>
                    </span>
                    <span className="hidden text-2xs text-ink-500 md:block">
                      <span className="flex items-center gap-1">{late ? <Clock size={11} className="text-amber" /> : null}{date(d.received_at)}</span>
                      <span className="text-ink-400">by {d.uploaded_by}</span>
                    </span>
                    <span className="hidden text-2xs text-ink-500 md:block">
                      <span className="num">{evs.length}</span> values · <span className="num">{landed.length}</span> lines
                      {evs.length > 0 && <span className="block text-ink-400">{ver} verified</span>}
                    </span>
                    <span className="flex justify-end">
                      <Chip tone={st.tone} icon={st.ok ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}>{st.label}</Chip>
                    </span>
                  </motion.button>
                )
              })}
            </Card>
          </section>
        ))}
      </div>
    </div>
  )
}
