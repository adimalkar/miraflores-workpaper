import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check, Lock, Send, Printer, FileWarning, Mail, CalendarRange, Unlock, AlertOctagon, CircleDashed, ExternalLink } from 'lucide-react'
import { useFindingState, useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { useReadiness } from '../store/readiness'
import { Button, Card, Chip, Modal, PageHeader, cx } from '../components/ui'
import { money, signed, date } from '../lib/format'
import { personName } from '../store/permissions'

export function Filing() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const r = useReadiness()
  const record = useStore((s) => s.record)
  const navigate = useStore((s) => s.navigate)
  const has = (a: string) => w.filing.some((f) => f.action === a)
  const last = (a: string) => [...w.filing].reverse().find((f) => f.action === a)
  const theo = m.packet.household.people.find((p) => p.id === 'theo')!
  const ssnOk = (w.ssnFix.get('theo') ?? theo.ssn) === m.packet.prior_years.return_2024.dependents.find((d) => d.name === theo.name)?.ssn
  const fedBal = m.current.summary.federal.balance_due + w.effectTotal.federalBalance
  const caBal = m.current.summary.california.balance_due + w.effectTotal.californiaBalance
  const accepted = has('efile-accepted')
  const preApproval = r.blockers.filter((b) => b.id !== 'client')
  const canSend = preApproval.every((b) => b.done)
  const [packet, setPacket] = useState(false)
  const [copy, setCopy] = useState(false)

  const transmit = () => {
    record({ kind: 'filing', action: 'efile-submitted', detail: { federal: fedBal, california: caBal } })
    if (!ssnOk) {
      const rej = m.packet.tax_agency_records.efile.find((e) => e.status === 'rejected')
      record({ kind: 'filing', action: 'efile-rejected', detail: { code: rej?.errors?.[0].code, message: rej?.errors?.[0].message, submission: rej?.submission_id } }, { toast: 'E-file rejected: R0000-504-02' })
    } else {
      const ok = m.packet.tax_agency_records.efile.filter((e) => e.status === 'accepted')
      record([
        { kind: 'filing', action: 'efile-accepted', detail: { submissions: ok.map((e) => `${e.jurisdiction} ${e.submission_id}`) } },
        { kind: 'filing', action: 'frozen' },
      ], { toast: 'Accepted by IRS and FTB. Workpaper frozen at filing.' })
    }
  }

  const steps: { id: string; title: string; done: boolean; body: ReactNode }[] = [
    {
      id: 'ext', title: 'Extension', done: true,
      body: <p className="text-sm text-ink-600">Form 4868 filed {date('2026-04-14')} with 36,000 (v2 estimate 35,728, rounded up). FTB 3519 with 0. IRS transcript shows code 460 (extended to Oct 15) and the 670 payment.</p>,
    },
    {
      id: 'approval', title: 'Send to the client for approval', done: has('sent-for-approval'),
      body: (
        <div>
          <ul className="mb-3 space-y-1">{preApproval.map((b) => <li key={b.id} className="flex items-center gap-2 text-sm">{b.done ? <Check size={14} className="text-tick" /> : <CircleDashed size={14} className="text-pencil" />}<span className={b.done ? 'text-ink-600' : 'text-ink'}>{b.label}</span><span className="ml-auto text-2xs text-ink-500">{b.detail}</span></li>)}</ul>
          {has('sent-for-approval') ? <Chip tone="tick">Sent {date(last('sent-for-approval')!.at)} by {personName(m, last('sent-for-approval')!.by)}</Chip> : (
            <Button variant="primary" disabled={!perms.canFile || !canSend} title={!canSend ? 'Clear the items above first.' : ''} onClick={() => record({ kind: 'filing', action: 'sent-for-approval', detail: { federal: fedBal, california: caBal } }, { toast: 'Sent to the client portal for approval' })}>Send for approval</Button>
          )}
          {!canSend && <p className="mt-2 text-2xs text-ink-500">Open review notes block filing, and unapproved adjustments over 1,000 need the partner.</p>}
        </div>
      ),
    },
    {
      id: 'sign', title: 'Client approval and e-file signature (8879)', done: has('client-approved'),
      body: has('client-approved')
        ? <p className="text-sm text-ink-600">Signed by {personName(m, last('client-approved')!.by)} on {date(last('client-approved')!.at, true)}. {(() => { const f = Number(last('client-approved')!.detail?.federal ?? fedBal); const c = Number(last('client-approved')!.detail?.california ?? caBal); return `Federal ${f > 0 ? 'balance due' : 'refund'} ${money(Math.abs(f))}, California ${c > 0 ? 'balance due' : 'refund'} ${money(Math.abs(c))}.` })()}</p>
        : <p className="text-sm text-ink-600">{has('sent-for-approval') ? 'Waiting for Ngozi or Erik in the client portal (switch role to sign as the client).' : 'Available once the return is sent.'}</p>,
    },
    {
      id: 'efile', title: 'Transmit', done: accepted,
      body: (
        <div className="space-y-2">
          {w.filing.filter((f) => f.action === 'efile-rejected').map((f, i) => (
            <div key={i} className="rounded-lg bg-pencil-soft p-3 text-sm ring-1 ring-pencil/30">
              <div className="flex items-center gap-2 font-medium text-pencil-deep"><AlertOctagon size={14} /> Rejected {String(f.detail?.code)} · {date(f.at, true)}</div>
              <p className="mt-1 text-ink-700">{String(f.detail?.message)}</p>
              <button onClick={() => navigate('/checks/ssn-theo')} className="mt-1 text-xs font-medium underline">The check that predicted this →</button>
            </div>
          ))}
          {accepted ? <p className="text-sm text-tick-deep">Accepted · {(last('efile-accepted')!.detail?.submissions as string[] | undefined)?.join(' · ')}</p> : (
            <Button variant="primary" icon={<Send size={14} />} disabled={!perms.canFile || !has('client-approved')} onClick={transmit}>Transmit federal + California</Button>
          )}
          {!ssnOk && has('client-approved') && <p className="text-2xs text-pencil">Warning: Theo's SSN still differs from the 2024 return.</p>}
        </div>
      ),
    },
    {
      id: 'freeze', title: 'Freeze at filing', done: !!w.frozenAt,
      body: w.frozenAt ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-600"><Lock size={14} /> Frozen {date(w.frozenAt, true)}. The filed return cannot change; an amendment is layered on top.
          <Button size="sm" icon={<Unlock size={13} />} disabled={!perms.canApproveLarge} title={perms.canApproveLarge ? '' : 'Only the partner can open an amendment.'} onClick={() => record({ kind: 'filing', action: 'amendment-opened', detail: { form: '1040-X / 540X' } }, { toast: 'Amendment opened on top of the filed return' })}>Open amendment</Button>
        </div>
      ) : has('amendment-opened') ? <p className="text-sm text-amber">Amendment in progress (1040-X / 540X). The filed version is preserved in the event log.</p> : <p className="text-sm text-ink-600">Happens automatically when both returns are accepted.</p>,
    },
    {
      id: 'copy', title: "Client's copy", done: has('client-copy-issued'),
      body: <div className="flex gap-2"><Button size="sm" icon={<Printer size={13} />} onClick={() => setCopy(true)}>Preview client copy</Button>{has('client-copy-issued') && <Chip tone="tick">Issued {date(last('client-copy-issued')!.at)}</Chip>}</div>,
    },
  ]

  return (
    <div>
      <PageHeader eyebrow="Filing and after" title="Filing" sub="From extension to e-file, the client's copy, the notice two years later, and next year's plan." right={<Chip tone={accepted ? 'tick' : 'amber'} className="!px-3 !py-1 !text-xs">{accepted ? 'Filed' : r.stage}</Chip>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className={cx('p-5', s.done && 'bg-white/70')}>
                <div className="mb-2 flex items-center gap-3">
                  <span className={cx('grid h-7 w-7 place-items-center rounded-full text-xs font-semibold', s.done ? 'bg-tick text-white' : 'bg-ink-100 text-ink-500')}>{s.done ? <Check size={14} /> : i + 1}</span>
                  <h3 className="display font-semibold">{s.title}</h3>
                </div>
                <div className="pl-10">{s.body}</div>
              </Card>
            </motion.li>
          ))}
        </ol>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="eyebrow mb-1">Amounts on approval</div>
            <div className="flex justify-between text-sm"><span>{fedBal > 0 ? 'Federal balance due' : 'Federal refund'}</span><span className="num font-semibold">{money(Math.abs(fedBal))}</span></div>
            <div className="flex justify-between text-sm"><span>{caBal > 0 ? 'California balance due' : 'California refund'}</span><span className="num font-semibold">{money(Math.abs(caBal))}</span></div>
            <p className="mt-2 text-2xs text-ink-500">Includes workpaper adjustments ({signed(w.effectTotal.federalBalance)} federal, {signed(w.effectTotal.californiaBalance)} California) estimated at v3 rates.</p>
          </Card>
          <PostFiling fedBal={fedBal} onPacket={() => setPacket(true)} />
          <OutsideFilings />
        </div>
      </div>
      <NoticePacket open={packet} onClose={() => setPacket(false)} />
      <ClientCopy open={copy} onClose={() => setCopy(false)} fedBal={fedBal} caBal={caBal} />
    </div>
  )
}

