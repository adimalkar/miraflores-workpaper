import type { Doc, ExtractedValue, Packet, ReturnLine, ReturnVersion } from './types'
import { areaForLine, AREAS, type AreaId } from './areas'

// The Model is a read-only index over the packet. Everything the workpaper records
// (verifications, adjustments, notes, sign-offs) lives in the event log, never in here.

export interface SourceRef {
  raw: string
  kind: 'ev' | 'doc' | 'page' | 'qa' | 'msg' | 'call' | 'py' | 'agency' | 'asset' | 'household' | 'param' | 'fx' | 'timeline' | 'line' | 'other'
  id: string
  label: string
  docId?: string
  page?: number
}

export interface Model {
  packet: Packet
  docs: Doc[]
  docById: Map<string, Doc>
  ev: Map<string, ExtractedValue>
  evByDoc: Map<string, ExtractedValue[]>
  versions: ReturnVersion[]
  versionById: Map<string, ReturnVersion>
  current: ReturnVersion
  lineMaps: Map<string, Map<string, ReturnLine>>
  /** line key -> keys of lines that use it as an input (current version) */
  parents: Map<string, string[]>
  /** ev id -> line keys that cite it (per version) */
  evToLines: Map<string, Map<string, string[]>>
  /** doc id -> line keys that cite any of its values (current version) */
  docToLines: Map<string, string[]>
  linesByArea: Map<AreaId, ReturnLine[]>
  /** For R-SUM / R-CARRY lines: the sign of each input, learned from the engine's own numbers. */
  sumSigns: Map<string, number[]>
  /** Current-version line keys, inputs before the lines that use them. */
  topo: string[]
  priorLines: Record<string, number | string>
  priorLabels: Record<string, string>
  staffById: Map<string, Packet['firm']['staff'][number]>
  ruleText: (rule: string) => string
  resolveRef: (raw: string) => SourceRef
  docLabel: (id: string) => string
}

export const PACKET_URL = `${import.meta.env.BASE_URL}packet/okafor_lindqvist_2025_packet.json`

