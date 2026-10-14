import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { X, FileText, AlignLeft, LayoutTemplate, CornerDownRight, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useModel, usePerms, useWork } from '../store/context'
import { useStore } from '../store/store'
import { Button, Chip, cx } from './ui'
import { TickMark } from './TickMark'
import { AttachButton, VerifyDialog } from './actions'
import { date, money, mask, lineValue } from '../lib/format'
import type { Doc, ExtractedValue } from '../data/types'
import type { Model } from '../data/model'

// The viewer renders a simulated page from printed_content. Highlights are keyed only by
// (document, page, field position) — the same keys a real PDF or image renderer would use —
// so swapping in real page images means replacing <TextPage> with an image layer and keeping
// <LayoutPage>'s boxes.

export function DocViewer() {
  const { m } = useModel()
  const w = useWork()
  const perms = usePerms()
  const sel = useStore((s) => s.doc)
  const openDoc = useStore((s) => s.openDoc)
  const trace = useStore((s) => s.trace)
  const openTrace = useStore((s) => s.openTrace)
  const record = useStore((s) => s.record)
  const doc = sel ? m.docById.get(sel.docId) : undefined
  const evs = useMemo(() => (doc ? m.evByDoc.get(doc.id) ?? [] : []), [doc, m])
  const focusEv = sel?.evId ? m.ev.get(sel.evId) : undefined
  const [page, setPage] = useState(sel?.page ?? focusEv?.page ?? 1)
  const [mode, setMode] = useState<'text' | 'layout'>('text')
  const [verifyEv, setVerifyEv] = useState<ExtractedValue | null>(null)
  useEffect(() => { setPage(sel?.page ?? focusEv?.page ?? 1) }, [sel?.docId, sel?.evId, sel?.page, focusEv?.page])
  if (!doc) return null

  const pageEvs = evs.filter((e) => e.page === page)
  const used = m.current.documents_used.includes(doc.id)
  const superseded = m.current.documents_superseded.includes(doc.id)
  const landed = m.docToLines.get(doc.id) ?? []
  const disp = w.dispositions.get(doc.id)
  const sensitive = !perms.clearance
  const p = doc.pages.find((x) => x.page === page)

  return (
    <motion.div
      initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
      transition={{ type: 'spring', stiffness: 360, damping: 36 }}
      className={cx('no-print fixed inset-y-0 z-40 flex w-full max-w-[780px] flex-col bg-paper shadow-pop ring-1 ring-ink-200', trace ? 'right-0 lg:right-[460px] lg:max-w-[min(780px,calc(100vw-700px))]' : 'right-0')}
      aria-label={`Document ${doc.id}`}
    >
      <div className="border-b border-ink-200 bg-white px-5 py-3.5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-hilite-soft ring-1 ring-hilite-deep/30"><FileText size={17} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="num text-2xs text-ink-500">{doc.id}</span>
              <Chip>{doc.document_type}</Chip>
              {doc.marked_corrected && <Chip tone="amber">Marked CORRECTED</Chip>}
              {superseded && <Chip tone="neutral">Superseded</Chip>}
              {!used && !superseded && <Chip tone="amber">Not used by the engine</Chip>}
              {doc.extraction.status !== 'extracted' && <Chip tone={doc.extraction.status === 'partial' ? 'pencil' : 'neutral'}>{doc.extraction.status.replace('_', ' ')}</Chip>}
            </div>
            <h2 className="display mt-1 truncate text-base font-semibold">{doc.title}</h2>
            <div className="mt-0.5 text-2xs text-ink-500">{doc.issuer} · {doc.belongs_to} · received {date(doc.received_at, true)} by {doc.uploaded_by} · <span className="num">{doc.file_name}</span></div>
          </div>
          <button onClick={() => openDoc(null)} className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink" aria-label="Close document"><X size={17} /></button>
        </div>
        {doc.extraction.reason && <p className="mt-2 rounded-md bg-ink-50 px-2.5 py-1.5 text-2xs text-ink-600">Pipeline: {doc.extraction.reason}</p>}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="scroll-thin min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-3 flex items-center gap-2">
            {doc.page_count > 1 && (
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded p-1 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={15} /></button>
                <select value={page} onChange={(e) => setPage(Number(e.target.value))} className="num rounded-md bg-white px-2 py-1 text-xs ring-1 ring-ink-200">
                  {doc.pages.map((x) => <option key={x.page} value={x.page}>Page {x.page} of {doc.page_count}{(m.evByDoc.get(doc.id) ?? []).some((e) => e.page === x.page) ? '' : ' ·'}</option>)}
                </select>
                <button disabled={page >= doc.page_count} onClick={() => setPage(page + 1)} className="rounded p-1 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Next page"><ChevronRight size={15} /></button>
              </div>
            )}
            <div className="ml-auto flex rounded-lg bg-white p-0.5 ring-1 ring-ink-200">
              <button onClick={() => setMode('text')} className={cx('flex items-center gap-1 rounded-md px-2 py-1 text-2xs', mode === 'text' ? 'bg-ink text-white' : 'text-ink-500')}><AlignLeft size={12} /> Printed text</button>
              <button onClick={() => setMode('layout')} className={cx('flex items-center gap-1 rounded-md px-2 py-1 text-2xs', mode === 'layout' ? 'bg-ink text-white' : 'text-ink-500')}><LayoutTemplate size={12} /> Field positions</button>
            </div>
          </div>
          {p ? (
            mode === 'text'
              ? <TextPage doc={doc} text={p.printed_content} evs={pageEvs} focus={sel?.evId} sensitive={sensitive} m={m} />
              : <LayoutPage evs={pageEvs} focus={sel?.evId} sensitive={sensitive} />
          ) : <div className="text-sm text-ink-500">No such page.</div>}
          {pageEvs.length === 0 && p && doc.extraction.status !== 'not_extracted' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber"><AlertTriangle size={13} /> Nothing on this page was extracted.</div>
          )}
        </div>

        <aside className="scroll-thin hidden w-[280px] shrink-0 overflow-y-auto border-l border-ink-200 bg-white px-4 py-4 sm:block">
          <div className="eyebrow mb-2">Where this document landed</div>
          {landed.length ? (
            <div className="mb-4 flex flex-wrap gap-1">
              {landed.map((k) => <button key={k} onClick={() => openTrace(k)} className="num rounded bg-ink-50 px-1.5 py-0.5 text-2xs text-ink-700 ring-1 ring-ink-200 hover:ring-ink-400">{k}</button>)}
            </div>
          ) : (
            <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
              {disp ? <><b>{disp.status.replace('-', ' ')}:</b> {disp.reason}</> : superseded ? 'Superseded by a corrected document.' : 'Not used on the return.'}
              {!disp && !perms.isClient && ' Record why below.'}
            </p>
          )}
          <div className="eyebrow mb-2">Values read on page {page}</div>
          <ul className="space-y-1">
            {pageEvs.length === 0 && <li className="text-2xs text-ink-400">None</li>}
            {pageEvs.map((e) => {
              const lines = m.evToLines.get(e.id)?.get(m.current.version) ?? []
              const v = w.verifications.get(e.id)
              const fix = w.extractionFix.get(e.id)
              const isSens = sensitive && ['ssn', 'account_number'].includes(e.value_type)
              return (
                <li key={e.id}>
                  <button
                    onClick={() => openDoc({ docId: doc.id, evId: e.id, page: e.page })}
                    className={cx('w-full rounded-md px-2 py-1.5 text-left transition', sel?.evId === e.id ? 'bg-hilite-soft ring-1 ring-hilite-deep/40' : 'hover:bg-ink-50')}
                  >
                    <div className="flex items-center gap-1.5 text-2xs text-ink-500"><span className="truncate">{e.label}</span>{v && <TickMark method={v.method} size={11} />}<span className="num ml-auto">{Math.round(e.confidence * 100)}%</span></div>
                    <div className="num text-xs font-medium text-ink">{isSens ? mask(String(e.value)) : fix ? `${fix.to} (corrected)` : typeof e.value === 'number' ? money(e.value, { cents: !Number.isInteger(e.value) }) : String(e.value)}</div>
                    {lines.length > 0 && <div className="mt-0.5 flex flex-wrap items-center gap-1 text-2xs text-ink-400"><CornerDownRight size={10} />{lines.slice(0, 4).join(', ')}{lines.length > 4 ? ` +${lines.length - 4}` : ''}</div>}
                  </button>
                </li>
              )
            })}
          </ul>
          {sel?.evId && focusEv && !perms.isClient && (
            <div className="mt-4 space-y-2 rounded-lg bg-ink-50 p-3">
              <div className="text-2xs text-ink-500">Selected: {focusEv.label}</div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="tick" disabled={!perms.canEdit} onClick={() => setVerifyEv(focusEv)}>Verify value</Button>
                {(m.evToLines.get(focusEv.id)?.get(m.current.version) ?? []).slice(0, 1).map((k) => <Button key={k} size="sm" onClick={() => openTrace(k)}>Open {k}</Button>)}
              </div>
            </div>
          )}
          {!perms.isClient && (
            <div className="mt-4 space-y-2">
              <div className="eyebrow">Disposition</div>
              <Disposition docId={doc.id} used={used} current={disp?.status} disabled={!perms.canEdit} onSave={(status, reason) => record({ kind: 'doc.disposition', docId: doc.id, status, reason }, { toast: `${doc.id} marked ${status.replace('-', ' ')}` })} />
              <AttachButton target={doc.id}>Attach original file</AttachButton>
            </div>
          )}
        </aside>
      </div>
      {verifyEv && <VerifyDialog open target={verifyEv.id} value={verifyEv.value} label={verifyEv.label} onClose={() => setVerifyEv(null)} />}
    </motion.div>
  )
}

