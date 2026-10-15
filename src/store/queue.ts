import { useMemo } from 'react'
import { useFindingState, useModel, usePerms, useWork } from './context'
import { useReadiness } from './readiness'
import { personName } from './permissions'
import { proposalEffect } from '../views/Checks'
import { largestEffect } from '../data/effects'

// The work queue: what the person signed in should do next, in order. "Today" lists it and
// focus mode steps through it. Every item comes from the event log and the checks.

export type WorkKind = 'finding' | 'note' | 'answer' | 'approve' | 'signoff' | 'filing' | 'verify' | 'admin'

export interface WorkItem {
  id: string
  kind: WorkKind
  title: string
  detail: string
  tone: 'pencil' | 'amber' | 'blue' | 'tick' | 'neutral'
  route?: string
  findingId?: string
  lineKey?: string
  weight: number
}

/** Document-backed lines nobody has verified yet, largest first: the verification pass. */
export function useVerifyQueue() {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  return useMemo(() => {
    // Lines with an open check are fixed in the work queue first, not verified as they stand.
    const blocked = new Set(fs.filter((x) => x.status === 'open').flatMap((x) => [...x.f.lines, ...x.f.proposals.map((p) => ('lineKey' in p ? p.lineKey : ''))]))
    return m.current.lines
    .filter((l) => typeof l.value === 'number' && l.value !== 0 && !w.verifications.has(l.key) && !blocked.has(l.key) && l.sources.some((s) => m.ev.get(s)?.value_type === 'money'))
    .sort((a, b) => Math.abs(Number(w.value(b.key))) - Math.abs(Number(w.value(a.key))))
    .map((l) => l.key)
  }, [m, w, fs])
}

export function useWorkQueue(): WorkItem[] {
  const { m } = useModel()
  const w = useWork()
  const fs = useFindingState()
  const perms = usePerms()
  const r = useReadiness()
  const verify = useVerifyQueue()
  return useMemo(() => {
    const items: WorkItem[] = []
    const me = perms.actor
    const filed = w.filing.some((f) => f.action === 'efile-accepted')

    if (perms.canEdit && !filed) {
      for (const { f, status } of fs) {
        if (status !== 'open' || f.severity === 'info') continue
        const eff = proposalEffect(f, m)
        const big = largestEffect(eff)
        items.push({
          id: `finding:${f.id}`, kind: 'finding', findingId: f.id, title: f.title,
          detail: `${f.kind === 'judgment' ? 'Needs a decision' : f.proposals.length ? 'Fix ready to apply' : 'Needs review'}${big ? ` · moves tax by about ${big.toLocaleString()}` : ''}`,
          tone: f.severity === 'blocking' || f.severity === 'error' ? 'pencil' : 'amber',
          route: `/checks/${f.id}`, weight: (f.severity === 'blocking' ? 1000 : f.severity === 'error' ? 800 : 500) + Math.min(big / 100, 199),
        })
      }
    }
    for (const n of w.notes.values()) {
      if (n.resolved) continue
      const replied = n.replies.length > 0 && n.replies[n.replies.length - 1].by !== n.by
      if (n.assignee === me && n.by !== me) items.push({ id: `note:${n.noteId}`, kind: 'note', lineKey: n.target, title: `${personName(m, n.by)}: ${n.text}`, detail: `${n.blocking ? 'Blocks filing' : 'Review note'} on ${n.target}`, tone: n.blocking ? 'pencil' : 'blue', weight: n.blocking ? 900 : 400 })
      else if (n.by === me && replied) items.push({ id: `note-reply:${n.noteId}`, kind: 'note', lineKey: n.target, title: `${personName(m, n.replies[n.replies.length - 1].by)} replied: ${n.replies[n.replies.length - 1].text}`, detail: `Your note on ${n.target}: clear it or push back`, tone: 'blue', weight: 850 })
    }
    for (const q of w.questions.values()) {
      if (q.by === me && q.answer && !w.verifications.has(q.target ?? '')) items.push({ id: `answer:${q.qId}`, kind: 'answer', lineKey: q.target, title: `${personName(m, q.answer.by)} answered: ${q.answer.text}`, detail: `Your question: ${q.text}`, tone: 'tick', weight: 700 })
      if (!q.answer && q.to === me) items.push({ id: `ask:${q.qId}`, kind: 'answer', lineKey: q.target, title: `${personName(m, q.by)} asked you: ${q.text}`, detail: 'Answer from Review › Questions', route: '/review/questions', tone: 'blue', weight: 750 })
    }
    if (perms.canApproveLarge) {
      const waiting = [...w.adjustments.values()].filter((a) => !a.reverted && a.needsPartner && !a.approvedBy && a.by !== me)
      if (waiting.length) items.push({ id: 'approve', kind: 'approve', title: `${waiting.length} adjustment${waiting.length > 1 ? 's' : ''} over ${w.partnerThreshold.toLocaleString()} waiting for your approval`, detail: waiting.slice(0, 3).map((a) => a.lineKey).join(', ') + (waiting.length > 3 ? '…' : ''), tone: 'amber', route: '/review/adjustments', weight: 950 })
    }
    for (const lv of perms.canSignAs) {
      const so = w.signoffs.get(`return|${lv}`)
      const before = lv === 'partner' ? r.blockers.filter((b) => ['findings', 'notes', 'reviewer'].includes(b.id)).every((b) => b.done) : r.blockers.filter((b) => ['findings', 'notes'].includes(b.id)).every((b) => b.done)
      if (so?.stale.length) items.push({ id: `resign:${lv}`, kind: 'signoff', title: `Your ${lv} sign-off reopened`, detail: `${so.stale.length} covered values changed: ${so.stale.slice(0, 3).join(', ')}`, tone: 'pencil', route: '/review/signoffs', weight: 980 })
      else if (!so && before && lv !== 'preparer' && !filed) items.push({ id: `sign:${lv}`, kind: 'signoff', title: `Ready for your ${lv} sign-off`, detail: 'Errors resolved and blocking notes cleared', tone: 'tick', route: '/review/signoffs', weight: 600 })
    }
    if (perms.canFile && !filed) {
      const sent = w.filing.some((f) => f.action === 'sent-for-approval')
      const signed = w.filing.some((f) => f.action === 'client-approved')
      const pre = r.blockers.filter((b) => b.id !== 'client').every((b) => b.done)
      if (pre && !sent) items.push({ id: 'send', kind: 'filing', title: 'Send the return to the client for approval', detail: 'Every gate before approval is clear', tone: 'tick', route: '/filing', weight: 970 })
      if (signed) items.push({ id: 'transmit', kind: 'filing', title: 'Client signed the 8879: transmit', detail: 'Federal and state e-file', tone: 'tick', route: '/filing', weight: 990 })
    }
    if (perms.canEdit && verify.length && !filed) items.push({ id: 'verify', kind: 'verify', title: `Verify ${verify.length} document-backed numbers`, detail: `Largest first, starting with ${verify[0]}`, tone: 'neutral', route: '/focus/verify', weight: 300 })
    if (perms.canAdmin) {
      const views = w.sensitiveViews.length
      items.push({ id: 'views', kind: 'admin', title: `${views} sensitive value${views === 1 ? '' : 's'} revealed this season`, detail: 'Review the view log', tone: 'neutral', route: '/firm/access', weight: 200 })
    }
    return items.sort((a, b) => b.weight - a.weight)
  }, [m, w, fs, perms, r, verify])
}
