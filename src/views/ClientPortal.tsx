import { useState } from 'react'
import { motion } from 'motion/react'
import { HelpCircle, PenLine, Upload, CheckCircle2, FileText } from 'lucide-react'
import { useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { Button, Card, Chip, Field, Modal, cx, inputCls } from '../components/ui'
import { AttachButton } from '../components/actions'
import { money, date, ago } from '../lib/format'
import { personName } from '../store/permissions'

export function ClientPortal() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const [ans, setAns] = useState<Record<string, string>>({})
  const [sign, setSign] = useState(false)
  const [pin, setPin] = useState('')
  const [agree, setAgree] = useState(false)
  const qs = [...w.questions.values()].filter((q) => q.to === 'client')
  const sent = [...w.filing].reverse().find((f) => f.action === 'sent-for-approval')
  const approved = w.filing.find((f) => f.action === 'client-approved')
  const accepted = w.filing.find((f) => f.action === 'efile-accepted')
  const copy = w.filing.find((f) => f.action === 'client-copy-issued')
  const fed = Number(sent?.detail?.federal ?? 0)
  const ca = Number(sent?.detail?.california ?? 0)
  const { findings } = useModel()
  const changes = [...new Set([...w.adjustments.values()].filter((a) => !a.reverted).map((a) => findings.find((f) => f.id === a.findingId)?.title ?? `${w.line(a.lineKey)?.label ?? a.lineKey} updated`))]
  const steps = [['Documents', true], ['Preparation & review', !!sent], ['Your approval', !!approved], ['Filed', !!accepted]] as const
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="eyebrow mb-2">Hi {perms.name.split(' ')[0]}</div>
      <h1 className="display text-3xl font-bold">Your 2025 tax returns</h1>
      <div className="mt-6 flex items-center gap-2">
        {steps.map(([l, done], i) => (
          <div key={l} className="flex flex-1 items-center gap-2">
            <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-semibold', done ? 'bg-tick text-white' : 'bg-ink-100 text-ink-500')}>{done ? '✓' : i + 1}</span>
            <span className={cx('text-xs', done ? 'text-ink' : 'text-ink-400')}>{l}</span>
            {i < steps.length - 1 && <span className={cx('h-px flex-1', done ? 'bg-tick' : 'bg-ink-200')} />}
          </div>
        ))}
      </div>

      {sent && !approved && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="mt-8 p-6 ring-2 ring-ink">
            <h2 className="display text-xl font-semibold">Your returns are ready for approval</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-ink-50 p-4"><div className="eyebrow">Federal · {fed > 0 ? 'balance due' : 'refund'}</div><div className="num text-2xl font-semibold">{money(Math.abs(fed))}</div><div className="text-xs text-ink-500">after the 36,000 you paid in April</div></div>
              <div className="rounded-lg bg-ink-50 p-4"><div className="eyebrow">California · {ca > 0 ? 'balance due' : 'refund'}</div><div className="num text-2xl font-semibold">{money(Math.abs(ca))}</div></div>
            </div>
            {changes.length > 0 && <div className="mt-4"><div className="eyebrow mb-1">What we corrected</div><ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">{changes.map((t) => <li key={t}>{t}</li>)}</ul></div>}
            <Button variant="primary" className="mt-5" icon={<PenLine size={14} />} onClick={() => setSign(true)}>Review and sign Form 8879</Button>
          </Card>
        </motion.div>
      )}
      {approved && (
        <Card className="mt-8 flex items-center gap-3 p-5"><CheckCircle2 className="text-tick" /><div className="text-sm">You signed the e-file authorization on {date(approved.at, true)}. {accepted ? 'Both returns were accepted.' : 'We will transmit shortly.'}</div></Card>
      )}
      {copy && (
        <Card className="mt-4 flex items-center gap-3 p-5"><FileText className="text-ink-500" /><div className="flex-1 text-sm">Your copy of the filed returns is ready.</div><Chip tone="tick">Issued {date(copy.at)}</Chip></Card>
      )}

      <h2 className="display mb-3 mt-10 text-lg font-semibold">Questions from your team</h2>
      {qs.length === 0 ? <p className="text-sm text-ink-500">Nothing to answer right now.</p> : (
        <div className="space-y-3">
          {qs.map((q) => (
            <Card key={q.qId} className="p-5">
              <div className="flex items-center gap-2 text-2xs text-ink-500"><HelpCircle size={12} /> {personName(m, q.by)} · {ago(q.at)}{q.due && <Chip tone="amber">by {date(q.due)}</Chip>}</div>
              <p className="mt-2 text-[15px] text-ink">{q.text}</p>
              {q.answer ? <p className="mt-3 rounded-lg bg-tick-soft/60 px-3 py-2 text-sm">You answered: {q.answer.text}</p> : (
                <div className="mt-3 space-y-2">
                  <textarea className={inputCls} rows={2} value={ans[q.qId] ?? ''} onChange={(e) => setAns({ ...ans, [q.qId]: e.target.value })} placeholder="Your answer" />
                  <div className="flex gap-2"><Button variant="primary" disabled={!(ans[q.qId] ?? '').trim()} onClick={() => record({ kind: 'question.answer', qId: q.qId, text: ans[q.qId] }, { toast: 'Thanks! Your answer was sent' })}>Send answer</Button><AttachButton target={q.target ?? q.qId} size="md">Attach a file</AttachButton></div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <h2 className="display mb-3 mt-10 text-lg font-semibold">Upload a document</h2>
      <Card className="flex items-center gap-3 p-5"><Upload size={16} className="text-ink-400" /><span className="flex-1 text-sm text-ink-600">Late or corrected forms, statements, receipts.</span><AttachButton target="client-uploads" size="md">Choose file</AttachButton></Card>

      <Modal open={sign} onClose={() => setSign(false)} title="Form 8879 · IRS e-file signature authorization" footer={<>
        <Button variant="ghost" onClick={() => setSign(false)}>Not yet</Button>
        <Button variant="primary" disabled={!agree || !/^\d{5}$/.test(pin)} onClick={() => { record({ kind: 'filing', action: 'client-approved', detail: { federal: fed, california: ca, pinLast: pin.slice(-2) } }, { toast: 'Signed. Thank you!' }); setSign(false) }}>Sign</Button>
      </>}>
        <div className="space-y-4 text-sm">
          <p className="text-ink-600">Under penalties of perjury, I declare that I have examined a copy of our 2025 federal and California returns and accompanying schedules, and to the best of my knowledge they are true, correct and complete. I authorize Miraflores (ERO EFIN {m.packet.firm.firm_identity.efin}) to transmit them.</p>
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-ink-50 p-3"><div><div className="eyebrow">Federal {fed > 0 ? 'balance due' : 'refund'}</div><div className="num font-semibold">{money(Math.abs(fed))}</div></div><div><div className="eyebrow">California {ca > 0 ? 'balance due' : 'refund'}</div><div className="num font-semibold">{money(Math.abs(ca))}</div></div></div>
          <Field label="Your 5-digit self-select PIN"><input className={cx(inputCls, 'num w-40 tracking-[0.4em]')} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" /></Field>
          <label className="flex items-start gap-2 text-ink-700"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-ink" />I have reviewed the returns and agree.</label>
        </div>
      </Modal>
    </div>
  )
}
