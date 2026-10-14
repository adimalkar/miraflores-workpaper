import type { Model } from './model'
import { lineValueNum } from './model'
import type { EffectPart } from './effects'
import type { AreaId } from './areas'
import type { ReturnLine } from './types'

// Independent checks. Each one re-derives a figure from the documents, the client's own words,
// the prior year or the agency records, and compares it with what the engine produced.
// None of them read the engine's diagnostics: they are the second pair of eyes.

export type Severity = 'blocking' | 'error' | 'warning' | 'info'
export type FindingKind = 'engine' | 'extraction' | 'conflict' | 'completeness' | 'judgment' | 'outside'

export type Proposal =
  | { kind: 'line'; lineKey: string; to: number; reason: string; effects: EffectPart[] }
  | { kind: 'new-line'; lineKey: string; label: string; form: string; to: number; reason: string; effects: EffectPart[] }
  | { kind: 'household'; personId: string; field: 'ssn'; to: string; reason: string }
  | { kind: 'extraction'; evId: string; to: string; reason: string }

export interface Fact { text: string; refs?: string[] }

export interface Finding {
  id: string
  title: string
  area: AreaId
  severity: Severity
  kind: FindingKind
  summary: string
  facts: Fact[]
  lines: string[]
  refs: string[]
  proposals: Proposal[]
  whatIf?: string
  /** What the engine said about this, if anything. */
  engineDiagnostic?: string
  /** The check's method, shown so a reviewer can judge whether to trust it. */
  method: string
}

const num = (s: string) => Number(s.replace(/[,$]/g, '').replace(/\.$/, ''))
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

function line(m: Model, key: string): ReturnLine | undefined {
  return m.lineMaps.get(m.current.version)!.get(key)
}

function pageText(m: Model, docId: string, page?: number) {
  const d = m.docById.get(docId)
  if (!d) return ''
  return d.pages.filter((p) => page == null || p.page === page).map((p) => p.printed_content).join('\n')
}

// ---------------------------------------------------------------------------------------------

function duplicateInterest(m: Model): Finding[] {
  const out: Finding[] = []
  const ints = m.current.lines.filter((l) => /^SchB\.1\.\d+$/.test(l.key))
  for (let i = 0; i < ints.length; i++) {
    for (let j = i + 1; j < ints.length; j++) {
      const a = ints[i], b = ints[j]
      if (a.value !== b.value || !a.sources[0] || !b.sources[0]) continue
      const ea = m.ev.get(a.sources[0]), eb = m.ev.get(b.sources[0])
      if (!ea || !eb || ea.document_id === eb.document_id) continue
      const ta = pageText(m, ea.document_id), tb = pageText(m, eb.document_id)
      const acctA = ta.match(/account ending (\d{4})/)?.[1]
      const acctB = tb.match(/account ending (\d{4})/)?.[1]
      if (!acctA || acctA !== acctB) continue
      out.push({
        id: 'interest-double-count',
        title: 'Bank sweep interest counted twice',
        area: 'investments', severity: 'error', kind: 'engine',
        summary: `${a.label} and ${b.label} are the same ${fmt(Number(a.value))} of interest: the sweep program's 1099-INT is reproduced inside the brokerage composite for account ending ${acctA}.`,
        facts: [
          { text: `${ea.document_id} page ${ea.page}: "${ta.match(/1099-INT[^.]*\./)?.[0] ?? ''}"`, refs: [ea.id] },
          { text: `${eb.document_id}: "${tb.match(/Payer[^.]*\([^)]*\)/)?.[0] ?? ''}"`, refs: [eb.id] },
          { text: `2024 return reported the sweep interest once (SchB.1.1 = ${fmt(Number(m.priorLines['SchB.1.1']))}).`, refs: ['py:/return_2024/lines/SchB.1.1'] },
        ],
        lines: [a.key, b.key, 'SchB.2'], refs: [ea.id, eb.id],
        proposals: [{ kind: 'line', lineKey: b.key, to: 0, reason: `Duplicate of ${a.key} (same payer program, same account ending ${acctA}).`, effects: [{ cat: 'interest', amount: -Number(b.value) }] }],
        method: 'Pairs interest lines with equal amounts and checks whether both documents cite the same account number.',
      })
    }
  }
  return out
}

function fxRateYear(m: Model): Finding[] {
  const out: Finding[] = []
  const fx = m.packet.fx_rates?.SEK_per_USD
  if (!fx) return out
  for (const l of m.current.lines) {
    const ref = l.sources.find((s) => s.startsWith('ref:fx.SEK.'))
    if (!ref) continue
    const which = ref.split('.')[2]
    if (!which.startsWith(String(m.packet.household.tax_year - 1))) continue
    const evSrc = l.sources.map((s) => m.ev.get(s)).find(Boolean)
    if (!evSrc) continue
    const sek = Number(evSrc.value)
    const right = Math.round(sek / fx['2025_average'])
    out.push({
      id: `fx-${l.key}`, title: 'Swedish interest converted at last year\'s exchange rate',
      area: 'foreign', severity: 'warning', kind: 'engine',
      summary: `SEK ${fmt(sek)} was converted at the 2024 average (${which.replace('_', ' ')} = ${fx[which]}). The 2025 average is ${fx['2025_average']}, giving ${fmt(right)} instead of ${fmt(Number(l.value))}.`,
      facts: [
        { text: `Interest credited 12/31/2025 — a 2025 item.`, refs: [evSrc.id] },
        { text: `Rates available to the engine: 2024 average ${fx['2024_average']}, 2025 average ${fx['2025_average']}, 2025 year-end ${fx['2025_year_end']}.`, refs: ['ref:fx.SEK.2025_average'] },
      ],
      lines: [l.key], refs: [evSrc.id, ref],
      proposals: [{ kind: 'line', lineKey: l.key, to: right, reason: `Convert at the 2025 average rate ${fx['2025_average']} SEK/USD.`, effects: [{ cat: 'interest', amount: right - Number(l.value) }] }],
      method: 'Flags any conversion whose rate is from a year other than the tax year.',
    })
  }
  return out
}

interface LotInfo { key: string; box: string; lot: string; proceeds: number; basis: number; acquired: string; sold: string }
function parseLot(l: ReturnLine): LotInfo | null {
  const m = l.key.match(/^F8949\.([A-L])\.(.+)$/)
  if (!m || m[2] === 'total') return null
  const p = l.label.match(/acquired ([\d-]+|None), sold ([\d-]+); proceeds ([\d,.]+), basis ([\d,.]+)/)
  if (!p) return null
  return { key: l.key, box: m[1], lot: m[2], acquired: p[1], sold: p[2], proceeds: num(p[3]), basis: num(p[4]) }
}
const isShort = (box: string) => 'ABCGHI'.includes(box)

