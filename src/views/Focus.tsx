import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X, ArrowUp, ArrowDown, Check, CornerDownLeft } from 'lucide-react'
import { useFindingState, useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { useVerifyQueue, useWorkQueue, type WorkItem } from '../store/queue'
import { useLineProof } from '../store/lineState'
import { FindingDetail, proposalEvents } from './Checks'
import { TextPage } from '../components/DocViewer'
import { TickMark } from '../components/TickMark'
import { AdjustDialog, NoteDialog, useStandards } from '../components/actions'
import { Button, Chip, Kbd, cx } from '../components/ui'
import { VERIFICATION_LABEL, lineValue, money } from '../lib/format'

// Focus mode: one item at a time, keyboard first. The evidence sits next to the question,
// and every action advances to the next item.

type Mode = 'work' | 'verify'

export function Focus({ mode: m0 }: { mode?: string }) {
  const navigate = useStore((s) => s.navigate)
  const mode: Mode = m0 === 'verify' ? 'verify' : 'work'
  const work = useWorkQueue().filter((i) => i.kind !== 'verify' && i.kind !== 'admin')
  const verify = useVerifyQueue()
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(0)
  const total = mode === 'work' ? work.length : verify.length
  const i = Math.min(idx, Math.max(0, total - 1))
  useEffect(() => { setIdx(0) }, [mode])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role=dialog]')) return
      if (e.key === 'Escape') { const st = useStore.getState(); if (st.trace || st.doc || st.palette) return; e.preventDefault(); navigate('/overview') }
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setIdx((x) => Math.min(x + 1, total - 1)) }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setIdx((x) => Math.max(x - 1, 0)) }
      if (e.key === 'Tab') { e.preventDefault(); navigate(mode === 'work' ? '/focus/verify' : '/focus') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [navigate, total, mode])

  const progress = total + done === 0 ? 1 : done / (total + done)
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center gap-4 bg-ink px-5 text-white">
        <svg width="18" height="18" viewBox="0 0 20 20"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#F7E463" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="display font-semibold">Focus</span>
        <div className="ml-2 flex rounded-lg bg-white/10 p-0.5 text-xs">
          {([['work', 'Work queue', work.length], ['verify', 'Verify numbers', verify.length]] as const).map(([id, label, n]) => (
            <button key={id} onClick={() => navigate(id === 'work' ? '/focus' : '/focus/verify')} className={cx('relative rounded-md px-3 py-1.5 font-medium', mode === id ? 'text-ink' : 'text-ink-200 hover:text-white')}>
              {mode === id && <motion.span layoutId="focus-mode" className="absolute inset-0 rounded-md bg-white" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <span className="relative">{label} <span className="num opacity-60">{n}</span></span>
            </button>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-3 text-xs text-ink-300 md:flex">
          <span className="num">{total ? `${i + 1} of ${total}` : 'Clear'}</span>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/15"><motion.div className="h-full bg-hilite" animate={{ width: `${progress * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
          {done > 0 && <span>{done} done this session</span>}
        </div>
        <button onClick={() => navigate('/overview')} className="ml-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-200 hover:bg-white/10 hover:text-white"><X size={14} /> Exit <Kbd>esc</Kbd></button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-r border-ink-200 bg-white/60 py-3 lg:block" aria-label="Queue">
          {mode === 'work'
            ? work.map((it, j) => <QueueRow key={it.id} active={j === i} onClick={() => setIdx(j)} title={it.title} sub={it.detail} tone={it.tone} />)
            : verify.slice(0, 200).map((k, j) => <VerifyRow key={k} k={k} active={j === i} onClick={() => setIdx(j)} />)}
        </nav>
        <main className="scroll-thin relative min-w-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {total === 0 ? (
              <Clear key="clear" mode={mode} />
            ) : mode === 'work' ? (
              <motion.div key={work[i].id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }} className="mx-auto max-w-[980px] px-6 py-8">
                <WorkFocus item={work[i]} onDone={() => setDone((d) => d + 1)} />
              </motion.div>
            ) : (
              <motion.div key={verify[i]} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }} className="px-6 py-8">
                <LineFocus lineKey={verify[i]} onDone={() => setDone((d) => d + 1)} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <footer className="hidden h-10 shrink-0 items-center gap-5 border-t border-ink-200 bg-white px-5 text-2xs text-ink-500 md:flex">
        <span className="flex items-center gap-1.5"><Kbd>j</Kbd><Kbd>k</Kbd> next / previous</span>
        {mode === 'work' ? <span className="flex items-center gap-1.5"><Kbd>a</Kbd> apply the proposed fix</span> : <>
          <span className="flex items-center gap-1.5"><Kbd>v</Kbd> verify</span>
          <span className="flex items-center gap-1.5"><Kbd>1</Kbd>–<Kbd>5</Kbd> verification method</span>
          <span className="flex items-center gap-1.5"><Kbd>e</Kbd> adjust</span>
        </>}
        <span className="flex items-center gap-1.5"><Kbd>n</Kbd> note</span>
        <span className="flex items-center gap-1.5"><Kbd>tab</Kbd> switch queue</span>
        <span className="ml-auto flex items-center gap-1.5"><Kbd>esc</Kbd> back to Today</span>
      </footer>
    </div>
  )
}

