import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check, Lock, Send, Printer, FileWarning, Mail, CalendarRange, Unlock, AlertOctagon, CircleDashed, ExternalLink } from 'lucide-react'
import { useFindingState, useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { useReadiness } from '../store/readiness'
import { Button, Card, Chip, Modal, PageHeader, cx } from '../components/ui'
import { money, signed, date } from '../lib/format'
import { personName } from '../store/permissions'
import { useStandards } from '../components/actions'
import {
  efileValidation, extensionInfo, householdNames, outsideFilings, examItems, receiptsRecon, retentionYears, postFilingEvents, timelineEvent, returnForms,
} from '../data/derived'

const dueLabel = (n: number, j: string) => `${j} ${n > 0 ? 'balance due' : 'refund'}`

export function Filing() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const r = useReadiness()
  const record = useStore((s) => s.record)
  const navigate = useStore((s) => s.navigate)
  const has = (a: string) => w.filing.some((f) => f.action === a)
  const last = (a: string) => [...w.filing].reverse().find((f) => f.action === a)
  const fedBal = m.current.summary.federal.balance_due + w.effectTotal.federalBalance
  const caBal = m.current.summary.california.balance_due + w.effectTotal.californiaBalance
  const accepted = has('efile-accepted')
  const preApproval = r.blockers.filter((b) => b.id !== 'client')
  const canSend = preApproval.every((b) => b.done)
  const errors = efileValidation(m, w)
  const ext = extensionInfo(m)
  const names = householdNames(m)
  const [notice, setNotice] = useState<string | null>(null)
  const [copy, setCopy] = useState(false)

  const transmit = () => {
    record({ kind: 'filing', action: 'efile-submitted', detail: { federal: fedBal, california: caBal } })
    if (errors.length) {
      record({ kind: 'filing', action: 'efile-rejected', detail: { code: errors[0].code, message: errors[0].message, personId: errors[0].personId } }, { toast: `E-file rejected: ${errors[0].code}` })
      return
    }
    const ok = m.packet.tax_agency_records.efile.filter((e) => e.status === 'accepted')
    record([
      { kind: 'filing', action: 'efile-accepted', detail: { submissions: ok.map((e) => `${e.jurisdiction} ${e.submission_id}`) } },
      { kind: 'filing', action: 'frozen' },
    ], { toast: 'Accepted. Workpaper frozen at filing.' })
  }

  const steps: { id: string; title: string; done: boolean; body: ReactNode }[] = [
    {
      id: 'ext', title: 'Extension', done: !!ext.event,
      body: ext.event ? (
        <p className="text-sm text-ink-600">
          {ext.event.detail} Filed {date(ext.event.at)}{ext.ext?.federal?.estimated_balance != null && <> from an estimated balance of {money(ext.ext.federal.estimated_balance)} ({ext.ext.federal.rule})</>}.
          {ext.transcript460 && <> IRS transcript code 460: {ext.transcript460.description}.</>}
        </p>
      ) : <p className="text-sm text-ink-600">No extension filed.</p>,
    },
    {
      id: 'approval', title: 'Send to the client for approval', done: has('sent-for-approval'),
      body: (
        <div>
          <ul className="mb-3 space-y-1">{preApproval.map((b) => <li key={b.id} className="flex items-center gap-2 text-sm">{b.done ? <Check size={14} className="text-tick" /> : <CircleDashed size={14} className="text-pencil" />}<button onClick={() => navigate(b.route)} className={cx('text-left hover:underline', b.done ? 'text-ink-600' : 'text-ink')}>{b.label}</button><span className="ml-auto text-2xs text-ink-500">{b.detail}</span></li>)}</ul>
          {has('sent-for-approval') ? <Chip tone="tick">Sent {date(last('sent-for-approval')!.at)} by {personName(m, last('sent-for-approval')!.by)}</Chip> : (
            <Button variant="primary" disabled={!perms.canFile || !canSend} title={!canSend ? 'Clear the items above first.' : ''} onClick={() => record({ kind: 'filing', action: 'sent-for-approval', detail: { federal: fedBal, california: caBal } }, { toast: 'Sent to the client portal for approval' })}>Send for approval</Button>
          )}
        </div>
      ),
    },
    {
      id: 'sign', title: 'Client approval and e-file signature (8879)', done: has('client-approved'),
      body: has('client-approved')
        ? <p className="text-sm text-ink-600">Signed by {personName(m, last('client-approved')!.by)} on {date(last('client-approved')!.at, true)}. {(() => { const f = Number(last('client-approved')!.detail?.federal ?? fedBal); const c = Number(last('client-approved')!.detail?.california ?? caBal); return `${dueLabel(f, 'Federal')} ${money(Math.abs(f))}, ${dueLabel(c, 'state')} ${money(Math.abs(c))}.` })()}</p>
        : <p className="text-sm text-ink-600">{has('sent-for-approval') ? `Waiting for ${names.first.join(' or ')} in the client portal.` : 'Available once the return is sent.'}</p>,
    },
    {
      id: 'efile', title: 'Transmit', done: accepted,
      body: (
        <div className="space-y-2">
          {w.filing.filter((f) => f.action === 'efile-rejected').map((f, i) => (
            <div key={i} className="rounded-lg bg-pencil-soft p-3 text-sm ring-1 ring-pencil/30">
              <div className="flex items-center gap-2 font-medium text-pencil-deep"><AlertOctagon size={14} /> Rejected {String(f.detail?.code)} · {date(f.at, true)}</div>
              <p className="mt-1 text-ink-700">{String(f.detail?.message)}</p>
              {f.detail?.personId != null && <button onClick={() => navigate(`/checks/ssn-${String(f.detail!.personId)}`)} className="mt-1 text-xs font-medium underline">The check that predicted this →</button>}
            </div>
          ))}
          {accepted ? <p className="text-sm text-tick-deep">Accepted · {(last('efile-accepted')!.detail?.submissions as string[] | undefined)?.join(' · ')}</p> : (
            <Button variant="primary" icon={<Send size={14} />} disabled={!perms.canFile || !has('client-approved')} onClick={transmit}>Transmit {returnForms(m)}</Button>
          )}
          {errors.length > 0 && has('client-approved') && !accepted && <p className="text-2xs text-pencil">Pre-transmit validation: {errors.map((e) => e.message).join(' ')}</p>}
        </div>
      ),
    },
    {
      id: 'freeze', title: 'Freeze at filing', done: !!w.frozenAt,
      body: w.frozenAt ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-600"><Lock size={14} /> Frozen {date(w.frozenAt, true)}. The filed return cannot change; an amendment is layered on top.
          <Button size="sm" icon={<Unlock size={13} />} disabled={!perms.canApproveLarge} title={perms.canApproveLarge ? '' : 'Only the partner can open an amendment.'} onClick={() => record({ kind: 'filing', action: 'amendment-opened', detail: { forms: 'amended federal and state returns' } }, { toast: 'Amendment opened on top of the filed return' })}>Open amendment</Button>
        </div>
      ) : has('amendment-opened') ? <p className="text-sm text-amber">Amendment in progress. The filed version is preserved in the event log.</p> : <p className="text-sm text-ink-600">Happens automatically when the returns are accepted.</p>,
    },
    {
      id: 'copy', title: "Client's copy", done: has('client-copy-issued'),
      body: <div className="flex gap-2"><Button size="sm" icon={<Printer size={13} />} onClick={() => setCopy(true)}>Preview client copy</Button>{has('client-copy-issued') && <Chip tone="tick">Issued {date(last('client-copy-issued')!.at)}</Chip>}</div>,
    },
  ]

  return (
    <div>
      <PageHeader eyebrow="Filing and after" title="Filing" sub="From extension to e-file, the client's copy, notices after filing, and next year's plan." right={<Chip tone={accepted ? 'tick' : 'amber'} className="!px-3 !py-1 !text-xs">{accepted ? 'Filed' : r.stage}</Chip>} />
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
            <div className="flex justify-between text-sm"><span>{dueLabel(fedBal, 'Federal')}</span><span className="num font-semibold">{money(Math.abs(fedBal))}</span></div>
            <div className="flex justify-between text-sm"><span>{dueLabel(caBal, 'State')}</span><span className="num font-semibold">{money(Math.abs(caBal))}</span></div>
            <p className="mt-2 text-2xs text-ink-500">Includes workpaper adjustments ({signed(w.effectTotal.federalBalance)} federal, {signed(w.effectTotal.californiaBalance)} state) estimated at {m.current.version} rates.</p>
          </Card>
          <PostFiling fedBal={fedBal} onNotice={setNotice} />
          <OutsideFilings />
        </div>
      </div>
      {notice && <NoticeRecord noticeId={notice} onClose={() => setNotice(null)} />}
      <ClientCopy open={copy} onClose={() => setCopy(false)} fedBal={fedBal} caBal={caBal} />
    </div>
  )
}