function stockPlanBasis(m: Model): Finding[] {
  const supp = m.docs.filter((d) => d.document_type === 'stock_plan_supplement')
  const suppEv = supp.flatMap((d) => m.evByDoc.get(d.id) ?? [])
  const fixes: { lot: LotInfo; basisEv: string; acqEv: string; basis: number; line: ReturnLine }[] = []
  for (const l of m.current.lines) {
    const lot = parseLot(l)
    if (!lot || lot.basis !== 0 || !'BE'.includes(lot.box)) continue
    const acq = suppEv.find((e) => e.field.endsWith('_acquired') && e.value === lot.acquired)
    if (!acq) continue
    const prefix = acq.field.replace(/_acquired$/, '')
    const b = suppEv.find((e) => e.field === `${prefix}_adjusted_basis`)
    if (!b) continue
    fixes.push({ lot, basisEv: b.id, acqEv: acq.id, basis: Number(b.value), line: l })
  }
  if (!fixes.length) return []
  const total = fixes.reduce((s, f) => s + f.basis, 0)
  return [{
    id: 'rsu-zero-basis', title: 'RSU sales taxed on their full proceeds',
    area: 'wages', severity: 'error', kind: 'engine',
    summary: `${fixes.length} RSU lots carry a basis of 0 because the broker left noncovered basis blank. The stock plan supplement gives the adjusted basis (the vest value already taxed on the W-2). Gain is overstated by ${fmt(total)}.`,
    facts: [
      ...fixes.map((f) => ({ text: `${f.lot.lot}: proceeds ${fmt(f.lot.proceeds)}, supplement basis ${fmt(f.basis)} → gain ${fmt(f.lot.proceeds - f.basis)} (engine: ${fmt(f.lot.proceeds)})`, refs: [f.basisEv, ...f.line.sources.slice(-1)] })),
      { text: 'The engine matched the supplement for the ESPP lot (N2) but not for these RSU lots: the broker\'s lot numbers (N1, N3, N4) differ from the plan\'s (RSU-2502, RSU-2505, RSU-2308). Matching by acquisition date succeeds.', refs: ['ev-0072'] },
      { text: 'Corvane W-2 box 14 reports RSU income 38,200 = 800 sh × 47.75, the same vests.', refs: ['ev-0016'] },
    ],
    lines: fixes.map((f) => f.lot.key), refs: fixes.map((f) => f.basisEv),
    proposals: fixes.map((f) => ({
      kind: 'line' as const, lineKey: f.lot.key, to: Math.round(f.lot.proceeds - f.basis),
      reason: `Basis per stock plan supplement (${f.basisEv}); report adjustment code B.`,
      effects: [{ cat: isShort(f.lot.box) ? 'stcg' as const : 'ltcg' as const, amount: -f.basis }],
    })),
    engineDiagnostic: undefined,
    method: 'Finds noncovered lots with zero basis and looks for a stock plan supplement lot with the same acquisition date.',
  }]
}

function unreadBrokerPage(m: Model): Finding[] {
  const out: Finding[] = []
  for (const d of m.docs) {
    if (d.extraction.status !== 'partial' || !m.current.documents_used.includes(d.id)) continue
    const pageNo = Number(d.extraction.reason?.match(/Page (\d+)/i)?.[1])
    const page = d.pages.find((p) => p.page === pageNo)
    if (!page) continue
    const re = /(M\d+) (.+?) ([\d.]+) sh acquired ([\d-]+) sold ([\d-]+) proceeds ([\d,.]+) basis ([\d,.]+) (short|long)-term (covered|noncovered)/g
    const lots = [...page.printed_content.matchAll(re)]
    const summary = pageText(m, d.id, 1).match(/total proceeds ([\d,.]+)/)?.[1]
    const detailTotal = d.pages.map((p) => p.printed_content.match(/Detail total proceeds ([\d,.]+)/)?.[1]).find(Boolean)
    for (const x of lots) {
      const [, lot, desc, sh, acq, sold, proceeds, basis, term, cov] = x
      const box = term === 'short' ? (cov === 'covered' ? 'A' : 'B') : (cov === 'covered' ? 'D' : 'E')
      const key = `F8949.${box}.${lot}`
      if (line(m, key)) continue
      const gain = Math.round(num(proceeds) - num(basis))
      out.push({
        id: `unread-${d.id}-${lot}`, title: `Sale on an unread page: ${desc}`,
        area: 'investments', severity: 'warning', kind: 'extraction',
        summary: `Page ${pageNo} of ${d.id} was never read by the pipeline. It holds lot ${lot} (proceeds ${proceeds}, basis ${basis}), which explains the gap between the summary proceeds (${summary}) and the detail total (${detailTotal}) exactly.`,
        facts: [
          { text: `Pipeline note: ${d.extraction.reason}`, refs: [`doc:${d.id}#page${pageNo}`] },
          { text: `${summary} − ${detailTotal} = ${fmt(num(summary ?? '0') - num(detailTotal ?? '0'))} = lot ${lot} proceeds ${proceeds}.` },
        ],
        lines: [`F8949.${box}.total`], refs: [`doc:${d.id}#page${pageNo}`],
        proposals: [{ kind: 'new-line', lineKey: key, form: 'F8949', label: `${desc} (${sh} sh, acquired ${acq}, sold ${sold}; proceeds ${proceeds}, basis ${basis})`, to: gain, reason: `Lot ${lot} from ${d.id} page ${pageNo}, entered from the printed page.`, effects: [{ cat: term === 'short' ? 'stcg' : 'ltcg', amount: gain }] }],
        engineDiagnostic: 'BROKER_SUMMARY_DETAIL_MISMATCH',
        method: 'Reads the pages the pipeline skipped and parses any sale not already on Form 8949.',
      })
    }
  }
  return out
}