function PostFiling({ fedBal, onPacket }: { fedBal: number; onPacket: () => void }) {
  const { m } = useModel()
  const w = useWork()
  const record = useStore((s) => s.record)
  const perms = usePerms()
  const accepted = w.filing.some((f) => f.action === 'efile-accepted')
  const days = (new Date('2026-07-20').getTime() - new Date('2026-04-15').getTime()) / 86400000
  const rate = Number(m.packet.post_filing_rates.irs_underpayment_interest_rate_annual)
  const ftp = Number(m.packet.post_filing_rates.irs_failure_to_pay_penalty_per_month)
  const interest = Math.max(0, fedBal) * rate * (days / 365)
  const penalty = Math.max(0, fedBal) * ftp * Math.ceil(days / 30)
  const fed = Number(m.current.summary.federal.total_tax) + w.effectTotal.federalTax
  const ca = Number(m.current.summary.california.total_tax) + w.effectTotal.californiaTax
  const notice = m.packet.tax_agency_records.notices.find((n) => n.type.startsWith('Letter 566'))
  return (
    <>
      <Card className="p-5">
        <div className="mb-2 flex items-center gap-2"><FileWarning size={15} /><h3 className="display font-semibold">After filing</h3></div>
        <ul className="space-y-2 text-sm text-ink-600">
          {fedBal > 0
            ? <li>Balance of <b className="num text-ink">{money(fedBal)}</b> paid 07/20/2026 by direct debit, {Math.round(days)} days after April 15: interest ≈ <b className="num text-ink">{money(interest)}</b> and failure-to-pay ≈ <b className="num text-ink">{money(penalty)}</b>, which the IRS assessed on 08/03 (codes 196/276). The extension extended the time to file, not to pay.</li>
            : <li>With the workpaper's corrections the April extension payment more than covered the tax: a federal refund of <b className="num text-ink">{money(-fedBal)}</b> instead of the scripted balance due, so no interest or failure-to-pay penalty. The engine's v3 balance ({money(m.current.summary.federal.balance_due)}) would have cost ≈ {money(m.current.summary.federal.balance_due * rate * (days / 365) + m.current.summary.federal.balance_due * ftp * Math.ceil(days / 30))}.</li>}
          <li>California refund issued 08/21/2026 by direct deposit.</li>
          <li>Quality review selected this return on 01/04/2027 (Sam Adeyemi).</li>
        </ul>
      </Card>
      <Card className="p-5">
        <div className="mb-2 flex items-center gap-2"><Mail size={15} /><h3 className="display font-semibold">{notice?.type}</h3></div>
        <p className="text-xs text-ink-500">Dated {notice?.dated} · response due {notice?.response_due}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-700">{notice?.items_under_examination?.map((x) => <li key={x}>{x}</li>)}</ul>
        <Button size="sm" className="mt-3" variant="primary" onClick={onPacket}>Build the response record</Button>
      </Card>
      <Card className="p-5">
        <div className="mb-2 flex items-center gap-2"><CalendarRange size={15} /><h3 className="display font-semibold">Plan 2026</h3></div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-600">Federal safe harbor (110% of 2025)</span><span className="num">{money(fed * 1.1)}</span></div>
          <div className="flex justify-between text-xs text-ink-500"><span>Four installments: 4/15, 6/15, 9/15, 1/15</span><span className="num">{money((fed * 1.1) / 4)} each</span></div>
          <div className="flex justify-between pt-1"><span className="text-ink-600">California (110% of 2025 tax)</span><span className="num">{money(ca * 1.1)}</span></div>
          <div className="text-xs text-ink-500">30 / 40 / 30% on 4/15, 6/15, 1/15. California-source income only from 2026: the Sacramento rental and Ridgeline's share.</div>
        </div>
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ink-600">{(m.packet.planning_reference_2026.known_2026_changes_for_this_household as string[]).map((x) => <li key={x}>{x}</li>)}</ul>
        <Button size="sm" className="mt-3" disabled={!perms.canEdit || !accepted} title={accepted ? '' : 'Roll forward after filing.'} onClick={() => record({ kind: 'filing', action: 'rolled-forward', detail: { carryovers: m.current.carryovers_out, openFindings: true } }, { toast: '2026 file created with carryovers, assets, basis and open items' })}>Roll forward to 2026</Button>
        {w.filing.some((f) => f.action === 'rolled-forward') && <p className="mt-2 text-2xs text-tick-deep">Rolled forward. Carryovers, the asset register, basis records, the judgment log and every open item travel with their history.</p>}
      </Card>
    </>
  )
}

