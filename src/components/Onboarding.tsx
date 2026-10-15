import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, X } from 'lucide-react'
import { Kbd, Modal, cx } from './ui'
import { TickLegend } from './TickMark'
import { NAV } from './Shell'
import { useStore } from '../store/store'
import { useModel } from '../store/context'

const WELCOME_KEY = 'proof.welcome.v1'

/** First-run introduction: three ideas, then straight into the work. */
export function Welcome() {
  const { m, findings } = useModel()
  const navigate = useStore((s) => s.navigate)
  const [open, setOpen] = useState(() => { try { return !localStorage.getItem(WELCOME_KEY) } catch { return false } })
  const [step, setStep] = useState(0)
  const close = () => { try { localStorage.setItem(WELCOME_KEY, '1') } catch { /* ignore */ } setOpen(false) }
  const silent = findings.filter((f) => !f.engineDiagnostic).length
  const slides = [
    {
      eyebrow: 'Proof · a workpaper for Miraflores',
      title: 'Every number carries its own proof.',
      body: `${m.current.lines.length} numbers on this return, each one traceable to the field on the page it came from, how it was built, who verified it and what changed.`,
      art: <ArtTrace />,
    },
    {
      eyebrow: "Checks that don't trust the engine",
      title: `${findings.length} findings. The engine flagged ${findings.length - silent}.`,
      body: 'Each check rebuilds a figure from the documents, the client, the prior year or the agency records, and shows its evidence and its method.',
      art: <ArtChecks />,
    },
    {
      eyebrow: 'Built for the whole team',
      title: 'Prepare, review, sign and file together.',
      body: 'Switch roles from the bottom-left. Open a second tab as someone else and watch changes arrive live. Sign-offs reopen when what they covered moves.',
      art: <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200"><TickLegend /></div>,
    },
  ]
  const sl = slides[step]
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-ink-900/50 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ y: 16, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} className="relative grid w-full max-w-[860px] overflow-hidden rounded-2xl bg-paper shadow-pop md:grid-cols-[1.05fr_1fr]" role="dialog" aria-modal="true" aria-label="Welcome">
            <button onClick={close} className="absolute right-4 top-4 z-10 rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink" aria-label="Skip introduction"><X size={16} /></button>
            <div className="flex flex-col p-8 md:p-10">
              <AnimatePresence mode="wait">
                <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                  <div className="eyebrow">{sl.eyebrow}</div>
                  <h2 className="display mt-3 text-[30px] font-bold leading-tight text-ink">{sl.title}</h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{sl.body}</p>
                </motion.div>
              </AnimatePresence>
              <div className="mt-auto flex items-center gap-3 pt-10">
                <div className="flex gap-1.5">{slides.map((_, i) => <button key={i} onClick={() => setStep(i)} aria-label={`Step ${i + 1}`} className={cx('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-ink' : 'w-1.5 bg-ink-200')} />)}</div>
                <div className="ml-auto flex items-center gap-2">
                  {step < slides.length - 1
                    ? <button onClick={() => setStep(step + 1)} className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-700">Next <ArrowRight size={14} /></button>
                    : <button onClick={() => { close(); navigate('/overview') }} className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-700">Start working <ArrowRight size={14} /></button>}
                </div>
              </div>
            </div>
            <div className="hidden items-center justify-center bg-ink-100/60 p-8 md:flex">
              <AnimatePresence mode="wait"><motion.div key={step} className="w-full" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>{sl.art}</motion.div></AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ArtTrace() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sheet ring-1 ring-ink-200">
        <span className="text-xs text-ink-500">Taxable interest</span>
        <span className="flex items-center gap-2"><span className="num text-lg font-semibold">6,450</span>
          <svg width="18" height="18" viewBox="0 0 20 20" className="tick-draw"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#23795A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </div>
      <div className="ml-6 border-l-2 border-dashed border-ink-300 pl-4">
        <div className="sheet rounded-lg px-4 py-3 font-mono text-[11px] leading-[22px] text-ink-600 shadow-sheet ring-1 ring-ink-200">
          1099-INT … box 1 interest <mark className="hl rounded-sm bg-transparent px-0.5 font-semibold text-ink">1,840.00</mark>.
        </div>
      </div>
    </div>
  )
}

function ArtChecks() {
  const rows = [['Blocks e-file', 'pencil'], ['Error', 'pencil'], ['Needs a decision', 'amber']] as const
  return (
    <div className="space-y-2">
      {rows.map(([t, tone], i) => (
        <motion.div key={t} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.12 }} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-ink-200">
          <span className={cx('h-2 w-2 rounded-full', tone === 'pencil' ? 'bg-pencil' : 'bg-amber')} />
          <span className="h-2 flex-1 rounded-full bg-ink-100" />
          <span className="text-2xs text-ink-500">{t}</span>
        </motion.div>
      ))}
      <div className="pt-2 text-center text-2xs text-ink-400">engine silent · evidence attached · fix proposed</div>
    </div>
  )
}

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups: [string, [string, string][]][] = [
    ['Anywhere', [['⌘ K  or  /', 'Search numbers, lines, documents, people'], ['f', 'Focus mode'], ['?', 'This sheet'], ['⌘ Z', 'Undo your last change'], ['esc', 'Close the panel or document']]],
    ['Go to', NAV.map((n) => [`g  ${n.key}`, n.label] as [string, string])],
    ['Focus mode', [['j / k', 'Next / previous item'], ['a', 'Apply the proposed fix'], ['v', 'Verify the number'], ['1–5', 'Choose verification method'], ['e', 'Adjust'], ['n', 'Add a note'], ['tab', 'Switch queue']]],
  ]
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width={720}>
      <div className="grid gap-6 sm:grid-cols-3">
        {groups.map(([g, rows]) => (
          <div key={g}>
            <div className="eyebrow mb-2">{g}</div>
            <ul className="space-y-1.5">{rows.map(([k, d]) => <li key={k + d} className="flex items-center justify-between gap-3 text-xs"><span className="text-ink-600">{d}</span><Kbd>{k}</Kbd></li>)}</ul>
          </div>
        ))}
      </div>
    </Modal>
  )
}