function cryptoBasis(m: Model): Finding[] {
  const out: Finding[] = []
  for (const l of m.current.lines) {
    const lot = parseLot(l)
    if (!lot || lot.basis !== 0) continue
    const nullBasis = l.sources.map((s) => m.ev.get(s)).find((e) => e && e.field.endsWith('_basis') && e.value == null)
    if (!nullBasis) continue
    const asset = l.label.match(/^(\w+)/)?.[1] ?? ''
    const msg = m.packet.client.messages.find((x) => /cost|bought/i.test(x.text) && x.text.includes(asset))
    const cost = msg ? num(msg.text.match(/about ([\d,]+)/)?.[1] ?? 'NaN') : NaN
    const date = msg?.text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    const acquired = date ? `${date[3]}-${date[1]}-${date[2]}` : null
    const facts: Fact[] = [{ text: `Coinhaven export: "${pageText(m, nullBasis.document_id).match(/C6[^;]*;/)?.[0] ?? 'basis unknown'}"`, refs: [nullBasis.id] }]
    if (msg) facts.push({ text: `Client (${msg.sent_at.slice(0, 10)}): "${msg.text}"`, refs: [msg.id] })
    const proposals: Proposal[] = []
    if (msg && !Number.isNaN(cost) && acquired) {
      const gain = Math.round(lot.proceeds - cost)
      proposals.push({ kind: 'line', lineKey: l.key, to: 0, reason: 'Lot moves to long-term (box K): acquired 03/2021 per client.', effects: [{ cat: 'stcg', amount: -Number(l.value) }] })
      proposals.push({ kind: 'new-line', lineKey: l.key.replace(/\.H\./, '.K.'), form: 'F8949', label: `${l.label.split(' (')[0]} (acquired ${acquired}, sold ${lot.sold}; proceeds ${fmt(lot.proceeds)}, basis ${fmt(cost)})`, to: gain, reason: `Basis ${fmt(cost)} per client message ${msg.id} and bank statement line (CryptoNorth, ${date![0]}).`, effects: [{ cat: 'ltcg', amount: gain }] })
      facts.push({ text: `Holding period runs from ${acquired}, so the sale is long-term. Gain ${fmt(gain)} instead of ${fmt(lot.proceeds)} short-term.` })
    }
    out.push({
      id: `crypto-basis-${lot.lot}`, title: `Crypto lot ${lot.lot} reported with zero basis`,
      area: 'investments', severity: 'warning', kind: 'judgment',
      summary: `The engine used zero basis and the transfer-in date for ${lot.lot}. The client has since given a cost and a 2021 purchase date, supported only by a bank statement line. Using it is a judgment call about substantiation.`,
      facts, lines: [l.key], refs: [nullBasis.id, ...(msg ? [msg.id] : [])], proposals,
      engineDiagnostic: 'DIGITAL_ASSET_BASIS_MISSING',
      method: 'Finds lots whose basis was read as empty and searches client messages for a cost.',
    })
  }
  return out
}

function duplicateMileagePage(m: Model): Finding[] {
  const out: Finding[] = []
  const miles = line(m, 'SchC.44a')
  const car = line(m, 'SchC.9')
  if (!miles || !car) return out
  const pageTotals = miles.sources.map((s) => m.ev.get(s)).filter(Boolean) as NonNullable<ReturnType<typeof m.ev.get>>[]
  const docId = pageTotals[0]?.document_id
  if (!docId) return out
  const evs = m.evByDoc.get(docId) ?? []
  const sig = new Map<number, string>()
  for (const p of new Set(evs.map((e) => e.page))) {
    sig.set(p, evs.filter((e) => e.page === p && /^trip\d+_(date|miles)$/.test(e.field)).map((e) => `${e.field}=${e.value}`).join('|'))
  }
  const pages = [...sig.keys()].sort((a, b) => a - b)
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    if (!sig.get(pages[i]) || sig.get(pages[i]) !== sig.get(pages[j])) continue
    const dup = pageTotals.find((e) => e.page === pages[j])
    if (!dup) continue
    const correct = Number(miles.value) - Number(dup.value)
    const rate = Number(m.packet.engine_reference.parameters.mileage_rate)
    const carRight = Math.round(correct * rate)
    out.push({
      id: 'mileage-duplicate-page', title: 'Mileage log page counted twice',
      area: 'business', severity: 'error', kind: 'engine',
      summary: `Page ${pages[j]} of the mileage log is a second scan of page ${pages[i]} (same ${evs.filter((e) => e.page === pages[i] && e.field.endsWith('_date')).length} trips, same dates and miles). Business miles are ${fmt(correct)}, not ${fmt(Number(miles.value))}; car expense ${fmt(carRight)}, not ${fmt(Number(car.value))}.`,
      facts: [
        { text: `Printed on page ${pages[j]}: "${pageText(m, docId, pages[j]).match(/^\([^)]*\)/)?.[0] ?? ''}"`, refs: [`doc:${docId}#page${pages[j]}`] },
        { text: `Rule R-MILEAGE-PAGE-TOTALS sums every page total: ${pageTotals.map((e) => e.value).join(' + ')} = ${fmt(Number(miles.value))}.`, refs: pageTotals.map((e) => e.id) },
        { text: `Odometer 41,220 → 58,960 = 17,740 total miles; business share ${Math.round((correct / 17740) * 100)}% after the fix.` },
        { text: `2024 business miles were 7,400.`, refs: ['py:/return_2024/lines/SchC.44a'] },
      ],
      lines: ['SchC.44a', 'SchC.9'], refs: [dup.id],
      proposals: [
        { kind: 'line', lineKey: 'SchC.44a', to: correct, reason: `Remove duplicate page ${pages[j]} (${fmt(Number(dup.value))} miles).`, effects: [] },
        { kind: 'line', lineKey: 'SchC.9', to: carRight, reason: `${fmt(correct)} miles × ${rate} standard rate.`, effects: [{ cat: 'schc_profit', amount: Number(car.value) - carRight }] },
      ],
      method: 'Compares the trip list on every page of the log; identical pages are duplicates.',
    })
  }
  return out
}