function OutsideFilings() {
  const items = [
    { t: 'FinCEN 114 (FBAR)', d: 'Sparbanken max 1.45m SEK. Due 10/15/2026 (automatic extension). Outside the engagement; the client files it. Tell them in writing.', s: 'Client' },
    { t: 'Forms 1099-NEC to two contractors', d: 'Quintero 4,800 and Patel 2,600, paid by ACH. Due 02/02/2026, now late. Outside the engagement; offer to prepare.', s: 'Late' },
    { t: 'Form 3520 for 2023 inheritance', d: "Possibly required for the 2023 bequest from Erik's mother. The prior preparer never resolved it.", s: 'Investigate' },
    { t: 'Oregon (Woodworks composite)', d: 'Composite return filed by the S corp, 1,580 paid on Erik\'s behalf. No individual Oregon return.', s: 'Covered' },
    { t: 'Arizona (Ridgeline composite)', d: 'Composite filed by the partnership. No individual Arizona return.', s: 'Covered' },
    { t: "Ada's own 2025 Form 1040", d: 'Summer W-2 4,100. She checked “can be claimed as a dependent”, which agrees with this return.', s: 'Agrees' },
    { t: 'Woodworks 1120-S', d: 'Prepared by Willamette CPA Group. K-1s only in this packet.', s: 'Related' },
  ]
  return (
    <Card className="p-5">
      <h3 className="display mb-1 font-semibold">Outside filings identified</h3>
      <p className="mb-3 text-xs text-ink-500">Every return or form this household or its entities must file that isn't part of this engagement.</p>
      <ul className="space-y-2.5">{items.map((x) => (
        <li key={x.t} className="text-sm"><div className="flex items-center gap-2 font-medium">{x.t}<Chip tone={x.s === 'Late' || x.s === 'Investigate' ? 'pencil' : x.s === 'Client' ? 'amber' : 'tick'} className="ml-auto">{x.s}</Chip></div><p className="text-xs text-ink-600">{x.d}</p></li>
      ))}</ul>
    </Card>
  )
}

