import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, Lock, RotateCcw, HelpCircle, MessageSquareText, Scale, ClipboardCheck, UserCog, Plus, Undo2 } from 'lucide-react'
import { useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { snapshotFor } from '../store/derive'
import { useReadiness } from '../store/readiness'
import { AREAS, areaForLine } from '../data/areas'
import { Button, Card, Chip, Empty, Field, PageHeader, Tabs, cx, inputCls, Avatar } from '../components/ui'
import { JudgmentDialog, NoteDialog, QuestionDialog } from '../components/actions'
import { NoteCard } from '../components/TracePanel'
import { ago, money, signed, date } from '../lib/format'
import { initials, personName } from '../store/permissions'

type Tab = 'notes' | 'questions' | 'signoffs' | 'adjustments' | 'judgments' | 'steps' | 'client' | 'team'

export function Review({ tab: t }: { tab?: string }) {
  const navigate = useStore((s) => s.navigate)
  const w = useWork()
  const tab = (t as Tab) || 'notes'
  const openNotes = [...w.notes.values()].filter((n) => !n.resolved).length
  const openQ = [...w.questions.values()].filter((q) => !q.answer).length
  const pending = [...w.adjustments.values()].filter((a) => !a.reverted && a.needsPartner && !a.approvedBy).length
  return (
    <div>
      <PageHeader eyebrow="People" title="Review" sub="Review notes that block filing, questions that become evidence, sign-offs that reopen when what they covered changes, and the judgment calls behind the return." />
      <Tabs value={tab} onChange={(v) => navigate(`/review/${v}`)} className="mb-5 w-full rounded-xl bg-ink-100/60 p-1" items={[
        { id: 'notes', label: 'Notes', count: openNotes || undefined },
        { id: 'questions', label: 'Questions', count: openQ || undefined },
        { id: 'signoffs', label: 'Sign-offs' },
        { id: 'adjustments', label: 'Adjustments', count: pending || undefined },
        { id: 'judgments', label: 'Judgments & elections' },
        { id: 'steps', label: 'Required steps' },
        { id: 'client', label: 'Client answers' },
        { id: 'team', label: 'Team & time' },
      ]} />
      {tab === 'notes' && <Notes />}
      {tab === 'questions' && <Questions />}
      {tab === 'signoffs' && <SignOffs />}
      {tab === 'adjustments' && <Adjustments />}
      {tab === 'judgments' && <Judgments />}
      {tab === 'steps' && <Steps />}
      {tab === 'client' && <ClientAnswers />}
      {tab === 'team' && <Team />}
    </div>
  )
}

function Notes() {
  const w = useWork()
  const perms = usePerms()
  const [open, setOpen] = useState(false)
  const [show, setShow] = useState<'open' | 'all'>('open')
  const openTrace = useStore((s) => s.openTrace)
  const notes = [...w.notes.values()].filter((n) => show === 'all' || !n.resolved).sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.at.localeCompare(a.at))
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {(['open', 'all'] as const).map((s) => <button key={s} onClick={() => setShow(s)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1', show === s ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink-200')}>{s === 'open' ? 'Open' : 'All'}</button>)}
        <Button size="sm" className="ml-auto" icon={<Plus size={13} />} disabled={!perms.canEdit && perms.role !== 'quality_reviewer'} onClick={() => setOpen(true)}>New note on the return</Button>
      </div>
      {notes.length === 0 ? <Empty title="No open notes">Reviewers add notes from any line's proof panel. A blocking note stops filing until it is cleared.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((n) => (
            <div key={n.noteId}>
              <button onClick={() => openTrace(n.target)} className="num mb-1 text-2xs text-ink-500 hover:underline">{n.target}</button>
              <NoteCard noteId={n.noteId} />
            </div>
          ))}
        </div>
      )}
      {open && <NoteDialog open target="F1040.24" label="the return" onClose={() => setOpen(false)} />}
    </div>
  )
}