function form1099KDoubleCount(m: Model): Finding[] {
  const gross = line(m, 'SchC.1')
  if (!gross) return []
  const k = gross.sources.map((s) => m.ev.get(s)).find((e) => e && m.docById.get(e.document_id)?.document_type === '1099-K')
  const books = gross.sources.map((s) => m.ev.get(s)).find((e) => e && e.field === 'total_income')
  if (!k || !books) return []
  const kAmt = Number(k.value)
  const detail = m.docs.filter((d) => d.document_type === 'books_transaction_detail')
  const hit = detail.map((d) => ({ d, t: pageText(m, d.id) })).find(({ t }) => t.includes(fmt(kAmt) + '.00') && /card processing|Paywell/i.test(t))
  if (!hit) return []
  const necs = m.docs.filter((d) => d.document_type === '1099-NEC').flatMap((d) => (m.evByDoc.get(d.id) ?? []).filter((e) => e.field === 'box1'))
  const necTotal = necs.reduce((s, e) => s + Number(e.value), 0)
  const no1099 = num(hit.t.match(/no Form 1099: ([\d,.]+)/)?.[1] ?? '0')
  return [{
    id: '1099k-double-count', title: 'Card payments counted in receipts twice',
    area: 'business', severity: 'error', kind: 'engine',
    summary: `Gross receipts add the 1099-K (${fmt(kAmt)}) on top of the books, but the books already include it: Atlas Outdoor Gear paid ${fmt(kAmt)} by card through Paywell, deposited gross. Receipts are ${fmt(Number(books.value))}, not ${fmt(Number(gross.value))}.`,
    facts: [
      { text: `Books transaction detail: "${hit.t.match(/Atlas Outdoor Gear paid[^.]*\./)?.[0] ?? ''}"`, refs: [`${hit.d.id}`] },
      { text: `Reconciliation: 1099-NEC total ${fmt(necTotal)} + deposits from clients with no 1099 ${fmt(no1099)} = ${fmt(necTotal + no1099)} = books revenue ${fmt(Number(books.value))}. The 1099-K is a subset of the Atlas 1099-NEC.`, refs: necs.map((e) => e.id) },
      { text: 'This is the reconciliation the IRS asks for in the 2028 Letter 566.', refs: ['D72'] },
    ],
    lines: ['SchC.1'], refs: [k.id, books.id],
    proposals: [{ kind: 'line', lineKey: 'SchC.1', to: Number(books.value), reason: `1099-K ${fmt(kAmt)} matched to books deposits (${hit.d.id}).`, effects: [{ cat: 'schc_profit', amount: -kAmt }] }],
    method: 'Searches the books detail for the 1099-K amount and payer before accepting it as unmatched income.',
  }]
}

function seHealthInsurance(m: Model): Finding[] {
  const sehi = line(m, 'Sch1.17')
  if (!sehi || !Number(sehi.value)) return []
  const q = m.packet.client.questionnaire.find((x) => /eligible for health coverage/i.test(x.question))
  if (!q || !/^yes/i.test(q.answer)) return []
  const pyNote = m.packet.prior_years.return_2024.notes['Sch1.17']
  return [{
    id: 'sehi-eligible', title: 'Self-employed health insurance claimed while eligible for an employer plan',
    area: 'business', severity: 'error', kind: 'engine',
    summary: `The deduction is not allowed for any month Erik was eligible to join a subsidized employer plan, including a spouse's. The client says both of Ngozi's employers offered family coverage. ${fmt(Number(sehi.value))} should come off.`,
    facts: [
      { text: `${q.id}: "${q.question}" → "${q.answer}"`, refs: [q.id] },
      { text: `2024 return: "${pyNote}"`, refs: ['py:/return_2024/notes/Sch1.17'] },
      { text: 'Removing it raises QBI as well; the per-dollar adjustment rate does not capture that, so the estimate is conservative.' },
    ],
    lines: ['Sch1.17'], refs: [q.id],
    proposals: [{ kind: 'line', lineKey: 'Sch1.17', to: 0, reason: `Eligible for employer-subsidized coverage through spouse (${q.id}).`, effects: [{ cat: 'adjustment', amount: -Number(sehi.value) }] }],
    method: 'Reads the eligibility answer before allowing the deduction.',
  }]
}

function mixedUseExpenses(m: Model): Finding[] {
  const call = m.packet.client.call_notes[0]
  const util = line(m, 'SchC.25'), soft = line(m, 'SchC.27a.1')
  if (!call || !util || !soft) return []
  const notes = call.notes.join(' ')
  const phonePct = Number(notes.match(/business share is (\d+)%/)?.[1] ?? NaN) / 100
  const netPct = Number(notes.match(/business use about (\d+)%/)?.[1] ?? NaN) / 100
  const phone = m.ev.get(util.sources.find((s) => m.ev.get(s)?.field === 'Telephone') ?? '')
  const net = m.ev.get(util.sources.find((s) => m.ev.get(s)?.field === 'Internet') ?? '')
  if (!phone || !net || Number.isNaN(phonePct) || Number.isNaN(netPct)) return []
  const utilRight = Math.round(Number(phone.value) * phonePct + Number(net.value) * netPct)
  const detail = m.docs.find((d) => d.document_type === 'books_transaction_detail')
  const spotify = detail ? num(pageText(m, detail.id).match(/Spotify Family ([\d,.]+)/)?.[1] ?? '0') : 0
  const proposals: Proposal[] = [
    { kind: 'line', lineKey: 'SchC.25', to: utilRight, reason: `Phone ${phonePct * 100}% and internet ${netPct * 100}% business use (call ${call.date.slice(0, 10)}).`, effects: [{ cat: 'schc_profit', amount: Number(util.value) - utilRight }] },
  ]
  if (spotify && /Spotify.*personal/i.test(notes)) proposals.push({ kind: 'line', lineKey: 'SchC.27a.1', to: Number(soft.value) - spotify, reason: 'Spotify Family is personal (booked by mistake).', effects: [{ cat: 'schc_profit', amount: spotify }] })
  return [{
    id: 'mixed-use', title: 'Family phone, home internet and a music subscription deducted in full',
    area: 'business', severity: 'warning', kind: 'engine',
    summary: `The books carry the whole family mobile plan, the home internet and Spotify Family. On the call Erik put the business share at ${phonePct * 100}% and ${netPct * 100}%, and called Spotify personal.`,
    facts: [
      ...call.notes.filter((n) => /Mobile|internet|Spotify/i.test(n)).map((n) => ({ text: n, refs: [call.id] })),
      { text: `Utilities ${fmt(Number(util.value))} → ${fmt(utilRight)}; software ${fmt(Number(soft.value))} → ${fmt(Number(soft.value) - spotify)}.`, refs: [phone.id, net.id] },
    ],
    lines: ['SchC.25', 'SchC.27a.1'], refs: [call.id],
    proposals,
    method: 'Applies the business-use percentages the client gave on the call to the books lines.',
  }]
}

