import { useState } from 'react'
import { Shield, Eye, Download, Upload, RotateCcw, Save, Plus, X } from 'lucide-react'
import { useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { Button, Card, Chip, Field, PageHeader, Tabs, cx, inputCls, Meter, Modal } from '../components/ui'
import { useStandards } from '../components/actions'
import { useReadiness } from '../store/readiness'
import { ago, mask, VERIFICATION_LABEL, humanize } from '../lib/format'
import { personName } from '../store/permissions'
import { AREAS } from '../data/areas'
import type { WPEvent } from '../store/events'
import { newId } from '../store/events'
import { SAMPLE } from '../data/sample'
import { sensitiveFields, returnForms } from '../data/derived'
import { validatePacket } from '../data/model'
import { set as idbSet, del as idbDel } from 'idb-keyval'
import { PACKET_OVERRIDE_KEY } from '../store/store'
import { snapshotFor } from '../store/derive'

export function Firm({ tab }: { tab?: string }) {
  const navigate = useStore((s) => s.navigate)
  const t = tab || 'standards'
  return (
    <div>
      <PageHeader eyebrow="Firm" title="Firm administration" sub="Standards every engagement follows, who can see sensitive data (and who did), time against budget, status, and the record itself." />
      <Tabs value={t} onChange={(v) => navigate(`/firm/${v}`)} className="mb-5 w-fit rounded-xl bg-ink-100/60 p-1" items={[{ id: 'standards', label: 'Standards' }, { id: 'access', label: 'Sensitive data & view log' }, { id: 'status', label: 'Status & time' }, { id: 'record', label: 'Record & retention' }]} />
      {t === 'standards' && <Standards />}
      {t === 'access' && <Access />}
      {t === 'status' && <Status />}
      {t === 'record' && <RecordTab />}
    </div>
  )
}

function Standards() {
  const std = useStandards()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(std)) as typeof std)
  const [newRule, setNewRule] = useState('')
  const [newType, setNewType] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(std)
  const ro = !perms.canAdmin
  return (
    <div className="space-y-5">
      {ro && <Card className="flex items-center gap-2 p-3 text-sm text-ink-600"><Shield size={14} /> {perms.why('admin')} Switch to Jo Kimura to edit.</Card>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="display mb-3 font-semibold">Verification methods</h3>
          <ul className="space-y-1.5">{draft.verification_types.map((v) => (
            <li key={v} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ring-ink-200">{VERIFICATION_LABEL[v] ?? humanize(v)}{!ro && <button onClick={() => setDraft({ ...draft, verification_types: draft.verification_types.filter((x) => x !== v) })} className="text-ink-300 hover:text-pencil"><X size={14} /></button>}</li>
          ))}</ul>
          {!ro && <div className="mt-2 flex gap-2"><input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. observed_original_document" className={cx(inputCls, 'h-8 text-xs')} /><Button size="sm" icon={<Plus size={12} />} disabled={!newType} onClick={() => { setDraft({ ...draft, verification_types: [...draft.verification_types, newType.trim().replace(/\s+/g, '_')] }); setNewType('') }}>Add</Button></div>}
        </Card>
        <Card className="p-5">
          <h3 className="display mb-3 font-semibold">Variance review</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Flag if change over (%)"><input disabled={ro} type="number" className={inputCls} value={draft.variance_review.flag_if_change_over_percent} onChange={(e) => setDraft({ ...draft, variance_review: { ...draft.variance_review, flag_if_change_over_percent: Number(e.target.value) } })} /></Field>
            <Field label="…and over amount"><input disabled={ro} type="number" className={inputCls} value={draft.variance_review.and_over_amount} onChange={(e) => setDraft({ ...draft, variance_review: { ...draft.variance_review, and_over_amount: Number(e.target.value) } })} /></Field>
          </div>
          <h3 className="display mb-2 mt-5 font-semibold">Review levels</h3>
          <div className="flex gap-2">{draft.review_levels.map((l) => <Chip key={l} tone="ink">{l}</Chip>)}</div>
        </Card>
        <Card className="p-5">
          <h3 className="display mb-3 font-semibold">Rules</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-700">{draft.rules.map((r, i) => <li key={i} className="group">{r}{!ro && <button onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })} className="ml-2 text-ink-300 opacity-0 hover:text-pencil group-hover:opacity-100"><X size={12} /></button>}</li>)}</ol>
          {!ro && <div className="mt-2 flex gap-2"><input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="New rule" className={cx(inputCls, 'h-8 text-xs')} /><Button size="sm" disabled={!newRule} onClick={() => { setDraft({ ...draft, rules: [...draft.rules, newRule] }); setNewRule('') }}>Add</Button></div>}
          <p className="mt-3 text-2xs text-ink-500">Enforced in the app: no self-review, partner approval over 1,000, judgment authority required, blocking notes stop filing, masking without clearance, 8867 due diligence.</p>
        </Card>
        <Card className="p-5">
          <h3 className="display mb-3 font-semibold">Required steps</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-700">{draft.required_steps.map((r) => <li key={r}>{r}</li>)}</ol>
        </Card>
      </div>
      {!ro && <div className="flex justify-end gap-2"><Button variant="ghost" disabled={!dirty} onClick={() => setDraft(JSON.parse(JSON.stringify(std)))}>Discard</Button><Button variant="primary" icon={<Save size={14} />} disabled={!dirty} onClick={() => record({ kind: 'standards.update', standards: draft }, { toast: 'Firm standards updated for every engagement' })}>Save standards</Button></div>}
    </div>
  )
}

function Access() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const sensitive = sensitiveFields(m, w)
  const reveal = (id: string, label: string) => {
    if (!perms.clearance) return
    record({ kind: 'view.sensitive', field: id, subject: label })
    setShown({ ...shown, [id]: true })
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="display mb-1 font-semibold">Sensitive data</h3>
        <p className="mb-3 text-xs text-ink-500">Masked by default. Revealing a value is logged with your name and the time. Staff without clearance cannot reveal.</p>
        <ul className="divide-y divide-ink-100">
          {sensitive.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 text-ink-700">{s.label}</span>
              <span className="num">{shown[s.id] ? s.value : mask(s.value)}</span>
              <Button size="sm" variant="ghost" icon={<Eye size={13} />} disabled={!perms.clearance || shown[s.id]} title={perms.why('unmask') ?? ''} onClick={() => reveal(s.id, s.label)}>{perms.clearance ? 'Reveal' : 'No clearance'}</Button>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <div className="eyebrow mb-2">Staff clearance</div>
          <ul className="space-y-1 text-sm">{m.packet.firm.staff.map((s) => <li key={s.id} className="flex items-center justify-between"><span>{s.name} <span className="text-2xs text-ink-400">{s.role.replace('_', ' ')}</span></span>{s.sensitive_data_clearance ? <Chip tone="tick">Cleared</Chip> : <Chip tone="pencil" title={s.note}>Not cleared</Chip>}</li>)}</ul>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="display mb-3 font-semibold">View log</h3>
        {w.sensitiveViews.length === 0 ? <p className="text-sm text-ink-500">No sensitive values have been revealed.</p> : (
          <ul className="space-y-1.5 text-sm">{w.sensitiveViews.slice().reverse().map((e) => e.kind === 'view.sensitive' && (
            <li key={e.id} className="flex justify-between gap-3"><span><b>{personName(m, e.actor)}</b> viewed {e.subject}</span><span className="text-2xs text-ink-400">{new Date(e.at).toLocaleString()}</span></li>
          ))}</ul>
        )}
      </Card>
    </div>
  )
}

function Status() {
  const { m } = useModel()
  const w = useWork()
  const r = useReadiness()
  const budget = m.packet.firm.budget_hours
  const total = Object.values(budget).reduce((a, b) => a + b, 0)
  const spent = [...w.time.values()].reduce((a, b) => a + b, 0)
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Client</th><th className="text-left font-medium">Return</th><th className="text-left font-medium">Stage</th><th className="text-left font-medium">Open items</th><th className="text-left font-medium">Team</th><th className="pr-4 text-left font-medium">Hours</th></tr></thead>
          <tbody><tr className="border-t border-ink-100">
            <td className="py-3 pl-4 font-medium">{m.packet.packet.name.split(' - ')[0]} <span className="num text-2xs text-ink-400">{m.packet.packet.client_id}</span></td>
            <td>{returnForms(m)} · {m.packet.household.tax_year}</td>
            <td><Chip tone={r.ready ? 'tick' : 'amber'}>{r.stage}</Chip></td>
            <td className="text-xs">{r.blockers.filter((b) => !b.done).map((b) => b.label).join(' · ') || 'None'}</td>
            <td className="text-xs">{personName(m, m.packet.firm.assignment_at_start.preparer)}, {personName(m, m.packet.firm.assignment_at_start.reviewer)}, {personName(m, m.packet.firm.assignment_at_start.partner)}</td>
            <td className="num pr-4 text-xs">{spent.toFixed(1)} / {total}</td>
          </tr></tbody>
        </table>
      </Card>
      <Card className="p-5">
        <h3 className="display mb-3 font-semibold">Time against budget</h3>
        <ul className="space-y-2.5">
          {Object.entries(budget).map(([k, b]) => {
            const area = AREAS.find((a) => a.budgetKey === k)
            const t = area ? w.time.get(area.id) ?? 0 : w.time.get(k) ?? 0
            return <li key={k} className="grid grid-cols-[220px_minmax(0,1fr)_80px] items-center gap-3 text-sm"><span className="text-ink-700">{humanize(k)}</span><Meter value={t} max={b} tone={t > b ? 'pencil' : 'ink'} /><span className="num text-right text-xs">{t.toFixed(1)} / {b}h</span></li>
          })}
        </ul>
      </Card>
    </div>
  )
}

