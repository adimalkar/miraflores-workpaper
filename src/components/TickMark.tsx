import { cx } from './ui'
import { VERIFICATION_LABEL } from '../lib/format'

// Auditor's tick marks, one per verification method. They are the workpaper's visual language:
// a number with a mark has been proven, and the mark says how.

const PATHS: Record<string, { d: string; label: string; letter?: string }> = {
  agreed_to_source_document: { d: 'M3 10.5l4 4L17 4', label: 'Traced to source' },
  recalculated: { d: 'M3 10.5l4 4L17 4 M2 17.5h16', label: 'Footed / recalculated' },
  confirmed_with_client: { d: 'M3 10.5l4 4L17 4', label: 'Confirmed with client', letter: 'C' },
  agreed_to_prior_year: { d: 'M3 10.5l4 4L17 4', label: 'Agreed to prior year', letter: 'PY' },
  agreed_to_third_party_record: { d: 'M3 10.5l4 4L17 4', label: 'Agreed to third-party record', letter: 'T' },
}

export function TickMark({ method, size = 16, animate = false, tone = 'tick', className }: { method: string; size?: number; animate?: boolean; tone?: 'tick' | 'pencil' | 'muted'; className?: string }) {
  const p = PATHS[method] ?? PATHS.agreed_to_source_document
  const color = tone === 'tick' ? '#23795A' : tone === 'pencil' ? '#C8323C' : '#8590AC'
  return (
    <span className={cx('inline-flex items-center gap-0.5', className)} title={VERIFICATION_LABEL[method] ?? p.label}>
      <svg width={size} height={size} viewBox="0 0 20 20" className={cx(animate && 'tick-draw')} aria-hidden>
        <path d={p.d} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {p.letter && <span className="num text-[9px] font-semibold leading-none" style={{ color }}>{p.letter}</span>}
      <span className="sr-only">{VERIFICATION_LABEL[method] ?? p.label}</span>
    </span>
  )
}

export function TickLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-2xs text-ink-500">
      {Object.keys(PATHS).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5"><TickMark method={k} size={13} />{VERIFICATION_LABEL[k]}</span>
      ))}
    </div>
  )
}
