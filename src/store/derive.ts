import type { Model } from '../data/model'
import type { Finding } from '../data/checks'
import { effectOf, addEffects, ZERO_EFFECT, largestEffect, type TaxEffect, type EffectPart } from '../data/effects'
import { AREAS, areaForLine } from '../data/areas'
import type { WPEvent } from './events'
import type { ReturnLine } from '../data/types'
import { partnerThreshold } from '../data/derived'

export interface Adjustment {
  adjId: string; lineKey: string; from: number | null; to: number; reason: string; effects: EffectPart[]
  effect: TaxEffect; by: string; at: string; findingId?: string; isNew?: { label: string; form: string }
  approvedBy?: string; approvedAt?: string; reverted?: { by: string; at: string; reason: string }
  needsPartner: boolean
}
export interface Verification { target: string; method: string; note?: string; evidence?: string[]; by: string; at: string; value: unknown }
export interface NoteThread {
  noteId: string; target: string; text: string; blocking: boolean; noteType: 'review' | 'internal'; by: string; at: string
  assignee?: string; replies: { by: string; at: string; text: string }[]; resolved?: { by: string; at: string; text?: string }
}
export interface Question {
  qId: string; to: string; target?: string; text: string; by: string; at: string; due?: string
  answer?: { by: string; at: string; text: string; attachments?: string[] }
}
export interface SignOff { scope: string; level: 'preparer' | 'reviewer' | 'partner'; by: string; at: string; snapshot: Record<string, unknown>; note?: string; stale: string[] }
export interface Judgment { jId: string; target?: string; topic: string; decision: string; authority: string; category: string; by: string; at: string; findingId?: string }
export interface Attachment { attId: string; target: string; fileName: string; mime: string; size: number; note?: string; text?: string; by: string; at: string }

export interface WorkState {
  events: WPEvent[]
  active: WPEvent[]
  adjustments: Map<string, Adjustment>
  adjByLine: Map<string, Adjustment>
  verifications: Map<string, Verification>
  notes: Map<string, NoteThread>
  questions: Map<string, Question>
  signoffs: Map<string, SignOff> // key scope|level
  judgments: Judgment[]
  findingStatus: Map<string, { status: string; reason?: string; by: string; at: string }>
  dispositions: Map<string, { status: string; reason: string; by: string; at: string }>
  attachments: Attachment[]
  ssnFix: Map<string, string>
  extractionFix: Map<string, { to: string; reason: string; by: string; at: string; from: unknown }>
  assignments: Map<string, { staffId: string; due?: string }>
  time: Map<string, number>
  steps: Map<string, { done: boolean; by: string; at: string }>
  sensitiveViews: WPEvent[]
  filing: { action: string; at: string; by: string; detail?: Record<string, unknown> }[]
  standards?: unknown
  frozenAt?: string
  lastSeen: Map<string, string> // actor -> ISO
  effectTotal: TaxEffect
  partnerThreshold: number
  value: (key: string) => number | null
  line: (key: string) => (ReturnLine & { original?: number | string; adjusted?: boolean; flowed?: boolean; pending?: boolean }) | undefined
  pendingCount: number
}