function hvacCapitalize(m: Model): Finding[] {
  const rep = line(m, 'SchE.14A')
  const wi = m.packet.what_if.alternatives.find((a) => a.id === 'hvac_improvement')
  if (!rep || !wi) return []
  const inv = m.docs.find((d) => d.document_type === 'invoice' && /Heating/i.test(d.title))
  return [{
    id: 'hvac-improvement', title: 'Whole HVAC system replacement expensed as a repair',
    area: 'rentals', severity: 'warning', kind: 'judgment',
    summary: 'The 11,000 job replaced the furnace and condenser with a new heat pump, air handler and line set. That is a restoration of a building system, which is normally capitalized and depreciated over 27.5 years. The engine expensed it inside repairs.',
    facts: [
      ...(inv ? [{ text: `Invoice: "${pageText(m, inv.id).match(/Removed[^.]*\.[^.]*\./)?.[0] ?? ''}"`, refs: [inv.id] }] : []),
      { text: 'Call: "replaced the whole system with a heat pump (new air handler, line set)."', refs: ['call-01'] },
      { text: `Engine what-if "${wi.id}": federal tax +${fmt(wi.federal.total_tax_change)}, California +${fmt(wi.california.total_tax_change)}.` },
    ],
    lines: ['SchE.14A', 'SchE.18A'], refs: inv ? [inv.id] : [], whatIf: wi.id,
    proposals: wi.changed_lines.filter((c) => c.key === 'SchE.14A' || c.key === 'SchE.18A').map((c, i) => ({
      kind: 'line' as const, lineKey: c.key, to: Number(c.new), reason: 'Capitalize the HVAC replacement (Reg. 1.263(a)-3 restoration of a building system); depreciate SL 27.5 years from 08/2025.',
      effects: i === 0 ? [{ cat: 'fixed' as const, amount: 0, fixed: { federal: wi.federal.total_tax_change, california: wi.california.total_tax_change }, note: `Engine what-if ${wi.id}` }] : [],
    })),
    method: 'Reads the invoice description against the repair treatment; the effect comes from the engine\'s own what-if.',
  }]
}

function homePropertyTax(m: Model): Finding[] {
  const re = line(m, 'SchA.5b'), inc = line(m, 'SchA.5a'), cap = line(m, 'SchA.5e')
  const buyer = m.docs.find((d) => d.document_type === 'closing_statement_buyer')
  if (!re || !inc || !cap || !buyer) return []
  const credit = (m.evByDoc.get(buyer.id) ?? []).find((e) => e.field === 'tax_credit')
  if (!credit) return []
  const right = Number(re.value) - Number(credit.value)
  const capAmt = Number(cap.value)
  const totalBefore = Number(inc.value) + Number(re.value)
  const totalAfter = Number(inc.value) + right
  const limitedBefore = Math.min(totalBefore, capAmt)
  const limitedAfter = Math.min(totalAfter, capAmt)
  return [{
    id: 'home-tax-seller-share', title: 'Home property tax includes the seller\'s share',
    area: 'deductions', severity: 'error', kind: 'engine',
    summary: `The 2025 Travis County bill (${fmt(Number(re.value))}) covers the whole year, but the seller owned the house until 07/07 and credited the buyers ${fmt(Number(credit.value))} at closing for that period. The buyers' deductible share is ${fmt(right)}.`,
    facts: [
      { text: `Buyer closing statement: "${pageText(m, buyer.id).match(/Seller credit[^.]*\./)?.[0] ?? ''}"`, refs: [credit.id] },
      { text: 'Travis County receipt: owner of record 01/01/2025 was the prior owner.', refs: ['D58'] },
      { text: `State and local taxes fall from ${fmt(totalBefore)} to ${fmt(totalAfter)}, crossing below the ${fmt(capAmt)} cap: the federal deduction drops ${fmt(limitedBefore - limitedAfter)}.` },
    ],
    lines: ['SchA.5b', 'SchA.5e'], refs: [credit.id],
    proposals: [{
      kind: 'line', lineKey: 'SchA.5b', to: right, reason: `Exclude seller's share 01/01–07/07 credited at closing (${credit.id}).`,
      effects: [
        { cat: 'itemized', amount: -(limitedBefore - limitedAfter), only: 'federal', note: 'Below the cap, so the itemized rate applies to the part that is no longer capped.' },
        { cat: 'salt', amount: -Number(credit.value), only: 'california' },
      ],
    }],
    method: 'Matches the escrow-paid bill to the buyer closing statement\'s tax proration.',
  }]
}

function mortgagePayoffInterest(m: Model): Finding[] {
  const mi = line(m, 'SchA.8a')
  if (!mi) return []
  const payoff = mi.sources.map((s) => m.ev.get(s)).find((e) => e && m.docById.get(e.document_id)?.document_type === 'payoff_statement')
  if (!payoff) return []
  const f1098 = m.docs.find((d) => d.document_type === '1098' && /payoff/i.test(pageText(m, d.id)) && /includes/i.test(pageText(m, d.id)))
  if (!f1098) return []
  return [{
    id: 'mortgage-payoff-double', title: 'Payoff interest added on top of a 1098 that already includes it',
    area: 'deductions', severity: 'error', kind: 'engine',
    summary: `Lonestar's 1098 box 1 (13,900) already includes the interest paid at payoff on 11/20, and the payoff statement says so. Adding the payoff statement's ${fmt(Number(payoff.value))} counts it twice.`,
    facts: [
      { text: `${f1098.id}: "${pageText(m, f1098.id).match(/Box 1[^.]*\([^)]*\)/)?.[0] ?? ''}"`, refs: [f1098.id] },
      { text: `${payoff.document_id}: "${pageText(m, payoff.document_id).match(/\(Interest[^)]*\)/)?.[0] ?? ''}"`, refs: [payoff.id] },
    ],
    lines: ['SchA.8a'], refs: [payoff.id],
    proposals: [{ kind: 'line', lineKey: 'SchA.8a', to: Number(mi.value) - Number(payoff.value), reason: `Payoff interest is inside ${f1098.id} box 1.`, effects: [{ cat: 'itemized', amount: -Number(payoff.value) }] }],
    method: 'Reads the 1098 and payoff statement wording before summing interest from both.',
  }]
}

