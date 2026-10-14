import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { X, ArrowUpRight, FileText, MessageSquareText, HelpCircle, Calculator, CornerDownRight, Pencil, ShieldAlert, History, Link2, Undo2, CheckCheck, AlertTriangle } from 'lucide-react'
import { useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { useLineProof, STATUS_META } from '../store/lineState'
import { Button, Chip, cx } from './ui'
import { TickMark } from './TickMark'
import { AdjustDialog, AttachButton, NoteDialog, QuestionDialog, VerifyDialog } from './actions'
import { VERIFICATION_LABEL, ago, lineValue, money, signed, pct } from '../lib/format'
import { AREA_BY_ID, areaForLine } from '../data/areas'
import { personName } from '../store/permissions'
import type { ExtractedValue } from '../data/types'

export function TracePanel({ lineKey }: { lineKey: string }) {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const openTrace = useStore((s) => s.openTrace)
  const openDoc = useStore((s) => s.openDoc)
  const navigate = useStore((s) => s.navigate)
  const record = useStore((s) => s.record)
  const proof = useLineProof(lineKey)
  const l = w.line(lineKey)
  const [dlg, setDlg] = useState<null | 'verify' | 'adjust' | 'note' | 'question'>(null)
  if (!l) return null
  const area = AREA_BY_ID.get(areaForLine(l))!
  const meta = STATUS_META[proof.status]
  const prior = m.priorLines[lineKey]
  const versions = m.versions.map((v) => ({ v: v.version, at: v.computed_at, val: m.lineMaps.get(v.version)!.get(lineKey)?.value }))
  const parents = m.parents.get(lineKey) ?? []
  const attachments = w.attachments.filter((a) => a.target === lineKey)
  const questions = [...w.questions.values()].filter((q) => q.target === lineKey)
  const activity = w.active.filter((e) => ('target' in e && e.target === lineKey) || ('lineKey' in e && e.lineKey === lineKey)).slice(-8).reverse()
  const frozen = !!w.frozenAt

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="no-print scroll-thin z-30 flex w-full max-w-[460px] shrink-0 flex-col overflow-y-auto border-l border-ink-200 bg-white max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:shadow-pop"
      aria-label={`Proof of ${lineKey}`}
    >
      <div className="sticky top-0 z-10 border-b border-ink-100 bg-white/95 px-5 pb-4 pt-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="num rounded-md bg-ink px-1.5 py-0.5 text-2xs font-medium text-white">{lineKey}</span>
          <Chip tone="neutral">{l.jurisdiction === 'california' ? 'California' : 'Federal'}</Chip>
          <button onClick={() => navigate(`/return/${area.id}`)} className="text-2xs text-ink-500 hover:text-ink hover:underline">{area.short}</button>
          <button onClick={() => openTrace(null)} className="ml-auto rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink" aria-label="Close proof"><X size={16} /></button>
        </div>
        <h2 className="display mt-2 text-[17px] font-semibold leading-snug text-ink">{l.label}</h2>
        <div className="mt-3 flex items-end gap-3">
          <motion.div layoutId={`val-${lineKey}`} className="num text-[30px] font-semibold leading-none text-ink">{lineValue(l.value)}</motion.div>
          {proof.verification && <TickMark method={proof.verification.method} size={22} animate />}
          {(l.adjusted || l.flowed) && l.original !== undefined && <span className="num mb-0.5 text-sm text-ink-400 line-through decoration-pencil/60">{lineValue(l.original)}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip tone={meta.tone}>{meta.label}</Chip>
          {proof.recalc.status === 'foots' && <Chip tone="tick" icon={<Calculator size={11} />} title={proof.recalc.formula}>Re-footed</Chip>}
          {proof.recalc.status === 'differs' && <Chip tone="pencil" icon={<Calculator size={11} />}>Does not foot: {money(proof.recalc.expected)}</Chip>}
          {proof.agree.status === 'agrees' && <Chip tone="tick" icon={<CheckCheck size={11} />}>Agrees to source</Chip>}
          {proof.staleVerification && <Chip tone="pencil" icon={<AlertTriangle size={11} />}>Value moved since verified</Chip>}
          {l.flowed && <Chip tone="blue" title="An input was adjusted; this sum was carried forward exactly.">Flowed from adjusted inputs</Chip>}
          {l.pending && <Chip tone="amber" title="This line applies tax rules the workpaper cannot rerun. The tax effect is estimated with the version's per-dollar rates until the engine recomputes.">Awaiting engine recompute</Chip>}
        </div>
        {!perms.isClient && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {proof.verification
              ? <Button size="sm" variant="secondary" disabled={!perms.canEdit || frozen} onClick={() => record({ kind: 'unverify', target: lineKey }, { toast: 'Verification removed' })} icon={<Undo2 size={13} />}>Unverify</Button>
              : <Button size="sm" variant="tick" disabled={!perms.canEdit || frozen} title={perms.why('edit') ?? ''} onClick={() => setDlg('verify')} icon={<TickMark method="agreed_to_source_document" size={13} tone="muted" className="[&_path]:stroke-white" />}>Verify</Button>}
            <Button size="sm" disabled={!perms.canEdit || frozen || typeof l.value !== 'number'} onClick={() => setDlg('adjust')} icon={<Pencil size={13} />}>Adjust</Button>
            <Button size="sm" variant="ghost" disabled={!perms.canEdit && perms.role !== 'quality_reviewer'} onClick={() => setDlg('note')} icon={<MessageSquareText size={13} />}>Note</Button>
            <Button size="sm" variant="ghost" disabled={!perms.canEdit} onClick={() => setDlg('question')} icon={<HelpCircle size={13} />}>Ask</Button>
            <AttachButton target={lineKey} />
          </div>
        )}
      </div>

      <div className="space-y-6 px-5 py-5">
        {proof.adjustment && (
          <Block title="Adjustment" icon={<Pencil size={13} />}>
            <div className="rounded-lg bg-slateblue-soft/60 p-3 ring-1 ring-slateblue/20">
              <div className="flex items-baseline justify-between gap-3">
                <div className="num text-sm"><span className="text-ink-400 line-through">{money(proof.adjustment.from)}</span> → <span className="font-semibold">{money(proof.adjustment.to)}</span></div>
                <div className="num text-2xs text-ink-500">Fed {signed(proof.adjustment.effect.federalTax)} · CA {signed(proof.adjustment.effect.californiaTax)}</div>
              </div>
              <p className="mt-1.5 text-xs text-ink-600">{proof.adjustment.reason}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-ink-500">
                <span>{personName(m, proof.adjustment.by)} · {ago(proof.adjustment.at)}</span>
                {proof.adjustment.needsPartner && (proof.adjustment.approvedBy
                  ? <Chip tone="tick">Partner approved · {personName(m, proof.adjustment.approvedBy)}</Chip>
                  : <Chip tone="pencil">Needs partner sign-off</Chip>)}
              </div>
              <div className="mt-2 flex gap-1.5">
                {proof.adjustment.needsPartner && !proof.adjustment.approvedBy && perms.canApproveLarge && proof.adjustment.by !== perms.actor && (
                  <Button size="sm" variant="tick" onClick={() => record({ kind: 'adjust.approve', adjId: proof.adjustment!.adjId }, { toast: 'Adjustment approved' })}>Approve</Button>
                )}
                {perms.canEdit && !frozen && <Button size="sm" variant="ghost" onClick={() => record({ kind: 'adjust.revert', adjId: proof.adjustment!.adjId, reason: 'Reverted from the proof panel' }, { toast: 'Adjustment reverted; engine value restored' })}>Revert to engine value</Button>}
              </div>
            </div>
          </Block>
        )}

        {proof.findings.length > 0 && (
          <Block title="Independent checks" icon={<ShieldAlert size={13} />}>
            <div className="space-y-2">
              {proof.findings.map(({ f, status }) => (
                <button key={f.id} onClick={() => navigate(`/checks/${f.id}`)} className={cx('block w-full rounded-lg p-3 text-left ring-1 transition hover:shadow-sm', status === 'open' ? 'bg-pencil-soft/60 ring-pencil/25' : 'bg-ink-50 ring-ink-200')}>
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">{f.title}<ArrowUpRight size={13} className="ml-auto text-ink-400" /></div>
                  <p className="mt-1 line-clamp-3 text-xs text-ink-600">{f.summary}</p>
                  <div className="mt-1.5 text-2xs text-ink-500">{status === 'open' ? 'Open' : status === 'resolved' ? 'Resolved' : 'Dismissed'}</div>
                </button>
              ))}
            </div>
          </Block>
        )}

        <Block title="How it was built" icon={<Calculator size={13} />}>
          <p className="text-xs text-ink-600"><span className="num mr-1.5 rounded bg-ink-100 px-1 py-px text-2xs text-ink-600">{l.rule}</span>{m.ruleText(l.rule)}</p>
          {l.inputs.length > 0 && (
            <ul className="mt-3 divide-y divide-ink-100 rounded-lg ring-1 ring-ink-200">
              {l.inputs.map((k, i) => {
                const il = w.line(k)
                const neg = proof.recalc.formula?.includes(`− ${k}`)
                return (
                  <li key={k}>
                    <button onClick={() => openTrace(k)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-ink-50">
                      <span className="num w-3 text-ink-400">{i === 0 ? '' : neg ? '−' : '+'}</span>
                      <span className="num shrink-0 text-2xs text-ink-500">{k}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-700">{il?.label}</span>
                      <span className={cx('num font-medium', il && 'adjusted' in il && il.adjusted && 'text-slateblue')}>{lineValue(il?.value)}</span>
                    </button>
                  </li>
                )
              })}
              <li className="flex items-center justify-between bg-ink-50 px-3 py-2 text-xs">
                <span className="font-medium text-ink-600">= {l.label}</span>
                <span className="num font-semibold">{lineValue(l.value)}</span>
              </li>
            </ul>
          )}
          {l.note && <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">Engine note: {l.note}</p>}
        </Block>

        <Block title="Where it came from" icon={<FileText size={13} />}>
          {l.sources.length === 0 && l.inputs.length > 0 && <p className="text-xs text-ink-500">Computed from the lines above; follow any of them to its documents.</p>}
          {l.sources.length === 0 && l.inputs.length === 0 && <p className="text-xs text-ink-500">No source cited by the engine.</p>}
          <div className="space-y-2">
            {l.sources.map((s) => <SourceCard key={s} raw={s} onOpenDoc={(docId, evId, page) => openDoc({ docId, evId, page })} />)}
          </div>
        </Block>

        {parents.length > 0 && (
          <Block title="Flows into" icon={<CornerDownRight size={13} />}>
            <div className="flex flex-wrap gap-1.5">
              {parents.map((p) => (
                <button key={p} onClick={() => openTrace(p)} className="num rounded-md bg-ink-50 px-2 py-1 text-2xs text-ink-700 ring-1 ring-ink-200 hover:bg-white hover:ring-ink-300">{p} <span className="text-ink-400">{lineValue(w.line(p)?.value)}</span></button>
              ))}
            </div>
          </Block>
        )}

        <Block title="History" icon={<History size={13} />}>
          <ol className="relative space-y-2.5 border-l border-ink-200 pl-4">
            {prior !== undefined && (
              <li className="text-xs"><Dot c="bg-ink-300" />
                <span className="text-ink-500">{m.packet.household.tax_year - 1} as filed ({m.packet.prior_years.return_2024.prepared_by.split(' (')[0]})</span>
                <span className="num float-right font-medium">{lineValue(prior)}</span>
                {typeof prior === 'number' && typeof l.value === 'number' && prior !== 0 && <div className="num text-2xs text-ink-400">Change {signed(l.value - prior)} ({pct(((l.value - prior) / Math.abs(prior)) * 100)})</div>}
              </li>
            )}
            {versions.map((v) => (
              <li key={v.v} className="text-xs"><Dot c={v.v === m.current.version ? 'bg-ink' : 'bg-ink-300'} />
                <span className="text-ink-500">{v.v} · {new Date(v.at).toLocaleDateString()}</span>
                <span className={cx('num float-right font-medium', v.val === undefined && 'text-ink-300')}>{v.val === undefined ? 'not present' : lineValue(v.val)}</span>
              </li>
            ))}
            {[...w.adjustments.values()].filter((a) => a.lineKey === lineKey).map((a) => (
              <li key={a.adjId} className="text-xs"><Dot c="bg-slateblue" />
                <span className={cx('text-ink-500', a.reverted && 'line-through')}>Workpaper · {personName(m, a.by)}</span>
                <span className="num float-right font-medium text-slateblue">{money(a.to)}</span>
              </li>
            ))}
          </ol>
        </Block>

        {(proof.notes.length > 0 || questions.length > 0 || attachments.length > 0) && (
          <Block title="Notes, questions & evidence" icon={<Link2 size={13} />}>
            <div className="space-y-2">
              {proof.notes.map((n) => <NoteCard key={n.noteId} noteId={n.noteId} />)}
              {questions.map((q) => (
                <div key={q.qId} className="rounded-lg p-3 text-xs ring-1 ring-ink-200">
                  <div className="flex items-center gap-2 text-2xs text-ink-500"><HelpCircle size={12} /> {personName(m, q.by)} asked {q.to === 'client' ? 'the client' : personName(m, q.to)} · {ago(q.at)}</div>
                  <p className="mt-1 text-ink-700">{q.text}</p>
                  {q.answer ? <p className="mt-2 rounded-md bg-tick-soft px-2 py-1.5 text-ink-700"><b>{personName(m, q.answer.by)}:</b> {q.answer.text}</p> : <p className="mt-1.5 text-2xs text-amber">Awaiting answer</p>}
                </div>
              ))}
              {attachments.map((a) => (
                <div key={a.attId} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs ring-1 ring-ink-200">
                  <FileText size={13} className="text-ink-400" /><span className="font-medium">{a.fileName}</span>
                  <span className="text-ink-400">{a.note}</span><span className="ml-auto text-2xs text-ink-400">{personName(m, a.by)}</span>
                </div>
              ))}
            </div>
          </Block>
        )}

        {proof.verification && (
          <div className="flex items-start gap-3 rounded-lg bg-tick-soft/60 p-3 ring-1 ring-tick/20">
            <TickMark method={proof.verification.method} size={20} />
            <div className="text-xs">
              <div className="font-medium text-tick-deep">{VERIFICATION_LABEL[proof.verification.method]}</div>
              <div className="text-ink-600">{personName(m, proof.verification.by)} · {new Date(proof.verification.at).toLocaleString()}</div>
              {proof.verification.note && <p className="mt-1 text-ink-600">{proof.verification.note}</p>}
            </div>
          </div>
        )}

        {activity.length > 0 && (
          <Block title="Activity" icon={<History size={13} />}>
            <ul className="space-y-1.5 text-2xs text-ink-500">
              {activity.map((e) => <li key={e.id}><span className="font-medium text-ink-700">{personName(m, e.actor)}</span> {e.kind.replace('.', ' ')} · {ago(e.at)}</li>)}
            </ul>
          </Block>
        )}
      </div>

      <VerifyDialog open={dlg === 'verify'} onClose={() => setDlg(null)} target={lineKey} value={l.value} label={lineKey} />
      {dlg === 'adjust' && <AdjustDialog open lineKey={lineKey} onClose={() => setDlg(null)} />}
      {dlg === 'note' && <NoteDialog open target={lineKey} label={lineKey} onClose={() => setDlg(null)} />}
      {dlg === 'question' && <QuestionDialog open target={lineKey} label={lineKey} onClose={() => setDlg(null)} />}
    </motion.aside>
  )
}

function Dot({ c }: { c: string }) { return <span className={cx('absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-white', c)} /> }

function Block({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2.5 flex items-center gap-1.5">{icon}{title}</h3>
      {children}
    </section>
  )
}

export function NoteCard({ noteId }: { noteId: string }) {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const n = w.notes.get(noteId)
  const [reply, setReply] = useState('')
  if (!n) return null
  const canResolve = n.noteType === 'review' ? perms.canResolveReviewNotes : perms.canEdit
  return (
    <div className={cx('rounded-lg p-3 text-xs ring-1', n.resolved ? 'bg-ink-50 ring-ink-200' : n.blocking ? 'bg-pencil-soft/50 ring-pencil/30' : 'bg-white ring-ink-200')}>
      <div className="flex items-center gap-2 text-2xs text-ink-500">
        {n.blocking && !n.resolved && <Chip tone="pencil">Blocks filing</Chip>}
        <span>{personName(m, n.by)} · {ago(n.at)}</span>
        {n.assignee && <span>→ {personName(m, n.assignee)}</span>}
      </div>
      <p className={cx('mt-1.5 text-ink-700', n.resolved && 'line-through decoration-ink-300')}>{n.text}</p>
      {n.replies.map((r, i) => <p key={i} className="mt-1.5 border-l-2 border-ink-200 pl-2 text-ink-600"><b>{personName(m, r.by)}:</b> {r.text}</p>)}
      {n.resolved && <p className="mt-1.5 text-2xs text-tick-deep">Cleared by {personName(m, n.resolved.by)} · {ago(n.resolved.at)}{n.resolved.text ? ` — ${n.resolved.text}` : ''}</p>}
      {!perms.isClient && (
        <div className="mt-2 flex items-center gap-1.5">
          {!n.resolved && (perms.canEdit || perms.role === 'quality_reviewer') && (
            <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && reply.trim()) { record({ kind: 'note.reply', noteId, text: reply }); setReply('') } }} placeholder="Reply…" className="h-7 min-w-0 flex-1 rounded-md bg-white px-2 text-xs ring-1 ring-ink-200 focus:outline-none focus:ring-slateblue/50" />
          )}
          {!n.resolved && <Button size="sm" variant="secondary" disabled={!canResolve} title={canResolve ? '' : perms.why('resolve-review') ?? ''} onClick={() => record({ kind: 'note.resolve', noteId, text: reply || undefined }, { toast: 'Note cleared' })}>Clear</Button>}
          {n.resolved && perms.canEdit && <Button size="sm" variant="ghost" onClick={() => record({ kind: 'note.reopen', noteId })}>Reopen</Button>}
        </div>
      )}
    </div>
  )
}

