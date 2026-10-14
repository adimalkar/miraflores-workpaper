export function money(n: number | null | undefined, opts: { cents?: boolean; sign?: boolean; dash?: boolean } = {}) {
  if (n == null || Number.isNaN(n)) return '—'
  if (n === 0 && opts.dash) return '—'
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 })
  if (n < 0) return `(${s})`
  return opts.sign && n > 0 ? `+${s}` : s
}

export function signed(n: number) {
  if (n === 0) return '0'
  const s = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  return n > 0 ? `+${s}` : `−${s}`
}

export function lineValue(v: unknown) {
  if (typeof v === 'number') {
    if (Math.abs(v) < 1 && v !== 0 && !Number.isInteger(v)) return v.toString()
    return money(v, { cents: !Number.isInteger(v) })
  }
  return String(v ?? '—')
}

export function date(iso: string | undefined | null, withTime = false) {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) })
}

export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return date(iso)
}

export function pct(n: number | null) {
  if (n == null) return 'new'
  return `${n > 0 ? '+' : ''}${n.toFixed(0)}%`
}

export function mask(v: string) {
  return v.replace(/\d(?=[\d-]{4})/g, '•')
}

export const VERIFICATION_LABEL: Record<string, string> = {
  agreed_to_source_document: 'Agreed to source document',
  recalculated: 'Recalculated',
  confirmed_with_client: 'Confirmed with client',
  agreed_to_prior_year: 'Agreed to prior year',
  agreed_to_third_party_record: 'Agreed to third-party record',
}

export function humanize(s: string) {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