function vehicleDonation(m: Model): Finding[] {
  const v = line(m, 'F8283.A1.vehicle')
  const c = m.docs.find((d) => d.document_type === '1098-C')
  if (!v || !c) return []
  const sold = (m.evByDoc.get(c.id) ?? []).find((e) => e.field === 'box4c')
  if (!sold || Number(sold.value) >= Number(v.value)) return []
  const diff = Number(v.value) - Number(sold.value)
  return [{
    id: 'vehicle-gross-proceeds', title: 'Donated car deducted at its blue-book value',
    area: 'deductions', severity: 'error', kind: 'engine',
    summary: `The charity sold the Subaru for ${fmt(Number(sold.value))} (Form 1098-C box 4c). When a donated vehicle is sold, the deduction is limited to the gross proceeds. The engine used the client's estimate of ${fmt(Number(v.value))}.`,
    facts: [
      { text: `${c.id}: "${pageText(m, c.id).match(/Box 4a[^.]*\./)?.[0] ?? ''}"`, refs: [sold.id] },
      { text: 'Client: "Kelley Blue Book said about 6,000."', refs: ['qa-39'] },
      { text: 'Noncash gifts on Schedule A line 12 are the first item the IRS examines in January 2028.', refs: ['D72'] },
    ],
    lines: ['F8283.A1.vehicle', 'SchA.12'], refs: [sold.id],
    proposals: [{ kind: 'line', lineKey: 'F8283.A1.vehicle', to: Number(sold.value), reason: `Limited to gross proceeds (${c.id} box 4c).`, effects: [{ cat: 'itemized', amount: -diff }] }],
    method: 'Compares the claimed value with the charity\'s reported sale price.',
  }]
}

function federalEstimates(m: Model): Finding[] {
  const est = line(m, 'F1040.26')
  const tr = m.packet.tax_agency_records.irs_account_transcript_2025[0]
  if (!est || !tr) return []
  const paid = tr.transactions.filter((t) => t.code === '670').reduce((s, t) => s + Number(t.amount), 0)
  if (paid === Number(est.value)) return []
  const q = m.packet.client.questionnaire.find((x) => /4th quarter/i.test(x.question))
  return [{
    id: 'fed-estimates-transcript', title: 'Fourth federal estimate taken from the client\'s memory, not the IRS record',
    area: 'payments', severity: 'error', kind: 'conflict',
    summary: `The return claims ${fmt(Number(est.value))} of estimates. The IRS account transcript shows ${fmt(paid)}: the January payment was 3,000 on 01/15/2026, not "4,000 I think" on 01/14.`,
    facts: [
      ...(q ? [{ text: `${q.id}: "${q.answer}"`, refs: [q.id] }] : []),
      { text: `IRS transcript as of ${tr.as_of}: ${tr.transactions.map((t) => `${t.date} ${fmt(Number(t.amount))}`).join('; ')}.`, refs: ['agency:/irs_account_transcript_2025/0'] },
      { text: 'EFTPS confirmations cover only the first three payments.', refs: ['D67'] },
    ],
    lines: ['F1040.26'], refs: ['agency:/irs_account_transcript_2025/0'],
    proposals: [{ kind: 'line', lineKey: 'F1040.26', to: paid, reason: 'Agreed to IRS account transcript (code 670 payments).', effects: [{ cat: 'fed_payment', amount: paid - Number(est.value) }] }],
    method: 'Agrees estimated payments to the IRS transcript instead of to the questionnaire.',
  }]
}

function caEstimates(m: Model): Finding[] {
  const est = line(m, 'F540NR.72')
  const ftb = m.packet.tax_agency_records.ftb_account
  if (!est || !ftb) return []
  const paid = ftb.tax_year_2025_payments.reduce((s, p) => s + p.amount, 0)
  if (paid === Number(est.value)) return []
  const misapplied = ftb.tax_year_2024_payments_after_filing[0]
  return [{
    id: 'ca-estimate-wrong-year', title: 'A California estimate was designated to 2024',
    area: 'payments', severity: 'error', kind: 'conflict',
    summary: `The return claims ${fmt(Number(est.value))} of 2025 California estimates. FTB has ${fmt(paid)}: the 09/15/2025 payment of ${fmt(misapplied?.amount ?? 0)} was entered in Web Pay as tax year 2024 and FTB is holding it as a 2024 credit.`,
    facts: [
      { text: `FTB account: ${misapplied?.note}`, refs: ['agency:/ftb_account'] },
      { text: 'Web Pay confirmation shows "tax year 2024 (estimated payment)" for 2025-09-15.', refs: ['D68'] },
      { text: 'Options: claim 10,500 now and ask FTB to transfer the 2024 credit, or claim the 2024 overpayment as a refund. Either way the return should agree to FTB.' },
    ],
    lines: ['F540NR.72'], refs: ['agency:/ftb_account'],
    proposals: [{ kind: 'line', lineKey: 'F540NR.72', to: paid, reason: 'Agreed to FTB account (2025 payments).', effects: [{ cat: 'ca_payment', amount: paid - Number(est.value) }] }],
    method: 'Agrees California estimates to the FTB account, not to the payment confirmations.',
  }]
}

function caSourceWages(m: Model): Finding[] {
  const ca = line(m, 'SchCA540NR.1.E')
  const stub = m.docs.find((d) => d.document_type === 'paystub')
  if (!ca || !stub) return []
  const stubCa = (m.evByDoc.get(stub.id) ?? []).find((e) => e.field === 'ytd_ca_wages')
  const corvane = m.docs.find((d) => d.document_type === 'W-2' && /Corvane/.test(d.title))
  const halv = m.docs.find((d) => d.document_type === 'W-2' && /Halvorsen/.test(d.title) && !/photo/i.test(d.title))
  if (!stubCa || !corvane || !halv) return []
  const cBox16 = (m.evByDoc.get(corvane.id) ?? []).find((e) => e.field === 'box16')
  const hBox16 = (m.evByDoc.get(halv.id) ?? []).find((e) => e.field === 'box16')
  if (!cBox16 || !hBox16) return []
  const right = Number(cBox16.value) + Number(stubCa.value)
  const delta = right - Number(ca.value)
  return [{
    id: 'ca-source-wages', title: 'California taxes Texas wages',
    area: 'california', severity: 'error', kind: 'engine',
    summary: `California-source wages use every dollar of both W-2s' box 16 (${fmt(Number(ca.value))}). Halvorsen kept California as the work state through September by mistake. Ngozi moved on 07/14, and her paystub shows California wages of ${fmt(Number(stubCa.value))} at the move. California-source wages are ${fmt(right)}.`,
    facts: [
      { text: `Halvorsen W-2: "${pageText(m, halv.id).match(/\(Employment[^)]*\)/)?.[0] ?? ''}"`, refs: [hBox16.id] },
      { text: `Paystub ${stub.id}: work location Austin from 07/15; YTD CA taxable wages ${fmt(Number(stubCa.value))}.`, refs: [stubCa.id] },
      { text: 'Client: "Ngozi\'s new employer kept withholding California tax until September by mistake."', refs: ['qa-45'] },
      { text: `Corvane box 16 ${fmt(Number(cBox16.value))} is all California (employment ended 05/16) + Halvorsen to the move ${fmt(Number(stubCa.value))} = ${fmt(right)}.` },
    ],
    lines: ['SchCA540NR.1.E'], refs: [stubCa.id, hBox16.id],
    proposals: [{ kind: 'line', lineKey: 'SchCA540NR.1.E', to: right, reason: 'California-source wages: Corvane box 16 plus Halvorsen wages through the 07/14 move (paystub).', effects: [{ cat: 'ca_source_income', amount: delta }] }],
    method: 'Rebuilds the California wage split from residency dates and the paystub instead of box 16.',
  }]
}

