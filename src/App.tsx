import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { get as idbGet, del as idbDel } from 'idb-keyval'
import { buildModel, loadPacket, validatePacket, type Model } from './data/model'
import type { Packet } from './data/types'
import { ModelProvider } from './store/context'
import { useStore, PACKET_OVERRIDE_KEY } from './store/store'
import { Shell } from './components/Shell'

export default function App() {
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hydrate = useStore((s) => s.hydrate)
  const ready = useStore((s) => s.ready)

  useEffect(() => {
    (async () => {
      // A packet opened from Firm › Record replaces the delivered one until it is restored.
      let override: Packet | undefined
      try { override = await idbGet(PACKET_OVERRIDE_KEY) } catch { /* storage blocked */ }
      const packet = override ?? (await loadPacket())
      const problems = validatePacket(packet)
      if (problems.length) throw new Error(`This file is not a workpaper packet: ${problems.join('; ')}`)
      await hydrate(override ? `custom:${packet.packet.client_id}` : undefined)
      setModel(buildModel(packet))
    })().catch((e) => setError(String(e.message ?? e)))
  }, [hydrate])

  if (error) return <Boot message="The packet did not load" detail={error} action={<button onClick={async () => { try { await idbDel(PACKET_OVERRIDE_KEY) } catch { /* ignore */ } location.reload() }} className="mt-5 rounded-lg bg-hilite px-4 py-2 text-sm font-semibold text-ink">Restore the delivered packet</button>} />
  if (!model || !ready) return <Boot message="Opening the workpaper" detail="Reading the documents, extracted values and return versions" />
  return (
    <ModelProvider model={model}>
      <Shell />
    </ModelProvider>
  )
}

function Boot({ message, detail, action }: { message: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center bg-ink">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <svg width="44" height="44" viewBox="0 0 20 20" className="tick-draw mx-auto mb-5"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#F7E463" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="display text-lg font-semibold text-white">{message}</div>
        <div className="mt-1 max-w-lg text-sm text-ink-300">{detail}</div>
        {action}
      </motion.div>
    </div>
  )
}
