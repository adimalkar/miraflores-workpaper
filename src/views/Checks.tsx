import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ShieldCheck, ShieldAlert, Wand2, X, HelpCircle, Scale, FileText, GitBranch, EyeOff, CheckCircle2 } from 'lucide-react'
import { useFindingState, useModel, usePerms, useWork } from '../store/context'
import { useStore, type NewEvent } from '../store/store'
import { newId } from '../store/events'
import { Button, Card, Chip, Modal, PageHeader, Tabs, cx, inputCls } from '../components/ui'
import { JudgmentDialog, QuestionDialog } from '../components/actions'
import { effectOf, addEffects, ZERO_EFFECT, type TaxEffect } from '../data/effects'
import { signed, money } from '../lib/format'
import { AREA_BY_ID } from '../data/areas'
import type { Finding, Proposal } from '../data/checks'
import { personName } from '../store/permissions'

const SEV: Record<string, { label: string; tone: 'pencil' | 'amber' | 'neutral' }> = {
  blocking: { label: 'Blocks e-file', tone: 'pencil' }, error: { label: 'Error', tone: 'pencil' },
  warning: { label: 'Needs a decision', tone: 'amber' }, info: { label: 'For the record', tone: 'neutral' },
}
const KIND: Record<string, string> = {
  engine: 'Engine error', extraction: 'Misread document', conflict: 'Sources disagree', completeness: 'Completeness', judgment: 'Judgment call', outside: 'Outside filing',
}

export function proposalEffect(f: Finding, m: ReturnType<typeof useModel>['m']): TaxEffect {
  return f.proposals.reduce((acc, p) => ('effects' in p ? addEffects(acc, effectOf(p.effects, m.current)) : acc), ZERO_EFFECT)
}

export function proposalEvents(f: Finding, m: ReturnType<typeof useModel>['m'], w: ReturnType<typeof useWork>): NewEvent[] {
  const evs: NewEvent[] = []
  for (const p of f.proposals) evs.push(...eventsFor(p, f, m, w))
  return evs
}

function eventsFor(p: Proposal, f: Finding, m: ReturnType<typeof useModel>['m'], w: ReturnType<typeof useWork>): NewEvent[] {
  if (p.kind === 'household') {
    const person = m.packet.household.people.find((x) => x.id === p.personId)!
    return [{ kind: 'household.correct', personId: p.personId, field: 'ssn', from: w.ssnFix.get(p.personId) ?? person.ssn, to: p.to, reason: p.reason }]
  }
  if (p.kind === 'extraction') {
    return [{ kind: 'extraction.correct', evId: p.evId, from: m.ev.get(p.evId)?.value, to: p.to, reason: p.reason }]
  }
  const orig = m.lineMaps.get(m.current.version)!.get(p.lineKey)
  return [{
    kind: 'adjust', adjId: newId('adj'), lineKey: p.lineKey, from: typeof orig?.value === 'number' ? orig.value : null, to: p.to, reason: p.reason,
    effects: p.effects, findingId: f.id, ...(p.kind === 'new-line' ? { isNew: { label: p.label, form: p.form } } : {}),
  }]
}

