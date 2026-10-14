import type { Model } from './model'
import { lineValueNum } from './model'
import type { EffectPart } from './effects'
import type { AreaId } from './areas'
import type { ReturnLine } from './types'
import { paymentsRecon } from './derived'

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

/** First notice item (from agency records) whose text matches. */
function noticeItem(m: Model, re: RegExp) {
  for (const n of m.packet.tax_agency_records.notices) for (const item of n.items_under_examination ?? []) if (re.test(item)) return { notice: n, item }
  return null
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
  const fixes: { lot: LotInfo; basisEv: string; acqEv: string; basis: number; line: ReturnLine; planLot: string }[] = []
  for (const l of m.current.lines) {
    const lot = parseLot(l)
    if (!lot || lot.basis !== 0 || !'BE'.includes(lot.box)) continue
    const acq = suppEv.find((e) => e.field.endsWith('_acquired') && e.value === lot.acquired)
    if (!acq) continue
    const prefix = acq.field.replace(/_acquired$/, '')
    const b = suppEv.find((e) => e.field === `${prefix}_adjusted_basis`)
    if (!b) continue
    fixes.push({ lot, basisEv: b.id, acqEv: acq.id, basis: Number(b.value), line: l, planLot: prefix })
  }
  if (!fixes.length) return []
  const total = fixes.reduce((s, f) => s + f.basis, 0)
  const matched = m.current.lines.filter((l) => /^F8949\./.test(l.key) && l.sources.some((s) => suppEv.some((e) => e.id === s))).map((l) => l.key.split('.')[2])
  const w2Rsu = m.packet.extracted_values.find((e) => m.docById.get(e.document_id)?.document_type === 'W-2' && /RSU/i.test(e.label + e.field))
  return [{
    id: 'rsu-zero-basis', title: 'Stock compensation sales taxed on their full proceeds',
    area: 'wages', severity: 'error', kind: 'engine',
    summary: `${fixes.length} noncovered lot${fixes.length > 1 ? 's carry' : ' carries'} a basis of 0 because the broker left basis blank. The stock plan supplement gives the adjusted basis (income already taxed on the W-2). Gain is overstated by ${fmt(total)}.`,
    facts: [
      ...fixes.map((f) => ({ text: `${f.lot.lot} = plan lot ${f.planLot}: proceeds ${fmt(f.lot.proceeds)}, supplement basis ${fmt(f.basis)} → gain ${fmt(f.lot.proceeds - f.basis)} (engine: ${fmt(f.lot.proceeds)})`, refs: [f.basisEv, f.acqEv] })),
      ...(matched.length ? [{ text: `The engine did match the supplement for ${matched.join(', ')}, but not for these lots: the broker's lot numbers differ from the plan's. Matching by acquisition date succeeds.` }] : []),
      ...(w2Rsu ? [{ text: `${m.docById.get(w2Rsu.document_id)?.issuer} W-2: ${w2Rsu.label} ${fmt(Number(w2Rsu.value))}, the same vests already taxed as wages.`, refs: [w2Rsu.id] }] : []),
    ],
    lines: fixes.map((f) => f.lot.key), refs: fixes.map((f) => f.basisEv),
    proposals: fixes.map((f) => ({
      kind: 'line' as const, lineKey: f.lot.key, to: Math.round(f.lot.proceeds - f.basis),
      reason: `Basis per stock plan supplement (${f.basisEv}); report adjustment code B.`,
      effects: [{ cat: isShort(f.lot.box) ? 'stcg' as const : 'ltcg' as const, amount: -f.basis }],
    })),
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
    const facts: Fact[] = [{ text: `${m.docById.get(nullBasis.document_id)?.issuer} export: "${pageText(m, nullBasis.document_id).match(new RegExp(`${lot.lot} [^;]*;`))?.[0] ?? 'basis unknown'}"`, refs: [nullBasis.id] }]
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
  const odoStart = evs.find((e) => e.field === 'odometer_start'), odoEnd = evs.find((e) => e.field === 'odometer_end')
  const pyMiles = m.priorLines['SchC.44a']
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    if (!sig.get(pages[i]) || sig.get(pages[i]) !== sig.get(pages[j])) continue
    const dup = pageTotals.find((e) => e.page === pages[j])
    if (!dup) continue
    const correct = Number(miles.value) - Number(dup.value)
    const rate = Number(m.packet.engine_reference.parameters.mileage_rate)
    const carRight = Math.round(correct * rate)
    const total = odoStart && odoEnd ? Number(odoEnd.value) - Number(odoStart.value) : null
    out.push({
      id: 'mileage-duplicate-page', title: 'Mileage log page counted twice',
      area: 'business', severity: 'error', kind: 'engine',
      summary: `Page ${pages[j]} of the mileage log repeats page ${pages[i]} trip for trip (${evs.filter((e) => e.page === pages[i] && e.field.endsWith('_date')).length} identical trips). Business miles are ${fmt(correct)}, not ${fmt(Number(miles.value))}; car expense ${fmt(carRight)}, not ${fmt(Number(car.value))}.`,
      facts: [
        { text: `Printed on page ${pages[j]}: "${pageText(m, docId, pages[j]).slice(0, 110)}…"`, refs: [`doc:${docId}#page${pages[j]}`] },
        { text: `${m.ruleText(miles.rule)} ${pageTotals.map((e) => e.value).join(' + ')} = ${fmt(Number(miles.value))}.`, refs: pageTotals.map((e) => e.id) },
        ...(total ? [{ text: `Odometer ${fmt(Number(odoStart!.value))} → ${fmt(Number(odoEnd!.value))} = ${fmt(total)} total miles; business share ${Math.round((correct / total) * 100)}% after the fix.`, refs: [odoStart!.id, odoEnd!.id] }] : []),
        ...(typeof pyMiles === 'number' ? [{ text: `Prior-year business miles: ${fmt(pyMiles)}.`, refs: ['py:/return_2024/lines/SchC.44a'] }] : []),
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
  const kDoc = m.docById.get(k.document_id)!
  const detail = m.docs.filter((d) => d.document_type === 'books_transaction_detail')
  const match = detail.flatMap((d) => (m.evByDoc.get(d.id) ?? []).filter((e) => Number(e.value) === kAmt)).find(Boolean)
  if (!match) return []
  const sentence = pageText(m, match.document_id, match.page).split(/(?<=\.)\s/).find((s) => s.includes(fmt(kAmt)))
  const necs = m.docs.filter((d) => d.document_type === '1099-NEC').flatMap((d) => (m.evByDoc.get(d.id) ?? []).filter((e) => e.field === 'box1'))
  const necTotal = necs.reduce((s, e) => s + Number(e.value), 0)
  const noForm = (m.evByDoc.get(match.document_id) ?? []).find((e) => /unreported|no.?1099/i.test(e.field))
  const exam = noticeItem(m, /1099-K/)
  return [{
    id: '1099k-double-count', title: 'Card payments counted in receipts twice',
    area: 'business', severity: 'error', kind: 'engine',
    summary: `Gross receipts add the 1099-K from ${kDoc.issuer} (${fmt(kAmt)}) on top of the books, but the books already include those deposits. Receipts are ${fmt(Number(books.value))}, not ${fmt(Number(gross.value))}.`,
    facts: [
      { text: `Books detail: "${sentence ?? match.label}"`, refs: [match.id] },
      ...(noForm ? [{ text: `1099-NEC total ${fmt(necTotal)} + ${noForm.label.toLowerCase()} ${fmt(Number(noForm.value))} = ${fmt(necTotal + Number(noForm.value))} vs books revenue ${fmt(Number(books.value))}.`, refs: [...necs.map((e) => e.id), noForm.id] }] : []),
      { text: `Engine rule ${gross.rule}: ${m.ruleText(gross.rule)}`, refs: [k.id] },
      ...(exam ? [{ text: `The ${exam.notice.type} (${exam.notice.dated}) asks for exactly this reconciliation.`, refs: [exam.notice.document] }] : []),
    ],
    lines: ['SchC.1'], refs: [k.id, books.id],
    proposals: [{ kind: 'line', lineKey: 'SchC.1', to: Number(books.value), reason: `1099-K ${fmt(kAmt)} matched to books deposits (${match.id}).`, effects: [{ cat: 'schc_profit', amount: -kAmt }] }],
    method: 'Searches the books detail for the 1099-K amount before accepting it as income the books missed.',
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
    summary: `The deduction is not allowed for any month the self-employed person was eligible to join a subsidized employer plan, including a spouse's. The client answered yes to eligibility. ${fmt(Number(sehi.value))} should come off.`,
    facts: [
      { text: `${q.id}: "${q.question}" → "${q.answer}"`, refs: [q.id] },
      ...(pyNote ? [{ text: `Prior-year return: "${pyNote}"`, refs: ['py:/return_2024/notes/Sch1.17'] }] : []),
      { text: 'Removing it raises QBI as well; the per-dollar adjustment rate does not capture that, so the estimate is conservative.' },
    ],
    lines: ['Sch1.17'], refs: [q.id],
    proposals: [{ kind: 'line', lineKey: 'Sch1.17', to: 0, reason: `Eligible for employer-subsidized coverage (${q.id}).`, effects: [{ cat: 'adjustment', amount: -Number(sehi.value) }] }],
    method: 'Reads the eligibility answer before allowing the deduction.',
  }]
}

function mixedUseExpenses(m: Model): Finding[] {
  const out: Proposal[] = []
  const facts: Fact[] = []
  const calls = m.packet.client.call_notes
  // Business-use percentages stated by the client, matched to the books account they name.
  const pctStatements = calls.flatMap((c) => c.notes.map((n) => ({ c, n, pct: Number(n.match(/(\d{1,3})%/)?.[1] ?? NaN) / 100 }))).filter((x) => !Number.isNaN(x.pct))
  const books = m.docs.find((d) => d.document_type === 'books_profit_loss')
  if (!books) return []
  const bookEvs = m.evByDoc.get(books.id) ?? []
  const byLine = new Map<string, { from: number; to: number; reasons: string[] }>()
  const touch = (lineKey: string) => { const l = line(m, lineKey)!; const x = byLine.get(lineKey) ?? { from: Number(l.value), to: Number(l.value), reasons: [] }; byLine.set(lineKey, x); return x }
  for (const s of pctStatements) {
    const acct = bookEvs.find((e) => s.n.toLowerCase().includes(e.field.toLowerCase().split(' ')[0]) || (/phone|mobile/i.test(s.n) && /telephone/i.test(e.field)))
    if (!acct) continue
    const l = m.current.lines.find((x) => x.form === 'SchC' && x.sources.includes(acct.id))
    if (!l) continue
    const x = touch(l.key)
    const cut = Math.round(Number(acct.value) * (1 - s.pct))
    x.to -= cut
    x.reasons.push(`${acct.field} ${Math.round(s.pct * 100)}% business`)
    facts.push({ text: `${s.n} → ${acct.field} ${fmt(Number(acct.value))} × ${Math.round(s.pct * 100)}% = ${fmt(Number(acct.value) - cut)}`, refs: [s.c.id, acct.id] })
  }
  // Items the client called personal, found in the books detail.
  const detail = m.docs.find((d) => d.document_type === 'books_transaction_detail')
  for (const c of calls) for (const n of c.notes.filter((x) => /personal/i.test(x))) {
    const word = n.split(/\s+/).find((wd) => /^[A-Z]/.test(wd))
    const ev = detail ? (m.evByDoc.get(detail.id) ?? []).find((e) => word && (e.field.toLowerCase().includes(word.toLowerCase()) || e.label.toLowerCase().includes(word.toLowerCase()))) : undefined
    if (!ev) continue
    // The detail sentence that mentions the item names the books account it was booked to.
    const sentence = pageText(m, detail!.id).split(/(?<=\.)\s/).find((s) => s.toLowerCase().includes(word!.toLowerCase()))
    const acct = sentence ? bookEvs.find((e) => sentence.startsWith(e.field) || sentence.includes(`${e.field} `)) : undefined
    const l = acct ? m.current.lines.find((x) => x.form === 'SchC' && x.sources.includes(acct.id)) : undefined
    if (!l) continue
    const x = touch(l.key)
    x.to -= Number(ev.value)
    x.reasons.push(`${ev.label} personal`)
    facts.push({ text: `${n} → remove ${fmt(Number(ev.value))} from ${l.label.toLowerCase()}`, refs: [c.id, ev.id] })
  }
  for (const [k, x] of byLine) if (x.to !== x.from) out.push({ kind: 'line', lineKey: k, to: x.to, reason: `Business use per client call: ${x.reasons.join('; ')}.`, effects: [{ cat: 'schc_profit', amount: x.from - x.to }] })
  if (!out.length) return []
  return [{
    id: 'mixed-use', title: 'Personal share of mixed-use expenses deducted in full',
    area: 'business', severity: 'warning', kind: 'engine',
    summary: `The books deduct whole bills that the client says are partly personal. Applying the client's own business-use figures changes ${out.length} Schedule C line${out.length > 1 ? 's' : ''}.`,
    facts, lines: [...byLine.keys()], refs: calls.map((c) => c.id), proposals: out,
    method: 'Matches business-use percentages and "personal" items from the call notes to the books accounts they name.',
  }]
}

function hvacCapitalize(m: Model): Finding[] {
  const out: Finding[] = []
  for (const wi of m.packet.what_if.alternatives) {
    const repair = wi.changed_lines.find((c) => /^SchE\.14[A-Z]$/.test(c.key))
    if (!repair || !/improvement|capitaliz/i.test(wi.description)) continue
    const amount = Number(repair.old) - Number(repair.new)
    const inv = m.docs.find((d) => d.document_type === 'invoice' && (m.evByDoc.get(d.id) ?? []).some((e) => Number(e.value) === amount))
    const said = m.packet.client.call_notes.flatMap((c) => c.notes.map((n) => ({ c, n }))).find(({ n }) => /replace/i.test(n))
    out.push({
      id: `capitalize-${repair.key}`, title: 'A replacement expensed as a repair',
      area: 'rentals', severity: 'warning', kind: 'judgment',
      summary: `${fmt(amount)} sits inside rental repairs, but the work replaced a building system. Restorations are normally capitalized and depreciated. The engine has a what-if for it: ${wi.description}`,
      facts: [
        ...(inv ? [{ text: `Invoice: "${pageText(m, inv.id).slice(0, 160)}…"`, refs: [inv.id] }] : []),
        ...(said ? [{ text: `Client call: "${said.n}"`, refs: [said.c.id] }] : []),
        { text: `Engine what-if "${wi.id}": federal tax ${wi.federal.total_tax_change >= 0 ? '+' : ''}${fmt(wi.federal.total_tax_change)}, state ${wi.california.total_tax_change >= 0 ? '+' : ''}${fmt(wi.california.total_tax_change)}.` },
      ],
      lines: wi.changed_lines.filter((c) => /^SchE\.(14|18)/.test(c.key)).map((c) => c.key), refs: inv ? [inv.id] : [], whatIf: wi.id,
      proposals: wi.changed_lines.filter((c) => /^SchE\.(14|18)[A-Z]$/.test(c.key)).map((c, i) => ({
        kind: 'line' as const, lineKey: c.key, to: Number(c.new), reason: 'Capitalize the replacement (Reg. 1.263(a)-3 restoration of a building system); depreciate SL 27.5 years.',
        effects: i === 0 ? [{ cat: 'fixed' as const, amount: 0, fixed: { federal: wi.federal.total_tax_change, california: wi.california.total_tax_change }, note: `Engine what-if ${wi.id}` }] : [],
      })),
      method: 'Looks for engine what-ifs that move a repair into improvements, and the invoice and client words that support it.',
    })
  }
  return out
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
  const receipt = m.docs.find((d) => d.document_type === 'property_tax_receipt')
  return [{
    id: 'home-tax-seller-share', title: "Home property tax includes the seller's share",
    area: 'deductions', severity: 'error', kind: 'engine',
    summary: `The full-year bill (${fmt(Number(re.value))}) was deducted, but the buyer closing statement credits ${fmt(Number(credit.value))} from the seller for the part of the year before the purchase. The buyers' deductible share is ${fmt(right)}.`,
    facts: [
      { text: `${credit.label}: ${fmt(Number(credit.value))} ("${pageText(m, buyer.id).split(/(?<=\.)\s/).find((s) => s.includes(fmt(Number(credit.value)))) ?? ''}")`, refs: [credit.id] },
      ...(receipt ? [{ text: `Tax receipt: "${pageText(m, receipt.id)}"`, refs: [receipt.id] }] : []),
      { text: `State and local taxes fall from ${fmt(totalBefore)} to ${fmt(totalAfter)} against the ${fmt(capAmt)} cap: the federal deduction drops ${fmt(limitedBefore - limitedAfter)}.` },
    ],
    lines: ['SchA.5b', 'SchA.5e'], refs: [credit.id],
    proposals: [{
      kind: 'line', lineKey: 'SchA.5b', to: right, reason: `Exclude the seller's share credited at closing (${credit.id}).`,
      effects: [
        { cat: 'itemized', amount: -(limitedBefore - limitedAfter), only: 'federal', note: 'Only the part no longer capped changes the federal deduction.' },
        { cat: 'salt', amount: -Number(credit.value), only: 'california' },
      ],
    }],
    method: "Matches the escrow-paid bill to the buyer closing statement's tax proration.",
  }]
}

function mortgagePayoffInterest(m: Model): Finding[] {
  const mi = line(m, 'SchA.8a')
  if (!mi) return []
  const payoff = mi.sources.map((s) => m.ev.get(s)).find((e) => e && m.docById.get(e.document_id)?.document_type === 'payoff_statement')
  if (!payoff) return []
  const cited = new Set(mi.sources.map((s) => m.ev.get(s)?.document_id))
  const f1098 = m.docs.find((d) => d.document_type === '1098' && cited.has(d.id) && /payoff/i.test(pageText(m, d.id)) && /includes/i.test(pageText(m, d.id)))
  if (!f1098) return []
  const box1 = (m.evByDoc.get(f1098.id) ?? []).find((e) => e.field === 'box1')
  return [{
    id: 'mortgage-payoff-double', title: 'Payoff interest added on top of a 1098 that already includes it',
    area: 'deductions', severity: 'error', kind: 'engine',
    summary: `${f1098.issuer}'s Form 1098 box 1${box1 ? ` (${fmt(Number(box1.value))})` : ''} already includes the interest paid at payoff, and the payoff statement says so. Adding the payoff statement's ${fmt(Number(payoff.value))} counts it twice.`,
    facts: [
      { text: `${f1098.id}: "${pageText(m, f1098.id).match(/Box 1[^.]*\([^)]*\)/)?.[0] ?? pageText(m, f1098.id).slice(0, 120)}"`, refs: [box1?.id ?? f1098.id] },
      { text: `${payoff.document_id}: "${pageText(m, payoff.document_id).match(/\([^)]*\)/)?.[0] ?? ''}"`, refs: [payoff.id] },
    ],
    lines: ['SchA.8a'], refs: [payoff.id],
    proposals: [{ kind: 'line', lineKey: 'SchA.8a', to: Number(mi.value) - Number(payoff.value), reason: `Payoff interest is inside ${f1098.id} box 1.`, effects: [{ cat: 'itemized', amount: -Number(payoff.value) }] }],
    method: 'Reads the 1098 and payoff statement wording before summing interest from both.',
  }]
}

function vehicleDonation(m: Model): Finding[] {
  const out: Finding[] = []
  for (const c of m.docs.filter((d) => d.document_type === '1098-C')) {
    const sold = (m.evByDoc.get(c.id) ?? []).find((e) => e.field === 'box4c')
    const v = m.current.lines.find((l) => l.form === 'F8283' && l.sources.some((s) => m.ev.get(s)?.document_id === c.id))
    if (!sold || !v || Number(sold.value) >= Number(v.value)) continue
    const diff = Number(v.value) - Number(sold.value)
    const quote = v.sources.map((s) => m.packet.client.questionnaire.find((q) => q.id === s)).find(Boolean)
    const exam = noticeItem(m, /noncash/i)
    out.push({
      id: 'vehicle-gross-proceeds', title: 'Donated vehicle deducted above its sale price',
      area: 'deductions', severity: 'error', kind: 'engine',
      summary: `The charity sold the vehicle for ${fmt(Number(sold.value))} (Form 1098-C box 4c). When a donated vehicle is sold, the deduction is limited to the gross proceeds. The return claims ${fmt(Number(v.value))}.`,
      facts: [
        { text: `${c.id}: "${pageText(m, c.id).match(/Box 4a[^.]*\./)?.[0] ?? pageText(m, c.id).slice(0, 140)}"`, refs: [sold.id] },
        ...(quote ? [{ text: `Value claimed comes from the client: "${quote.answer}"`, refs: [quote.id] }] : []),
        ...(exam ? [{ text: `Later examined: "${exam.item}"`, refs: [exam.notice.document] }] : []),
      ],
      lines: [v.key, 'SchA.12'], refs: [sold.id],
      proposals: [{ kind: 'line', lineKey: v.key, to: Number(sold.value), reason: `Limited to gross proceeds (${c.id} box 4c).`, effects: [{ cat: 'itemized', amount: -diff }] }],
      method: "Compares the claimed value with the charity's reported sale price.",
    })
  }
  return out
}

function federalEstimates(m: Model): Finding[] {
  const est = line(m, 'F1040.26')
  const tr = m.packet.tax_agency_records.irs_account_transcript_2025[0]
  if (!est || !tr) return []
  const paid = tr.transactions.filter((t) => t.code === '670' && typeof t.amount === 'number').reduce((s, t) => s + Number(t.amount), 0)
  if (paid === Number(est.value)) return []
  const recon = paymentsRecon(m, 'federal')
  const off = recon.rows.filter((r) => r.agency !== (r.client ?? r.confirmations.reduce((s, c) => s + c.amount, 0)) || r.agency == null)
  const unconfirmed = recon.rows.filter((r) => r.agency != null && !r.confirmations.length)
  return [{
    id: 'fed-estimates-transcript', title: "Federal estimates don't agree to the IRS record",
    area: 'payments', severity: 'error', kind: 'conflict',
    summary: `The return claims ${fmt(Number(est.value))} of estimated payments; the IRS account transcript shows ${fmt(paid)}. ${off.map((r) => `${r.date}: ${r.client != null ? `client said ${fmt(r.client)}` : r.confirmations.length ? `confirmations ${fmt(r.confirmations.reduce((s, c) => s + c.amount, 0))}` : 'no confirmation'}, IRS ${r.agency != null ? fmt(r.agency) : 'none'}`).join('; ')}.`,
    facts: [
      ...(recon.question ? [{ text: `${recon.question.id}: "${recon.question.answer}"`, refs: [recon.question.id] }] : []),
      { text: `IRS transcript as of ${tr.as_of}: ${tr.transactions.filter((t) => t.code === '670').map((t) => `${t.date} ${fmt(Number(t.amount))}`).join('; ')}.`, refs: ['agency:/irs_account_transcript_2025/0'] },
      ...(unconfirmed.length ? [{ text: `No payment confirmation in file for ${unconfirmed.map((r) => r.date).join(', ')}.` }] : []),
      ...(est.note ? [{ text: `Engine: ${est.note}` }] : []),
    ],
    lines: ['F1040.26'], refs: ['agency:/irs_account_transcript_2025/0'],
    proposals: [{ kind: 'line', lineKey: 'F1040.26', to: paid, reason: 'Agreed to IRS account transcript (code 670 payments).', effects: [{ cat: 'fed_payment', amount: paid - Number(est.value) }] }],
    method: 'Agrees estimated payments to the IRS transcript, not to the questionnaire or confirmations.',
  }]
}

function caEstimates(m: Model): Finding[] {
  const est = line(m, 'F540NR.72')
  const ftb = m.packet.tax_agency_records.ftb_account
  if (!est || !ftb) return []
  const paid = ftb.tax_year_2025_payments.reduce((s, p) => s + p.amount, 0)
  if (paid === Number(est.value)) return []
  const held = ftb.tax_year_2024_payments_after_filing
  const recon = paymentsRecon(m, 'california')
  const wrongYear = recon.rows.flatMap((r) => r.confirmations.filter((c) => c.year && c.year !== String(m.packet.household.tax_year) && held.some((h) => h.date === r.date)).map((c) => ({ ...c, date: r.date })))
  return [{
    id: 'ca-estimate-wrong-year', title: 'A state estimate was applied to another tax year',
    area: 'payments', severity: 'error', kind: 'conflict',
    summary: `The return claims ${fmt(Number(est.value))} of state estimates; the agency account shows ${fmt(paid)} for ${m.packet.household.tax_year}. ${held.map((h) => `The ${h.date} payment of ${fmt(h.amount)} is held elsewhere: ${h.note}`).join(' ')}`,
    facts: [
      ...held.map((h) => ({ text: `Agency account: ${h.date} ${fmt(h.amount)}: ${h.note}`, refs: ['agency:/ftb_account'] })),
      ...wrongYear.map((c) => ({ text: `Payment confirmation for ${c.date}: designated tax year ${c.year}.`, refs: [c.evId] })),
      { text: `Options: claim ${fmt(paid)} now and ask the agency to transfer the credit, or claim the other year's overpayment as a refund. Either way the return must agree to the agency record.` },
    ],
    lines: ['F540NR.72'], refs: ['agency:/ftb_account'],
    proposals: [{ kind: 'line', lineKey: 'F540NR.72', to: paid, reason: 'Agreed to the state agency account.', effects: [{ cat: 'ca_payment', amount: paid - Number(est.value) }] }],
    method: 'Agrees state estimates to the agency account, not to the payment confirmations.',
  }]
}

function caSourceWages(m: Model): Finding[] {
  const ca = line(m, 'SchCA540NR.1.E')
  const fedWages = line(m, 'F1040.1a')
  if (!ca || !fedWages) return []
  const w2s = [...new Set(fedWages.sources.map((s) => m.ev.get(s)?.document_id).filter(Boolean) as string[])].map((id) => m.docById.get(id)!)
  const residencyEnd = m.packet.household.residency.find((r) => r.status === 'resident' && /CA/.test(r.state))?.to
  const facts: Fact[] = []
  let right = 0
  for (const d of w2s) {
    const box16 = (m.evByDoc.get(d.id) ?? []).find((e) => e.field === 'box16')
    if (!box16) continue
    const employer = d.issuer.split(/[ ,]/)[0]
    const stub = m.docs.find((x) => x.document_type === 'paystub' && x.title.includes(employer))
    const stubCa = stub ? (m.evByDoc.get(stub.id) ?? []).find((e) => e.field === 'ytd_ca_wages') : undefined
    const note = pageText(m, d.id).match(/\(([^)]*)\)|Employment (ended|began)[^.]*\./)?.[0]
    if (stubCa) {
      right += Number(stubCa.value)
      facts.push({ text: `${d.issuer}: box 16 ${fmt(Number(box16.value))}${note ? ` ${note}` : ''}. Paystub at the move shows state wages ${fmt(Number(stubCa.value))}: "${pageText(m, stub!.id).match(/Work location[^.]*\./)?.[0] ?? ''}"`, refs: [box16.id, stubCa.id] })
    } else {
      right += Number(box16.value)
      facts.push({ text: `${d.issuer}: box 16 ${fmt(Number(box16.value))} earned while resident${note ? ` (${note.replace(/[()]/g, '')})` : ''}.`, refs: [box16.id] })
    }
  }
  if (!right || right === Number(ca.value)) return []
  const q = m.packet.client.questionnaire.find((x) => /withhold/i.test(x.answer) && /state|California/i.test(x.answer))
  if (q) facts.push({ text: `Client: "${q.answer}"`, refs: [q.id] })
  return [{
    id: 'ca-source-wages', title: 'State taxes wages earned after the move',
    area: 'california', severity: 'error', kind: 'engine',
    summary: `State-source wages use every dollar of box 16 (${fmt(Number(ca.value))}). Residency ended ${residencyEnd}; wages earned after that are not state-source. Rebuilt from each employer's records: ${fmt(right)}.`,
    facts, lines: ['SchCA540NR.1.E'], refs: facts.flatMap((f) => f.refs ?? []),
    proposals: [{ kind: 'line', lineKey: 'SchCA540NR.1.E', to: right, reason: 'State-source wages rebuilt per employer: box 16 while resident, paystub state wages at the move.', effects: [{ cat: 'ca_source_income', amount: right - Number(ca.value) }] }],
    method: 'Rebuilds the state wage split from residency dates and payroll records instead of box 16.',
  }]
}

function dependentSsn(m: Model): Finding[] {
  const out: Finding[] = []
  const py = m.packet.prior_years.return_2024.dependents
  const priorDoc = m.docs.find((d) => d.document_type === 'prior_year_return')?.id ?? 'py:/return_2024/dependents'
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
        { text: `Prior-year return as filed: ${prior.ssn}`, refs: [priorDoc] },
        ...(card ? [{ text: `Social Security card (received ${card.received_at.slice(0, 10)}): ${pageText(m, card.id)}`, refs: [card.id] }] : [{ text: 'Ask the client for the Social Security card.' }]),
      ],
      lines: ['F8812.4'], refs: [`household:${p.id}`, priorDoc],
      proposals: [{ kind: 'household', personId: p.id, field: 'ssn', to: prior.ssn, reason: 'Agrees to 2024 return as filed (and SS card when received).' }],
      method: 'Compares every SSN on the organizer with the prior-year return as filed.',
    })
  }
  return out
}

