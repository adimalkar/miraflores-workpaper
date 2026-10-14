import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { newId, type WPEvent } from './events'

// Persistence: the event log is the only thing saved. It goes to IndexedDB (falling back to
// localStorage), and every new event is broadcast to other open tabs so several people can work
// at once and see each other's changes live. Swapping this adapter for a server is the only
// change a multi-machine deployment needs.

const KEY = 'proof.events.v1'
const ACTOR_KEY = 'proof.actor'
const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('proof-sync') : null

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never
export type NewEvent = DistributiveOmit<WPEvent, 'id' | 'at' | 'actor'>

export interface Presence { actor: string; view: string; tab: string; at: number }

export type Panel =
  | { type: 'line'; key: string }
  | { type: 'doc'; docId: string; evId?: string; page?: number }
  | null

interface Toast { id: string; text: string; undo?: string[]; tone?: 'ok' | 'warn' }

interface Store {
  ready: boolean
  events: WPEvent[]
  actor: string
  tab: string
  presence: Record<string, Presence>
  route: string
  trace: string | null
  doc: { docId: string; evId?: string; page?: number } | null
  palette: boolean
  toasts: Toast[]
  versionView: string
  hydrate: () => Promise<void>
  setActor: (a: string) => void
  record: (e: NewEvent | NewEvent[], opts?: { toast?: string; silent?: boolean }) => string[]
  undo: (ids: string[], label: string) => void
  navigate: (route: string) => void
  openTrace: (key: string | null) => void
  openDoc: (d: { docId: string; evId?: string; page?: number } | null) => void
  setPalette: (open: boolean) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  setVersionView: (v: string) => void
  resetAll: () => Promise<void>
  importEvents: (evs: WPEvent[]) => void
}

async function load(): Promise<WPEvent[]> {
  try {
    const v = await idbGet(KEY)
    if (Array.isArray(v)) return v
  } catch { /* IndexedDB unavailable */ }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* storage blocked */ }
  return []
}

async function save(events: WPEvent[]) {
  try { await idbSet(KEY, events); return } catch { /* fall through */ }
  try { localStorage.setItem(KEY, JSON.stringify(events)) } catch { /* storage blocked */ }
}

const initialRoute = () => (typeof location !== 'undefined' && location.hash.slice(1)) || '/overview'
const tabId = Math.random().toString(36).slice(2, 8)

export const useStore = create<Store>((set, get) => ({
  ready: false,
  events: [],
  actor: (() => { try { return sessionStorage.getItem(ACTOR_KEY) || localStorage.getItem(ACTOR_KEY) || 'st-01' } catch { return 'st-01' } })(),
  tab: tabId,
  presence: {},
  route: initialRoute(),
  trace: null,
  doc: null,
  palette: false,
  toasts: [],
  versionView: 'work',

  hydrate: async () => {
    const events = await load()
    set({ events, ready: true })
  },

  setActor: (a) => {
    try { sessionStorage.setItem(ACTOR_KEY, a); localStorage.setItem(ACTOR_KEY, a) } catch { /* ignore */ }
    set({ actor: a })
    if (a.startsWith('cu-')) get().navigate('/client')
    else if (get().route.startsWith('/client')) get().navigate('/overview')
  },

  record: (input, opts) => {
    const list = Array.isArray(input) ? input : [input]
    const batch = list.length > 1 ? newId('b') : undefined
    const now = new Date().toISOString()
    const evs = list.map((e) => ({ ...e, id: newId(), at: now, actor: get().actor, ...(batch ? { batch } : {}) }) as WPEvent)
    const events = [...get().events, ...evs]
    set({ events })
    save(events)
    channel?.postMessage({ type: 'events', events: evs, from: tabId })
    if (opts?.toast) get().toast({ text: opts.toast, undo: evs.map((e) => e.id) })
    return evs.map((e) => e.id)
  },

  undo: (ids, label) => {
    get().record({ kind: 'undo', eventIds: ids, label })
    get().toast({ text: `Undone: ${label}` })
  },

  navigate: (route) => {
    if (typeof location !== 'undefined' && location.hash.slice(1) !== route) history.pushState(null, '', `#${route}`)
    set({ route })
    broadcastPresence()
  },

  openTrace: (key) => set({ trace: key }),
  openDoc: (d) => set({ doc: d }),
  setPalette: (open) => set({ palette: open }),
  toast: (t) => {
    const id = newId('t')
    set({ toasts: [...get().toasts, { ...t, id }] })
    setTimeout(() => get().dismissToast(id), t.undo ? 7000 : 3500)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  setVersionView: (v) => set({ versionView: v }),
  resetAll: async () => {
    set({ events: [] })
    await save([])
    channel?.postMessage({ type: 'reset', from: tabId })
  },
  importEvents: (evs) => {
    const known = new Set(get().events.map((e) => e.id))
    const fresh = evs.filter((e) => !known.has(e.id))
    const merged = [...get().events, ...fresh].sort((a, b) => a.at.localeCompare(b.at))
    set({ events: merged })
    save(merged)
    channel?.postMessage({ type: 'events', events: fresh, from: tabId })
    get().toast({ text: `Loaded ${fresh.length} events` })
  },
}))

function broadcastPresence() {
  const s = useStore.getState()
  channel?.postMessage({ type: 'presence', p: { actor: s.actor, view: s.route, tab: tabId, at: Date.now() } })
}

if (channel) {
  channel.onmessage = (msg) => {
    const d = msg.data
    if (!d || d.from === tabId) {
      if (d?.type !== 'presence') return
    }
    if (d.type === 'events') {
      const s = useStore.getState()
      const known = new Set(s.events.map((e) => e.id))
      const fresh = (d.events as WPEvent[]).filter((e) => !known.has(e.id))
      if (fresh.length) useStore.setState({ events: [...s.events, ...fresh].sort((a, b) => a.at.localeCompare(b.at)) })
    } else if (d.type === 'reset') {
      useStore.setState({ events: [] })
    } else if (d.type === 'presence' && d.p.tab !== tabId) {
      useStore.setState({ presence: { ...useStore.getState().presence, [d.p.tab]: d.p } })
    } else if (d.type === 'bye') {
      const p = { ...useStore.getState().presence }
      delete p[d.tab]
      useStore.setState({ presence: p })
    } else if (d.type === 'hello') {
      broadcastPresence()
    }
  }
  setInterval(() => {
    broadcastPresence()
    const now = Date.now()
    const p = useStore.getState().presence
    const alive = Object.fromEntries(Object.entries(p).filter(([, v]) => now - v.at < 95000))
    if (Object.keys(alive).length !== Object.keys(p).length) useStore.setState({ presence: alive })
  }, 3000)
  channel.postMessage({ type: 'hello', from: tabId })
  document.addEventListener('visibilitychange', () => broadcastPresence())
  window.addEventListener('beforeunload', () => channel.postMessage({ type: 'bye', tab: tabId }))
  useStore.subscribe((s, prev) => { if (s.actor !== prev.actor) broadcastPresence() })
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => useStore.setState({ route: initialRoute() }))
}

// Exposed in development only, for end-to-end tests.
if (import.meta.env.DEV) (window as unknown as { __proofStore: typeof useStore }).__proofStore = useStore
