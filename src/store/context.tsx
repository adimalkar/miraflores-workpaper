import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Model } from '../data/model'
import { runChecks, type Finding } from '../data/checks'
import { deriveState, type WorkState } from './derive'
import { useStore } from './store'
import { permissionsFor, type Permissions } from './permissions'

interface Ctx { m: Model; findings: Finding[] }
const ModelCtx = createContext<Ctx | null>(null)

export function ModelProvider({ model, children }: { model: Model; children: ReactNode }) {
  const findings = useMemo(() => runChecks(model), [model])
  if (import.meta.env.DEV) (window as unknown as { __proof: unknown }).__proof = { model, findings }
  return <ModelCtx.Provider value={{ m: model, findings }}>{children}</ModelCtx.Provider>
}

export function useModel() {
  const c = useContext(ModelCtx)
  if (!c) throw new Error('Model not loaded')
  return c
}

export function useWork(): WorkState {
  const { m, findings } = useModel()
  const events = useStore((s) => s.events)
  return useMemo(() => deriveState(m, events, findings), [m, events, findings])
}

export function usePerms(): Permissions {
  const { m } = useModel()
  const actor = useStore((s) => s.actor)
  return useMemo(() => permissionsFor(m, actor), [m, actor])
}

export function useFindingState() {
  const { findings } = useModel()
  const w = useWork()
  return useMemo(() => findings.map((f) => {
    const st = w.findingStatus.get(f.id)
    const applied = f.proposals.length > 0 && f.proposals.every((p) =>
      p.kind === 'household' ? w.ssnFix.get(p.personId) === p.to
        : p.kind === 'extraction' ? w.extractionFix.get(p.evId)?.to === p.to
          : w.adjByLine.get(p.lineKey)?.to === p.to)
    const judged = w.judgments.find((j) => j.findingId === f.id)
    const status = st?.status === 'dismissed' ? 'dismissed' : applied || st?.status === 'resolved' || (judged && st?.status !== 'open') ? 'resolved' : 'open'
    return { f, status, applied, reason: st?.reason ?? (judged ? `Judgment: ${judged.decision}` : undefined), by: st?.by ?? judged?.by, at: st?.at ?? judged?.at }
  }), [findings, w])
}
