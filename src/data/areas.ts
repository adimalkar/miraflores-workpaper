import type { RateCategory, ReturnLine } from './types'

export type AreaId =
  | 'wages' | 'investments' | 'business' | 'rentals' | 'passthrough'
  | 'retirement' | 'foreign' | 'deductions' | 'computation' | 'payments' | 'california'

export interface Area {
  id: AreaId
  name: string
  short: string
  budgetKey: string | null
  blurb: string
  /** Line key the area summary leads with */
  anchor: string
}

export const AREAS: Area[] = [
  { id: 'wages', name: 'Wages & stock compensation', short: 'Wages', budgetKey: 'wages_and_stock_compensation', blurb: 'Two W-2s, RSU vests, ESPP, ISO exercise', anchor: 'F1040.1z' },
  { id: 'investments', name: 'Investments & digital assets', short: 'Investments', budgetKey: 'investments_and_digital_assets', blurb: 'Three brokerages, 282 sales, 12 crypto disposals', anchor: 'F1040.7' },
  { id: 'business', name: 'Lindqvist Studio · Schedule C', short: 'Business', budgetKey: 'business', blurb: 'Books to taxable profit, equipment, mileage, home office', anchor: 'SchC.31' },
  { id: 'rentals', name: 'Rentals & condo sale', short: 'Rentals', budgetKey: 'rentals_and_sale', blurb: 'Fremont Way rental, Barton Hills condo sold 10/15', anchor: 'SchE.26' },
  { id: 'passthrough', name: 'Pass-throughs & basis', short: 'K-1s', budgetKey: 'pass_throughs_and_basis', blurb: 'Woodworks S corp (basis gap), Ridgeline LP (late K-1)', anchor: 'SchE.32' },
  { id: 'retirement', name: 'Retirement & HSA', short: 'Retirement', budgetKey: null, blurb: 'Backdoor Roth, SEP, family HSA', anchor: 'F1040.4b' },
  { id: 'foreign', name: 'Foreign items', short: 'Foreign', budgetKey: null, blurb: 'Sparbanken account (SEK), foreign tax credit, 8938', anchor: 'F8938.1.max' },
  { id: 'deductions', name: 'Deductions & credits', short: 'Deductions', budgetKey: 'deductions_and_credits', blurb: 'Itemized, gifts of stock and a car, CTC, AOTC, dependent care', anchor: 'F1040.12' },
  { id: 'computation', name: 'Tax computation', short: 'Tax', budgetKey: null, blurb: 'Regular tax, AMT from the ISO exercise, NIIT, SE tax', anchor: 'F1040.24' },
  { id: 'payments', name: 'Payments & penalties', short: 'Payments', budgetKey: null, blurb: 'Withholding, estimates, extension, underpayment penalty', anchor: 'F1040.33' },
  { id: 'california', name: 'California 540NR · state split', short: 'California', budgetKey: 'california', blurb: 'Part-year resident to 7/14, then Texas', anchor: 'F540NR.64' },
]

export const AREA_BY_ID = new Map(AREAS.map((a) => [a.id, a]))

const FORM_AREA: Record<string, AreaId> = {
  SchB: 'investments', SchD: 'investments', F8949: 'investments', F8960: 'investments',
  SchC: 'business', SchSE: 'business', 'F4562-C': 'business', F8995: 'business', F8995A: 'business',
  SchE: 'rentals', 'F4562-E': 'rentals', F4797: 'rentals', F8582: 'rentals',
  F7203: 'passthrough', ScheduleS: 'california',
  F8606: 'retirement', F8889: 'retirement',
  F8938: 'foreign',
  SchA: 'deductions', F8283: 'deductions', F8812: 'deductions', F8863: 'deductions', F2441: 'deductions', F8867: 'deductions',
  F6251: 'computation', Sch2: 'computation', F8959: 'wages',
  F2210: 'payments', FTB5805: 'california',
  SchCA540NR: 'california', F540NR: 'california', FTB3885A: 'california',
}

