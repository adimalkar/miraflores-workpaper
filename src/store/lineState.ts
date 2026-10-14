import { useMemo } from 'react'
import type { Model } from '../data/model'
import { recalcLine, sourceAgreement, type Finding, type RecalcStatus } from '../data/checks'
import type { WorkState, Verification, NoteThread, Adjustment } from './derive'
import { useFindingState, useModel, useWork } from './context'

export type ProofStatus = 'flagged' | 'adjusted' | 'verified' | 'supported' | 'open'

export interface LineProof {
  key: string
  status: ProofStatus
  verification?: Verification
  recalc: RecalcStatus
  agree: ReturnType<typeof sourceAgreement>
  findings: { f: Finding; status: string }[]
  notes: NoteThread[]
  adjustment?: Adjustment
  staleVerification: boolean
}

export function proofFor(m: Model, w: WorkState, fs: { f: Finding; status: string }[], key: string): LineProof {
  const l = w.line(key)
  const recalc = l ? recalcLine(m, l, w.value) : { status: 'na' as const }
  const agree = l ? sourceAgreement(m, l) : { status: 'na' as const }
  const findings = fs.filter((x) => x.f.lines.includes(key) || x.f.proposals.some((p) => 'lineKey' in p && p.lineKey === key))
  const notes = [...w.notes.values()].filter((n) => n.target === key)
  const verification = w.verifications.get(key)
  const adjustment = w.adjByLine.get(key)
  const staleVerification = !!verification && typeof l?.value === 'number' && verification.value !== l.value
  let status: ProofStatus = 'open'
  if (findings.some((x) => x.status === 'open') || notes.some((n) => n.blocking && !n.resolved) || staleVerification) status = 'flagged'
  else if (verification) status = 'verified'
  else if (adjustment) status = 'adjusted'
  else if (recalc.status === 'foots' || agree.status === 'agrees') status = 'supported'
  return { key, status, verification, recalc, agree, findings, notes, adjustment, staleVerification }
}

export function useLineProof(key: string) {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  return useMemo(() => proofFor(m, w, fs, key), [m, w, fs, key])
}

export function useAllProofs() {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  return useMemo(() => {
    const map = new Map<string, LineProof>()
    for (const l of m.current.lines) map.set(l.key, proofFor(m, w, fs, l.key))
    for (const a of w.adjustments.values()) if (a.isNew && !map.has(a.lineKey)) map.set(a.lineKey, proofFor(m, w, fs, a.lineKey))
    return map
  }, [m, w, fs])
}

export const STATUS_META: Record<ProofStatus, { label: string; tone: 'pencil' | 'blue' | 'tick' | 'neutral' | 'amber'; dot: string }> = {
  flagged: { label: 'Flagged', tone: 'pencil', dot: 'bg-pencil' },
  adjusted: { label: 'Adjusted', tone: 'blue', dot: 'bg-slateblue' },
  verified: { label: 'Verified', tone: 'tick', dot: 'bg-tick' },
  supported: { label: 'Independently supported', tone: 'neutral', dot: 'bg-ink-300' },
  open: { label: 'Not yet verified', tone: 'neutral', dot: 'bg-ink-200 ring-1 ring-ink-300' },
}
