import type { RateCategory, ReturnVersion } from './types'

/**
 * The engine cannot be rerun. A change's tax effect is estimated the way the packet README
 * prescribes: change x the version's per-dollar rate for the matching category. Credits and
 * payments move tax or balance 1:1. Where a what-if exists, its engine result is used instead.
 */
export type EffectCat = RateCategory | 'fed_payment' | 'ca_payment' | 'fed_credit' | 'ca_credit' | 'fixed'

export interface EffectPart {
  cat: EffectCat
  /** Change in the measure the rate applies to (income, deduction, adjustment, payment or credit dollars). */
  amount: number
  only?: 'federal' | 'california'
  /** For cat 'fixed': engine-computed effects from a what-if. */
  fixed?: { federal: number; california: number }
  note?: string
}

export interface TaxEffect {
  federalTax: number
  californiaTax: number
  federalBalance: number
  californiaBalance: number
}

export const ZERO_EFFECT: TaxEffect = { federalTax: 0, californiaTax: 0, federalBalance: 0, californiaBalance: 0 }

export function effectOf(parts: EffectPart[], v: ReturnVersion): TaxEffect {
  const out = { ...ZERO_EFFECT }
  for (const p of parts) {
    if (p.cat === 'fixed' && p.fixed) {
      out.federalTax += p.fixed.federal
      out.californiaTax += p.fixed.california
      continue
    }
    if (p.cat === 'fed_payment') { out.federalBalance -= p.amount; continue }
    if (p.cat === 'ca_payment') { out.californiaBalance -= p.amount; continue }
    if (p.cat === 'fed_credit') { out.federalTax -= p.amount; continue }
    if (p.cat === 'ca_credit') { out.californiaTax -= p.amount; continue }
    const r = v.tax_effect_rates[p.cat as RateCategory]
    if (!r) continue
    if (p.only !== 'california') out.federalTax += p.amount * r.federal_per_dollar
    if (p.only !== 'federal') out.californiaTax += p.amount * r.california_per_dollar
  }
  out.federalBalance += out.federalTax
  out.californiaBalance += out.californiaTax
  return {
    federalTax: Math.round(out.federalTax),
    californiaTax: Math.round(out.californiaTax),
    federalBalance: Math.round(out.federalBalance),
    californiaBalance: Math.round(out.californiaBalance),
  }
}

export function addEffects(a: TaxEffect, b: TaxEffect): TaxEffect {
  return {
    federalTax: a.federalTax + b.federalTax,
    californiaTax: a.californiaTax + b.californiaTax,
    federalBalance: a.federalBalance + b.federalBalance,
    californiaBalance: a.californiaBalance + b.californiaBalance,
  }
}

export function largestEffect(e: TaxEffect) {
  return Math.max(Math.abs(e.federalTax), Math.abs(e.californiaTax), Math.abs(e.federalBalance), Math.abs(e.californiaBalance))
}
