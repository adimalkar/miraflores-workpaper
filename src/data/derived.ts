import type { Model } from './model'
import type { WorkState } from '../store/derive'
import type { Finding } from './checks'
import type { ExtractedValue, ReturnLine } from './types'
import { AREAS, areaForLine, incomeSign, type AreaId } from './areas'

// Everything a schedule or narrative shows is computed here from the packet and the event log.
// Nothing in this file names a client, a document id or an amount.

type FS = { f: Finding; status: string }[]

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))
const evOf = (m: Model, docId: string, field: string) => (m.evByDoc.get(docId) ?? []).find((e) => e.field === field)
const docsOfType = (m: Model, ...types: string[]) => m.docs.filter((d) => types.includes(d.document_type))
const cur = (m: Model) => m.lineMaps.get(m.current.version)!

// ---------- firm standards ----------------------------------------------------------------------

/** "Any adjustment with a tax effect over 1,000 ... requires partner sign-off" → 1000 */
export function partnerThreshold(rules: string[]): number {
  const r = rules.find((x) => /partner/i.test(x) && /over\s+[\d,]+/i.test(x))
  const n = r?.match(/over\s+([\d,]+)/i)?.[1]
  return n ? Number(n.replace(/,/g, '')) : Infinity
}

export function retentionYears(rules: string[]): number | null {
  const r = rules.find((x) => /retain/i.test(x))
  const n = r?.match(/(\d+)\s+years?/i)?.[1]
  return n ? Number(n) : null
}

// ---------- household -------------------------------------------------------------------------

export function householdNames(m: Model) {
  const p = m.packet.household.people
  const tp = p.find((x) => x.role === 'taxpayer')
  const sp = p.find((x) => x.role === 'spouse')
  return { taxpayer: tp, spouse: sp, dependents: p.filter((x) => x.role === 'dependent'), first: [tp, sp].filter(Boolean).map((x) => x!.name.split(' ')[0]) }
}

