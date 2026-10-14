import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FileDown, Cpu, Phone, MessageCircle, Send, AlertOctagon, CheckCircle2, CircleDollarSign, UserPlus, Mail, Play, Pause } from 'lucide-react'
import { useModel, useWork } from '../store/context'
import { useStore } from '../store/store'
import { Button, Card, Chip, PageHeader, Tabs, cx, Empty } from '../components/ui'
import { date, lineValue, money, signed, ago } from '../lib/format'
import { personName } from '../store/permissions'
import { AREAS, AREA_BY_ID, areaForLine } from '../data/areas'
import { useEffect } from 'react'

const ICON: Record<string, typeof FileDown> = {
  document_received: FileDown, return_computed: Cpu, client_call: Phone, client_message: MessageCircle, extension_filed_with_payment: Send,
  efile_rejected: AlertOctagon, efile_accepted_federal: CheckCircle2, efile_accepted_california: CheckCircle2, federal_balance_paid: CircleDollarSign,
  california_refund_issued: CircleDollarSign, staff_joined_engagement: UserPlus, notice_received: Mail,
}

export function Season({ tab }: { tab?: string }) {
  const navigate = useStore((s) => s.navigate)
  const t = (tab as 'replay' | 'compare' | 'changes') || 'replay'
  return (
    <div>
      <PageHeader eyebrow="Change over time" title="Season" sub="Replay the season as it happened, compare any two versions of the return, and see what changed since you last looked." />
      <Tabs value={t} onChange={(v) => navigate(`/season/${v}`)} className="mb-5 w-fit rounded-xl bg-ink-100/60 p-1" items={[{ id: 'replay', label: 'Replay' }, { id: 'compare', label: 'Compare versions' }, { id: 'changes', label: 'Since you last looked' }]} />
      {t === 'replay' && <Replay />}
      {t === 'compare' && <Compare />}
      {t === 'changes' && <Changes />}
    </div>
  )
}

