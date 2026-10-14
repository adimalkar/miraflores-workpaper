import type { EffectPart } from '../data/effects'

// Everything the workpaper records is an append-only event. Nothing is edited in place,
// so every number keeps its original, who changed it, when and why.

export type Actor = string // staff id (st-01...) or client user id (cu-01...)

interface Base { id: string; at: string; actor: Actor; batch?: string }

export type WPEvent = Base & (
  | { kind: 'verify'; target: string; method: string; note?: string; evidence?: string[]; value: unknown }
  | { kind: 'unverify'; target: string; note?: string }
  | { kind: 'adjust'; adjId: string; lineKey: string; from: number | null; to: number; reason: string; effects: EffectPart[]; findingId?: string; isNew?: { label: string; form: string } }
  | { kind: 'adjust.approve'; adjId: string; note?: string }
  | { kind: 'adjust.revert'; adjId: string; reason: string }
  | { kind: 'note'; noteId: string; target: string; text: string; blocking: boolean; assignee?: string; noteType: 'review' | 'internal' }
  | { kind: 'note.reply'; noteId: string; text: string }
  | { kind: 'note.resolve'; noteId: string; text?: string }
  | { kind: 'note.reopen'; noteId: string; text?: string }
  | { kind: 'question'; qId: string; to: string; target?: string; text: string; due?: string }
  | { kind: 'question.answer'; qId: string; text: string; attachments?: string[] }
  | { kind: 'signoff'; scope: string; level: 'preparer' | 'reviewer' | 'partner'; snapshot: Record<string, unknown>; note?: string }
  | { kind: 'signoff.revoke'; scope: string; level: string; reason: string }
  | { kind: 'judgment'; jId: string; target?: string; topic: string; decision: string; authority: string; category: 'judgment' | 'election' | 'due_diligence' | 'penalty' | 'variance'; findingId?: string }
  | { kind: 'finding.status'; findingId: string; status: 'open' | 'resolved' | 'dismissed'; reason?: string }
  | { kind: 'doc.disposition'; docId: string; status: 'used' | 'duplicate' | 'superseded' | 'informational' | 'not-needed' | 'outside-scope'; reason: string }
  | { kind: 'attach'; attId: string; target: string; fileName: string; mime: string; size: number; note?: string; text?: string }
  | { kind: 'household.correct'; personId: string; field: 'ssn'; from: string; to: string; reason: string }
  | { kind: 'extraction.correct'; evId: string; from: unknown; to: string; reason: string }
  | { kind: 'assign'; area: string; staffId: string; due?: string }
  | { kind: 'time'; area: string; hours: number; note?: string }
  | { kind: 'step'; step: string; done: boolean; note?: string }
  | { kind: 'view.sensitive'; field: string; subject: string }
  | { kind: 'standards.update'; standards: unknown; note?: string }
  | { kind: 'filing'; action: FilingAction; detail?: Record<string, unknown> }
  | { kind: 'seen'; view: string }
  | { kind: 'undo'; eventIds: string[]; label: string }
  | { kind: 'planning'; text: string }
)

export type FilingAction =
  | 'extension-filed' | 'sent-for-approval' | 'client-approved' | 'efile-submitted' | 'efile-rejected'
  | 'efile-accepted' | 'frozen' | 'amendment-opened' | 'client-copy-issued' | 'notice-received' | 'notice-response-prepared' | 'rolled-forward'

export type WPEventKind = WPEvent['kind']

export function newId(prefix = 'e') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
