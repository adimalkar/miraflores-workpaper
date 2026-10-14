import { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'motion/react'
import { FileText, GitBranch, ShieldAlert, ArrowRight, Hash, UserRound } from 'lucide-react'
import { useStore } from '../store/store'
import { useFindingState, useModel, useWork } from '../store/context'
import { lineValue, money } from '../lib/format'
import { Kbd } from './ui'

export function CommandPalette() {
  const open = useStore((s) => s.palette)
  const setOpen = useStore((s) => s.setPalette)
  const navigate = useStore((s) => s.navigate)
  const openTrace = useStore((s) => s.openTrace)
  const openDoc = useStore((s) => s.openDoc)
  const setActor = useStore((s) => s.setActor)
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const [q, setQ] = useState('')

  const digits = q.replace(/[^\d.]/g, '')
  const isAmount = digits.length >= 3 && /^[\d,.$\s-]+$/.test(q.trim())
  const amountHits = useMemo(() => {
    if (!isAmount) return { lines: [], evs: [] }
    const target = Number(digits)
    const lines = m.current.lines.filter((l) => typeof l.value === 'number' && (Math.abs(Math.abs(l.value) - target) < 1 || String(Math.round(Math.abs(l.value))).startsWith(digits.split('.')[0]))).slice(0, 12)
    const evs = m.packet.extracted_values.filter((e) => typeof e.value === 'number' && (Math.abs(Math.abs(e.value) - target) < 0.01 || String(Math.round(Math.abs(e.value))) === digits.split('.')[0])).slice(0, 12)
    return { lines, evs }
  }, [isAmount, digits, m])

  const go = (fn: () => void) => { fn(); setOpen(false); setQ('') }
  const lines = useMemo(() => m.current.lines.filter((l) => !l.key.startsWith('F8949') || /total|SCORP/.test(l.key)), [m])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[85] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <motion.div initial={{ y: -8, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -6, scale: 0.98 }} transition={{ type: 'spring', stiffness: 500, damping: 36 }} className="relative w-full max-w-[640px]">
            <Command label="Search the workpaper" className="overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-ink-200" shouldFilter={!isAmount} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
              <div className="flex items-center gap-3 border-b border-ink-100 px-4">
                <Hash size={16} className="text-ink-400" />
                <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Type an amount (1840), a line (SchC.1), a document, a person…" className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-300" />
                <Kbd>esc</Kbd>
              </div>
              <Command.List className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-sm text-ink-500">Nothing matches. Try an amount without commas, or a form like “SchE”.</Command.Empty>
                {isAmount && (
                  <>
                    <Group heading={`Lines worth ${money(Number(digits))}`}>
                      {amountHits.lines.map((l) => (
                        <Item key={l.key} value={`amt-line-${l.key}`} onSelect={() => go(() => openTrace(l.key))} icon={<GitBranch size={14} />} title={l.label} meta={l.key} right={lineValue(l.value)} />
                      ))}
                    </Group>
                    <Group heading="Read from documents">
                      {amountHits.evs.map((e) => (
                        <Item key={e.id} value={`amt-ev-${e.id}`} onSelect={() => go(() => openDoc({ docId: e.document_id, evId: e.id, page: e.page }))} icon={<FileText size={14} />} title={`${e.label}`} meta={`${e.document_id} p${e.page}`} right={money(Number(e.value), { cents: true })} />
                      ))}
                    </Group>
                  </>
                )}
                {!isAmount && (
                  <>
                    <Group heading="Go to">
                      {[['Overview', '/overview'], ['Return', '/return'], ['Documents', '/documents'], ['Checks', '/checks'], ['Review notes & sign-offs', '/review'], ['Depreciation', '/schedules/depreciation'], ['Sales detail', '/schedules/sales'], ['Books to tax', '/schedules/books'], ['State split', '/schedules/state'], ['Basis by year', '/schedules/basis'], ['Prior preparer vs us', '/schedules/prior'], ['Season replay', '/season'], ['Compare versions', '/season/compare'], ['Filing', '/filing'], ['Firm standards & view log', '/firm']].map(([t, r]) => (
                        <Item key={r} value={`go ${t}`} onSelect={() => go(() => navigate(r))} icon={<ArrowRight size={14} />} title={t} />
                      ))}
                    </Group>
                    {q.length > 0 && (
                      <>
                        <Group heading="Checks">
                          {fs.map(({ f, status }) => <Item key={f.id} value={`check ${f.title} ${f.summary}`} onSelect={() => go(() => navigate(`/checks/${f.id}`))} icon={<ShieldAlert size={14} />} title={f.title} meta={status} />)}
                        </Group>
                        <Group heading="Return lines">
                          {lines.map((l) => <Item key={l.key} value={`${l.key} ${l.label}`} onSelect={() => go(() => openTrace(l.key))} icon={<GitBranch size={14} />} title={l.label} meta={l.key} right={lineValue(w.line(l.key)?.value)} />)}
                        </Group>
                        <Group heading="Documents">
                          {m.docs.map((d) => <Item key={d.id} value={`${d.id} ${d.title} ${d.issuer} ${d.document_type}`} onSelect={() => go(() => openDoc({ docId: d.id }))} icon={<FileText size={14} />} title={d.title} meta={d.id} />)}
                        </Group>
                        <Group heading="Act as">
                          {[...m.packet.firm.staff, ...m.packet.firm.client_users].map((s) => <Item key={s.id} value={`act as ${s.name} ${s.role}`} onSelect={() => go(() => setActor(s.id))} icon={<UserRound size={14} />} title={`Act as ${s.name}`} meta={s.role.replace('_', ' ')} />)}
                        </Group>
                      </>
                    )}
                  </>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return <Command.Group heading={heading} className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5">{children}</Command.Group>
}

function Item({ value, onSelect, icon, title, meta, right }: { value: string; onSelect: () => void; icon: React.ReactNode; title: string; meta?: string; right?: string }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-700 data-[selected=true]:bg-ink-50 data-[selected=true]:text-ink">
      <span className="text-ink-400">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {meta && <span className="num shrink-0 text-2xs text-ink-400">{meta}</span>}
      {right && <span className="num shrink-0 text-xs font-medium">{right}</span>}
    </Command.Item>
  )
}