export function Checks({ focus }: { focus?: string }) {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const navigate = useStore((s) => s.navigate)
  const [tab, setTab] = useState<'open' | 'resolved' | 'dismissed' | 'engine'>('open')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const list = fs.filter((x) => x.status === tab)
  const current = fs.find((x) => x.f.id === focus) ?? list[0]
  const engineSilent = fs.filter((x) => !x.f.engineDiagnostic).length
  const allEffect = useMemo(() => fs.filter((x) => x.status === 'open').reduce((acc, x) => addEffects(acc, proposalEffect(x.f, m)), ZERO_EFFECT), [fs, m])

  const applyMany = (ids: string[]) => {
    const evs = fs.filter((x) => ids.includes(x.f.id) && x.f.proposals.length).flatMap((x) => proposalEvents(x.f, m, w))
    if (!evs.length) return
    record(evs, { toast: `Applied fixes for ${ids.length} findings` })
    setPicked(new Set())
  }

  return (
    <div>
      <PageHeader
        eyebrow="Checks that don't trust the engine"
        title="Independent checks"
        sub={`Each check rebuilds a figure from the documents, the client's own words, the prior year or the agency records and compares it with the engine. ${fs.length} findings; the engine's own diagnostics mention ${fs.length - engineSilent} of them.`}
        right={perms.canEdit && fs.some((x) => x.status === 'open' && x.f.proposals.length) ? (
          <Button variant="primary" icon={<Wand2 size={14} />} disabled={!!w.frozenAt} onClick={() => applyMany(fs.filter((x) => x.status === 'open' && x.f.proposals.length && x.f.kind !== 'judgment').map((x) => x.f.id))}>Apply all clear-cut fixes</Button>
        ) : undefined}
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Open" value={fs.filter((x) => x.status === 'open').length} tone="pencil" />
        <Stat label="Engine was silent on" value={engineSilent} />
        <Stat label="Federal tax if all open fixes applied" value={signed(allEffect.federalTax)} mono />
        <Stat label="California tax if applied" value={signed(allEffect.californiaTax)} mono />
      </div>
      <Tabs value={tab} onChange={(v) => { setTab(v); setPicked(new Set()) }} className="mb-4 w-fit rounded-xl bg-ink-100/60 p-1" items={[
        { id: 'open', label: 'Open', count: fs.filter((x) => x.status === 'open').length },
        { id: 'resolved', label: 'Resolved', count: fs.filter((x) => x.status === 'resolved').length },
        { id: 'dismissed', label: 'Dismissed', count: fs.filter((x) => x.status === 'dismissed').length },
        { id: 'engine', label: 'Engine diagnostics', count: m.current.diagnostics.length },
      ]} />
      {tab === 'engine' ? <EngineDiagnostics /> : (
        <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-2">
            <AnimatePresence>
              {picked.size > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs text-white">
                  <span className="num">{picked.size} selected</span>
                  <Button size="sm" variant="tick" className="ml-auto" disabled={!perms.canEdit} onClick={() => applyMany([...picked])}>Apply fixes</Button>
                  <button onClick={() => setPicked(new Set())} className="text-ink-300 hover:text-white"><X size={14} /></button>
                </motion.div>
              )}
            </AnimatePresence>
            {list.length === 0 && <Card className="p-6 text-center text-sm text-ink-500"><ShieldCheck className="mx-auto mb-2 text-tick" />Nothing here.</Card>}
            {list.map(({ f }) => {
              const eff = proposalEffect(f, m)
              const active = current?.f.id === f.id
              return (
                <div key={f.id} className={cx('relative rounded-xl ring-1 transition', active ? 'bg-white shadow-sheet ring-ink-300' : 'bg-white/60 ring-ink-200 hover:bg-white')}>
                  {active && <motion.span layoutId="check-active" className="absolute -left-px top-3 h-8 w-[3px] rounded-r bg-pencil" />}
                  <div className="flex items-start gap-2 p-3">
                    {tab === 'open' && f.proposals.length > 0 && (
                      <input type="checkbox" checked={picked.has(f.id)} onChange={(e) => { const n = new Set(picked); e.target.checked ? n.add(f.id) : n.delete(f.id); setPicked(n) }} className="mt-1 accent-ink" aria-label={`Select ${f.title}`} />
                    )}
                    <button onClick={() => navigate(`/checks/${f.id}`)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={SEV[f.severity].tone}>{SEV[f.severity].label}</Chip>
                        <span className="text-2xs text-ink-400">{AREA_BY_ID.get(f.area)?.short}</span>
                        {!f.engineDiagnostic && <span className="flex items-center gap-1 text-2xs text-ink-400" title="The engine raised no diagnostic for this"><EyeOff size={10} /> engine silent</span>}
                      </div>
                      <div className="mt-1.5 text-sm font-medium leading-snug text-ink">{f.title}</div>
                      {(eff.federalTax !== 0 || eff.californiaTax !== 0 || eff.federalBalance !== 0 || eff.californiaBalance !== 0) && (
                        <div className="num mt-1 text-2xs text-ink-500">Fed {signed(eff.federalBalance)} · CA {signed(eff.californiaBalance)} on balance</div>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <AnimatePresence mode="wait">
            {current && <FindingDetail key={current.f.id} x={current} />}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone, mono }: { label: string; value: React.ReactNode; tone?: 'pencil'; mono?: boolean }) {
  return (
    <Card className="p-4">
      <div className="eyebrow">{label}</div>
      <div className={cx('display mt-1 text-2xl font-semibold', tone === 'pencil' && 'text-pencil', mono && 'num')}>{value}</div>
    </Card>
  )
}

function FindingDetail({ x }: { x: ReturnType<typeof useFindingState>[number] }) {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const openTrace = useStore((s) => s.openTrace)
  const openDoc = useStore((s) => s.openDoc)
  const navigate = useStore((s) => s.navigate)
  const { f } = x
  const eff = proposalEffect(f, m)
  const [dlg, setDlg] = useState<null | 'dismiss' | 'judgment' | 'ask'>(null)
  const [reason, setReason] = useState('')
  const openRef = (r: string) => {
    const ref = m.resolveRef(r)
    if (ref.kind === 'ev') openDoc({ docId: ref.docId!, evId: r, page: ref.page })
    else if (ref.kind === 'doc' || ref.kind === 'page') openDoc({ docId: ref.docId!, page: ref.page })
    else if (ref.kind === 'line' || m.lineMaps.get(m.current.version)!.has(r)) openTrace(r)
    else if (ref.kind === 'qa' || ref.kind === 'msg' || ref.kind === 'call') navigate(`/review/client`)
    else if (ref.kind === 'agency') navigate('/schedules/payments')
    else if (ref.kind === 'py') navigate('/schedules/prior')
  }
  const wi = f.whatIf ? m.packet.what_if.alternatives.find((a) => a.id === f.whatIf) : undefined
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={SEV[f.severity].tone}>{SEV[f.severity].label}</Chip>
          <Chip>{KIND[f.kind]}</Chip>
          <span className="text-2xs text-ink-500">{AREA_BY_ID.get(f.area)?.name}</span>
          {x.status !== 'open' && <Chip tone={x.status === 'resolved' ? 'tick' : 'neutral'} icon={<CheckCircle2 size={11} />}>{x.status} {x.by ? `· ${personName(m, x.by)}` : ''}</Chip>}
        </div>
        <h2 className="display mt-3 text-2xl font-semibold leading-tight">{f.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{f.summary}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className={cx('rounded-lg px-3 py-2.5 text-xs ring-1', f.engineDiagnostic ? 'bg-ink-50 ring-ink-200' : 'bg-pencil-soft/50 ring-pencil/25')}>
            <div className="eyebrow mb-1">What the engine said</div>
            {f.engineDiagnostic ? <>Flagged as <span className="num">{f.engineDiagnostic}</span>{m.current.diagnostics.find((d) => d.code === f.engineDiagnostic) ? `: ${m.current.diagnostics.find((d) => d.code === f.engineDiagnostic)!.message}` : ' in earlier versions.'}</> : 'Nothing. No diagnostic, full confidence on the values involved.'}
          </div>
          <div className="rounded-lg bg-ink-50 px-3 py-2.5 text-xs ring-1 ring-ink-200">
            <div className="eyebrow mb-1">How this check works</div>{f.method}
          </div>
        </div>

        <h3 className="eyebrow mb-2 mt-6">Evidence</h3>
        <ol className="space-y-2">
          {f.facts.map((fact, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-hilite-soft text-2xs text-ink-700 ring-1 ring-hilite-deep/30">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-ink-700">{fact.text}</p>
                {fact.refs && fact.refs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {fact.refs.map((r) => (
                      <button key={r} onClick={() => openRef(r)} className="num inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-2xs text-ink-600 ring-1 ring-ink-200 hover:ring-ink-400">
                        {r.startsWith('ev-') || /^D\d/.test(r) || r.startsWith('doc:') ? <FileText size={10} /> : <GitBranch size={10} />}{r.replace('py:/', 'prior ').replace('agency:/', '')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {f.proposals.length > 0 && (
          <>
            <h3 className="eyebrow mb-2 mt-6">Proposed fix</h3>
            <div className="overflow-hidden rounded-lg ring-1 ring-ink-200">
              {f.proposals.map((p, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-ink-100 px-3 py-2.5 text-sm last:border-0">
                  {p.kind === 'household' ? (
                    <><span className="flex-1">Correct {m.packet.household.people.find((q) => q.id === p.personId)?.name}'s SSN</span><span className="num text-xs">{perms.clearance ? `${m.packet.household.people.find((q) => q.id === p.personId)?.ssn} → ${p.to}` : '•••-••-•••• (masked)'}</span></>
                  ) : p.kind === 'extraction' ? (
                    <><span className="flex-1">Correct the extracted value ({p.evId})</span><span className="num text-xs">{String(m.ev.get(p.evId)?.value)} → {p.to}</span></>
                  ) : (
                    <>
                      <button onClick={() => openTrace(p.lineKey)} className="num shrink-0 text-2xs text-ink-500 hover:underline">{p.lineKey}{p.kind === 'new-line' && ' (new)'}</button>
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-600">{p.reason}</span>
                      <span className="num text-xs"><span className="text-ink-400">{p.kind === 'new-line' ? '—' : money(Number(m.lineMaps.get(m.current.version)!.get(p.lineKey)?.value))}</span> → <b>{money(p.to)}</b></span>
                    </>
                  )}
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 bg-hilite-soft/60 px-3 py-2.5 text-xs sm:grid-cols-4">
                <div><div className="text-2xs text-ink-500">Federal tax</div><div className="num font-semibold">{signed(eff.federalTax)}</div></div>
                <div><div className="text-2xs text-ink-500">Federal balance</div><div className="num font-semibold">{signed(eff.federalBalance)}</div></div>
                <div><div className="text-2xs text-ink-500">California tax</div><div className="num font-semibold">{signed(eff.californiaTax)}</div></div>
                <div><div className="text-2xs text-ink-500">California balance</div><div className="num font-semibold">{signed(eff.californiaBalance)}</div></div>
              </div>
            </div>
            {wi && <p className="mt-2 text-2xs text-ink-500">Effect from the engine's own what-if <span className="num">{wi.id}</span>: {wi.description}</p>}
          </>
        )}

        {x.reason && x.status !== 'open' && <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600"><b>{x.status === 'dismissed' ? 'Dismissed' : 'Resolved'}:</b> {x.reason}</p>}

        {!perms.isClient && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
            {x.status === 'open' && f.proposals.length > 0 && (
              <Button variant="primary" icon={<Wand2 size={14} />} disabled={!perms.canEdit || !!w.frozenAt} title={perms.why('edit') ?? ''} onClick={() => record(proposalEvents(f, m, w), { toast: `Applied: ${f.title}` })}>Apply fix</Button>
            )}
            {x.status === 'open' && <Button icon={<Scale size={14} />} disabled={!perms.canEdit} onClick={() => setDlg('judgment')}>Record judgment</Button>}
            {x.status === 'open' && <Button variant="ghost" icon={<HelpCircle size={14} />} disabled={!perms.canEdit} onClick={() => setDlg('ask')}>Ask the client</Button>}
            {x.status === 'open' && <Button variant="ghost" icon={<X size={14} />} disabled={!perms.canEdit} onClick={() => setDlg('dismiss')}>Dismiss</Button>}
            {x.status !== 'open' && !x.applied && perms.canEdit && <Button variant="ghost" onClick={() => record({ kind: 'finding.status', findingId: f.id, status: 'open', reason: 'Reopened' })}>Reopen</Button>}
            {x.applied && <span className="self-center text-xs text-ink-500">Fix in place. Revert its adjustments to reopen this check.</span>}
            {f.lines[0] && <Button variant="ghost" icon={<ShieldAlert size={14} />} onClick={() => openTrace(f.lines[0])}>Open {f.lines[0]}</Button>}
          </div>
        )}
      </Card>
      <Modal open={dlg === 'dismiss'} onClose={() => setDlg(null)} title="Dismiss finding" footer={<>
        <Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button>
        <Button variant="primary" disabled={reason.trim().length < 5} onClick={() => { record({ kind: 'finding.status', findingId: f.id, status: 'dismissed', reason }, { toast: 'Finding dismissed' }); setDlg(null); setReason('') }}>Dismiss</Button>
      </>}>
        <p className="mb-3 text-sm text-ink-600">Say why this doesn't need a change. The reason stays on the record for the reviewer and for anyone who reads the file later.</p>
        <textarea autoFocus className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
      {dlg === 'judgment' && <JudgmentDialog open onClose={() => setDlg(null)} topic={f.title} findingId={f.id} target={f.lines[0]} />}
      {dlg === 'ask' && <QuestionDialog open onClose={() => setDlg(null)} target={f.lines[0]} label={f.title} suggested={f.kind === 'judgment' ? `Can you send support for: ${f.title.toLowerCase()}?` : ''} />}
    </motion.div>
  )
}

function EngineDiagnostics() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const openRef = useStore((s) => s.openTrace)
  const [note, setNote] = useState<Record<string, string>>({})
  return (
    <div className="space-y-2">
      {m.current.diagnostics.map((d) => {
        const st = w.findingStatus.get(`diag-${d.code}`)
        return (
          <Card key={d.code} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={d.severity === 'warning' ? 'amber' : 'neutral'}>{d.severity}</Chip>
              <span className="num text-xs font-medium">{d.code}</span>
              {st && <Chip tone="tick">Resolved · {personName(m, st.by)}</Chip>}
              <span className="ml-auto flex flex-wrap gap-1">{d.refs.slice(0, 6).map((r) => <button key={r} onClick={() => openRef(r)} className="num rounded bg-ink-50 px-1.5 py-0.5 text-2xs ring-1 ring-ink-200">{r}</button>)}</span>
            </div>
            <p className="mt-2 text-sm text-ink-700">{d.message}</p>
            {st?.reason && <p className="mt-1 text-xs text-ink-500">Resolution: {st.reason}</p>}
            {!st && perms.canEdit && (
              <div className="mt-2 flex gap-2">
                <input value={note[d.code] ?? ''} onChange={(e) => setNote({ ...note, [d.code]: e.target.value })} placeholder="How it was resolved" className="h-8 flex-1 rounded-md px-2 text-xs ring-1 ring-ink-200" />
                <Button size="sm" disabled={(note[d.code] ?? '').length < 4} onClick={() => record({ kind: 'finding.status', findingId: `diag-${d.code}`, status: 'resolved', reason: note[d.code] }, { toast: `${d.code} resolved` })}>Resolve</Button>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
