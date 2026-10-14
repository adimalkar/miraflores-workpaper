import { useMemo, useState, type ReactNode } from 'react'
import { set as idbSet } from 'idb-keyval'
import { Paperclip } from 'lucide-react'
import { useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { newId } from '../store/events'
import { Button, Field, Modal, inputCls, Chip, cx } from './ui'
import { TickMark } from './TickMark'
import { VERIFICATION_LABEL, money, signed } from '../lib/format'
import { effectOf, largestEffect, type EffectCat } from '../data/effects'
import { incomeSign, rateCategoryForLine } from '../data/areas'
import { personName } from '../store/permissions'

export function useStandards() {
  const { m } = useModel()
  const w = useWork()
  return (w.standards as typeof m.packet.firm.starter_standards | undefined) ?? m.packet.firm.starter_standards
}

export function VerifyDialog({ target, value, open, onClose, label }: { target: string; value: unknown; open: boolean; onClose: () => void; label: string }) {
  const std = useStandards()
  const record = useStore((s) => s.record)
  const [method, setMethod] = useState(std.verification_types[0])
  const [note, setNote] = useState('')
  return (
    <Modal open={open} onClose={onClose} title={`Verify ${label}`} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="tick" onClick={() => { record({ kind: 'verify', target, method, note: note || undefined, value }, { toast: `Verified ${label}` }); onClose() }}>Record verification</Button>
    </>}>
      <div className="space-y-4">
        <div className="text-sm text-ink-600">How did you verify <span className="num font-semibold text-ink">{typeof value === 'number' ? money(value) : String(value)}</span>? The tick mark records the method, your name and the time.</div>
        <div className="grid gap-2">
          {std.verification_types.map((t) => (
            <button key={t} onClick={() => setMethod(t)} className={cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ring-1 transition', method === t ? 'bg-tick-soft ring-tick/40' : 'ring-ink-200 hover:bg-ink-50')}>
              <TickMark method={t} size={18} />
              <span className="font-medium">{VERIFICATION_LABEL[t] ?? t}</span>
            </button>
          ))}
        </div>
        <Field label="Note (optional)"><textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Agreed to W-2 box 1 and to payroll register" /></Field>
      </div>
    </Modal>
  )
}

const CATS: { id: EffectCat; label: string }[] = [
  { id: 'wages', label: 'Wages' }, { id: 'interest', label: 'Interest / dividends' }, { id: 'schc_profit', label: 'Schedule C profit' },
  { id: 'stcg', label: 'Short-term gain' }, { id: 'ltcg', label: 'Long-term gain' }, { id: 'ordinary_income', label: 'Other income' },
  { id: 'adjustment', label: 'Adjustment to income' }, { id: 'salt', label: 'State and local taxes' }, { id: 'itemized', label: 'Other itemized' },
  { id: 'ca_source_income', label: 'California-source only' }, { id: 'fed_payment', label: 'Federal payment' }, { id: 'ca_payment', label: 'California payment' },
  { id: 'fed_credit', label: 'Federal credit' },
]

export function AdjustDialog({ lineKey, open, onClose }: { lineKey: string; open: boolean; onClose: () => void }) {
  const { m } = useModel()
  const w = useWork()
  const l = w.line(lineKey)
  const record = useStore((s) => s.record)
  const orig = m.lineMaps.get(m.current.version)!.get(lineKey)
  const from = typeof orig?.value === 'number' ? orig.value : null
  const current = w.value(lineKey)
  const [to, setTo] = useState(current != null ? String(current) : '')
  const [reason, setReason] = useState('')
  const defCat = orig ? rateCategoryForLine(orig) : 'ordinary_income'
  const [cat, setCat] = useState<EffectCat>(defCat === 'credit' ? 'fed_credit' : defCat === 'payment' ? (orig?.jurisdiction === 'california' ? 'ca_payment' : 'fed_payment') : (defCat ?? 'ordinary_income') as EffectCat)
  const n = Number(to.replace(/[,\s]/g, ''))
  const delta = from != null && !Number.isNaN(n) ? n - from : 0
  const sign = orig ? incomeSign(orig) : 1
  const amount = ['fed_payment', 'ca_payment', 'fed_credit'].includes(cat) ? delta : delta * sign
  const eff = useMemo(() => effectOf([{ cat, amount }], m.current), [cat, amount, m])
  const big = largestEffect(eff) > w.partnerThreshold
  const ok = !Number.isNaN(n) && reason.trim().length > 3 && n !== current
  if (!l) return null
  return (
    <Modal open={open} onClose={onClose} width={560} title={<>Adjust <span className="num text-ink-500">{lineKey}</span></>} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!ok} onClick={() => {
        record({ kind: 'adjust', adjId: newId('adj'), lineKey, from, to: n, reason, effects: [{ cat, amount }] }, { toast: `Adjusted ${lineKey}` })
        onClose()
      }}>Post adjustment</Button>
    </>}>
      <div className="space-y-4">
        <div className="text-sm text-ink-600">{l.label}</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-ink-50 px-3 py-2 ring-1 ring-ink-200">
            <div className="eyebrow">Engine (kept)</div>
            <div className="num text-lg font-semibold">{money(from)}</div>
          </div>
          <Field label="New value"><input autoFocus className={cx(inputCls, 'num text-lg')} value={to} onChange={(e) => setTo(e.target.value)} inputMode="decimal" /></Field>
        </div>
        <Field label="Why" hint="Shown on the line, in the activity log and in the client's change summary."><textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Agreed to IRS transcript; client's recollection was wrong" /></Field>
        <Field label="Flows through" hint="The engine can't be rerun; the effect is the change × this version's per-dollar rate.">
          <select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value as EffectCat)}>
            {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-hilite-soft/70 px-3 py-2.5 ring-1 ring-hilite-deep/20">
          <div><div className="eyebrow">Federal tax</div><div className="num font-semibold">{signed(eff.federalTax)}</div></div>
          <div><div className="eyebrow">California tax</div><div className="num font-semibold">{signed(eff.californiaTax)}</div></div>
          {big && <div className="col-span-2 text-xs text-pencil-deep">Effect over {w.partnerThreshold.toLocaleString()}: needs partner sign-off before filing (firm rule).</div>}
        </div>
      </div>
    </Modal>
  )
}