export async function loadPacket(url = PACKET_URL): Promise<Packet> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load the packet (${res.status}) from ${url}`)
  return res.json()
}

/** Structural check before a packet is trusted: returns what is missing, empty when usable. */
export function validatePacket(p: unknown): string[] {
  const out: string[] = []
  const x = p as Partial<Packet> | null
  if (!x || typeof x !== 'object') return ['not a JSON object']
  if (!x.packet?.client_id) out.push('packet.client_id missing')
  if (!Array.isArray(x.documents) || !x.documents.length) out.push('no documents')
  if (!Array.isArray(x.extracted_values)) out.push('no extracted_values')
  if (!Array.isArray(x.return_versions) || !x.return_versions.length || !Array.isArray(x.return_versions[0]?.lines)) out.push('no return_versions with lines')
  if (!Array.isArray(x.household?.people)) out.push('household.people missing')
  if (!x.firm?.staff?.length) out.push('firm.staff missing')
  return out
}

export function buildModel(packet: Packet): Model {
  const docs = packet.documents
  const docById = new Map(docs.map((d) => [d.id, d]))
  const ev = new Map(packet.extracted_values.map((e) => [e.id, e]))
  const evByDoc = new Map<string, ExtractedValue[]>()
  for (const e of packet.extracted_values) {
    const list = evByDoc.get(e.document_id) ?? []
    list.push(e)
    evByDoc.set(e.document_id, list)
  }
  const versions = packet.return_versions
  const versionById = new Map(versions.map((v) => [v.version, v]))
  const current = versions[versions.length - 1]
  const lineMaps = new Map(versions.map((v) => [v.version, new Map(v.lines.map((l) => [l.key, l]))]))

  const parents = new Map<string, string[]>()
  for (const l of current.lines) {
    for (const i of l.inputs) {
      const p = parents.get(i) ?? []
      p.push(l.key)
      parents.set(i, p)
    }
  }

  const evToLines = new Map<string, Map<string, string[]>>()
  for (const v of versions) {
    for (const l of v.lines) {
      for (const s of l.sources) {
        if (!s.startsWith('ev-')) continue
        const byV = evToLines.get(s) ?? new Map<string, string[]>()
        const arr = byV.get(v.version) ?? []
        arr.push(l.key)
        byV.set(v.version, arr)
        evToLines.set(s, byV)
      }
    }
  }

  const docToLines = new Map<string, string[]>()
  for (const l of current.lines) {
    for (const s of l.sources) {
      const e = ev.get(s)
      if (!e) continue
      const arr = docToLines.get(e.document_id) ?? []
      if (!arr.includes(l.key)) arr.push(l.key)
      docToLines.set(e.document_id, arr)
    }
  }

  const linesByArea = new Map<AreaId, ReturnLine[]>(AREAS.map((a) => [a.id, []]))
  for (const l of current.lines) linesByArea.get(areaForLine(l))!.push(l)

  const curMap = lineMaps.get(current.version)!
  const num = (k: string) => { const v = curMap.get(k)?.value; return typeof v === 'number' ? v : null }
  const sumSigns = new Map<string, number[]>()
  for (const l of current.lines) {
    if (typeof l.value !== 'number' || !l.inputs.length) continue
    if (l.rule === 'R-CARRY' && l.inputs.length === 1) { sumSigns.set(l.key, [1]); continue }
    if (l.rule !== 'R-SUM') continue
    const vals = l.inputs.map(num)
    if (vals.some((v) => v == null)) continue
    const n = vals.length
    if (n > 14) { sumSigns.set(l.key, vals.map(() => 1)); continue }
    for (let mask = 0; mask < 1 << n; mask++) {
      if (mask & 1) continue
      let t = 0
      for (let i = 0; i < n; i++) t += (mask & (1 << i) ? -1 : 1) * (vals[i] as number)
      if (Math.abs(t - l.value) <= Math.max(1, n * 0.5)) { sumSigns.set(l.key, vals.map((_, i) => (mask & (1 << i) ? -1 : 1))); break }
    }
  }
  const topo: string[] = []
  const seen = new Set<string>()
  const visit = (k: string) => {
    if (seen.has(k)) return
    seen.add(k)
    for (const i of curMap.get(k)?.inputs ?? []) visit(i)
    topo.push(k)
  }
  for (const l of current.lines) visit(l.key)

  const staffById = new Map(packet.firm.staff.map((s) => [s.id, s]))
  const rules = packet.engine_reference.rules

  const docLabel = (id: string) => {
    const d = docById.get(id)
    return d ? `${d.id} · ${d.title}` : id
  }

  const resolveRef = (raw: string): SourceRef => {
    if (raw.startsWith('ev-')) {
      const e = ev.get(raw)
      return { raw, kind: 'ev', id: raw, label: e ? `${e.label}` : raw, docId: e?.document_id, page: e?.page }
    }
    if (/^D\d{2}$/.test(raw)) return { raw, kind: 'doc', id: raw, label: docLabel(raw), docId: raw }
    if (raw.startsWith('doc:')) {
      const m = raw.match(/^doc:(D\d+)#page(\d+)/)
      return { raw, kind: 'page', id: raw, label: m ? `${m[1]} page ${m[2]} (not extracted)` : raw, docId: m?.[1], page: m ? Number(m[2]) : undefined }
    }
    if (/^qa-\d+/.test(raw)) {
      const q = packet.client.questionnaire.find((x) => x.id === raw)
      return { raw, kind: 'qa', id: raw, label: q ? `Questionnaire: ${q.question}` : raw }
    }
    if (/^msg-\d+/.test(raw)) {
      const m = packet.client.messages.find((x) => x.id === raw)
      return { raw, kind: 'msg', id: raw, label: m ? `Message from ${m.from}` : raw }
    }
    if (/^call-\d+/.test(raw)) return { raw, kind: 'call', id: raw, label: 'Client call notes' }
    if (raw.startsWith('py:')) return { raw, kind: 'py', id: raw, label: `Prior year · ${raw.slice(4).replace(/^\//, '').replace(/\//g, ' › ')}` }
    if (raw.startsWith('agency:')) return { raw, kind: 'agency', id: raw, label: `Agency record · ${raw.slice(8)}` }
    if (raw.startsWith('asset:')) return { raw, kind: 'asset', id: raw.slice(6), label: `Asset ${raw.slice(6)}` }
    if (raw.startsWith('household:')) {
      const p = packet.household.people.find((x) => x.id === raw.slice(10))
      return { raw, kind: 'household', id: raw.slice(10), label: p ? `Household · ${p.name}` : raw }
    }
    if (raw.startsWith('ref:param.')) return { raw, kind: 'param', id: raw.slice(10), label: `Engine parameter · ${raw.slice(10)} = ${JSON.stringify(packet.engine_reference.parameters[raw.slice(10)])}` }
    if (raw.startsWith('ref:fx.')) {
      const parts = raw.split('.')
      const rate = packet.fx_rates?.SEK_per_USD?.[parts[2]]
      return { raw, kind: 'fx', id: raw, label: `FX ${parts[1]} ${parts[2].replace('_', ' ')} = ${rate}` }
    }
    if (raw.startsWith('timeline:')) return { raw, kind: 'timeline', id: raw.slice(9), label: `Timeline · ${raw.slice(9)}` }
    if (lineMaps.get(current.version)?.has(raw)) return { raw, kind: 'line', id: raw, label: raw }
    return { raw, kind: 'other', id: raw, label: raw }
  }

  return {
    packet, docs, docById, ev, evByDoc, versions, versionById, current, lineMaps, parents, evToLines, docToLines,
    linesByArea, sumSigns, topo, priorLines: packet.prior_years.return_2024.lines, priorLabels: packet.prior_years.return_2024.line_labels,
    staffById,
    ruleText: (r) => rules[r] ?? r,
    resolveRef, docLabel,
  }
}

export function lineValueNum(l: ReturnLine | undefined): number | null {
  if (!l) return null
  return typeof l.value === 'number' ? l.value : null
}