function RecordTab() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const reset = useStore((s) => s.resetAll)
  const importEvents = useStore((s) => s.importEvents)
  const [confirm, setConfirm] = useState(false)
  const custom = useStore((s) => s.customPacket)
  const [packetError, setPacketError] = useState<string | null>(null)
  const filed = [...w.filing].reverse().find((f) => f.action === 'efile-accepted')
  const destroy = filed ? new Date(new Date(filed.at).getTime() + 7 * 365.25 * 86400000).toISOString().slice(0, 10) : 'seven years after filing'
  const exportLog = () => {
    const blob = new Blob([JSON.stringify({ packet: m.packet.packet, exported_at: new Date().toISOString(), events: w.events }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `workpaper-${m.packet.packet.client_id}-events.json`
    a.click()
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="display mb-1 font-semibold">The record</h3>
        <p className="text-sm text-ink-600">The packet is never modified. Everything the firm did is an append-only log of <b className="num">{w.events.length}</b> events, saved in this browser and shared live with other open tabs. Export it to archive the engagement, or to hand it to another reviewer.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={<Download size={14} />} onClick={exportLog}>Export event log</Button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium ring-1 ring-ink-200 hover:bg-ink-50"><Upload size={14} /> Import<input type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const j = JSON.parse(await f.text()); importEvents((j.events ?? j) as WPEvent[]) }} /></label>
          <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={!perms.canAdmin && perms.role !== 'partner'} onClick={() => setConfirm(true)}>Reset demo</Button>
        </div>
        <div className="mt-5 border-t border-ink-100 pt-4">
          <h4 className="display text-sm font-semibold">Packet</h4>
          <p className="mt-1 text-xs text-ink-600">{custom ? `A custom packet is open (${m.packet.packet.name}). It has its own event log.` : `The delivered packet is open (${m.packet.packet.name}, generated ${m.packet.packet.generated}).`} Any packet in the same format opens here: every view, check and schedule is computed from it.</p>
          {packetError && <p className="mt-2 rounded-md bg-pencil-soft px-2 py-1.5 text-xs text-pencil-deep">{packetError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <label className={cx('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium ring-1 ring-ink-200 hover:bg-ink-50', !perms.canAdmin && 'pointer-events-none opacity-45')} title={perms.canAdmin ? '' : perms.why('admin') ?? ''}><Upload size={14} /> Open another packet<input type="file" accept="application/json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const j = JSON.parse(await f.text())
                const problems = validatePacket(j)
                if (problems.length) { setPacketError(`Not opened: ${problems.join('; ')}.`); return }
                await idbSet(PACKET_OVERRIDE_KEY, j)
                location.reload()
              } catch (err) { setPacketError(`Not opened: ${String((err as Error).message)}`) }
            }} /></label>
            {custom && <Button variant="secondary" onClick={async () => { await idbDel(PACKET_OVERRIDE_KEY); location.reload() }}>Restore the delivered packet</Button>}
          </div>
        </div>
        {!custom && <div className="mt-4"><Button variant="ghost" onClick={() => {
            const t0 = Date.now() - 1000 * 60 * 60 * 26
            let i = 0
            const evs = SAMPLE.flatMap((g) => g.events.map((e) => {
              const ev = { ...e, id: newId(), at: new Date(t0 + (i++) * 1000 * 60 * 23).toISOString(), actor: g.actor } as WPEvent
              if (ev.kind === 'signoff') ev.snapshot = snapshotFor(m, ev.scope, (k) => { const l = m.lineMaps.get(m.current.version)!.get(k); return l && typeof l.value === 'number' ? l.value : null }, new Map())
              return ev
            }))
            importEvents(evs)
          }}>Load sample team activity</Button></div>}
      </Card>
      <Card className="p-5">
        <h3 className="display mb-1 font-semibold">Retention</h3>
        <p className="text-sm text-ink-600">Firm rule: retain 7 years after filing, then destroy. {filed ? <>Filed {filed.at.slice(0, 10)} → scheduled destruction <b className="num">{destroy}</b>.</> : 'The clock starts when the return is accepted.'}</p>
        <p className="mt-2 text-2xs text-ink-500">The 2028 examination letter falls inside the window, and the response record is built from this log.</p>
      </Card>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Reset the demo?" footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Keep my work</Button><Button variant="danger" onClick={async () => { await reset(); setConfirm(false) }}>Erase all workpaper events</Button></>}>
        <p className="text-sm text-ink-600">This deletes all {w.events.length} events (verifications, adjustments, notes, sign-offs) in this browser and in other open tabs. The packet itself is untouched. Export first if you want to keep them.</p>
      </Modal>
      {void ago}
    </div>
  )
}