type DispStatus = 'used' | 'duplicate' | 'superseded' | 'informational' | 'not-needed' | 'outside-scope'
function Disposition({ docId, used, current, disabled, onSave }: { docId: string; used: boolean; current?: string; disabled: boolean; onSave: (s: DispStatus, reason: string) => void }) {
  const [status, setStatus] = useState<DispStatus | ''>('')
  const [reason, setReason] = useState('')
  useEffect(() => { setStatus(''); setReason('') }, [docId])
  return (
    <div className="space-y-1.5">
      <select disabled={disabled} value={status} onChange={(e) => setStatus(e.target.value as DispStatus)} className="w-full rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-ink-200">
        <option value="">{current ? `Recorded: ${current.replace('-', ' ')}` : used ? 'Used on the return' : 'Record a disposition…'}</option>
        <option value="used">Used</option><option value="duplicate">Duplicate</option><option value="superseded">Superseded</option>
        <option value="informational">Informational only</option><option value="not-needed">Not needed</option><option value="outside-scope">Outside engagement scope</option>
      </select>
      {status && (
        <div className="flex gap-1.5">
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why?" className="h-7 min-w-0 flex-1 rounded-md px-2 text-xs ring-1 ring-ink-200" />
          <Button size="sm" disabled={reason.trim().length < 3} onClick={() => { onSave(status, reason); setStatus(''); setReason('') }}>Save</Button>
        </div>
      )}
    </div>
  )
}