export function deriveState(m: Model, events: WPEvent[], findings: Finding[]): WorkState {
  const undone = new Set<string>()
  for (const e of events) if (e.kind === 'undo') e.eventIds.forEach((id) => undone.add(id))
  const active = events.filter((e) => !undone.has(e.id) && e.kind !== 'undo')

  const adjustments = new Map<string, Adjustment>()
  const verifications = new Map<string, Verification>()
  const notes = new Map<string, NoteThread>()
  const questions = new Map<string, Question>()
  const signoffRaw = new Map<string, Omit<SignOff, 'stale'>>()
  const judgments: Judgment[] = []
  const findingStatus = new Map<string, { status: string; reason?: string; by: string; at: string }>()
  const dispositions = new Map<string, { status: string; reason: string; by: string; at: string }>()
  const attachments: Attachment[] = []
  const ssnFix = new Map<string, string>()
  const extractionFix = new Map<string, { to: string; reason: string; by: string; at: string; from: unknown }>()
  const assignments = new Map<string, { staffId: string; due?: string }>()
  const time = new Map<string, number>()
  const steps = new Map<string, { done: boolean; by: string; at: string }>()
  const sensitiveViews: WPEvent[] = []
  const filing: WorkState['filing'] = []
  const lastSeen = new Map<string, string>()
  let standards: unknown
  let frozenAt: string | undefined
  // Firm standards can change during the season; thresholds come from the latest version.
  const lastStd = [...active].reverse().find((e) => e.kind === 'standards.update') as { standards?: { rules?: string[] } } | undefined
  const threshold = partnerThreshold(lastStd?.standards?.rules ?? m.packet.firm.starter_standards.rules)

  for (const e of active) {
    switch (e.kind) {
      case 'verify': verifications.set(e.target, { target: e.target, method: e.method, note: e.note, evidence: e.evidence, by: e.actor, at: e.at, value: e.value }); break
      case 'unverify': verifications.delete(e.target); break
      case 'adjust': {
        const effect = effectOf(e.effects, m.current)
        adjustments.set(e.adjId, { adjId: e.adjId, lineKey: e.lineKey, from: e.from, to: e.to, reason: e.reason, effects: e.effects, effect, by: e.actor, at: e.at, findingId: e.findingId, isNew: e.isNew, needsPartner: largestEffect(effect) > threshold })
        break
      }
      case 'adjust.approve': { const a = adjustments.get(e.adjId); if (a) { a.approvedBy = e.actor; a.approvedAt = e.at }; break }
      case 'adjust.revert': { const a = adjustments.get(e.adjId); if (a) a.reverted = { by: e.actor, at: e.at, reason: e.reason }; break }
      case 'note': notes.set(e.noteId, { noteId: e.noteId, target: e.target, text: e.text, blocking: e.blocking, noteType: e.noteType, by: e.actor, at: e.at, assignee: e.assignee, replies: [] }); break
      case 'note.reply': notes.get(e.noteId)?.replies.push({ by: e.actor, at: e.at, text: e.text }); break
      case 'note.resolve': { const n = notes.get(e.noteId); if (n) n.resolved = { by: e.actor, at: e.at, text: e.text }; break }
      case 'note.reopen': { const n = notes.get(e.noteId); if (n) { n.resolved = undefined; if (e.text) n.replies.push({ by: e.actor, at: e.at, text: e.text }) }; break }
      case 'question': questions.set(e.qId, { qId: e.qId, to: e.to, target: e.target, text: e.text, by: e.actor, at: e.at, due: e.due }); break
      case 'question.answer': { const q = questions.get(e.qId); if (q) q.answer = { by: e.actor, at: e.at, text: e.text, attachments: e.attachments }; break }
      case 'signoff': signoffRaw.set(`${e.scope}|${e.level}`, { scope: e.scope, level: e.level, by: e.actor, at: e.at, snapshot: e.snapshot, note: e.note }); break
      case 'signoff.revoke': signoffRaw.delete(`${e.scope}|${e.level}`); break
      case 'judgment': judgments.push({ jId: e.jId, target: e.target, topic: e.topic, decision: e.decision, authority: e.authority, category: e.category, by: e.actor, at: e.at, findingId: e.findingId }); break
      case 'finding.status': findingStatus.set(e.findingId, { status: e.status, reason: e.reason, by: e.actor, at: e.at }); break
      case 'doc.disposition': dispositions.set(e.docId, { status: e.status, reason: e.reason, by: e.actor, at: e.at }); break
      case 'attach': attachments.push({ attId: e.attId, target: e.target, fileName: e.fileName, mime: e.mime, size: e.size, note: e.note, text: e.text, by: e.actor, at: e.at }); break
      case 'household.correct': ssnFix.set(e.personId, e.to); break
      case 'extraction.correct': extractionFix.set(e.evId, { to: e.to, reason: e.reason, by: e.actor, at: e.at, from: e.from }); break
      case 'assign': assignments.set(e.area, { staffId: e.staffId, due: e.due }); break
      case 'time': time.set(e.area, (time.get(e.area) ?? 0) + e.hours); break
      case 'step': steps.set(e.step, { done: e.done, by: e.actor, at: e.at }); break
      case 'view.sensitive': sensitiveViews.push(e); break
      case 'filing':
        filing.push({ action: e.action, at: e.at, by: e.actor, detail: e.detail })
        if (e.action === 'frozen') frozenAt = e.at
        if (e.action === 'amendment-opened') frozenAt = undefined
        break
      case 'standards.update': standards = e.standards; break
      case 'seen': lastSeen.set(e.actor, e.at); break
    }
  }

  const adjByLine = new Map<string, Adjustment>()
  let effectTotal = ZERO_EFFECT
  for (const a of adjustments.values()) {
    if (a.reverted) continue
    adjByLine.set(a.lineKey, a)
    effectTotal = addEffects(effectTotal, a.effect)
  }

  const base = m.lineMaps.get(m.current.version)!
  // Propagate adjustments upward through arithmetic lines (sums and carries) using the sign
  // pattern learned from the engine. Lines with real tax logic are marked as awaiting recompute.
  const delta = new Map<string, number>()
  const pending = new Set<string>()
  for (const a of adjByLine.values()) {
    const b = base.get(a.lineKey)
    if (b && typeof b.value === 'number') delta.set(a.lineKey, a.to - b.value)
    if (!b && a.isNew) {
      const total = `${a.lineKey.split('.').slice(0, 2).join('.')}.total`
      if (base.has(total)) delta.set(total, (delta.get(total) ?? 0) + a.to)
    }
  }
  for (const k of m.topo) {
    if (adjByLine.has(k)) continue
    const l = base.get(k)
    if (!l || !l.inputs.length) continue
    const touched = l.inputs.filter((i) => delta.has(i) || pending.has(i))
    if (!touched.length) continue
    const signs = m.sumSigns.get(k)
    if (signs) {
      const d = l.inputs.reduce((s2, i, idx) => s2 + signs[idx] * (delta.get(i) ?? 0), delta.get(k) ?? 0)
      if (d !== 0) delta.set(k, d)
      if (l.inputs.some((i) => pending.has(i))) pending.add(k)
    } else {
      pending.add(k)
    }
  }
  const value = (key: string): number | null => {
    const a = adjByLine.get(key)
    if (a) return a.to
    const l = base.get(key)
    return l && typeof l.value === 'number' ? l.value + (delta.get(key) ?? 0) : null
  }
  const line = (key: string) => {
    const l = base.get(key)
    const a = adjByLine.get(key)
    if (!l && a?.isNew) {
      return { key, jurisdiction: 'federal' as const, form: a.isNew.form, line: key.split('.').slice(1).join('.'), label: a.isNew.label, value: a.to, rule: 'WORKPAPER-ADDED', inputs: [], sources: [], adjusted: true, original: undefined }
    }
    if (!l) return undefined
    if (a) return { ...l, value: a.to, original: l.value, adjusted: true }
    const d = delta.get(key)
    if (d && typeof l.value === 'number') return { ...l, value: l.value + d, original: l.value, flowed: true, pending: pending.has(key) }
    if (pending.has(key)) return { ...l, pending: true }
    return l
  }

  // Sign-offs reopen when anything they covered has moved.
  const signoffs = new Map<string, SignOff>()
  for (const [k, s] of signoffRaw) {
    const now = snapshotFor(m, s.scope, value, adjustments, verifications)
    const stale = Object.keys({ ...s.snapshot, ...now }).filter((key) => JSON.stringify(s.snapshot[key]) !== JSON.stringify(now[key]))
    signoffs.set(k, { ...s, stale })
  }

  void findings
  return {
    events, active, adjustments, adjByLine, verifications, notes, questions, signoffs, judgments, findingStatus, dispositions,
    attachments, ssnFix, extractionFix, assignments, time, steps, sensitiveViews, filing, standards, frozenAt, lastSeen,
    effectTotal, value, line, pendingCount: pending.size, partnerThreshold: threshold,
  }
}

/** The values a sign-off covers: every line of the area (or the whole return) plus its adjustments. */
export function snapshotFor(
  m: Model, scope: string, value: (k: string) => number | null,
  adjustments: Map<string, Adjustment>, _verifs?: Map<string, Verification>,
): Record<string, unknown> {
  const lines = scope === 'return'
    ? m.current.lines.filter((l) => /^(F1040|F540NR)\./.test(l.key))
    : m.current.lines.filter((l) => areaForLine(l) === scope)
  const snap: Record<string, unknown> = {}
  for (const l of lines) snap[l.key] = typeof l.value === 'number' ? value(l.key) : l.value
  for (const a of adjustments.values()) {
    if (a.reverted) continue
    const area = AREAS.find((x) => x.id === scope)
    if (scope === 'return' || (area && areaForLine({ key: a.lineKey, form: a.lineKey.split('.')[0] }) === scope)) snap[`adj:${a.adjId}`] = a.to
  }
  return snap
}