function Questions() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const openTrace = useStore((s) => s.openTrace)
  const [open, setOpen] = useState(false)
  const [ans, setAns] = useState<Record<string, string>>({})
  const qs = [...w.questions.values()].sort((a, b) => Number(!!a.answer) - Number(!!b.answer) || b.at.localeCompare(a.at))
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button size="sm" icon={<HelpCircle size={13} />} disabled={!perms.canEdit} onClick={() => setOpen(true)}>Ask a question</Button></div>
      {qs.length === 0 ? <Empty title="No questions yet">Ask the client or a colleague from any line or check. Answers are filed as evidence on that item.</Empty> : (
        <div className="space-y-3">
          {qs.map((q) => {
            const canAnswer = !q.answer && (q.to === perms.actor || (q.to === 'client' && perms.isClient))
            return (
              <Card key={q.qId} className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-2xs text-ink-500">
                  <Avatar name={personName(m, q.by)} initials={initials(personName(m, q.by))} size={20} />
                  <span>{personName(m, q.by)} → {q.to === 'client' ? 'Client' : personName(m, q.to)} · {ago(q.at)}</span>
                  {q.due && <Chip tone="amber">Due {date(q.due)}</Chip>}
                  {q.target && <button onClick={() => openTrace(q.target!)} className="num rounded bg-ink-50 px-1.5 ring-1 ring-ink-200">{q.target}</button>}
                  {q.answer ? <Chip tone="tick" className="ml-auto">Answered · now evidence</Chip> : <Chip tone="amber" className="ml-auto">Waiting</Chip>}
                </div>
                <p className="mt-2 text-sm text-ink">{q.text}</p>
                {q.answer && <div className="mt-2 rounded-lg bg-tick-soft/60 px-3 py-2 text-sm"><b>{personName(m, q.answer.by)}:</b> {q.answer.text}<div className="mt-0.5 text-2xs text-ink-500">{ago(q.answer.at)}</div></div>}
                {canAnswer && (
                  <div className="mt-2 flex gap-2">
                    <input className={cx(inputCls, 'h-9')} value={ans[q.qId] ?? ''} onChange={(e) => setAns({ ...ans, [q.qId]: e.target.value })} placeholder="Answer…" />
                    <Button variant="primary" disabled={!(ans[q.qId] ?? '').trim()} onClick={() => record({ kind: 'question.answer', qId: q.qId, text: ans[q.qId] }, { toast: 'Answer filed as evidence' })}>Answer</Button>
                  </div>
                )}
                {!q.answer && q.to === 'client' && !perms.isClient && <p className="mt-2 text-2xs text-ink-400">Visible in the client portal. Switch to Ngozi or Erik to answer as the client.</p>}
              </Card>
            )
          })}
        </div>
      )}
      {open && <QuestionDialog open onClose={() => setOpen(false)} />}
    </div>
  )
}