function candidates(e: ExtractedValue): string[] {
  const out = new Set<string>()
  if (e.text_as_read) out.add(e.text_as_read)
  if (typeof e.value === 'number') {
    out.add(e.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    out.add(e.value.toLocaleString('en-US'))
    out.add(String(e.value))
  } else if (typeof e.value === 'string' && e.value) {
    out.add(e.value)
    const d = e.value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (d) out.add(`${d[2]}/${d[3]}/${d[1]}`)
  }
  return [...out].filter((s) => s.length >= 2)
}

interface Span { start: number; end: number; ev: ExtractedValue; wrong?: boolean }

function locate(text: string, evs: ExtractedValue[]): Span[] {
  const spans: Span[] = []
  const taken = (s: number, e: number) => spans.some((x) => s < x.end && e > x.start)
  const sorted = [...evs].sort((a, b) => a.position.y0 - b.position.y0 || a.position.x0 - b.position.x0)
  let cursor = 0
  for (const e of sorted) {
    let found: Span | null = null
    for (const c of candidates(e)) {
      for (const from of [cursor, 0]) {
        let i = text.indexOf(c, from)
        while (i >= 0) {
          const before = text[i - 1], after = text[i + c.length]
          const boundary = (!before || !/[\d.]/.test(before)) && (!after || !/\d/.test(after) || c.length > 6)
          if (boundary && !taken(i, i + c.length)) { found = { start: i, end: i + c.length, ev: e }; break }
          i = text.indexOf(c, i + 1)
        }
        if (found) break
      }
      if (found) break
    }
    if (found) { spans.push(found); cursor = found.end }
  }
  return spans.sort((a, b) => a.start - b.start)
}

function TextPage({ doc, text, evs, focus, sensitive, m }: { doc: Doc; text: string; evs: ExtractedValue[]; focus?: string; sensitive: boolean; m: Model }) {
  const ref = useRef<HTMLDivElement>(null)
  const spans = useMemo(() => locate(text, evs), [text, evs])
  const missing = evs.filter((e) => !spans.some((s) => s.ev.id === e.id))
  const openDoc = useStore((s) => s.openDoc)
  useEffect(() => {
    const el = ref.current?.querySelector('[data-focus="true"]')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus, text])
  let display = text
  if (sensitive) display = display.replace(/\b\d{3}-\d{2}-\d{4}\b/g, (s) => mask(s)).replace(/SE\d{2}( \d{4}){5}/g, 'SE•• •••• •••• •••• •••• ••••')
  const parts: ReactNode[] = []
  let at = 0
  spans.forEach((s, i) => {
    if (s.start > at) parts.push(display.slice(at, s.start))
    const isFocus = s.ev.id === focus
    parts.push(
      <mark
        key={i} data-focus={isFocus}
        onClick={() => openDoc({ docId: doc.id, evId: s.ev.id, page: s.ev.page })}
        title={`${s.ev.label} · ${Math.round(s.ev.confidence * 100)}%`}
        className={cx('cursor-pointer rounded-sm bg-transparent px-0.5 text-ink transition', isFocus ? 'hl font-semibold' : 'hl-soft hover:bg-hilite-soft')}
      >
        {display.slice(s.start, s.end)}
      </mark>,
    )
    at = s.end
  })
  if (at < display.length) parts.push(display.slice(at))
  const focusMissing = missing.find((e) => e.id === focus)
  return (
    <div ref={ref}>
      <motion.div
        key={`${doc.id}-${text.length}`}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="sheet relative rounded-md px-9 py-8 font-mono text-[13px] leading-[28px] text-ink-700 shadow-sheet ring-1 ring-ink-200/70"
      >
        <div className="absolute right-6 top-3 num text-2xs text-ink-300">{doc.file_name}</div>
        <div className="whitespace-pre-wrap break-words">{parts}</div>
      </motion.div>
      {focusMissing && (
        <div className="mt-3 rounded-lg bg-pencil-soft px-3 py-2.5 text-xs text-pencil-deep ring-1 ring-pencil/30">
          <b>Not found on the page:</b> the pipeline read “{focusMissing.text_as_read || 'blank'}” for {focusMissing.label} ({Math.round(focusMissing.confidence * 100)}% confidence), but those characters are not printed here.
          {focusMissing.value_type === 'ein' && ' Compare with the printed tax ID: two digits are transposed.'}
        </div>
      )}
      {missing.length > 0 && !focusMissing && (
        <div className="mt-3 text-2xs text-ink-400">{missing.length} value{missing.length > 1 ? 's' : ''} on this page could not be pinned to printed text (shown in the list).</div>
      )}
      {void m}
    </div>
  )
}

function LayoutPage({ evs, focus, sensitive }: { evs: ExtractedValue[]; focus?: string; sensitive: boolean }) {
  const openDoc = useStore((s) => s.openDoc)
  return (
    <div className="relative mx-auto aspect-[8.5/11] w-full max-w-[560px] rounded-md bg-white shadow-sheet ring-1 ring-ink-200/70">
      <div className="absolute left-4 top-3 text-2xs text-ink-300">Synthetic positions · a real page image renders underneath this layer</div>
      {evs.map((e) => {
        const isFocus = e.id === focus
        const v = sensitive && ['ssn', 'account_number'].includes(e.value_type) ? mask(String(e.value)) : e.text_as_read || '∅'
        return (
          <button
            key={e.id}
            onClick={() => openDoc({ docId: e.document_id, evId: e.id, page: e.page })}
            title={e.label}
            className={cx('absolute flex items-center overflow-hidden rounded-sm px-1 text-left text-[10px] leading-tight transition', isFocus ? 'z-10 bg-hilite ring-2 ring-hilite-deep' : 'bg-hilite-soft/70 ring-1 ring-hilite-deep/30 hover:bg-hilite-soft')}
            style={{ left: `${e.position.x0 * 100}%`, top: `${e.position.y0 * 100}%`, width: `${(e.position.x1 - e.position.x0) * 100}%`, height: `${Math.max(2.2, (e.position.y1 - e.position.y0) * 100)}%` }}
          >
            <span className="num truncate">{v}</span>
          </button>
        )
      })}
      {void lineValue}
    </div>
  )
}