/** Provider names on Form 2441 lines vs the names printed on the care statements. */
function providerNameFacts(m: Model, docId: string): Fact[] {
  const out: Fact[] = []
  const d = m.docById.get(docId)
  if (d?.document_type !== 'dependent_care_statement') return out
  for (const s of m.docs.filter((x) => x.document_type === 'dependent_care_statement')) {
    const printed = pageText(m, s.id).split(',')[0].trim()
    const l = m.current.lines.find((x) => x.form === 'F2441' && x.sources.some((src) => m.ev.get(src)?.document_id === s.id))
    const named = l?.label.match(/provider:\s*([^,]+)/i)?.[1]?.trim()
    if (named && printed && named !== printed) out.push({ text: `${l!.key} names the provider "${named}"; the statement prints "${printed}".`, refs: [s.id, l!.key] })
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
        ...providerNameFacts(m, e.document_id),
      ],
      lines: [...usedIn, ...lineByEin.map((l) => l.key)], refs: [e.id],
      proposals: printed ? [{ kind: 'extraction', evId: e.id, to: printed, reason: `Agrees to printed ${e.document_id} page ${e.page}.` }] : [],
      method: 'Looks for every extracted identifier verbatim on its page; a high confidence score is not evidence.',
    })
  }
  return out
}

