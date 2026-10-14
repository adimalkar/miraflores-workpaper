// Shapes of the packet as delivered. Only the fields the workpaper reads are typed strictly;
// everything else is kept as `unknown` so a richer packet still loads.

export type Money = number

export interface Position { x0: number; y0: number; x1: number; y1: number }

export interface ExtractedValue {
  id: string
  document_id: string
  page: number
  field: string
  label: string
  value: string | number | boolean | null
  value_type: string
  text_as_read: string
  position: Position
  confidence: number
}

export interface DocPage { page: number; printed_content: string }

export interface Doc {
  id: string
  title: string
  document_type: string
  issuer: string
  belongs_to: string
  tax_year: number
  received_at: string
  uploaded_by: 'client' | 'firm'
  file_name: string
  page_count: number
  pages: DocPage[]
  marked_corrected?: boolean | null
  extraction: { status: 'extracted' | 'partial' | 'not_extracted'; values: number; reason: string | null }
}

export interface ReturnLine {
  key: string
  jurisdiction: 'federal' | 'california'
  form: string
  line: string
  label: string
  value: number | string
  rule: string
  inputs: string[]
  sources: string[]
  note?: string
}

export interface Diagnostic { code: string; severity: 'info' | 'warning'; message: string; refs: string[] }

export interface AssetRow {
  asset_id: string
  description: string
  activity: string
  cost: number
  land_value_not_depreciated: number | null
  placed_in_service: string
  method: string
  life_years: number
  federal: { prior_accumulated: number; depreciation_2025: number; accumulated_end: number }
  california: { prior_accumulated: number; depreciation_2025: number; accumulated_end: number }
  amt: { depreciation_2025: number; difference_from_regular: number }
  disposed: null | Record<string, unknown> | string
  sources: string[]
}

export interface Summary {
  federal: { agi: number; taxable_income: number; total_tax: number; payments: number; balance_due: number; penalty: number }
  california: { total_agi: number; ca_agi: number; total_tax: number; payments: number; balance_due: number; penalty: number }
}

export type RateCategory =
  | 'wages' | 'interest' | 'schc_profit' | 'stcg' | 'ltcg' | 'ordinary_income'
  | 'adjustment' | 'salt' | 'itemized' | 'ca_source_income'

export interface ReturnVersion {
  version: string
  computed_at: string
  trigger: string
  documents_used: string[]
  documents_superseded: string[]
  summary: Summary
  tax_effect_rates: Record<RateCategory, { federal_per_dollar: number; california_per_dollar: number }>
  carryovers_out: { federal: Record<string, number>; california: Record<string, unknown> }
  assets: AssetRow[]
  diagnostics: Diagnostic[]
  changes_from_previous: { key: string; change: 'added' | 'changed' | 'removed'; old?: unknown; new?: unknown }[]
  lines: ReturnLine[]
}

export interface Person {
  id: string; role: string; name: string; ssn: string; dob: string
  occupation?: string; ip_pin?: string | null; phone?: string; email?: string
  relationship?: string; months_lived_with_you?: number; full_time_student?: boolean; note?: string; own_income?: string
}

export interface Staff {
  id: string; name: string; role: string; credential: string | null
  sensitive_data_clearance: boolean; active_from: string; note?: string
}

export interface TimelineEvent { id: string; at: string; event: string; actor: string | null; detail: string | null; refs: string[] }

export interface Packet {
  packet: { name: string; version: string; generated: string; client_id: string }
  readme: Record<string, unknown>
  household: {
    filing_status: string; tax_year: number; entered_by: string
    people: Person[]
    addresses: { from: string; to: string | null; address: string; type: string }[]
    residency: { state: string; from: string; to: string; status: string }[]
    bank_account_for_refund_or_payment: { routing: string; account: string; type: string; bank: string }
    prior_year_agi_for_esignature: number
    related_returns: { who: string; return: string; prepared_by: string; in_this_packet: boolean | string }[]
  }
  documents: Doc[]
  extracted_values: ExtractedValue[]
  client: {
    questionnaire: { id: string; question: string; answer: string; answered_by: string; answered_at: string }[]
    messages: { id: string; sent_at: string; from: string; to: string; text: string }[]
    call_notes: { id: string; date: string; participants: string[]; notes: string[] }[]
  }
  firm: {
    name: string
    staff: Staff[]
    firm_identity: { ein: string; address: string; phone: string; efin: string; ero_pin: string; ptins: Record<string, string>; paid_preparer_signing_returns: string }
    client_users: { id: string; name: string; role: string }[]
    assignment_at_start: { preparer: string; reviewer: string; partner: string }
    deadlines: { what: string; date: string }[]
    budget_hours: Record<string, number>
    starter_standards: {
      note: string
      verification_types: string[]
      variance_review: { compare_to: string; flag_if_change_over_percent: number; and_over_amount: number }
      review_levels: string[]
      rules: string[]
      required_steps: string[]
    }
  }
  prior_years: {
    return_2024: {
      prepared_by: string; filed: string; residency: unknown
      dependents: { name: string; ssn: string }[]
      lines: Record<string, number | string>
      line_labels: Record<string, string>
      line_sources: Record<string, string[]>
      notes: Record<string, string>
      K1_1120S: Record<string, number>; K1_1065: Record<string, unknown>
    }
    prior_preparer_workpaper: { source_document: string; summary_memo: string; notes: string[]; open_items_left_by_prior_preparer: string[] }
    asset_records: (Omit<AssetRow, 'federal' | 'california' | 'amt'> & { land_value: number | null; federal: Record<string, number>; california: Record<string, number>; amt_difference: Record<string, number> })[]
    basis_records: Record<string, Record<string, unknown>[]>
    carryovers_into_2025: Record<string, unknown>
  }
  tax_agency_records: {
    irs_account_transcript_2025: { as_of: string; transactions: { date: string; code: string; description: string; amount: number | string }[] }[]
    ftb_account: { as_of: string; tax_year_2025_payments: { date: string; amount: number }[]; tax_year_2024_payments_after_filing: { date: string; amount: number; note: string }[] }
    notices: { id: string; agency: string; type: string; tax_year: number; dated: string; summary?: string; status?: string; response_due?: string; document: string; items_under_examination?: string[] }[]
    efile: { date: string; jurisdiction: string; submission_id: string; status: string; errors?: { code: string; message: string }[] }[]
  }
  timeline: TimelineEvent[]
  engine_reference: { parameters: Record<string, unknown>; rules: Record<string, string> }
  return_versions: ReturnVersion[]
  what_if: {
    alternatives: { id: string; description: string; base_version: string; choices: Record<string, string>; federal: { base: Summary['federal']; alternative: Summary['federal']; total_tax_change: number; penalty_change: number }; california: { base: Summary['california']; alternative: Summary['california']; total_tax_change: number; penalty_change: number }; changed_lines: { key: string; old: unknown; new: unknown }[] }[]
    extension: Record<string, unknown>
  }
  planning_reference_2026: Record<string, unknown>
  post_filing_rates: Record<string, unknown>
  fx_rates: Record<string, Record<string, number>>
}