function Replay() {
  const { m } = useModel()
  const openDoc = useStore((s) => s.openDoc)
  const tl = m.packet.timeline
  const [i, setI] = useState(tl.findIndex((e) => e.id === 'tl-17'))
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const h = setInterval(() => setI((x) => { if (x >= tl.length - 1) { setPlaying(false); return x } return x + 1 }), 1100)
    return () => clearInterval(h)
  }, [playing, tl.length])
  const at = tl[i].at
  const docsIn = m.docs.filter((d) => d.received_at <= at)
  const ver = [...m.versions].reverse().find((v) => v.computed_at <= at)
  const ev = tl[i]
  const describe = (e: typeof ev) => {
    const r = e.refs.map((x) => m.docById.get(x)?.title ?? m.packet.client.messages.find((q) => q.id === x)?.text ?? x).join(' · ')
    return e.detail ?? r
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <Button size="sm" variant="primary" icon={playing ? <Pause size={13} /> : <Play size={13} />} onClick={() => { if (i >= tl.length - 1) setI(0); setPlaying(!playing) }}>{playing ? 'Pause' : 'Play season'}</Button>
          <input type="range" min={0} max={tl.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)) }} className="flex-1 accent-ink" aria-label="Season position" />
          <span className="num w-24 text-right text-xs text-ink-500">{date(at)}</span>
        </div>
        <ol className="relative space-y-1 border-l border-ink-200 pl-5">
          {tl.map((e, j) => {
            const Icon = ICON[e.event] ?? FileDown
            const past = j <= i
            return (
              <li key={e.id}>
                <button onClick={() => { setPlaying(false); setI(j) }} className={cx('relative flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition', j === i ? 'bg-hilite-soft/70' : 'hover:bg-ink-50', !past && 'opacity-40')}>
                  <span className={cx('absolute -left-[29px] top-2 grid h-4 w-4 place-items-center rounded-full ring-2 ring-white', past ? (e.event.includes('reject') ? 'bg-pencil' : e.event === 'return_computed' ? 'bg-ink' : 'bg-tick') : 'bg-ink-200')} />
                  <Icon size={14} className="mt-0.5 shrink-0 text-ink-500" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">{e.event.replace(/_/g, ' ')}{e.actor && <span className="text-2xs font-normal text-ink-400">{personName(m, e.actor)}</span>}</span>
                    <span className="line-clamp-1 text-xs text-ink-500">{describe(e)}</span>
                  </span>
                  <span className="num shrink-0 text-2xs text-ink-400">{e.at.slice(0, 10)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </Card>
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <Card className="p-5">
              <div className="eyebrow">As of {date(at, true)}</div>
              <div className="display mt-1 text-lg font-semibold">{ev.event.replace(/_/g, ' ')}</div>
              <p className="mt-1 text-sm text-ink-600">{describe(ev)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-ink-50 p-3"><div className="eyebrow">Documents in</div><div className="num text-xl font-semibold">{docsIn.length}</div></div>
                <div className="rounded-lg bg-ink-50 p-3"><div className="eyebrow">Return version</div><div className="num text-xl font-semibold">{ver?.version ?? '—'}</div></div>
              </div>
              {ver && (
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-ink-500">Federal balance due</span><span className="num font-medium">{money(ver.summary.federal.balance_due)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">California balance</span><span className="num font-medium">{money(ver.summary.california.balance_due)}</span></div>
                  <div className="text-2xs text-ink-400">{ver.trigger}</div>
                </div>
              )}
              {ev.refs.filter((r) => m.docById.has(r)).map((r) => <Button key={r} size="sm" className="mr-1 mt-3" onClick={() => openDoc({ docId: r })}>Open {r}</Button>)}
            </Card>
          </motion.div>
        </AnimatePresence>
        <Card className="p-4 text-xs text-ink-500">Events after v3 (approval, e-file, payments, the 2028 letter) are scripted. On the Filing page the workpaper plays them out against your state: if Theo's SSN is still wrong when you transmit, the e-file is rejected exactly as it was in the real season.</Card>
      </div>
    </div>
  )
}

function Compare() {
  const { m } = useModel()
  const w = useWork()
  const openTrace = useStore((s) => s.openTrace)
  const opts = [...m.versions.map((v) => v.version), 'workpaper']
  const [a, setA] = useState('v1')
  const [b, setB] = useState('workpaper')
  const [area, setArea] = useState<string>('all')
  const val = (v: string, k: string) => (v === 'workpaper' ? (w.line(k)?.value ?? undefined) : m.lineMaps.get(v)!.get(k)?.value)
  const rows = useMemo(() => {
    const keys = new Set<string>()
    for (const v of m.versions) for (const l of v.lines) keys.add(l.key)
    for (const ad of w.adjustments.values()) keys.add(ad.lineKey)
    return [...keys].map((k) => ({ k, A: val(a, k), B: val(b, k) })).filter((r) => JSON.stringify(r.A) !== JSON.stringify(r.B))
      .filter((r) => area === 'all' || areaForLine({ key: r.k, form: r.k.split('.')[0] }) === area)
  }, [m, w, a, b, area])
  const summary = (v: string) => v === 'workpaper' ? null : m.versionById.get(v)!.summary
  const sa = summary(a), sb = summary(b)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={a} onChange={(e) => setA(e.target.value)} className="num rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-ink-200">{opts.map((o) => <option key={o}>{o}</option>)}</select>
        <span className="text-ink-400">→</span>
        <select value={b} onChange={(e) => setB(e.target.value)} className="num rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-ink-200">{opts.map((o) => <option key={o}>{o}</option>)}</select>
        <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-ink-200"><option value="all">All areas</option>{AREAS.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}</select>
        <span className="text-xs text-ink-500">{rows.length} lines differ</span>
      </div>
      {sa && sb && (
        <div className="grid gap-3 sm:grid-cols-4">
          {([['Federal AGI', sa.federal.agi, sb.federal.agi], ['Federal total tax', sa.federal.total_tax, sb.federal.total_tax], ['Federal balance', sa.federal.balance_due, sb.federal.balance_due], ['CA balance', sa.california.balance_due, sb.california.balance_due]] as const).map(([l, x, y]) => (
            <Card key={l} className="p-3"><div className="eyebrow">{l}</div><div className="num mt-1 text-sm">{money(x)} → <b>{money(y)}</b></div><div className="num text-2xs text-ink-500">{signed(y - x)}</div></Card>
          ))}
        </div>
      )}
      {(a !== 'workpaper' && b !== 'workpaper') && (
        <Card className="p-3 text-xs text-ink-600">{m.versionById.get(b)?.trigger}</Card>
      )}
      <Card className="overflow-hidden">
        {rows.length === 0 ? <div className="p-8"><Empty title="No differences">Pick two different versions.</Empty></div> : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50/70 text-2xs uppercase tracking-wider text-ink-400"><tr><th className="py-2 pl-4 text-left font-medium">Line</th><th className="text-left font-medium">Area</th><th className="text-right font-medium">{a}</th><th className="text-right font-medium">{b}</th><th className="pr-4 text-right font-medium">Change</th></tr></thead>
            <tbody>
              {rows.slice(0, 400).map((r) => {
                const l = w.line(r.k) ?? m.versions.map((v) => m.lineMaps.get(v.version)!.get(r.k)).find(Boolean)
                const d = typeof r.A === 'number' && typeof r.B === 'number' ? r.B - r.A : null
                return (
                  <tr key={r.k} onClick={() => openTrace(r.k)} className="cursor-pointer border-t border-ink-100 hover:bg-ink-50/60">
                    <td className="py-1.5 pl-4"><span className="num mr-2 text-2xs text-ink-400">{r.k}</span><span className="text-ink-700">{l?.label.slice(0, 80)}</span></td>
                    <td className="text-2xs text-ink-500">{AREA_BY_ID.get(areaForLine({ key: r.k, form: r.k.split('.')[0] }))?.short}</td>
                    <td className="num text-right text-ink-500">{r.A === undefined ? <Chip>added</Chip> : lineValue(r.A)}</td>
                    <td className="num text-right font-medium">{r.B === undefined ? <Chip>removed</Chip> : lineValue(r.B)}</td>
                    <td className="num pr-4 text-right text-xs">{d != null ? signed(d) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function Changes() {
  const { m } = useModel()
  const w = useWork()
  const actor = useStore((s) => s.actor)
  const record = useStore((s) => s.record)
  const openTrace = useStore((s) => s.openTrace)
  const last = w.lastSeen.get(actor)
  const evs = w.active.filter((e) => e.kind !== 'seen' && e.kind !== 'view.sensitive' && e.actor !== actor && (!last || e.at > last)).reverse()
  const target = (e: (typeof evs)[number]) => ('lineKey' in e ? e.lineKey : 'target' in e ? e.target : undefined) as string | undefined
  return (
    <div>
      <div className="mb-4 flex items-center gap-3 text-sm text-ink-600">
        <span>{last ? `You last marked this file as seen ${ago(last)}.` : 'You have not marked this file as seen yet.'} Showing work by others since then.</span>
        <Button size="sm" className="ml-auto" onClick={() => record({ kind: 'seen', view: 'all' }, { toast: 'Marked as seen' })}>Mark all as seen</Button>
      </div>
      {evs.length === 0 ? <Empty title="Nothing new from anyone else">Open a second tab as another person (role switcher) and make a change: it appears here live.</Empty> : (
        <Card className="divide-y divide-ink-100">
          {evs.map((e) => (
            <motion.div key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-32 shrink-0 truncate font-medium">{personName(m, e.actor)}</span>
              <span className="text-ink-600">{describeEvent(e)}</span>
              {target(e) && <button onClick={() => openTrace(target(e)!)} className="num rounded bg-ink-50 px-1.5 py-0.5 text-2xs ring-1 ring-ink-200">{target(e)}</button>}
              <span className="ml-auto text-2xs text-ink-400">{ago(e.at)}</span>
            </motion.div>
          ))}
        </Card>
      )}
    </div>
  )
}

export function describeEvent(e: ReturnType<typeof useWork>['active'][number]): string {
  switch (e.kind) {
    case 'verify': return `verified (${e.method.replace(/_/g, ' ')})`
    case 'adjust': return `adjusted to ${money(e.to)}: ${e.reason}`
    case 'adjust.approve': return 'approved an adjustment'
    case 'adjust.revert': return 'reverted an adjustment'
    case 'note': return `${e.blocking ? 'added a blocking note' : 'added a note'}: ${e.text}`
    case 'note.resolve': return 'cleared a note'
    case 'note.reply': return `replied: ${e.text}`
    case 'question': return `asked: ${e.text}`
    case 'question.answer': return `answered: ${e.text}`
    case 'signoff': return `signed off ${e.scope} as ${e.level}`
    case 'judgment': return `recorded a ${e.category.replace('_', ' ')}: ${e.topic}`
    case 'finding.status': return `${e.status} a finding`
    case 'filing': return `filing: ${e.action.replace(/-/g, ' ')}`
    case 'household.correct': return 'corrected a dependent SSN'
    case 'extraction.correct': return `corrected an extracted value to ${e.to}`
    default: return e.kind.replace('.', ' ')
  }
}