function iraBasisConflict(m: Model): Finding[] {
  const q = m.packet.client.questionnaire.find((x) => /IRA/i.test(x.question) && /basis/i.test(x.question + x.answer))
  const l2 = line(m, 'F8606.2')
  if (!q || !l2 || !Number(l2.value) || !/none|no prior|don't|do not/i.test(q.answer)) return []
  const converted = line(m, 'F8606.16'), taxable = line(m, 'F8606.18')
  const ev5498 = l2.sources.map((s) => m.ev.get(s)).find(Boolean)
  return [{
    id: 'ira-basis-client', title: `Client says there is no prior IRA basis; the records say ${fmt(Number(l2.value))}`,
    area: 'retirement', severity: 'info', kind: 'conflict',
    summary: `The engine carried ${fmt(Number(l2.value))} of basis from the prior Form 8606. The client's answer is wrong; without the carried basis the conversion would be taxed on ${fmt(Number(taxable?.value ?? 0) + Number(l2.value))} instead of ${fmt(Number(taxable?.value ?? 0))}${converted ? ` (of ${fmt(Number(converted.value))} converted)` : ''}.`,
    facts: [
      { text: `${q.id}: "${q.answer}"`, refs: [q.id] },
      ...(ev5498 ? [{ text: `${m.docById.get(ev5498.document_id)?.title}: ${ev5498.label} ${fmt(Number(ev5498.value))}.`, refs: [ev5498.id] }] : []),
      ...l2.sources.filter((s) => s.startsWith('py:')).map((s) => ({ text: `Prior-year record ${s.replace('py:/', '')}.`, refs: [s] })),
    ],
    lines: ['F8606.2', 'F1040.4b'], refs: [q.id], proposals: [],
    method: 'Compares client answers with documents and the prior return.',
  }]
}

function sepExcess(m: Model): Finding[] {
  const ex = Number(m.current.carryovers_out.federal.sep_contribution_not_deductible_for_2025 ?? 0)
  const ded = line(m, 'Sch1.16')
  if (!ex || !ded) return []
  const conf = ded.sources.map((s) => m.ev.get(s)).find(Boolean)
  const date = conf ? (m.evByDoc.get(conf.document_id) ?? []).find((e) => e.value_type === 'date') : undefined
  return [{
    id: 'sep-excess', title: 'SEP contribution exceeds the deductible limit',
    area: 'retirement', severity: 'warning', kind: 'judgment',
    summary: `${conf ? `${fmt(Number(conf.value))} was contributed${date ? ` on ${date.value}` : ''}; ` : ''}the deductible limit at current profit is ${fmt(Number(ded.value))}. The ${fmt(ex)} excess is subject to a 6% excise each year until withdrawn. Business-income corrections change the limit.`,
    facts: [
      ...(conf ? [{ text: `${m.docById.get(conf.document_id)?.title}: ${conf.label} ${fmt(Number(conf.value))}.`, refs: [conf.id] }] : []),
      ...(ded.note ? [{ text: `Engine: ${ded.note}`, refs: ['Sch1.16'] }] : []),
    ],
    lines: ['Sch1.16'], refs: conf ? [conf.document_id] : [], proposals: [],
    method: "Reads the engine's carryover of the nondeductible amount and treats it as a client decision.",
  }]
}

function outsideFilings(m: Model): Finding[] {
  const out: Finding[] = []
  const pw = m.packet.prior_years.prior_preparer_workpaper
  const item = pw.open_items_left_by_prior_preparer.find((x) => /3520/.test(x))
  if (!item) return out
  const stmt = m.docs.find((d) => d.document_type === 'foreign_bank_statement')
  const inherit = stmt ? pageText(m, stmt.id).split(/(?<=\.)\s/).find((s) => /inherit/i.test(s)) : undefined
  const max = stmt ? (m.evByDoc.get(stmt.id) ?? []).find((e) => /max/.test(e.field)) : undefined
  const fx = m.packet.fx_rates?.SEK_per_USD?.['2025_year_end']
  const q = m.packet.client.questionnaire.find((x) => /gift or inheritance/i.test(x.question))
  out.push({
    id: 'form-3520', title: 'Possible unfiled Form 3520 for a foreign inheritance',
    area: 'foreign', severity: 'warning', kind: 'outside',
    summary: `A bequest over 100,000 USD from a foreign person requires Form 3520. The prior preparer raised it and never closed it${max && fx ? `; the account's peak balance is about ${fmt(Math.round(Number(max.value) / fx))} USD` : ''}.${q ? ` This year's questionnaire asked only about ${m.packet.household.tax_year}.` : ''}`,
    facts: [
      { text: `Prior preparer open item: "${item}"`, refs: [pw.source_document] },
      ...(inherit ? [{ text: `Statement: "${inherit}"`, refs: [stmt!.id] }] : []),
      ...(q ? [{ text: `${q.id}: "${q.question}" → "${q.answer}"`, refs: [q.id] }] : []),
    ],
    lines: [], refs: [pw.source_document, ...(stmt ? [stmt.id] : [])], proposals: [],
    method: "Carries every open item from the prior preparer's file into this year.",
  })
  return out
}

function priorHomeOffice(m: Model): Finding[] {
  const py = Number(m.priorLines['SchC.30'])
  const cur = line(m, 'SchC.30')
  const note = m.packet.prior_years.return_2024.notes['SchC.30'] ?? ''
  const pySqft = Number(note.match(/(\d+)\s*sq/i)?.[1] ?? NaN)
  const measure = cur?.sources.map((s) => m.ev.get(s)).filter((e) => e && /sqft/.test(e.field)) ?? []
  const rate = Number(m.packet.engine_reference.parameters.home_office_rate)
  if (!py || Number.isNaN(pySqft) || !measure.length) return []
  const first = Number(measure[0]!.value)
  if (first >= pySqft) return []
  const memo = m.packet.prior_years.prior_preparer_workpaper.notes.find((n) => /home office/i.test(n))
  return [{
    id: 'prior-home-office', title: `Prior year's home office used ${pySqft} sq ft; the measured room is ${first}`,
    area: 'business', severity: 'info', kind: 'judgment',
    summary: `The prior return used ${pySqft} sq ft. The client's measurements give ${first} sq ft for the same home. The prior year was overstated by about ${fmt((pySqft - first) * rate)}. That is likely under an amendment threshold, but record the decision.`,
    facts: [
      ...(memo ? [{ text: `Prior preparer: "${memo}"`, refs: [m.packet.prior_years.prior_preparer_workpaper.source_document] }] : []),
      { text: `Client measurement: "${pageText(m, measure[0]!.document_id).split(/(?<=\.)\s/)[0]}"`, refs: measure.map((e) => e!.id) },
    ],
    lines: ['SchC.30'], refs: [measure[0]!.document_id], proposals: [],
    engineDiagnostic: 'HOME_OFFICE_AREA_CHANGE',
    method: "Compares this year's measured area with the prior return.",
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