export function SourceCard({ raw, onOpenDoc, compact }: { raw: string; onOpenDoc: (docId: string, evId?: string, page?: number) => void; compact?: boolean }) {
  const { m } = useModel()
  const w = useWork()
  const ref = m.resolveRef(raw)
  if (ref.kind === 'ev') {
    const e = m.ev.get(raw) as ExtractedValue
    const d = m.docById.get(e.document_id)
    const fix = w.extractionFix.get(raw)
    const verified = w.verifications.get(raw)
    return (
      <motion.button
        layoutId={compact ? undefined : `src-${raw}`}
        onClick={() => onOpenDoc(e.document_id, e.id, e.page)}
        className="group block w-full rounded-lg bg-white p-3 text-left ring-1 ring-ink-200 transition hover:shadow-sheet hover:ring-ink-300"
      >
        <div className="flex items-center gap-2">
          <span className="num rounded bg-hilite-soft px-1.5 py-px text-2xs font-medium text-ink-700 ring-1 ring-hilite-deep/30">{e.document_id} · p{e.page}</span>
          <span className="truncate text-xs font-medium text-ink">{d?.title}</span>
          <ArrowUpRight size={13} className="ml-auto shrink-0 text-ink-300 group-hover:text-ink" />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-xs text-ink-500">{e.label}</span>
          <span className="num text-sm font-semibold">{fix ? <><s className="text-ink-400">{String(e.value)}</s> {fix.to}</> : typeof e.value === 'number' ? money(e.value, { cents: !Number.isInteger(e.value) }) : String(e.value)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-2xs text-ink-400">
          <span>Read as “{e.text_as_read || 'blank'}”</span>
          <span className="ml-auto flex items-center gap-1">
            confidence
            <span className="inline-block h-1 w-10 overflow-hidden rounded-full bg-ink-100"><span className={cx('block h-full', e.confidence < 0.7 ? 'bg-pencil' : e.confidence < 0.95 ? 'bg-amber' : 'bg-tick')} style={{ width: `${e.confidence * 100}%` }} /></span>
            <span className="num">{Math.round(e.confidence * 100)}%</span>
          </span>
          {verified && <TickMark method={verified.method} size={12} />}
        </div>
      </motion.button>
    )
  }
  if (ref.kind === 'doc' || ref.kind === 'page') {
    return (
      <button onClick={() => onOpenDoc(ref.docId!, undefined, ref.page)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ring-1 ring-ink-200 hover:bg-ink-50">
        <FileText size={13} className="text-ink-400" /><span className="truncate">{ref.label}</span><ArrowUpRight size={12} className="ml-auto text-ink-300" />
      </button>
    )
  }
  return <RefCard raw={raw} />
}

export function RefCard({ raw }: { raw: string }) {
  const { m } = useModel()
  const ref = m.resolveRef(raw)
  const openTrace = useStore((s) => s.openTrace)
  let body: ReactNode = null
  if (ref.kind === 'qa') {
    const q = m.packet.client.questionnaire.find((x) => x.id === raw)!
    body = <><div className="text-ink-500">{q.question}</div><div className="mt-1 font-medium text-ink">“{q.answer}”</div><div className="mt-1 text-2xs text-ink-400">{q.answered_by} · questionnaire · {q.answered_at.slice(0, 10)}</div></>
  } else if (ref.kind === 'msg') {
    const x = m.packet.client.messages.find((y) => y.id === raw)!
    body = <><div className="font-medium text-ink">“{x.text}”</div><div className="mt-1 text-2xs text-ink-400">{x.from} · {x.sent_at.slice(0, 10)}</div></>
  } else if (ref.kind === 'call') {
    const c = m.packet.client.call_notes.find((y) => y.id === raw)!
    body = <><div className="text-2xs text-ink-400">Call {c.date.slice(0, 10)} · {c.participants.join(', ')}</div><ul className="mt-1 list-disc pl-4 text-ink-700">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul></>
  } else if (ref.kind === 'py') {
    const path = raw.slice(4).split('/').filter(Boolean)
    let cur: unknown = m.packet.prior_years
    for (const p of path) cur = (cur as Record<string, unknown>)?.[p.replace(/~1/g, '/')]
    const lk = path[path.length - 1]
    body = <><div className="text-ink-500">Prior year · {path.join(' › ')}</div><div className="num mt-1 font-medium text-ink">{typeof cur === 'object' ? JSON.stringify(cur).slice(0, 220) : lineValue(cur)}</div>{m.priorLabels[lk] && <div className="text-2xs text-ink-400">{m.priorLabels[lk]}</div>}</>
  } else if (ref.kind === 'asset') {
    const a = m.current.assets.find((x) => x.asset_id === ref.id)
    body = a ? <><div className="font-medium text-ink">{a.description}</div><div className="num mt-1 text-2xs text-ink-500">Cost {money(a.cost)} · {a.method} · {a.life_years}y · 2025 fed {money(a.federal.depreciation_2025, { cents: true })} · CA {money(a.california.depreciation_2025, { cents: true })}</div></> : ref.label
  } else if (ref.kind === 'line') {
    return <button onClick={() => openTrace(raw)} className="num rounded-md bg-ink-50 px-2 py-1 text-2xs ring-1 ring-ink-200">{raw}</button>
  } else {
    body = <div className="text-ink-600">{ref.label}</div>
  }
  return <div className="rounded-lg bg-ink-50/70 px-3 py-2.5 text-xs ring-1 ring-ink-200">{body}</div>
}