function NoticePacket({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const record = useStore((s) => s.record)
  const openDoc = useStore((s) => s.openDoc)
  const veh = w.line('F8283.A1.vehicle')
  const stock = w.line('F8283.A1.stock')
  const gross = w.line('SchC.1')
  const vehFixed = Number(veh?.value) === 2900
  const grossFixed = Number(gross?.value) === 151300
  const D = ({ id }: { id: string }) => <button onClick={() => openDoc({ docId: id })} className="num inline-flex items-center gap-0.5 rounded bg-ink-50 px-1 text-2xs ring-1 ring-ink-200">{id}<ExternalLink size={9} /></button>
  return (
    <Modal open={open} onClose={onClose} width={760} title="Response record · IRS Letter 566 (tax year 2025)" footer={<>
      <Button variant="ghost" onClick={onClose}>Close</Button>
      <Button icon={<Printer size={13} />} onClick={() => window.print()}>Print</Button>
      <Button variant="primary" onClick={() => { record({ kind: 'filing', action: 'notice-response-prepared', detail: { notice: 'N-2025-L566' } }, { toast: 'Response record saved to the file' }); onClose() }}>Save to file</Button>
    </>}>
      <div className="space-y-5 text-sm">
        <p className="text-ink-600">Everything an examiner needs, drawn from the frozen workpaper. Nobody has to find the 2026 preparer or reopen the season.</p>
        <section>
          <h4 className="display mb-1 font-semibold">1 · Noncash charitable contributions (Schedule A line 12, Form 8283)</h4>
          <table className="w-full text-xs"><tbody>
            <tr className="border-t border-ink-100"><td className="py-1.5">200 sh Northlake Total Market Index Fund to Austin Community Foundation DAF, 12/05/2025</td><td className="num text-right">{money(Number(stock?.value))}</td><td className="pl-2"><D id="D65" /></td></tr>
            <tr className="border-t border-ink-100"><td className="py-1.5">Valuation: high/low average 72.50 × 200 on the transfer date; held since 04/2019 (long-term, publicly traded, no appraisal needed). Contemporaneous acknowledgment: no goods or services.</td><td /><td /></tr>
            <tr className="border-t border-ink-100"><td className="py-1.5">2012 Subaru Outback to Lone Star Kids Auto Donation, 08/20/2025; sold 09/09/2025 for 2,900 (1098-C box 4c)</td><td className={cx('num text-right', !vehFixed && 'text-pencil')}>{money(Number(veh?.value))}</td><td className="pl-2"><D id="D66" /></td></tr>
          </tbody></table>
          {!vehFixed && <p className="mt-2 rounded-md bg-pencil-soft px-2 py-1.5 text-xs text-pencil-deep">Exposure: the return claimed {money(Number(veh?.value))} for the vehicle, but the deduction is limited to 2,900 gross proceeds. Expect a 3,100 disallowance. See the check “Donated car deducted at its blue-book value”, which was {fs.find((x) => x.f.id === 'vehicle-gross-proceeds')?.status}.</p>}
        </section>
        <section>
          <h4 className="display mb-1 font-semibold">2 · Schedule C gross receipts reconciled to information returns</h4>
          <table className="w-full text-xs"><tbody>
            {m.docs.filter((d) => d.document_type === '1099-NEC').map((d) => <tr key={d.id} className="border-t border-ink-100"><td className="py-1">{d.issuer}</td><td className="num text-right">{money(Number((m.evByDoc.get(d.id) ?? []).find((e) => e.field === 'box1')?.value))}</td><td className="pl-2"><D id={d.id} /></td></tr>)}
            <tr className="border-t border-ink-100 font-medium"><td className="py-1">Forms 1099-NEC</td><td className="num text-right">142,000</td><td /></tr>
            <tr className="border-t border-ink-100"><td className="py-1">Deposits from 11 clients who issued no 1099</td><td className="num text-right">9,300</td><td className="pl-2"><D id="D15" /></td></tr>
            <tr className="border-t-2 border-ink font-semibold"><td className="py-1">Books revenue</td><td className="num text-right">151,300</td><td className="pl-2"><D id="D14" /></td></tr>
            <tr className="border-t border-ink-100"><td className="py-1">Form 1099-K (Paywell, 12,400) is Atlas Outdoor Gear's card payments, already inside Atlas's 41,200 1099-NEC</td><td /><td className="pl-2"><D id="D21" /></td></tr>
            <tr className="border-t border-ink-100"><td className="py-1">Schedule C line 1 as filed</td><td className={cx('num text-right font-medium', !grossFixed && 'text-pencil')}>{money(Number(gross?.value))}</td><td /></tr>
          </tbody></table>
          {!grossFixed && <p className="mt-2 rounded-md bg-amber-soft px-2 py-1.5 text-xs text-amber">The filed return overstated receipts by 12,400. The response should request a reduction (overpayment), not just defend.</p>}
        </section>
        <section className="text-xs text-ink-500">Prepared from workpaper state as of {date(new Date().toISOString(), true)}. Engine {m.current.version}; {[...w.adjustments.values()].filter((a) => !a.reverted).length} adjustments; sign-offs: {[...w.signoffs.values()].map((s) => `${s.scope}/${s.level} ${personName(m, s.by)}`).join(', ') || 'none'}.</section>
      </div>
    </Modal>
  )
}

function ClientCopy({ open, onClose, fedBal, caBal }: { open: boolean; onClose: () => void; fedBal: number; caBal: number }) {
  const { m } = useModel()
  const w = useWork()
  const record = useStore((s) => s.record)
  const { findings } = useModel()
  const changes = [...new Set([...w.adjustments.values()].filter((a) => !a.reverted).map((a) => findings.find((f) => f.id === a.findingId)?.title ?? `${w.line(a.lineKey)?.label ?? a.lineKey}: ${a.reason}`))]
  return (
    <Modal open={open} onClose={onClose} width={680} title="Client copy · 2025 returns" footer={<>
      <Button variant="ghost" onClick={onClose}>Close</Button>
      <Button icon={<Printer size={13} />} onClick={() => window.print()}>Print</Button>
      <Button variant="primary" onClick={() => { record({ kind: 'filing', action: 'client-copy-issued' }, { toast: "Client copy issued to the portal" }); onClose() }}>Issue to client</Button>
    </>}>
      <div className="space-y-4 text-sm">
        <p>Ngozi and Erik, here is a summary of your 2025 federal and California returns.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-ink-50 p-3"><div className="eyebrow">Federal</div><div className="num text-xl font-semibold">{money(Math.abs(fedBal))}</div><div className="text-xs text-ink-500">{fedBal > 0 ? 'balance due (after the 36,000 paid with the extension)' : 'refund by direct deposit'}</div></div>
          <div className="rounded-lg bg-ink-50 p-3"><div className="eyebrow">California</div><div className="num text-xl font-semibold">{money(Math.abs(caBal))}</div><div className="text-xs text-ink-500">{caBal > 0 ? 'balance due' : 'refund by direct deposit'}</div></div>
        </div>
        <div>
          <div className="eyebrow mb-1">What we changed from the first draft, and why</div>
          {changes.length === 0 ? <p className="text-ink-500">No changes.</p> : <ul className="list-disc space-y-1 pl-4 text-ink-700">{changes.map((t) => <li key={t}>{t}</li>)}</ul>}
        </div>
        <div>
          <div className="eyebrow mb-1">Things you need to do</div>
          <ul className="list-disc space-y-1 pl-4 text-ink-700">
            <li>File FinCEN Form 114 (FBAR) for the Sparbanken account by October 15, 2026.</li>
            <li>Issue Forms 1099-NEC to Mara Quintero and Dev Patel (late; we can help).</li>
            <li>2026 estimates: see the plan we sent with this copy.</li>
            <li>Keep these records until {Number(m.packet.household.tax_year) + 8}.</li>
          </ul>
        </div>
      </div>
    </Modal>
  )
}