export function NoteDialog({ target, open, onClose, label, defaultBlocking }: { target: string; open: boolean; onClose: () => void; label: string; defaultBlocking?: boolean }) {
  const { m } = useModel()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const [text, setText] = useState('')
  const [blocking, setBlocking] = useState(defaultBlocking ?? (perms.role === 'reviewer' || perms.role === 'partner'))
  const [assignee, setAssignee] = useState(m.packet.firm.assignment_at_start.preparer)
  return (
    <Modal open={open} onClose={onClose} title={`Note on ${label}`} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant={blocking ? 'danger' : 'primary'} disabled={text.trim().length < 3} onClick={() => {
        record({ kind: 'note', noteId: newId('n'), target, text, blocking, assignee, noteType: perms.role === 'reviewer' || perms.role === 'partner' ? 'review' : 'internal' }, { toast: blocking ? 'Review note added. It blocks filing until cleared.' : 'Note added' })
        onClose()
      }}>{blocking ? 'Add blocking note' : 'Add note'}</Button>
    </>}>
      <div className="space-y-4">
        <textarea autoFocus className={inputCls} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="What needs to happen?" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assign to">
            <select className={inputCls} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {m.packet.firm.staff.filter((s) => s.role !== 'firm_administrator').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end rounded-lg px-3 py-2 text-sm ring-1 ring-ink-200">
            <input type="checkbox" checked={blocking} onChange={(e) => setBlocking(e.target.checked)} className="accent-pencil" />
            Blocks filing
          </label>
        </div>
      </div>
    </Modal>
  )
}