export function moveSummary(m: Model) {
  const r = m.packet.household.residency
  if (r.length < 2) return r[0] ? `${r[0].state} resident all year` : ''
  const from = m.packet.household.addresses[0]?.address.split(',').slice(-2, -1)[0]?.trim()
  const to = m.packet.household.addresses[1]?.address.split(',').slice(-2, -1)[0]?.trim()
  const d = new Date(r[0].to + 'T12:00:00Z')
  return `Moved ${from ?? r[0].state} → ${to ?? r[1].state} on ${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

export function returnForms(m: Model) {
  const states = new Set(m.current.lines.filter((l) => l.jurisdiction !== 'federal').map((l) => l.form))
  const st = [...states].find((f) => /^F\d/.test(f)) ?? [...states][0]
  return st ? `Form 1040 + ${st.replace(/^F/, '')}` : 'Form 1040'
}

export function extensionInfo(m: Model) {
  const tl = m.packet.timeline.find((t) => /extension/.test(t.event))
  const ext = m.packet.what_if.extension as { federal?: { estimated_balance?: number; paid_with_form_4868?: number; rule?: string }; california?: { paid_with_ftb_3519?: number }; based_on_version?: string } | undefined
  const extended = m.packet.firm.deadlines.find((d) => /extended due date/i.test(d.what))
  const tr = m.packet.tax_agency_records.irs_account_transcript_2025.at(-1)
  const code460 = tr?.transactions.find((t) => t.code === '460')
  return { event: tl, ext, extendedTo: extended?.date, transcript460: code460 }
}

// ---------- area blurbs ------------------------------------------------------------------------

export function areaBlurb(m: Model, area: AreaId): string {
  const docs = new Map<string, number>()
  for (const [docId, keys] of m.docToLines) {
    if (!keys.some((k) => areaForLine(cur(m).get(k)!) === area)) continue
    const t = m.docById.get(docId)!.document_type.replace(/_/g, ' ')
    docs.set(t, (docs.get(t) ?? 0) + 1)
  }
  const parts = [...docs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => (n > 1 ? `${n} × ${t}` : t))
  const lines = m.linesByArea.get(area)?.length ?? 0
  return parts.length ? `${parts.join(' · ')}` : `${lines} computed lines`
}

// ---------- generic schedules ------------------------------------------------------------------

export function linesOfForm(m: Model, w: WorkState, pred: (l: ReturnLine) => boolean): string[] {
  const keys = m.current.lines.filter(pred).map((l) => l.key)
  for (const a of w.adjustments.values()) {
    if (!a.isNew || a.reverted || keys.includes(a.lineKey)) continue
    const l = w.line(a.lineKey)
    if (l && pred(l)) keys.push(a.lineKey)
  }
  return keys
}

/** Rental properties found on Schedule E (letters A, B, …) with their lines. */
export function rentalProperties(m: Model) {
  const props = m.current.lines.filter((l) => /^SchE\.1[A-Z]$/.test(l.key))
  return props.map((p) => {
    const letter = p.key.slice(-1)
    const keys = m.current.lines.filter((l) => new RegExp(`^SchE\\.\\d+${letter}$`).test(l.key) && !/^SchE\.(1|2)[A-Z]$/.test(l.key)).map((l) => l.key)
    const days = cur(m).get(`SchE.2${letter}`)?.value
    return { letter, name: String(p.value), days: days ? String(days) : '', keys }
  })
}

// ---------- books to tax ----------------------------------------------------------------------

export interface BooksStep { label: string; amount: number; lineKey?: string; evId?: string; kind: 'start' | 'revenue' | 'removed' | 'adjusted' | 'tax-only' }

export function booksToTax(m: Model, w: WorkState) {
  const books = docsOfType(m, 'books_profit_loss')[0]
  if (!books) return null
  const evs = m.evByDoc.get(books.id) ?? []
  const net = evs.find((e) => e.field === 'net_income')
  const totalIncome = evs.find((e) => e.field === 'total_income')
  const accounts = evs.filter((e) => e.value_type === 'money' && !['net_income', 'total_income', 'total_expenses'].includes(e.field) && !/^sales/i.test(e.field))
  const schcLines = m.current.lines.filter((l) => l.form === 'SchC' && incomeSign(l) === -1 && l.key !== 'SchC.28')
  const steps: BooksStep[] = []
  if (!net) return null
  steps.push({ label: `Books net income (${books.title.split('(')[1]?.replace(')', '') ?? 'books'})`, amount: num(net.value), evId: net.id, kind: 'start' })
  const gross = w.value('SchC.1')
  if (totalIncome && gross != null && gross !== num(totalIncome.value)) steps.push({ label: 'Gross receipts on Schedule C vs books revenue', amount: gross - num(totalIncome.value), lineKey: 'SchC.1', kind: 'revenue' })
  const mapped = new Set<string>()
  for (const l of schcLines) {
    const src = l.sources.filter((s) => m.ev.get(s)?.document_id === books.id)
    const val = w.value(l.key) ?? 0
    if (src.length) {
      src.forEach((s) => mapped.add(s))
      const bookAmt = src.reduce((s, id) => s + num(m.ev.get(id)!.value), 0)
      if (Math.abs(bookAmt - val) > 0.5) steps.push({ label: `${l.label}: books ${bookAmt.toLocaleString()} → tax ${val.toLocaleString()}`, amount: bookAmt - val, lineKey: l.key, kind: 'adjusted' })
    } else if (val) {
      steps.push({ label: `${l.label} (tax only, not in books)`, amount: -val, lineKey: l.key, kind: 'tax-only' })
    }
  }
  for (const a of accounts) {
    if (mapped.has(a.id)) continue
    const elsewhere = [...(m.evToLines.get(a.id)?.get(m.current.version) ?? [])]
    steps.push({ label: `${a.label}: in books, not on Schedule C${elsewhere.length ? ` (used in ${elsewhere.join(', ')})` : ''}`, amount: num(a.value), evId: a.id, kind: 'removed' })
  }
  const rebuilt = steps.reduce((s, x) => s + x.amount, 0)
  const schc = w.value('SchC.31') ?? 0
  return { books, steps, rebuilt, schc, diff: Math.round(rebuilt - schc) }
}

export function receiptsRecon(m: Model, w: WorkState) {
  const necs = docsOfType(m, '1099-NEC').map((d) => ({ doc: d, amount: num(evOf(m, d.id, 'box1')?.value ?? 0) }))
  const ks = docsOfType(m, '1099-K').map((d) => ({ doc: d, amount: num(evOf(m, d.id, 'box1a')?.value ?? 0) }))
  const books = docsOfType(m, 'books_profit_loss')[0]
  const booksRevenue = books ? num(evOf(m, books.id, 'total_income')?.value ?? 0) : 0
  const necTotal = necs.reduce((s, x) => s + x.amount, 0)
  const detail = docsOfType(m, 'books_transaction_detail')[0]
  const noForm = detail ? (m.evByDoc.get(detail.id) ?? []).find((e) => /unreported|no.?1099/i.test(e.field) || /no form 1099/i.test(e.label)) : undefined
  const kInBooks = detail ? (m.evByDoc.get(detail.id) ?? []).find((e) => ks.some((k) => num(e.value) === k.amount)) : undefined
  return {
    necs, ks, necTotal, booksRevenue, detail, noForm, kInBooks,
    noFormAmount: noForm ? num(noForm.value) : booksRevenue - necTotal,
    filed: w.value('SchC.1'),
  }
}

// ---------- brokers ------------------------------------------------------------------------------

export function brokerRecon(m: Model, w: WorkState) {
  const out: { doc: ReturnType<typeof docsOfType>[number]; summary: { label: string; amount: number }[]; detail: number; lots: number; unread?: string }[] = []
  for (const d of docsOfType(m, '1099-composite', '1099-B', '1099-DA')) {
    if (!m.current.documents_used.includes(d.id)) continue
    const evs = m.evByDoc.get(d.id) ?? []
    let summary = evs.filter((e) => /proceeds/i.test(e.field + ' ' + e.label) && !/^[A-Z]+\d+_/.test(e.field) && !/detail/i.test(e.label)).map((e) => ({ label: e.label, amount: num(e.value) }))
    if (!summary.length) {
      // Not extracted: read the printed summary page instead, and say so.
      const page = d.pages.find((p) => /summary/i.test(p.printed_content) && /proceeds/i.test(p.printed_content))
      const found = page ? [...page.printed_content.matchAll(/proceeds\s+([\d,]+\.\d{2})/gi)].map((x) => Number(x[1].replace(/,/g, ''))) : []
      if (found.length) summary = [{ label: `Printed summary, page ${page!.page} (not extracted by the pipeline)`, amount: found.reduce((a2, b2) => a2 + b2, 0) }]
    }
    const lotLines = m.current.lines.filter((l) => /^F8949\.[A-L]\.(?!total)/.test(l.key) && l.sources.some((s) => m.ev.get(s)?.document_id === d.id))
    let detail = 0
    for (const l of lotLines) { const p = l.label.match(/proceeds ([\d,.]+)/); if (p) detail += Number(p[1].replace(/,/g, '')) }
    for (const a of w.adjustments.values()) if (a.isNew && !a.reverted && a.reason.includes(d.id)) { const p = a.isNew.label.match(/proceeds ([\d,.]+)/); if (p) detail += Number(p[1].replace(/,/g, '')) }
    if (!summary.length && !lotLines.length) continue
    out.push({ doc: d, summary, detail: Math.round(detail * 100) / 100, lots: lotLines.length, unread: d.extraction.status === 'partial' ? d.extraction.reason ?? undefined : undefined })
  }
  return out
}

// ---------- payments ------------------------------------------------------------------------------

export interface PaymentRow { date: string; confirmations: { amount: number; year?: string; evId: string; docId: string }[]; agency?: number; client?: number }

export function paymentsRecon(m: Model, jurisdiction: 'federal' | 'california') {
  const docs = docsOfType(m, 'payment_confirmation').filter((d) => (/FTB|California/i.test(d.title) ? 'california' : 'federal') === jurisdiction)
  const rows = new Map<string, PaymentRow>()
  const row = (date: string) => rows.get(date) ?? rows.set(date, { date, confirmations: [] }).get(date)!
  for (const d of docs) {
    const evs = m.evByDoc.get(d.id) ?? []
    const groups = new Map<string, Record<string, ExtractedValue>>()
    for (const e of evs) { const [g, f] = e.field.split(/_(.+)/); const x = groups.get(g) ?? {}; x[f] = e; groups.set(g, x) }
    for (const g of groups.values()) if (g.date && g.amount) row(String(g.date.value)).confirmations.push({ amount: num(g.amount.value), year: g.year ? String(g.year.value) : undefined, evId: g.amount.id, docId: d.id })
  }
  const ty = String(m.packet.household.tax_year)
  if (jurisdiction === 'federal') {
    const tr = m.packet.tax_agency_records.irs_account_transcript_2025[0]
    for (const t of tr?.transactions ?? []) if (t.code === '670' && typeof t.amount === 'number') row(t.date).agency = t.amount
    const q = m.packet.client.questionnaire.find((x) => /estimated/i.test(x.question) && /\d{1,2}\/\d{1,2}|january|february|april|june|september/i.test(x.answer + x.question))
    const amt = [...(q?.answer.matchAll(/\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g) ?? [])].map((x) => x[0]).filter((x) => !/^(19|20)\d{2}$/.test(x)).at(-1)
    const when = q?.answer.match(/(January|February|March|April|June|September)\s+(\d{1,2}),\s*(\d{4})/i)
    if (q && amt && when) {
      const mo = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(when[1].toLowerCase()) + 1
      row(`${when[3]}-${String(mo).padStart(2, '0')}-${when[2].padStart(2, '0')}`).client = Number(amt.replace(/,/g, ''))
    }
    return { rows: [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)), question: q, agencyLabel: `IRS transcript (${tr?.as_of})` }
  }
  const ftb = m.packet.tax_agency_records.ftb_account
  for (const p of ftb.tax_year_2025_payments) row(p.date).agency = p.amount
  return { rows: [...rows.values()].filter((r) => r.agency != null || r.confirmations.some((c) => !c.year || c.year === ty || r.date > `${ty}-03-31`)).sort((a, b) => a.date.localeCompare(b.date)), question: undefined, agencyLabel: `FTB account (${ftb.as_of})`, heldOtherYear: ftb.tax_year_2024_payments_after_filing }
}

// ---------- basis ------------------------------------------------------------------------------

export interface BasisYear { year: number; beginning: number | null; increases: number | null; distributions: number | null; ending: number | null; source: string; docId?: string; gap?: boolean }

export function scorpBasis(m: Model, w: WorkState): { name: string; years: BasisYear[] } | null {
  const key = Object.keys(m.packet.prior_years.basis_records).find((k) => k.startsWith('scorp'))
  if (!key) return null
  const recs = m.packet.prior_years.basis_records[key] as { year: number; ending_stock_basis?: number | null; k1_income?: number; distributions?: number; source: string }[]
  const k1s = docsOfType(m, 'K-1-1120S')
  const name = k1s[0]?.title.split(' - ')[1] ?? key
  const ty = m.packet.household.tax_year
  const firstYear = Math.min(...recs.map((r) => r.year))
  const years: BasisYear[] = []
  let prevEnd: number | null = null
  for (let y = firstYear; y <= ty; y++) {
    const rec = recs.find((r) => r.year === y)
    const k1 = k1s.find((d) => d.tax_year === y)
    let inc: number | null = null, dist: number | null = null, source = '', docId: string | undefined
    if (y === ty && cur(m).has('F7203.4')) {
      inc = w.value('F7203.4'); dist = w.value('F7203.6'); source = `Form 7203 (${m.current.version})`; docId = k1?.id
    } else if (k1) {
      inc = num(evOf(m, k1.id, 'box1')?.value ?? 0) + num(evOf(m, k1.id, 'box4')?.value ?? 0)
      dist = num(evOf(m, k1.id, 'box16d')?.value ?? 0)
      source = `${y} K-1 (${k1.id}, received ${k1.received_at.slice(0, 10)})`; docId = k1.id
    } else if (rec?.k1_income != null) {
      inc = rec.k1_income; dist = rec.distributions ?? 0; source = rec.source
    }
    const beginning = y === firstYear ? null : prevEnd
    let ending: number | null
    if (rec?.ending_stock_basis != null && inc == null) { ending = rec.ending_stock_basis; source = source || rec.source }
    else if (beginning != null && inc != null && dist != null) ending = Math.max(0, beginning + inc - dist)
    else ending = null
    years.push({ year: y, beginning, increases: inc, distributions: dist, ending, source: source || rec?.source || 'No record', docId, gap: inc == null && y !== firstYear })
    prevEnd = ending
  }
  return { name, years }
}

export function partnershipCapital(m: Model) {
  return docsOfType(m, 'K-1-1065').map((d) => ({
    doc: d, begin: evOf(m, d.id, 'cap_begin')?.value, end: evOf(m, d.id, 'cap_end')?.value,
    outsideBasisKnown: Object.entries(m.packet.prior_years.basis_records).some(([k, v]) => k.startsWith('partnership') && (v as { outside_basis?: number | null }[]).some((r) => r.outside_basis != null)),
  }))
}

// ---------- K-1s ----------------------------------------------------------------------------------

export function k1Cards(m: Model) {
  return docsOfType(m, 'K-1-1120S', 'K-1-1065').filter((d) => d.tax_year === m.packet.household.tax_year).map((d) => {
    const evs = (m.evByDoc.get(d.id) ?? []).filter((e) => e.value_type === 'money' || e.value_type === 'percent')
    const supplement = docsOfType(m, 'K-1-state-supplement').find((s) => s.title.split(' ')[0] === d.title.split(' - ')[1]?.split(' ')[0])
    return { doc: d, rows: evs.map((e) => ({ ev: e, lines: m.evToLines.get(e.id)?.get(m.current.version) ?? [] })), supplement }
  })
}

// ---------- outside filings -------------------------------------------------------------------

export interface OutsideFiling { id: string; title: string; detail: string; owner: 'client' | 'firm' | 'entity' | 'related'; status: 'due' | 'late' | 'covered' | 'investigate' | 'agrees' | 'related'; refs: string[] }

export function outsideFilings(m: Model, fs: FS, w: WorkState): OutsideFiling[] {
  const out: OutsideFiling[] = []
  const now = new Date().toISOString().slice(0, 10)
  for (const d of m.current.diagnostics) {
    if (d.code === 'FBAR_OUTSIDE_RETURN') {
      const due = m.packet.firm.deadlines.find((x) => /FBAR|FinCEN/i.test(x.what))
      out.push({ id: 'fbar', title: 'FinCEN 114 (FBAR)', detail: `${d.message}${due ? ` Due ${due.date}.` : ''}`, owner: 'client', status: 'due', refs: d.refs })
    }
    if (d.code === 'FORM_1099_FILING') {
      const due = m.packet.firm.deadlines.find((x) => /1099/i.test(x.what))
      const report = docsOfType(m, 'books_report')[0]
      const payees = report ? (m.evByDoc.get(report.id) ?? []).map((e) => `${e.label} ${num(e.value).toLocaleString()}`).join(', ') : ''
      out.push({ id: '1099nec', title: 'Forms 1099-NEC to contractors', detail: `${payees ? payees + '. ' : ''}${due ? `Due ${due.date}${due.date < now ? ', now late' : ''}.` : ''} ${d.message}`, owner: 'client', status: due && due.date < now ? 'late' : 'due', refs: d.refs })
    }
  }
  for (const { f, status } of fs) if (f.kind === 'outside') out.push({ id: f.id, title: f.title, detail: f.summary, owner: 'client', status: status === 'open' ? 'investigate' : 'covered', refs: f.refs })
  for (const s of docsOfType(m, 'K-1-state-supplement', 'K-1-1120S')) {
    const text = s.pages.map((p) => p.printed_content).join(' ')
    const comp = text.match(/(\w+) composite return/i)
    if (comp && s.tax_year === m.packet.household.tax_year) out.push({ id: `composite-${s.id}`, title: `${comp[1]} composite return (${s.issuer})`, detail: text.match(/[^.]*composite[^.]*\./i)?.[0] ?? '', owner: 'entity', status: 'covered', refs: [s.id] })
  }
  for (const r of m.packet.household.related_returns) {
    const agrees = /claim(ed)? you as a dependent/i.test(r.return) && m.packet.household.people.some((p) => p.name === r.who && p.role === 'dependent')
    out.push({ id: `related-${r.who}`, title: `${r.who}: ${r.return.split('(')[0].trim()}`, detail: `${r.return}. Prepared by ${r.prepared_by}.`, owner: 'related', status: agrees ? 'agrees' : 'related', refs: [] })
  }
  for (const o of out) { const s = w.steps.get(`outside:${o.id}`); if (s?.done) o.status = 'covered' }
  return out
}

// ---------- examination ------------------------------------------------------------------------

export function examItems(m: Model, w: WorkState, fs: FS, items: string[]) {
  return items.map((text) => {
    const keys = new Set<string>()
    for (const mm of text.matchAll(/Schedule ([A-Z])\s+line\s+(\d+[a-z]?)/gi)) keys.add(`Sch${mm[1]}.${mm[2]}`)
    if (/Schedule C gross receipts/i.test(text)) keys.add('SchC.1')
    for (const mm of text.matchAll(/Form (\d{4})/g)) for (const l of m.current.lines) if (l.form === `F${mm[1]}` && !/total/.test(l.key)) keys.add(l.key)
    const lines = [...keys].filter((k) => w.line(k))
    const expanded = lines.flatMap((k) => [k, ...(w.line(k)?.inputs ?? [])]).filter((k, i, a) => a.indexOf(k) === i && w.line(k))
    const docs = [...new Set(expanded.flatMap((k) => (w.line(k)?.sources ?? []).map((s) => m.ev.get(s)?.document_id).filter(Boolean) as string[]))]
    const exposure = fs.filter((x) => x.f.lines.some((k) => expanded.includes(k)) || x.f.proposals.some((p) => 'lineKey' in p && expanded.includes(p.lineKey)))
    return { text, lines: expanded, docs, exposure, receipts: /1099-NEC|1099-K|gross receipts/i.test(text) }
  })
}

// ---------- prior preparer --------------------------------------------------------------------

const STOP = new Set(['the', 'to', 'for', 'of', 'a', 'and', 'client', 'obtain', 'confirm', 'roll', 'forward', 'basis', 'discussed', 'no', 'note', 'resolution'])
export function priorOpenItems(m: Model, w: WorkState, fs: FS) {
  const items = m.packet.prior_years.prior_preparer_workpaper.open_items_left_by_prior_preparer
  return items.map((text, i) => {
    const words = text.toLowerCase().match(/[a-z0-9-]+/g)?.filter((x) => x.length > 2 && !STOP.has(x)) ?? []
    const docs = m.docs.filter((d) => d.received_at > (m.packet.prior_years.return_2024.filed ?? '')).map((d) => {
      const t = `${d.title} ${d.tax_year} ${d.document_type}`.toLowerCase()
      return { d, score: words.filter((x) => t.includes(x)).length }
    }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.d)
    const finding = fs.find((x) => x.f.facts.some((fact) => fact.text.includes(text.slice(0, 30))))
    const resolution = w.judgments.find((j) => j.target === `prior-item:${i}`)
    return { i, text, docs, finding, resolution }
  })
}

// ---------- sensitive data ----------------------------------------------------------------------

export function sensitiveFields(m: Model, w: WorkState) {
  const out: { id: string; label: string; value: string }[] = []
  for (const p of m.packet.household.people) {
    out.push({ id: `ssn:${p.id}`, label: `${p.name} · SSN`, value: w.ssnFix.get(p.id) ?? p.ssn })
    if (p.ip_pin) out.push({ id: `ip_pin:${p.id}`, label: `${p.name} · IP PIN`, value: p.ip_pin })
  }
  const b = m.packet.household.bank_account_for_refund_or_payment
  out.push({ id: 'bank', label: `Refund account (${b.bank})`, value: b.account })
  for (const e of m.packet.extracted_values) if (e.value_type === 'account_number') out.push({ id: `acct:${e.id}`, label: `${m.docById.get(e.document_id)?.issuer} · account`, value: String(e.value) })
  return out
}

// ---------- due diligence ----------------------------------------------------------------------

export function dueDiligenceItems(m: Model, w: WorkState) {
  const ty = m.packet.household.tax_year
  const items: string[] = ['Interviewed the taxpayer and recorded answers about each qualifying person (age, relationship, residency, support).']
  for (const d of m.packet.household.people.filter((p) => p.role === 'dependent')) {
    const age = ty - Number(d.dob.slice(0, 4))
    if (age < 17) items.push(`Confirmed ${d.name.split(' ')[0]} (${d.relationship ?? 'dependent'}, age ${age} at year end) lived with the taxpayers ${d.months_lived_with_you ?? '?'} months: qualifies for the child tax credit.`)
    else items.push(`Confirmed ${d.name.split(' ')[0]} (age ${age}${d.full_time_student ? ', full-time student' : ''}) qualifies as an other dependent${d.own_income ? `; own income noted: ${d.own_income}` : ''}.`)
  }
  const py = m.packet.prior_years.return_2024.dependents
  const mismatch = m.packet.household.people.filter((p) => p.role === 'dependent' && py.find((x) => x.name === p.name && x.ssn !== (w.ssnFix.get(p.id) ?? p.ssn)))
  items.push(mismatch.length ? `Dependent SSNs checked against the prior-year return: ${mismatch.map((p) => p.name.split(' ')[0]).join(', ')} still differ. Resolve first.` : 'Checked every dependent SSN against Social Security cards or the prior-year return as filed.')
  items.push('Retained the records relied on (Form 8867, part III).')
  return { items, blocked: mismatch.length > 0 }
}

// ---------- timeline after filing ---------------------------------------------------------------

export function postFilingEvents(m: Model) {
  return m.packet.timeline.filter((t) => ['federal_balance_paid', 'california_refund_issued', 'quality_review_selected_return', 'next_year_engagement_started', 'notice_received'].includes(t.event))
}

export { AREAS }

// ---------- e-file validation -----------------------------------------------------------------

/** Pre-transmit checks the IRS e-file system applies: identity numbers must match its records. */
export function efileValidation(m: Model, w: WorkState) {
  const errors: { code: string; message: string; personId: string }[] = []
  const prior = m.packet.prior_years.return_2024.dependents
  const ids = docsOfType(m, 'identity_document')
  const packetRejection = m.packet.tax_agency_records.efile.find((e) => e.status === 'rejected')?.errors?.[0]
  m.packet.household.people.filter((p) => p.role === 'dependent').forEach((p, i) => {
    const ssn = w.ssnFix.get(p.id) ?? p.ssn
    const card = ids.find((d) => d.belongs_to === `dependent:${p.id}`)
    const official = card ? (m.evByDoc.get(card.id) ?? []).find((e) => e.value_type === 'ssn')?.value : prior.find((d) => d.name === p.name)?.ssn
    if (official && official !== ssn) {
      const code = packetRejection && packetRejection.message.includes(p.name) ? packetRejection.code : 'R0000-504-02'
      errors.push({ code, message: `Dependent's taxpayer identification number and name control must match the e-file database (dependent ${i + 1}: ${p.name}).`, personId: p.id })
    }
  })
  return errors
}

export function timelineEvent(m: Model, event: string) {
  return m.packet.timeline.find((t) => t.event === event)
}