const KEY_AREA: Record<string, AreaId> = {
  'F1040.1a': 'wages', 'F1040.1z': 'wages',
  'F1040.2b': 'investments', 'F1040.3a': 'investments', 'F1040.3b': 'investments', 'F1040.7': 'investments',
  'F1040.4a': 'retirement', 'F1040.4b': 'retirement', 'Sch1.13': 'retirement', 'Sch1.16': 'retirement',
  'Sch1.3': 'business', 'Sch1.15': 'business', 'Sch1.17': 'business',
  'Sch1.5': 'rentals',
  'SchB.7a': 'foreign', 'SchB.7b': 'foreign', 'SchB.8': 'foreign', 'SchB.1.6': 'foreign', 'Sch3.1': 'foreign',
  'F1040.12': 'deductions', 'F1040.13': 'business', 'F1040.19': 'deductions', 'F1040.14': 'computation',
  'Sch3.8': 'computation',
  'F1040.25a': 'payments', 'F1040.25d': 'payments', 'F1040.26': 'payments', 'Sch3.10': 'payments', 'Sch3.11': 'payments',
  'Sch3.15': 'payments', 'F1040.31': 'payments', 'F1040.33': 'payments', 'F1040.37': 'payments', 'F1040.38': 'payments',
  'SchE.28A': 'passthrough', 'SchE.28B': 'passthrough', 'SchE.32': 'passthrough', 'SchD.12': 'passthrough', 'F8949.F.SCORP': 'passthrough', 'F8949.F.total': 'passthrough',
  'SchB.1.7': 'passthrough', 'SchB.1.8': 'passthrough',
  'F6251.2i': 'wages',
}

export function areaForLine(l: Pick<ReturnLine, 'key' | 'form'>): AreaId {
  if (KEY_AREA[l.key]) return KEY_AREA[l.key]
  if (l.key.startsWith('F8949.B.N') || l.key.startsWith('F8949.A.N') || l.key.startsWith('F8949.E.N')) return 'wages'
  if (l.key.startsWith('F540NR.7') && /^F540NR\.7[1-8]$/.test(l.key)) return 'payments'
  if (FORM_AREA[l.form]) return FORM_AREA[l.form]
  if (l.form === 'F1040' || l.form === 'Sch1' || l.form === 'Sch3') return 'computation'
  return 'computation'
}

/** Which tax_effect_rates category a change to this line flows through. */
export function rateCategoryForLine(l: Pick<ReturnLine, 'key' | 'form' | 'jurisdiction' | 'label'>): RateCategory | 'credit' | 'payment' | null {
  const k = l.key
  if (l.jurisdiction === 'california') {
    if (/^F540NR\.7[1-8]/.test(k)) return 'payment'
    return 'ca_source_income'
  }
  if (k.startsWith('F1040.1') || k.startsWith('SchCA540NR.1')) return 'wages'
  if (k.startsWith('SchB.1') || k.startsWith('SchB.5') || k === 'F1040.2b' || k === 'F1040.3b') return 'interest'
  if (k.startsWith('SchC.') || k.startsWith('F4562-C') || k === 'Sch1.3') {
    // Expense lines reduce profit: a +1 on an expense is -1 profit. Handled by sign in the effect calc.
    return 'schc_profit'
  }
  if (k.startsWith('F8949.A') || k.startsWith('F8949.B') || k.startsWith('F8949.C') || k.startsWith('F8949.H') || k.startsWith('F8949.G') || k.startsWith('F8949.I')) return 'stcg'
  if (k.startsWith('F8949') || k.startsWith('SchD.') || k.startsWith('F4797')) return 'ltcg'
  if (k.startsWith('Sch1.1') || k.startsWith('Sch1.2')) return 'adjustment'
  if (k === 'SchA.5a' || k === 'SchA.5b' || k === 'SchA.5d') return 'salt'
  if (k.startsWith('SchA.') || k.startsWith('F8283')) return 'itemized'
  if (k.startsWith('SchE.') || k.startsWith('F4562-E')) return 'ordinary_income'
  if (k === 'F1040.26' || k === 'F1040.25a' || k.startsWith('Sch3.1') || k === 'F1040.33') return 'payment'
  if (k === 'F1040.19' || k.startsWith('F8812') || k.startsWith('F2441') || k.startsWith('F8863') || k === 'Sch3.1') return 'credit'
  return 'ordinary_income'
}

/** +1 when a larger line value means more income (or more deduction for deduction lines handled via the rate sign). */
export function incomeSign(l: Pick<ReturnLine, 'key'>): 1 | -1 {
  const k = l.key
  // Schedule C expense lines: larger expense, smaller profit.
  if (/^SchC\.(8|9|10|11|12|13|15|16|17|18|19|20|21|22|23|24a|24b|25|26|27a.*|28|30)$/.test(k)) return -1
  if (/^F4562-C/.test(k)) return -1
  // Schedule E expense lines: larger expense, smaller rental income.
  if (/^SchE\.(9|10|11|12|13|14|15|16|17|18|19|20)[AB]$/.test(k)) return -1
  if (/^F4562-E/.test(k)) return -1
  return 1
}
