import { useMemo } from 'react'
import { useFindingState, useModel, useWork } from './context'
import { AREAS } from '../data/areas'
import { useStandards } from '../components/actions'

export interface Blocker { id: string; label: string; detail: string; route: string; done: boolean; group: 'checks' | 'review' | 'steps' | 'client' }

export function useReadiness() {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const std = useStandards()
  return useMemo(() => {
    const openBlocking = fs.filter((x) => x.status === 'open' && (x.f.severity === 'blocking' || x.f.severity === 'error'))
    const openNotes = [...w.notes.values()].filter((n) => n.blocking && !n.resolved)
    const needsPartner = [...w.adjustments.values()].filter((a) => !a.reverted && a.needsPartner && !a.approvedBy)
    const rev = w.signoffs.get('return|reviewer')
    const par = w.signoffs.get('return|partner')
    const clientOk = w.filing.some((f) => f.action === 'client-approved')
    const autoSteps: Record<string, boolean> = {
      'Engagement letter and consents signed': true,
      'Diagnostics resolved': fs.filter((x) => x.status === 'open' && x.f.severity !== 'info').length === 0,
      'Reviewer sign-off': !!rev && rev.stale.length === 0,
      'Partner sign-off': !!par && par.stale.length === 0,
      'Client approval and e-file authorization': clientOk,
      'All documents accounted for': m.docs.filter((d) => d.received_at <= new Date().toISOString()).every((d) => m.current.documents_used.includes(d.id) || m.current.documents_superseded.includes(d.id) || w.dispositions.has(d.id)),
    }
    const steps = std.required_steps.map((s) => ({ step: s, done: autoSteps[s] ?? w.steps.get(s)?.done ?? false, auto: s in autoSteps, by: w.steps.get(s)?.by }))
    const preSteps = steps.filter((s) => s.step !== 'Client approval and e-file authorization')
    const blockers: Blocker[] = [
      { id: 'findings', label: 'Errors found by independent checks', detail: openBlocking.length ? `${openBlocking.length} open` : 'All resolved', route: '/checks', done: openBlocking.length === 0, group: 'checks' },
      { id: 'notes', label: 'Blocking review notes', detail: openNotes.length ? `${openNotes.length} open` : 'None open', route: '/review/notes', done: openNotes.length === 0, group: 'review' },
      { id: 'partner', label: `Adjustments over ${w.partnerThreshold.toLocaleString()} approved by partner`, detail: needsPartner.length ? `${needsPartner.length} waiting` : 'None waiting', route: '/review/adjustments', done: needsPartner.length === 0, group: 'review' },
      { id: 'reviewer', label: 'Reviewer sign-off on the return', detail: rev ? (rev.stale.length ? `Reopened: ${rev.stale.length} items changed` : 'Signed') : 'Not signed', route: '/review/signoffs', done: !!rev && rev.stale.length === 0, group: 'review' },
      { id: 'partnerso', label: 'Partner sign-off on the return', detail: par ? (par.stale.length ? `Reopened: ${par.stale.length} items changed` : 'Signed') : 'Not signed', route: '/review/signoffs', done: !!par && par.stale.length === 0, group: 'review' },
      { id: 'steps', label: 'Required steps before approval', detail: `${preSteps.filter((s) => s.done).length} of ${preSteps.length}`, route: '/review/steps', done: preSteps.every((s) => s.done), group: 'steps' },
      { id: 'client', label: 'Client approval and e-file signature', detail: clientOk ? 'Signed (8879)' : 'Not yet', route: '/filing', done: clientOk, group: 'client' },
    ]
    const areaSign = new Map(AREAS.map((a) => [a.id, (['preparer', 'reviewer', 'partner'] as const).map((lv) => w.signoffs.get(`${a.id}|${lv}`))]))
    const filed = w.filing.some((f) => f.action === 'efile-accepted')
    const sent = w.filing.some((f) => f.action === 'sent-for-approval')
    const stage = filed ? 'Filed' : clientOk ? 'Ready to file' : sent ? 'With client' : par && !par.stale.length ? 'Ready to send' : rev && !rev.stale.length ? 'Partner review' : w.signoffs.size ? 'In review' : 'Preparation'
    return { blockers, steps, ready: blockers.every((b) => b.done), stage, areaSign, openBlocking, openNotes, needsPartner }
  }, [m, w, fs, std])
}