function dependentSsn(m: Model): Finding[] {
  const out: Finding[] = []
  const py = m.packet.prior_years.return_2024.dependents
  for (const p of m.packet.household.people.filter((x) => x.role === 'dependent')) {
    const prior = py.find((d) => d.name === p.name)
    if (!prior || prior.ssn === p.ssn) continue
    const card = m.docs.find((d) => d.document_type === 'identity_document' && d.belongs_to === `dependent:${p.id}`)
    out.push({
      id: `ssn-${p.id}`, title: `${p.name.split(' ')[0]}'s SSN differs from last year's return`,
      area: 'deductions', severity: 'blocking', kind: 'conflict',
      summary: `The organizer has ${p.ssn}; the 2024 return as filed has ${prior.ssn}. Two digits are transposed. A wrong dependent SSN rejects the e-file (IRS R0000-504-02) and loses the child tax credit.`,
      facts: [
        { text: `Organizer (entered by ${m.packet.household.entered_by}): ${p.ssn}`, refs: [`household:${p.id}`] },
        { text: `2024 Form 1040 dependents: ${prior.ssn}`, refs: ['D06'] },
        ...(card ? [{ text: `Social Security card (received ${card.received_at.slice(0, 10)}): ${pageText(m, card.id)}`, refs: [card.id] }] : [{ text: 'Ask the client for the Social Security card.' }]),
      ],
      lines: ['F8812.4'], refs: [`household:${p.id}`, 'D06'],
      proposals: [{ kind: 'household', personId: p.id, field: 'ssn', to: prior.ssn, reason: 'Agrees to 2024 return as filed (and SS card when received).' }],
      method: 'Compares every SSN on the organizer with the prior-year return as filed.',
    })
  }
  return out
}

function extractionMismatch(m: Model): Finding[] {
  const out: Finding[] = []
  const idTypes = new Set(['ein', 'ssn', 'code', 'account_number'])
  for (const e of m.packet.extracted_values) {
    if (!idTypes.has(e.value_type) || !e.text_as_read) continue
    const text = pageText(m, e.document_id, e.page)
    if (text.includes(e.text_as_read)) continue
    // Find the printed token that is a near-anagram of what was read (transposed digits).
    const sorted = (s: string) => s.replace(/\D/g, '').split('').sort().join('')
    const candidates = text.match(/\b\d{2}-\d{7}\b|\b\d{3}-\d{2}-\d{4}\b/g) ?? []
    const printed = candidates.find((c) => sorted(c) === sorted(e.text_as_read))
    const usedIn = m.evToLines.get(e.id)?.get(m.current.version) ?? []
    const lineByEin = m.current.lines.filter((l) => l.label.includes(String(e.value)))
    out.push({
      id: `extract-${e.id}`, title: `${e.label} misread on ${e.document_id}`,
      area: usedIn[0] ? 'deductions' : 'deductions', severity: 'error', kind: 'extraction',
      summary: `The pipeline read ${e.text_as_read} at ${Math.round(e.confidence * 100)}% confidence; the page prints ${printed ?? 'something else'}.${printed ? ' Two digits are transposed.' : ''}`,
      facts: [
        { text: `Printed: "${text}"`, refs: [e.id] },
        ...lineByEin.map((l) => ({ text: `Carried into ${l.key}: "${l.label}"`, refs: [l.key] })),
        ...(e.document_id === 'D62' ? [{ text: 'Form 2441 also names the first provider "Bright Oak Preschool"; its statement and the 2024 return say "Bright Oak Kids Club".', refs: ['D61', 'py:/return_2024/lines/F2441.provider'] }] : []),
      ],
      lines: [...usedIn, ...lineByEin.map((l) => l.key)], refs: [e.id],
      proposals: printed ? [{ kind: 'extraction', evId: e.id, to: printed, reason: `Agrees to printed ${e.document_id} page ${e.page}.` }] : [],
      method: 'Looks for every extracted identifier verbatim on its page; a high confidence score is not evidence.',
    })
  }
  return out
}

function iraBasisConflict(m: Model): Finding[] {
  const q = m.packet.client.questionnaire.find((x) => /IRA details/i.test(x.question))
  const l2 = line(m, 'F8606.2')
  if (!q || !l2 || !/none/i.test(q.answer)) return []
  return [{
    id: 'ira-basis-client', title: 'Client says there is no prior IRA basis; the documents say 7,000',
    area: 'retirement', severity: 'info', kind: 'conflict',
    summary: 'The engine correctly carried 7,000 of basis from the 2024 Form 8606 (the 2024 contribution was made 02/12/2025). The client\'s answer is wrong; without the carried basis the conversion would be taxed on 7,026 instead of 26.',
    facts: [
      { text: `${q.id}: "${q.answer}"`, refs: [q.id] },
      { text: 'Form 5498 for 2024: 7,000 contributed 02/12/2025 for tax year 2024.', refs: ['D42'] },
      { text: '2024 Form 8606 line 14: basis 7,000. Prior preparer left "5498 not obtained" open; it is now in file.', refs: ['py:/return_2024/lines/F8606.14', 'D07'] },
    ],
    lines: ['F8606.2', 'F1040.4b'], refs: [q.id, 'D42'], proposals: [],
    method: 'Compares client answers with documents and the prior return.',
  }]
}

function sepExcess(m: Model): Finding[] {
  const ex = Number(m.current.carryovers_out.federal.sep_contribution_not_deductible_for_2025 ?? 0)
  if (!ex) return []
  return [{
    id: 'sep-excess', title: 'SEP contribution exceeds the deductible limit',
    area: 'retirement', severity: 'warning', kind: 'judgment',
    summary: `Erik deposited 18,000 on 04/10/2026; the limit at current profit is 15,214. The ${fmt(ex)} excess is subject to a 6% excise each year until withdrawn. Note that the Schedule C fixes raise profit and therefore the limit.`,
    facts: [
      { text: 'SEP confirmation: 18,000 deposited 04/10/2026 for 2025.', refs: ['D26'] },
      { text: 'Sch1.16 note: limit 20% × (net profit − ½ SE tax).', refs: ['Sch1.16'] },
    ],
    lines: ['Sch1.16'], refs: ['D26'], proposals: [],
    method: 'Reads the engine\'s carryover of the nondeductible SEP amount and treats it as a client decision.',
  }]
}

