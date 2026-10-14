import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { buildModel, loadPacket, type Model } from './data/model'
import { ModelProvider } from './store/context'
import { useStore } from './store/store'
import { Shell } from './components/Shell'

export default function App() {
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hydrate = useStore((s) => s.hydrate)
  const ready = useStore((s) => s.ready)

  useEffect(() => {
    hydrate()
    loadPacket().then((p) => setModel(buildModel(p))).catch((e) => setError(String(e.message ?? e)))
  }, [hydrate])

  if (error) return <Boot message="The packet did not load" detail={error} />
  if (!model || !ready) return <Boot message="Opening the workpaper" detail="Reading 74 documents and 3,012 extracted values" />
  return (
    <ModelProvider model={model}>
      <Shell />
    </ModelProvider>
  )
}

function Boot({ message, detail }: { message: string; detail: string }) {
  return (
    <div className="grid h-full place-items-center bg-ink">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <svg width="44" height="44" viewBox="0 0 20 20" className="tick-draw mx-auto mb-5"><path d="M3 10.5l4 4L17 4" fill="none" stroke="#F7E463" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="display text-lg font-semibold text-white">{message}</div>
        <div className="mt-1 text-sm text-ink-300">{detail}</div>
      </motion.div>
    </div>
  )
}