export function QuestionDialog({ target, open, onClose, label, suggested }: { target?: string; open: boolean; onClose: () => void; label?: string; suggested?: string }) {
  const { m } = useModel()
  const record = useStore((s) => s.record)
  const [to, setTo] = useState('client')
  const [text, setText] = useState(suggested ?? '')
  const [due, setDue] = useState('')
  return (
    <Modal open={open} onClose={onClose} title={label ? `Ask about ${label}` : 'Ask a question'} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={text.trim().length < 3} onClick={() => {
        record({ kind: 'question', qId: newId('q'), to, target, text, due: due || undefined }, { toast: to === 'client' ? 'Question sent to the client portal' : `Question sent to ${personName(m, to)}` })
        onClose()
      }}>Send question</Button>
    </>}>
      <div className="space-y-4">
        <Field label="To">
          <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="client">Client ({m.packet.firm.client_users.map((c) => c.name).join(' & ')})</option>
            {m.packet.firm.staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role.replace('_', ' ')}</option>)}
          </select>
        </Field>
        <textarea autoFocus className={inputCls} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="The answer is filed as evidence on this item." />
        <Field label="Answer needed by"><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

export function AttachButton({ target, children, size = 'sm' }: { target: string; children?: ReactNode; size?: 'sm' | 'md' }) {
  const record = useStore((s) => s.record)
  const perms = usePerms()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [text, setText] = useState('')
  return (
    <>
      <Button size={size} variant="ghost" icon={<Paperclip size={13} />} onClick={() => setOpen(true)} disabled={!perms.canEdit && !perms.isClient}>{children ?? 'Attach'}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Attach evidence" footer={<>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="primary" disabled={!file && text.trim().length < 3} onClick={async () => {
          const attId = newId('att')
          if (file) { try { await idbSet(`att:${attId}`, file) } catch { /* stored as metadata only */ } }
          record({ kind: 'attach', attId, target, fileName: file?.name ?? 'Note.txt', mime: file?.type ?? 'text/plain', size: file?.size ?? text.length, note: note || undefined, text: file ? undefined : text }, { toast: 'Evidence attached' })
          setOpen(false); setFile(null); setNote(''); setText('')
        }}>Attach</Button>
      </>}>
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-300 px-4 py-6 text-center text-sm text-ink-500 hover:bg-ink-50">
            <Paperclip size={18} />
            {file ? <span className="font-medium text-ink">{file.name} · {(file.size / 1024).toFixed(0)} KB</span> : <span>Choose a file (PDF, image, email export…)</span>}
            <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {!file && <Field label="…or paste a message or note"><textarea className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Email from Capitol Keys confirming the HVAC invoice" /></Field>}
          <Field label="What it proves"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  )
}

export function JudgmentDialog({ open, onClose, target, topic: t0, findingId, category: c0 }: { open: boolean; onClose: () => void; target?: string; topic?: string; findingId?: string; category?: 'judgment' | 'election' | 'due_diligence' | 'penalty' | 'variance' }) {
  const record = useStore((s) => s.record)
  const [topic, setTopic] = useState(t0 ?? '')
  const [decision, setDecision] = useState('')
  const [authority, setAuthority] = useState('')
  const [category, setCategory] = useState(c0 ?? 'judgment')
  return (
    <Modal open={open} onClose={onClose} title="Record a judgment call" width={560} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!topic || decision.length < 3 || authority.length < 2} onClick={() => {
        record({ kind: 'judgment', jId: newId('j'), target, topic, decision, authority, category, findingId }, { toast: 'Judgment recorded' })
        onClose()
      }}>Record</Button>
    </>}>
      <div className="space-y-4">
        <Field label="Kind">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="judgment">Judgment call</option><option value="election">Election</option>
            <option value="due_diligence">Due diligence</option><option value="penalty">Penalty decision</option><option value="variance">Variance explanation</option>
          </select>
        </Field>
        <Field label="Topic"><input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} /></Field>
        <Field label="Decision and reasoning"><textarea className={inputCls} rows={3} value={decision} onChange={(e) => setDecision(e.target.value)} /></Field>
        <Field label="Authority relied on" hint="Firm rule: every judgment call records the authority relied on."><input className={inputCls} value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="e.g. Reg. §1.263(a)-3(k); Pub. 527" /></Field>
      </div>
    </Modal>
  )
}

export function PersonTag({ id }: { id: string }) {
  const { m } = useModel()
  return <Chip tone="neutral">{personName(m, id)}</Chip>
}