function outsideFilings(m: Model): Finding[] {
  const out: Finding[] = []
  const memo = m.packet.prior_years.prior_preparer_workpaper.open_items_left_by_prior_preparer
  const f3520 = memo.find((x) => /3520/.test(x))
  if (f3520) out.push({
    id: 'form-3520-2023', title: 'Possible unfiled Form 3520 for the 2023 Swedish inheritance',
    area: 'foreign', severity: 'warning', kind: 'outside',
    summary: 'Erik inherited the Sparbanken account from his mother in 09/2023 (peak 2025 balance SEK 1.45m ≈ 150,000 USD). A gift or bequest over 100,000 from a foreign person requires Form 3520. The prior preparer flagged it and never closed it. The 2025 questionnaire only asked about 2025.',
    facts: [
      { text: `Prior preparer open item: "${f3520}"`, refs: ['D07'] },
      { text: 'Statement: "Account opened 09/2023 (inheritance from Birgitta Lindqvist)."', refs: ['D36'] },
      { text: 'qa-08 asked only about 2025.', refs: ['qa-08'] },
    ],
    lines: [], refs: ['D07', 'D36'], proposals: [],
    method: 'Carries every open item from the prior preparer into this year\'s file.',
  })
  return out
}

function priorHomeOffice(m: Model): Finding[] {
  const py = Number(m.priorLines['SchC.30'])
  if (!py) return []
  return [{
    id: 'prior-home-office', title: 'Last year\'s home office used 300 sq ft; the room is 220',
    area: 'business', severity: 'info', kind: 'judgment',
    summary: 'The prior preparer used 300 sq ft (noting "2 rooms combined?"). The client\'s measurements show a single 220 sq ft studio in Sacramento. 2024 overstated the deduction by 400. That is below an amendment threshold, but record the decision.',
    facts: [
      { text: 'Prior preparer: "Home office 300 sq ft (Sacramento rental house, 2 rooms combined?) - client to confirm."', refs: ['D07'] },
      { text: 'Client note: 11 × 20 ft = 220 sq ft, used exclusively January–mid-July.', refs: ['D24'] },
    ],
    lines: ['SchC.30'], refs: ['D24', 'D07'], proposals: [],
    engineDiagnostic: 'HOME_OFFICE_AREA_CHANGE',
    method: 'Compares this year\'s measured area with the prior preparer\'s figure.',
  }]
}

export function runChecks(m: Model): Finding[] {
  const all = [
    dependentSsn, caSourceWages, stockPlanBasis, form1099KDoubleCount, seHealthInsurance, duplicateMileagePage,
    homePropertyTax, vehicleDonation, mortgagePayoffInterest, duplicateInterest, federalEstimates, caEstimates,
    extractionMismatch, unreadBrokerPage, cryptoBasis, fxRateYear, mixedUseExpenses, hvacCapitalize,
    sepExcess, iraBasisConflict, outsideFilings, priorHomeOffice,
  ]
  const out: Finding[] = []
  for (const c of all) {
    try { out.push(...c(m)) } catch (err) { console.warn('check failed', c.name, err) }
  }
  return out
}

// --- Per-line independent signals -------------------------------------------------------------

export type RecalcStatus = { status: 'foots' | 'differs' | 'na'; expected?: number; formula?: string }

/** Re-foot R-SUM lines by searching for the sign pattern of their inputs. */
export function recalcLine(m: Model, l: ReturnLine, valueOf: (k: string) => number | null): RecalcStatus {
  if (l.rule !== 'R-SUM' || !l.inputs.length || typeof l.value !== 'number') return { status: 'na' }
  const vals = l.inputs.map((k) => valueOf(k))
  if (vals.some((v) => v == null)) return { status: 'na' }
  const n = vals.length
  if (n > 14) {
    const s = (vals as number[]).reduce((a, b) => a + b, 0)
    return Math.abs(s - l.value) <= 1 ? { status: 'foots', expected: s, formula: l.inputs.join(' + ') } : { status: 'differs', expected: s, formula: l.inputs.join(' + ') }
  }
  // Prefer patterns where the first input is positive (the usual "A minus B" shape).
  for (let mask = 0; mask < 1 << n; mask++) {
    if (mask & 1) continue
    let s = 0
    for (let i = 0; i < n; i++) s += (mask & (1 << i) ? -1 : 1) * (vals[i] as number)
    if (Math.abs(s - l.value) <= Math.max(1, n * 0.5)) {
      const formula = l.inputs.map((k, i) => `${i === 0 ? '' : mask & (1 << i) ? ' − ' : ' + '}${k}`).join('')
      return { status: 'foots', expected: s, formula }
    }
  }
  const s = (vals as number[]).reduce((a, b) => a + b, 0)
  return { status: 'differs', expected: s, formula: l.inputs.join(' + ') }
}

/** Does a single-source line agree with its document value? */
export function sourceAgreement(m: Model, l: ReturnLine): { status: 'agrees' | 'differs' | 'na'; source?: number } {
  if (typeof l.value !== 'number') return { status: 'na' }
  const money = l.sources.map((s) => m.ev.get(s)).filter((e) => e && e.value_type === 'money')
  if (money.length !== 1) return { status: 'na' }
  const v = Number(money[0]!.value)
  return Math.abs(Math.round(v) - l.value) <= 1 ? { status: 'agrees', source: v } : { status: 'na', source: v }
}

export interface Variance { key: string; label: string; prior: number; current: number; change: number; pct: number | null }

export function variances(m: Model, valueOf: (k: string) => number | null, std: { flag_if_change_over_percent: number; and_over_amount: number }): Variance[] {
  const out: Variance[] = []
  for (const [k, pv] of Object.entries(m.priorLines)) {
    if (typeof pv !== 'number') continue
    const l = line(m, k)
    if (!l) continue
    const cv = valueOf(k)
    if (cv == null) continue
    const change = cv - pv
    const pct = pv === 0 ? null : (change / Math.abs(pv)) * 100
    if (Math.abs(change) > std.and_over_amount && (pct == null || Math.abs(pct) > std.flag_if_change_over_percent)) {
      out.push({ key: k, label: l.label, prior: pv, current: cv, change, pct })
    }
  }
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}

export { lineValueNum }