const DOT: Record<WorkItem['tone'], string> = { pencil: 'bg-pencil', amber: 'bg-amber', blue: 'bg-slateblue', tick: 'bg-tick', neutral: 'bg-ink-300' }

function QueueRow({ active, onClick, title, sub, tone }: { active: boolean; onClick: () => void; title: string; sub: string; tone: WorkItem['tone'] }) {
  return (
    <button onClick={onClick} className="relative flex w-full items-start gap-2.5 px-4 py-2.5 text-left">
      {active && <motion.span layoutId="focus-row" className="absolute inset-x-2 inset-y-0.5 rounded-lg bg-white shadow-sm ring-1 ring-ink-200" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
      <span className={cx('relative mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} />
      <span className="relative min-w-0">
        <span className={cx('block truncate text-xs', active ? 'font-semibold text-ink' : 'text-ink-700')}>{title}</span>
        <span className="block truncate text-2xs text-ink-400">{sub}</span>
      </span>
    </button>
  )
}

function VerifyRow({ k, active, onClick }: { k: string; active: boolean; onClick: () => void }) {
  const w = useWork()
  const l = w.line(k)
  return (
    <button onClick={onClick} className="relative flex w-full items-center gap-2.5 px-4 py-2 text-left">
      {active && <motion.span layoutId="focus-row" className="absolute inset-x-2 inset-y-0.5 rounded-lg bg-white shadow-sm ring-1 ring-ink-200" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
      <span className="num relative w-20 shrink-0 truncate text-2xs text-ink-400">{k}</span>
      <span className={cx('relative min-w-0 flex-1 truncate text-xs', active ? 'font-semibold text-ink' : 'text-ink-700')}>{l?.label}</span>
      <span className="num relative text-2xs text-ink-500">{lineValue(l?.value)}</span>
    </button>
  )
}

function WorkFocus({ item, onDone }: { item: WorkItem; onDone: () => void }) {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const perms = usePerms()
  const record = useStore((s) => s.record)
  const navigate = useStore((s) => s.navigate)
  const x = item.findingId ? fs.find((y) => y.f.id === item.findingId) : undefined
  const [note, setNote] = useState(false)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role=dialog]')) return
      if (e.key === 'a' && x && x.f.proposals.length && x.f.kind !== 'judgment' && perms.canEdit && !w.frozenAt) { e.preventDefault(); record(proposalEvents(x.f, m, w), { toast: `Applied: ${x.f.title}` }); onDone() }
      if (e.key === 'n' && perms.canEdit) { e.preventDefault(); setNote(true) }
      if (e.key === 'Enter' && item.route && !x) { e.preventDefault(); navigate(item.route) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [x, item, m, w, perms, record, onDone, navigate])
  if (x) return (
    <>
      <FindingDetail x={x} />
      {note && <NoteDialog open target={x.f.lines[0] ?? 'F1040.24'} label={x.f.title} onClose={() => setNote(false)} />}
    </>
  )
  if (item.lineKey && w.line(item.lineKey)) return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-6 ring-1 ring-ink-200">
        <Chip tone={item.tone === 'pencil' ? 'pencil' : 'blue'}>{item.kind === 'note' ? 'Review note' : 'Answer'}</Chip>
        <h2 className="display mt-3 text-2xl font-semibold leading-snug">{item.title}</h2>
        <p className="mt-1 text-sm text-ink-500">{item.detail}</p>
      </div>
      <LineFocus lineKey={item.lineKey} onDone={onDone} compact />
    </div>
  )
  return (
    <div className="rounded-xl bg-white p-8 ring-1 ring-ink-200">
      <Chip tone={item.tone === 'tick' ? 'tick' : item.tone === 'pencil' ? 'pencil' : 'amber'}>{item.kind}</Chip>
      <h2 className="display mt-3 text-2xl font-semibold">{item.title}</h2>
      <p className="mt-1 text-ink-600">{item.detail}</p>
      {item.route && <Button className="mt-6" variant="primary" icon={<CornerDownLeft size={14} />} onClick={() => navigate(item.route!)}>Go there <Kbd>enter</Kbd></Button>}
    </div>
  )
}

function LineFocus({ lineKey, onDone, compact }: { lineKey: string; onDone: () => void; compact?: boolean }) {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const std = useStandards()
  const record = useStore((s) => s.record)
  const openTrace = useStore((s) => s.openTrace)
  const proof = useLineProof(lineKey)
  const l = w.line(lineKey)!
  const evs = l.sources.map((s) => m.ev.get(s)).filter(Boolean) as NonNullable<ReturnType<typeof m.ev.get>>[]
  const [srcIdx, setSrcIdx] = useState(0)
  const ev = evs[Math.min(srcIdx, evs.length - 1)]
  const doc = ev ? m.docById.get(ev.document_id) : undefined
  const page = doc?.pages.find((p) => p.page === ev.page)
  const [method, setMethod] = useState(std.verification_types[0])
  const [dlg, setDlg] = useState<null | 'adjust' | 'note'>(null)
  const [ticked, setTicked] = useState(false)
  const verify = () => {
    if (!perms.canEdit || w.frozenAt) return
    setTicked(true)
    setTimeout(() => { record({ kind: 'verify', target: lineKey, method, value: l.value, evidence: ev ? [ev.id] : undefined }, { toast: `Verified ${lineKey}` }); onDone() }, 380)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role=dialog]')) return
      if (e.key === 'v') { e.preventDefault(); verify() }
      if (e.key === 'e' && perms.canEdit) { e.preventDefault(); setDlg('adjust') }
      if (e.key === 'n' && perms.canEdit && !compact) { e.preventDefault(); setDlg('note') }
      if (e.key === 'Enter') { e.preventDefault(); openTrace(lineKey) }
      const n = Number(e.key)
      if (n >= 1 && n <= std.verification_types.length) setMethod(std.verification_types[n - 1])
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  const sensitive = !perms.clearance
  return (
    <div className={cx('grid gap-6', !compact && 'xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]')}>
      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-2 text-2xs text-ink-500"><span className="num rounded bg-ink px-1.5 py-0.5 text-white">{lineKey}</span>{l.jurisdiction === 'federal' ? 'Federal' : 'State'}</div>
          <h2 className="display mt-2 text-xl font-semibold leading-snug">{l.label}</h2>
          <div className="mt-3 flex items-center gap-3">
            <span className="num text-[40px] font-semibold leading-none">{lineValue(l.value)}</span>
            <AnimatePresence>{ticked && <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><TickMark method={method} size={34} animate /></motion.span>}</AnimatePresence>
          </div>
          <p className="mt-3 text-sm text-ink-600">{m.ruleText(l.rule)}</p>
          {l.note && <p className="mt-2 text-xs text-ink-500">Engine note: {l.note}</p>}
          {proof.findings.length > 0 && <div className="mt-3 rounded-lg bg-pencil-soft/60 px-3 py-2 text-xs text-pencil-deep ring-1 ring-pencil/20">{proof.findings.map((x) => x.f.title).join(' · ')}</div>}
        </div>
        {evs.length > 1 && (
          <div>
            <div className="eyebrow mb-2">Sources ({evs.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {evs.map((e, j) => <button key={e.id} onClick={() => setSrcIdx(j)} className={cx('num rounded-md px-2 py-1 text-2xs ring-1', j === srcIdx ? 'bg-hilite-soft ring-hilite-deep/40' : 'bg-white ring-ink-200')}>{e.document_id} · {typeof e.value === 'number' ? money(e.value) : String(e.value)}</button>)}
            </div>
          </div>
        )}
        <div>
          <div className="eyebrow mb-2">How did you verify it?</div>
          <div className="space-y-1">
            {std.verification_types.map((t, j) => (
              <button key={t} onClick={() => setMethod(t)} className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ring-1 transition', method === t ? 'bg-tick-soft ring-tick/40' : 'bg-white ring-ink-200 hover:bg-ink-50')}>
                <Kbd>{j + 1}</Kbd><TickMark method={t} size={16} /><span>{VERIFICATION_LABEL[t] ?? t}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="tick" icon={<Check size={14} />} disabled={!perms.canEdit || !!w.frozenAt} onClick={verify}>Verify <Kbd>v</Kbd></Button>
            <Button disabled={!perms.canEdit || !!w.frozenAt} onClick={() => setDlg('adjust')}>Adjust <Kbd>e</Kbd></Button>
            <Button variant="ghost" onClick={() => openTrace(lineKey)}>Full proof <Kbd>enter</Kbd></Button>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="min-w-0">
          {doc && page ? (
            <>
              <div className="mb-2 flex items-center gap-2 text-xs text-ink-500"><span className="num rounded bg-hilite-soft px-1.5 py-0.5 text-ink-700 ring-1 ring-hilite-deep/30">{doc.id} · p{page.page}</span><span className="truncate">{doc.title}</span><span className="ml-auto">{ev.label} · read “{ev.text_as_read}” at {Math.round(ev.confidence * 100)}%</span></div>
              <TextPage doc={doc} text={page.printed_content} evs={(m.evByDoc.get(doc.id) ?? []).filter((e) => e.page === page.page)} focus={ev.id} sensitive={sensitive} m={m} />
            </>
          ) : <div className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">No document behind this line. It is computed from other lines.</div>}
        </div>
      )}
      {dlg === 'adjust' && <AdjustDialog open lineKey={lineKey} onClose={() => setDlg(null)} />}
      {dlg === 'note' && <NoteDialog open target={lineKey} label={lineKey} onClose={() => setDlg(null)} />}
    </div>
  )
}

function Clear({ mode }: { mode: Mode }) {
  const navigate = useStore((s) => s.navigate)
  return (
    <motion.div key="clear" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="grid h-full place-items-center px-6 py-20 text-center">
      <div>
        <svg width="64" height="64" viewBox="0 0 20 20" className="tick-draw mx-auto"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#23795A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h2 className="display mt-6 text-2xl font-semibold">{mode === 'work' ? 'Queue clear.' : 'Every document-backed number is verified.'}</h2>
        <p className="mt-2 text-sm text-ink-500">{mode === 'work' ? 'Nothing is waiting on you. Verify numbers next, or head back to Today.' : 'The proof map is green where documents support it.'}</p>
        <div className="mt-6 flex justify-center gap-2">
          {mode === 'work' && <Button variant="primary" onClick={() => navigate('/focus/verify')}>Verify numbers</Button>}
          <Button onClick={() => navigate('/overview')}>Back to Today</Button>
        </div>
      </div>
    </motion.div>
  )
}

export function useFocusShortcut() {
  const navigate = useStore((s) => s.navigate)
  return useMemo(() => () => navigate('/focus'), [navigate])
}

void ArrowUp; void ArrowDown