function SignOffs() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const scopes = [{ id: 'return', name: 'Whole return (Form 1040 & 540NR)' }, ...AREAS.map((a) => ({ id: a.id, name: a.name }))]
  const levels = ['preparer', 'reviewer', 'partner'] as const
  const preparedBy = (scope: string) => {
    const s = new Set<string>()
    const p = w.signoffs.get(`${scope}|preparer`)
    if (p) s.add(p.by)
    for (const a of w.adjustments.values()) if (!a.reverted && (scope === 'return' || areaForLine({ key: a.lineKey, form: a.lineKey.split('.')[0] }) === scope)) s.add(a.by)
    return s
  }
  const sign = (scope: string, level: typeof levels[number]) => {
    const snapshot = snapshotFor(m, scope, w.value, w.adjustments)
    record({ kind: 'signoff', scope, level, snapshot }, { toast: `Signed off ${scope === 'return' ? 'the return' : scope} as ${level}` })
  }
  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-ink-600">A sign-off stores the exact values it covered. If any of them moves afterwards, by an adjustment or a new engine version, the sign-off reopens and shows what changed. Firm rule: a person may not review or sign off on work they prepared.</p>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,150px)] gap-3 border-b border-ink-100 bg-ink-50/70 px-4 py-2 text-2xs font-medium uppercase tracking-wider text-ink-400">
          <span>Scope</span>{levels.map((l) => <span key={l} className="text-center">{l}</span>)}
        </div>
        {scopes.map((s, i) => (
          <div key={s.id} className={cx('grid grid-cols-[minmax(0,1fr)_repeat(3,150px)] items-center gap-3 px-4 py-3', i === 0 ? 'bg-hilite-soft/30' : 'border-t border-ink-100')}>
            <span className={cx('text-sm', i === 0 ? 'font-semibold' : 'text-ink-700')}>{s.name}</span>
            {levels.map((lv) => {
              const so = w.signoffs.get(`${s.id}|${lv}`)
              const prepared = preparedBy(s.id)
              const conflict = lv !== 'preparer' && prepared.has(perms.actor)
              const canSign = perms.canSignAs.includes(lv) && !conflict && !w.frozenAt
              const why = !perms.canSignAs.includes(lv) ? `Only a ${lv} can sign at this level.` : conflict ? 'You prepared or adjusted this area; someone else must review it.' : ''
              return (
                <div key={lv} className="flex justify-center">
                  {so ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cx('w-full rounded-lg px-2 py-1.5 text-center text-2xs ring-1', so.stale.length ? 'bg-pencil-soft ring-pencil/30' : 'bg-tick-soft ring-tick/25')}>
                      <div className={cx('flex items-center justify-center gap-1 font-medium', so.stale.length ? 'text-pencil-deep' : 'text-tick-deep')}>
                        {so.stale.length ? <RotateCcw size={11} /> : <Check size={11} />}{so.stale.length ? 'Reopened' : personName(m, so.by).split(' ')[0]}
                      </div>
                      <div className="text-ink-500" title={so.stale.join(', ')}>{so.stale.length ? `${so.stale.length} changed: ${so.stale.slice(0, 2).join(', ')}` : date(so.at)}</div>
                      {so.stale.length > 0 && canSign && <button onClick={() => sign(s.id, lv)} className="mt-1 font-medium text-ink underline">Re-sign</button>}
                      {!so.stale.length && so.by === perms.actor && <button onClick={() => record({ kind: 'signoff.revoke', scope: s.id, level: lv, reason: 'Withdrawn' })} className="mt-0.5 text-ink-400 hover:text-ink">withdraw</button>}
                    </motion.div>
                  ) : (
                    <Button size="sm" variant={canSign ? 'secondary' : 'ghost'} disabled={!canSign} title={why} onClick={() => sign(s.id, lv)}>{canSign ? 'Sign off' : <Lock size={12} />}</Button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </Card>
    </div>
  )
}

function Adjustments() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const openTrace = useStore((s) => s.openTrace)
  const adjs = [...w.adjustments.values()].sort((a, b) => b.at.localeCompare(a.at))
  const pending = adjs.filter((a) => !a.reverted && a.needsPartner && !a.approvedBy && a.by !== perms.actor)
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <p className="text-sm text-ink-600">Every change keeps the engine's original value, who changed it, why, and the estimated tax effect.</p>
        {perms.canApproveLarge && pending.length > 0 && (
          <Button variant="tick" size="sm" className="ml-auto" onClick={() => record(pending.map((a) => ({ kind: 'adjust.approve' as const, adjId: a.adjId })), { toast: `Approved ${pending.length} adjustments` })}>Approve all {pending.length}</Button>
        )}
      </div>
      {adjs.length === 0 ? <Empty title="No adjustments yet">Adjust a line from its proof panel, or apply a fix from Checks.</Empty> : (
        <Card className="divide-y divide-ink-100">
          {adjs.map((a) => (
            <div key={a.adjId} className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 md:grid-cols-[110px_minmax(0,1fr)_170px_150px_160px]', a.reverted && 'opacity-50')}>
              <button onClick={() => openTrace(a.lineKey)} className="num text-left text-xs font-medium text-ink hover:underline">{a.lineKey}</button>
              <div className="min-w-0 text-xs text-ink-600"><div className="truncate">{a.reason}</div><div className="text-2xs text-ink-400">{personName(m, a.by)} · {ago(a.at)}{a.reverted ? ` · reverted by ${personName(m, a.reverted.by)}` : ''}</div></div>
              <div className="num hidden text-xs md:block"><span className="text-ink-400 line-through">{money(a.from)}</span> → <b>{money(a.to)}</b></div>
              <div className="num hidden text-2xs text-ink-500 md:block">Fed {signed(a.effect.federalBalance)} · CA {signed(a.effect.californiaBalance)}</div>
              <div className="flex justify-end gap-1.5">
                {a.reverted ? <Chip>Reverted</Chip> : a.needsPartner ? (a.approvedBy ? <Chip tone="tick">Approved · {personName(m, a.approvedBy).split(' ')[0]}</Chip> : perms.canApproveLarge && a.by !== perms.actor ? <Button size="sm" variant="tick" onClick={() => record({ kind: 'adjust.approve', adjId: a.adjId }, { toast: 'Approved' })}>Approve</Button> : <Chip tone="pencil" title={a.by === perms.actor ? 'You posted this adjustment; another partner must approve it.' : ''}>Needs partner</Chip>) : <Chip>Under 1,000</Chip>}
                {!a.reverted && perms.canEdit && <button title="Revert" onClick={() => record({ kind: 'adjust.revert', adjId: a.adjId, reason: 'Reverted from adjustments list' }, { toast: 'Reverted' })} className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink"><Undo2 size={13} /></button>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

const DD_ITEMS = [
  'Interviewed the taxpayer and recorded answers about each qualifying child (age, relationship, residency, support).',
  'Confirmed Theo lived with the taxpayers all year and was under 17 at year end (born 2017).',
  'Confirmed Ada is a full-time student under 24 who files her own return marked “can be claimed as a dependent”.',
  'Checked dependent SSNs against Social Security cards or the prior-year return as filed.',
  'Retained the records relied on for 3 years (Form 8867, part III).',
]

function Judgments() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const [open, setOpen] = useState(false)
  const [dd, setDd] = useState<boolean[]>(DD_ITEMS.map(() => false))
  const ddDone = w.judgments.find((j) => j.category === 'due_diligence')
  const elections = [
    { topic: 'Studio equipment cost recovery', options: m.packet.what_if.alternatives.filter((a) => a.id.startsWith('equipment')).map((a) => `${a.description} (federal ${signed(a.federal.total_tax_change)}, CA ${signed(a.california.total_tax_change)})`), base: '100% special depreciation (engine default)' },
    { topic: 'Itemize or standard deduction', options: m.packet.what_if.alternatives.filter((a) => a.id === 'standard_deduction').map((a) => `${a.description} (federal ${signed(a.federal.total_tax_change)})`), base: 'Itemize' },
    { topic: 'Underpayment penalty method', options: m.packet.what_if.alternatives.filter((a) => a.id === 'penalty_annualized').map((a) => `${a.description} (penalty change ${signed(a.federal.penalty_change)})`), base: 'Regular method' },
  ]
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="display font-semibold">Judgment log</h3><Button size="sm" icon={<Scale size={13} />} disabled={!perms.canEdit} onClick={() => setOpen(true)}>Record judgment</Button></div>
          {w.judgments.length === 0 ? <p className="text-sm text-ink-500">No judgment calls recorded. Each one records the decision, the reasoning and the authority relied on.</p> : (
            <ul className="space-y-3">
              {w.judgments.slice().reverse().map((j) => (
                <li key={j.jId} className="rounded-lg p-3 ring-1 ring-ink-200">
                  <div className="flex items-center gap-2 text-2xs text-ink-500"><Chip>{j.category.replace('_', ' ')}</Chip>{personName(m, j.by)} · {ago(j.at)}</div>
                  <div className="mt-1 text-sm font-medium">{j.topic}</div>
                  <p className="text-sm text-ink-700">{j.decision}</p>
                  <p className="mt-1 text-2xs text-ink-500">Authority: {j.authority}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="display mb-1 font-semibold">Elections and what-ifs</h3>
          <p className="mb-3 text-xs text-ink-500">Results come from the engine's own what-if runs, so they are exact rather than rate estimates.</p>
          <div className="space-y-3">
            {elections.map((e) => (
              <div key={e.topic} className="rounded-lg p-3 ring-1 ring-ink-200">
                <div className="text-sm font-medium">{e.topic}</div>
                <div className="mt-1 text-xs text-ink-500">Current: {e.base}</div>
                <ul className="mt-2 space-y-1">{e.options.map((o) => <li key={o} className="text-xs text-ink-700">• {o}</li>)}</ul>
                <Button size="sm" variant="ghost" className="mt-2" disabled={!perms.canEdit} onClick={() => record({ kind: 'judgment', jId: `j-${Date.now()}`, topic: e.topic, decision: `Keep: ${e.base}. Alternatives reviewed: ${e.options.join('; ')}`, authority: 'Engine what-if comparison; client preference', category: 'election' }, { toast: 'Election recorded' })}>Record: keep current</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="h-fit p-5">
        <div className="flex items-center gap-2"><ClipboardCheck size={16} /><h3 className="display font-semibold">Form 8867 due diligence</h3></div>
        <p className="mt-1 text-xs text-ink-500">Required for the child tax credit and credit for other dependents.</p>
        {ddDone ? (
          <div className="mt-3 rounded-lg bg-tick-soft p-3 text-xs"><b>Completed</b> by {personName(m, ddDone.by)} · {ago(ddDone.at)}<p className="mt-1 text-ink-600">{ddDone.decision}</p></div>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {DD_ITEMS.map((t, i) => (
                <li key={i}><label className="flex gap-2 text-xs text-ink-700"><input type="checkbox" className="mt-0.5 accent-tick" checked={dd[i]} onChange={(e) => setDd(dd.map((v, j) => (j === i ? e.target.checked : v)))} />{t}</label></li>
              ))}
            </ul>
            <Button className="mt-4 w-full" variant="tick" disabled={!perms.canEdit || !dd.every(Boolean)} onClick={() => record([
              { kind: 'judgment', jId: `dd-${Date.now()}`, topic: 'Form 8867 paid preparer due diligence (CTC/ODC)', decision: DD_ITEMS.join(' '), authority: 'IRC §6695(g); Treas. Reg. §1.6695-2', category: 'due_diligence' },
              { kind: 'step', step: 'Due diligence completed', done: true },
            ], { toast: 'Due diligence recorded' })}>Complete due diligence</Button>
          </>
        )}
      </Card>
      {open && <JudgmentDialog open onClose={() => setOpen(false)} />}
    </div>
  )
}

function Steps() {
  const r = useReadiness()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const { m } = useModel()
  return (
    <Card className="divide-y divide-ink-100">
      {r.steps.map((s) => (
        <div key={s.step} className="flex items-center gap-3 px-4 py-3">
          <button
            disabled={s.auto || !perms.canEdit}
            onClick={() => record({ kind: 'step', step: s.step, done: !s.done }, { toast: s.done ? 'Step reopened' : 'Step completed' })}
            className={cx('grid h-6 w-6 place-items-center rounded-md ring-1 transition', s.done ? 'bg-tick text-white ring-tick' : 'bg-white ring-ink-300 hover:ring-ink-500', s.auto && 'cursor-default')}
            aria-label={s.step}
          >
            {s.done && <Check size={14} />}
          </button>
          <span className="flex-1 text-sm">{s.step}</span>
          <span className="text-2xs text-ink-400">{s.auto ? 'Tracked automatically' : s.by ? `by ${personName(m, s.by)}` : 'Manual'}</span>
        </div>
      ))}
    </Card>
  )
}

function ClientAnswers() {
  const { m } = useModel()
  const [q, setQ] = useState('')
  const c = m.packet.client
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-3"><h3 className="display font-semibold">Questionnaire</h3><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="ml-auto h-8 w-48 rounded-md px-2 text-xs ring-1 ring-ink-200" /></div>
        <ul className="divide-y divide-ink-100">
          {c.questionnaire.filter((x) => (x.question + x.answer).toLowerCase().includes(q.toLowerCase())).map((x) => (
            <li key={x.id} className="py-2.5">
              <div className="flex gap-2 text-2xs text-ink-400"><span className="num">{x.id}</span><span>{x.answered_by}</span></div>
              <div className="text-xs text-ink-500">{x.question}</div>
              <div className="text-sm text-ink">{x.answer}</div>
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="display mb-3 font-semibold">Messages</h3>
          <ul className="space-y-3">{c.messages.map((x) => <li key={x.id} className="text-sm"><div className="text-2xs text-ink-400">{x.from} · {date(x.sent_at)} · <span className="num">{x.id}</span></div><p className="text-ink-700">{x.text}</p></li>)}</ul>
        </Card>
        <Card className="p-5">
          <h3 className="display mb-3 font-semibold">Call notes</h3>
          {c.call_notes.map((x) => <div key={x.id}><div className="text-2xs text-ink-400">{date(x.date)} · {x.participants.join(', ')}</div><ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-700">{x.notes.map((n) => <li key={n}>{n}</li>)}</ul></div>)}
        </Card>
      </div>
    </div>
  )
}

function Team() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const [hours, setHours] = useState<Record<string, string>>({})
  const budget = m.packet.firm.budget_hours
  const total = Object.values(budget).reduce((a, b) => a + b, 0)
  const spent = [...w.time.values()].reduce((a, b) => a + b, 0)
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-ink-600">
        <UserCog size={16} />
        <span>Assigned at start: preparer {personName(m, m.packet.firm.assignment_at_start.preparer)}, reviewer {personName(m, m.packet.firm.assignment_at_start.reviewer)}, partner {personName(m, m.packet.firm.assignment_at_start.partner)}.</span>
        <span className="num ml-auto">{spent.toFixed(1)} of {total} budgeted hours</span>
      </div>
      <Card className="divide-y divide-ink-100">
        {AREAS.map((a) => {
          const asg = w.assignments.get(a.id)
          const b = a.budgetKey ? budget[a.budgetKey] : undefined
          const t = w.time.get(a.id) ?? 0
          return (
            <div key={a.id} className="grid grid-cols-1 items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_200px_150px_220px]">
              <span className="text-sm font-medium">{a.name}</span>
              <select disabled={!(perms.role === 'reviewer' || perms.role === 'partner' || perms.canAdmin)} value={asg?.staffId ?? m.packet.firm.assignment_at_start.preparer} onChange={(e) => record({ kind: 'assign', area: a.id, staffId: e.target.value }, { toast: `${a.short} assigned to ${personName(m, e.target.value)}` })} className="rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-ink-200">
                {m.packet.firm.staff.filter((s) => s.role === 'preparer' || s.role === 'reviewer').map((s) => <option key={s.id} value={s.id}>{s.name}{!s.sensitive_data_clearance ? ' (no clearance)' : ''}</option>)}
              </select>
              <span className={cx('num text-xs', b != null && t > b ? 'text-pencil' : 'text-ink-600')}>{t.toFixed(1)}{b != null ? ` / ${b} h` : ' h'}</span>
              <div className="flex gap-1.5">
                <input value={hours[a.id] ?? ''} onChange={(e) => setHours({ ...hours, [a.id]: e.target.value })} placeholder="0.5" className="h-8 w-16 rounded-md px-2 text-xs ring-1 ring-ink-200" inputMode="decimal" />
                <Button size="sm" disabled={!perms.canEdit || !(Number(hours[a.id]) > 0)} onClick={() => { record({ kind: 'time', area: a.id, hours: Number(hours[a.id]) }, { toast: `Logged ${hours[a.id]} h on ${a.short}` }); setHours({ ...hours, [a.id]: '' }) }}>Log time</Button>
              </div>
            </div>
          )
        })}
      </Card>
      {void MessageSquareText}
    </div>
  )
}
