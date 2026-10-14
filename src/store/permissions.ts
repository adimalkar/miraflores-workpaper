import type { Model } from '../data/model'

export type Role = 'preparer' | 'reviewer' | 'partner' | 'firm_administrator' | 'quality_reviewer' | 'client'

export interface Permissions {
  actor: string
  name: string
  role: Role
  initials: string
  clearance: boolean
  canEdit: boolean          // verify, adjust, notes, questions, dispositions
  canSignAs: ('preparer' | 'reviewer' | 'partner')[]
  canApproveLarge: boolean  // adjustments with tax effect over 1,000
  canResolveReviewNotes: boolean
  canFile: boolean
  canAdmin: boolean
  isClient: boolean
  why: (action: string) => string | null
}

export const ROLE_LABEL: Record<Role, string> = {
  preparer: 'Preparer', reviewer: 'Reviewer', partner: 'Partner', firm_administrator: 'Firm administrator',
  quality_reviewer: 'Quality reviewer', client: 'Client',
}

export function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

export function personName(m: Model, id: string) {
  return m.staffById.get(id)?.name ?? m.packet.firm.client_users.find((c) => c.id === id)?.name ?? id
}

export function permissionsFor(m: Model, actor: string): Permissions {
  const staff = m.staffById.get(actor)
  const client = m.packet.firm.client_users.find((c) => c.id === actor)
  const role: Role = staff ? (staff.role as Role) : 'client'
  const name = staff?.name ?? client?.name ?? actor
  const clearance = staff?.sensitive_data_clearance ?? true
  const canEdit = role === 'preparer' || role === 'reviewer' || role === 'partner'
  const canSignAs: Permissions['canSignAs'] = role === 'preparer' ? ['preparer'] : role === 'reviewer' ? ['reviewer'] : role === 'partner' ? ['partner'] : []
  const p: Permissions = {
    actor, name, role, initials: initials(name), clearance, canEdit, canSignAs,
    canApproveLarge: role === 'partner',
    canResolveReviewNotes: role === 'reviewer' || role === 'partner',
    canFile: role === 'partner' || role === 'reviewer',
    canAdmin: role === 'firm_administrator',
    isClient: role === 'client',
    why: (action) => {
      if (action === 'edit' && !canEdit) return `${ROLE_LABEL[role]}s can read the workpaper but not change it.`
      if (action === 'approve-large' && role !== 'partner') return 'Firm rule: adjustments above the firm threshold need partner sign-off.'
      if (action === 'resolve-review' && !(role === 'reviewer' || role === 'partner')) return 'Only the reviewer or partner can clear a review note.'
      if (action === 'admin' && role !== 'firm_administrator') return 'Only the firm administrator can change firm standards.'
      if (action === 'unmask' && !clearance) return `${name} has no sensitive-data clearance${staff?.note ? ` (${staff.note})` : ''}.`
      return null
    },
  }
  return p
}