function PostFiling({ fedBal, onNotice }: { fedBal: number; onNotice: (id: string) => void }) {
  const { m } = useModel()
  const w = useWork()
  const record = useStore((s) => s.record)
  const perms = usePerms()
  const accepted = w.filing.some((f) => f.action === 'efile-accepted')
  const due = m.packet.firm.deadlines.find((d) => /original due date/i.test(d.what))?.date
  const paid = timelineEvent(m, 'federal_balance_paid')
  const days = due && paid ? Math.max(0, (new Date(paid.at).getTime() - new Date(due).getTime()) / 86400000) : 0
  const rate = Number(m.packet.post_filing_rates.irs_underpayment_interest_rate_annual)
  const ftp = Number(m.packet.post_filing_rates.irs_failure_to_pay_penalty_per_month)
  const cost = (bal: number) => Math.max(0, bal) * rate * (days / 365) + Math.max(0, bal) * ftp * Math.ceil(days / 30)
  const fed = Number(m.current.summary.federal.total_tax) + w.effectTotal.federalTax
  const ca = Number(m.current.summary.california.total_tax) + w.effectTotal.californiaTax
  const plan = m.packet.planning_reference_2026 as { federal_estimate_due_dates?: string[]; california_estimate_due_dates?: string[]; california_installment_percentages?: number[]; federal_safe_harbor?: string; california_safe_harbor?: string; known_2026_changes_for_this_household?: string[] }
  const notices = m.packet.tax_agency_records.notices.filter((n) => n.items_under_examination?.length)
  const events = postFilingEvents(m).filter((e) => e.event !== 'notice_received' && e.event !== 'federal_balance_paid')
  const ty = m.packet.household.tax_year
  return (
    <>
      <Card className="p-5">
        <div className="mb-2 flex items-center gap-2"><FileWarning size={15} /><h3 className="display font-semibold">After filing</h3></div>
        <ul className="space-y-2 text-sm text-ink-600">
          {paid && (fedBal > 0
            ? <li>Balance of <b className="num text-ink">{money(fedBal)}</b> paid {date(paid.at)}, {Math.round(days)} days after {date(due)}: interest ≈ <b className="num text-ink">{money(cost(fedBal))}</b> including failure-to-pay. {paid.detail}</li>
            : <li>With the workpaper's corrections the payments cover the tax: a federal refund of <b className="num text-ink">{money(-fedBal)}</b>, so no interest or failure-to-pay penalty. The engine's {m.current.version} balance of {money(m.current.summary.federal.balance_due)} would have cost ≈ {money(cost(m.current.summary.federal.balance_due))}.</li>)}
          {events.map((e) => <li key={e.id}>{date(e.at)} · {e.event.replace(/_/g, ' ')}{e.actor ? ` (${personName(m, e.actor)})` : ''}{e.detail ? `: ${e.detail}` : ''}</li>)}
        </ul>
      </Card>
      {notices.map((n) => (
        <Card key={n.id} className="p-5">
          <div className="mb-2 flex items-center gap-2"><Mail size={15} /><h3 className="display font-semibold">{n.type}</h3></div>
          <p className="text-xs text-ink-500">{n.agency} · tax year {n.tax_year} · dated {n.dated}{n.response_due ? ` · response due ${n.response_due}` : ''}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-700">{n.items_under_examination!.map((x) => <li key={x}>{x}</li>)}</ul>
          <Button size="sm" className="mt-3" variant="primary" onClick={() => onNotice(n.id)}>Build the response record</Button>
        </Card>
      ))}
      <Card className="p-5">
        <div className="mb-2 flex items-center gap-2"><CalendarRange size={15} /><h3 className="display font-semibold">Plan {ty + 1}</h3></div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-600">Federal safe harbor (110% of {ty} tax)</span><span className="num">{money(fed * 1.1)}</span></div>
          {plan.federal_estimate_due_dates && <div className="flex justify-between text-xs text-ink-500"><span>{plan.federal_estimate_due_dates.length} installments: {plan.federal_estimate_due_dates.map((d) => d.slice(5)).join(', ')}</span><span className="num">{money((fed * 1.1) / plan.federal_estimate_due_dates.length)} each</span></div>}
          <div className="flex justify-between pt-1"><span className="text-ink-600">State (110% of {ty} tax)</span><span className="num">{money(ca * 1.1)}</span></div>
          {plan.california_estimate_due_dates && <div className="text-xs text-ink-500">{plan.california_estimate_due_dates.map((d, i) => `${d.slice(5)}: ${money(ca * 1.1 * (plan.california_installment_percentages?.[i] ?? 0))}`).join(' · ')}</div>}
          {plan.california_safe_harbor && <div className="text-xs text-ink-500">{plan.california_safe_harbor}</div>}
        </div>
        {plan.known_2026_changes_for_this_household && <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ink-600">{plan.known_2026_changes_for_this_household.map((x) => <li key={x}>{x}</li>)}</ul>}
        <Button size="sm" className="mt-3" disabled={!perms.canEdit || !accepted} title={accepted ? '' : 'Roll forward after filing.'} onClick={() => record({ kind: 'filing', action: 'rolled-forward', detail: { carryovers: m.current.carryovers_out } }, { toast: `${ty + 1} file created with carryovers, assets, basis and open items` })}>Roll forward to {ty + 1}</Button>
        {w.filing.some((f) => f.action === 'rolled-forward') && <p className="mt-2 text-2xs text-tick-deep">Rolled forward. Carryovers, the asset register, basis records, the judgment log and every open item travel with their history.</p>}
      </Card>
    </>
  )
}

function OutsideFilings() {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const items = useMemo(() => outsideFilings(m, fs, w), [m, fs, w])
  const TONE: Record<string, 'pencil' | 'amber' | 'tick' | 'neutral'> = { late: 'pencil', investigate: 'pencil', due: 'amber', covered: 'tick', agrees: 'tick', related: 'neutral' }
  return (
    <Card className="p-5">
      <h3 className="display mb-1 font-semibold">Outside filings identified</h3>
      <p className="mb-3 text-xs text-ink-500">Returns and forms this household or its entities must file that aren't part of this return, found from the engine's diagnostics, the checks, K-1 statements and the related returns.</p>
      <ul className="space-y-2.5">{items.map((x) => (
        <li key={x.id} className="text-sm">
          <div className="flex items-center gap-2 font-medium">{x.title}<Chip tone={TONE[x.status]} className="ml-auto">{x.status}</Chip></div>
          <p className="text-xs text-ink-600">{x.detail}</p>
          {(x.status === 'due' || x.status === 'late' || x.status === 'investigate') && perms.canEdit && <button onClick={() => record({ kind: 'step', step: `outside:${x.id}`, done: true, note: x.title }, { toast: `${x.title}: marked handled` })} className="mt-1 text-2xs font-medium text-ink-500 hover:text-ink hover:underline">Mark handled (client told in writing)</button>}
        </li>
      ))}</ul>
    </Card>
  )
}

function NoticeRecord({ noticeId, onClose }: { noticeId: string; onClose: () => void }) {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const record = useStore((s) => s.record)
  const openDoc = useStore((s) => s.openDoc)
  const openTrace = useStore((s) => s.openTrace)
  const n = m.packet.tax_agency_records.notices.find((x) => x.id === noticeId)!
  const items = useMemo(() => examItems(m, w, fs, n.items_under_examination ?? []), [m, w, fs, n])
  const rec = receiptsRecon(m, w)
  const D = ({ id }: { id: string }) => <button onClick={() => openDoc({ docId: id })} className="num inline-flex items-center gap-0.5 rounded bg-ink-50 px-1 text-2xs ring-1 ring-ink-200">{id}<ExternalLink size={9} /></button>
  return (
    <Modal open onClose={onClose} width={780} title={`Response record · ${n.type} (tax year ${n.tax_year})`} footer={<>
      <Button variant="ghost" onClick={onClose}>Close</Button>
      <Button icon={<Printer size={13} />} onClick={() => window.print()}>Print</Button>
      <Button variant="primary" onClick={() => { record({ kind: 'filing', action: 'notice-response-prepared', detail: { notice: n.id } }, { toast: 'Response record saved to the file' }); onClose() }}>Save to file</Button>
    </>}>
      <div className="space-y-6 text-sm">
        <p className="text-ink-600">Built from the frozen workpaper for each item under examination: the lines involved, their documents, and anything the review found about them.</p>
        {items.map((it, i) => (
          <section key={i}>
            <h4 className="display mb-2 font-semibold">{i + 1} · {it.text}</h4>
            <table className="w-full text-xs"><tbody>
              {it.lines.map((k) => {
                const l = w.line(k)!
                const docs = [...new Set(l.sources.map((s) => m.ev.get(s)?.document_id).filter(Boolean) as string[])]
                return (
                  <tr key={k} className="border-t border-ink-100">
                    <td className="py-1.5"><button onClick={() => openTrace(k)} className="num mr-2 text-2xs text-ink-400 hover:underline">{k}</button>{l.label}</td>
                    <td className={cx('num whitespace-nowrap text-right', l.adjusted && 'text-slateblue')}>{typeof l.value === 'number' ? money(l.value) : String(l.value)}</td>
                    <td className="pl-2 text-right">{docs.map((d) => <D key={d} id={d} />)}</td>
                  </tr>
                )
              })}
            </tbody></table>
            {it.receipts && (
              <table className="mt-2 w-full text-xs"><tbody>
                {rec.necs.map(({ doc, amount }) => <tr key={doc.id} className="border-t border-ink-100"><td className="py-1">{doc.issuer} · 1099-NEC</td><td className="num text-right">{money(amount)}</td><td className="pl-2 text-right"><D id={doc.id} /></td></tr>)}
                <tr className="border-t border-ink-100 font-medium"><td className="py-1">Forms 1099-NEC</td><td className="num text-right">{money(rec.necTotal)}</td><td /></tr>
                <tr className="border-t border-ink-100"><td className="py-1">{rec.noForm?.label ?? 'Deposits with no 1099 (residual)'}</td><td className="num text-right">{money(rec.noFormAmount)}</td><td className="pl-2 text-right">{rec.detail && <D id={rec.detail.id} />}</td></tr>
                <tr className="border-t-2 border-ink font-semibold"><td className="py-1">Books revenue</td><td className="num text-right">{money(rec.booksRevenue)}</td><td /></tr>
                {rec.ks.map(({ doc, amount }) => <tr key={doc.id} className="border-t border-ink-100"><td className="py-1">Form 1099-K · {doc.issuer}{rec.kInBooks ? ': card payments already deposited in the books' : ''}</td><td className="num text-right">{money(amount)}</td><td className="pl-2 text-right"><D id={doc.id} /></td></tr>)}
              </tbody></table>
            )}
            {it.exposure.length > 0 && (
              <ul className="mt-2 space-y-1">{it.exposure.map(({ f, status }) => (
                <li key={f.id} className={cx('rounded-md px-2 py-1.5 text-xs', status === 'open' || status === 'dismissed' ? 'bg-pencil-soft text-pencil-deep' : 'bg-tick-soft text-tick-deep')}>
                  {status === 'resolved' ? 'Corrected before filing' : 'Exposure'}: {f.title}. {status !== 'resolved' && f.summary}
                </li>
              ))}</ul>
            )}
          </section>
        ))}
        <section className="text-xs text-ink-500">Prepared from workpaper state as of {date(new Date().toISOString(), true)}. Engine {m.current.version}; {[...w.adjustments.values()].filter((a) => !a.reverted).length} adjustments; sign-offs: {[...w.signoffs.values()].map((s) => `${s.scope}/${s.level} ${personName(m, s.by)}`).join(', ') || 'none'}.</section>
      </div>
    </Modal>
  )
}

function ClientCopy({ open, onClose, fedBal, caBal }: { open: boolean; onClose: () => void; fedBal: number; caBal: number }) {
  const { m, findings } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const std = useStandards()
  const record = useStore((s) => s.record)
  const names = householdNames(m)
  const extPaid = w.value('Sch3.10')
  const changes = [...new Set([...w.adjustments.values()].filter((a) => !a.reverted).map((a) => findings.find((f) => f.id === a.findingId)?.title ?? `${w.line(a.lineKey)?.label ?? a.lineKey} updated`))]
  const todos = outsideFilings(m, fs, w).filter((o) => o.owner === 'client' && o.status !== 'covered')
  const years = retentionYears(std.rules)
  const ty = m.packet.household.tax_year
  return (
    <Modal open={open} onClose={onClose} width={680} title={`Client copy · ${ty} returns`} footer={<>
      <Button variant="ghost" onClick={onClose}>Close</Button>
      <Button icon={<Printer size={13} />} onClick={() => window.print()}>Print</Button>
      <Button variant="primary" onClick={() => { record({ kind: 'filing', action: 'client-copy-issued' }, { toast: 'Client copy issued to the portal' }); onClose() }}>Issue to client</Button>
    </>}>
      <div className="space-y-4 text-sm">
        <p>{names.first.join(' and ')}, here is a summary of your {ty} returns ({returnForms(m)}).</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-ink-50 p-3"><div className="eyebrow">Federal</div><div className="num text-xl font-semibold">{money(Math.abs(fedBal))}</div><div className="text-xs text-ink-500">{fedBal > 0 ? `balance due${extPaid ? ` (after ${money(extPaid)} paid with the extension)` : ''}` : 'refund by direct deposit'}</div></div>
          <div className="rounded-lg bg-ink-50 p-3"><div className="eyebrow">State</div><div className="num text-xl font-semibold">{money(Math.abs(caBal))}</div><div className="text-xs text-ink-500">{caBal > 0 ? 'balance due' : 'refund by direct deposit'}</div></div>
        </div>
        <div>
          <div className="eyebrow mb-1">What we changed from the first draft</div>
          {changes.length === 0 ? <p className="text-ink-500">No changes.</p> : <ul className="list-disc space-y-1 pl-4 text-ink-700">{changes.map((t) => <li key={t}>{t}</li>)}</ul>}
        </div>
        <div>
          <div className="eyebrow mb-1">Things you need to do</div>
          <ul className="list-disc space-y-1 pl-4 text-ink-700">
            {todos.map((t) => <li key={t.id}><b>{t.title}</b>: {t.detail}</li>)}
            <li>Estimated payments for {ty + 1}: see the plan sent with this copy.</li>
            {years && <li>Keep these records until at least {ty + 1 + years}.</li>}
          </ul>
        </div>
      </div>
    </Modal>
  )
}
