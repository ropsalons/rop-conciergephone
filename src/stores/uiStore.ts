import { create } from 'zustand'
import { uuid } from '@/lib/utils'

export interface Toast {
  id: string
  kind: 'info' | 'success' | 'error' | 'urgent'
  title: string
  body?: string
}

// How the channel list in the sidebar is ordered. Favorites always float to the top;
// this controls the order *within* the non-favorite group (and among favorites).
// 'manual' = the user's own drag-and-drop order (see channelOrder).
export type ChannelSort = 'name' | 'activity' | 'unread' | 'manual'

// The re-orderable / collapsible sidebar sections. The user can move these up or down and
// roll each one up, the same way the AI console groups collapse.
export type SidebarSection = 'favorites' | 'channels' | 'dms'
const ALL_SECTIONS: SidebarSection[] = ['favorites', 'channels', 'dms']
// Normalize a stored order: keep known keys in their saved order, then append any missing ones,
// so a partial/old value can never drop a section.
function normalizeSections(raw: unknown): SidebarSection[] {
  const arr = Array.isArray(raw) ? raw.filter((x): x is SidebarSection => (ALL_SECTIONS as string[]).includes(x)) : []
  const seen = new Set(arr)
  for (const k of ALL_SECTIONS) if (!seen.has(k)) arr.push(k)
  return arr
}

// Persisted sidebar preferences (survive reloads). Kept tiny + defensive so a bad/empty
// localStorage value can never break boot.
const PREF_KEY = 'rop.sidebarPrefs'
interface SidebarPrefs {
  channelSort: ChannelSort
  hideInactive: boolean
  channelOrder: string[] // channel ids, in the user's manual drag order
  sectionOrder: SidebarSection[] // top-to-bottom order of the Favorites / Channels / DMs sections
  sectionCollapsed: Record<string, boolean> // which sections are rolled up
}
function loadPrefs(): SidebarPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
    // Default to most-recent activity (not A–Z) — far more useful with a big channel list.
    const valid = ['name', 'activity', 'unread', 'manual']
    const channelSort: ChannelSort = valid.includes(raw.channelSort) ? raw.channelSort : 'activity'
    const channelOrder = Array.isArray(raw.channelOrder) ? raw.channelOrder.filter((x: unknown) => typeof x === 'string') : []
    const sectionCollapsed =
      raw.sectionCollapsed && typeof raw.sectionCollapsed === 'object' ? (raw.sectionCollapsed as Record<string, boolean>) : {}
    return { channelSort, hideInactive: !!raw.hideInactive, channelOrder, sectionOrder: normalizeSections(raw.sectionOrder), sectionCollapsed }
  } catch {
    return { channelSort: 'activity', hideInactive: false, channelOrder: [], sectionOrder: ALL_SECTIONS.slice(), sectionCollapsed: {} }
  }
}
function savePrefs(p: SidebarPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
// Snapshot the current preference-bearing state to localStorage.
function persist(s: {
  channelSort: ChannelSort
  hideInactive: boolean
  channelOrder: string[]
  sectionOrder: SidebarSection[]
  sectionCollapsed: Record<string, boolean>
}) {
  savePrefs({
    channelSort: s.channelSort,
    hideInactive: s.hideInactive,
    channelOrder: s.channelOrder,
    sectionOrder: s.sectionOrder,
    sectionCollapsed: s.sectionCollapsed,
  })
}

interface UIState {
  mobileSidebarOpen: boolean
  searchOpen: boolean
  helpOpen: boolean
  threadRootId: string | null
  toasts: Toast[]
  channelSort: ChannelSort
  hideInactive: boolean
  channelOrder: string[]
  sectionOrder: SidebarSection[]
  sectionCollapsed: Record<string, boolean>
  setMobileSidebar: (open: boolean) => void
  toggleMobileSidebar: () => void
  setSearchOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  setChannelSort: (sort: ChannelSort) => void
  setHideInactive: (hide: boolean) => void
  setChannelOrder: (ids: string[]) => void
  moveSection: (key: SidebarSection, dir: -1 | 1) => void
  toggleSectionCollapsed: (key: SidebarSection) => void
  openThread: (id: string | null) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

const initialPrefs = loadPrefs()

export const useUIStore = create<UIState>((set, get) => ({
  mobileSidebarOpen: false,
  searchOpen: false,
  helpOpen: false,
  threadRootId: null,
  toasts: [],
  channelSort: initialPrefs.channelSort,
  hideInactive: initialPrefs.hideInactive,
  channelOrder: initialPrefs.channelOrder,
  sectionOrder: initialPrefs.sectionOrder,
  sectionCollapsed: initialPrefs.sectionCollapsed,
  setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setChannelSort: (sort) => {
    set({ channelSort: sort })
    persist(get())
  },
  setHideInactive: (hide) => {
    set({ hideInactive: hide })
    persist(get())
  },
  // Dragging a channel writes a new manual order and switches the list into manual mode.
  setChannelOrder: (ids) => {
    set({ channelOrder: ids, channelSort: 'manual' })
    persist(get())
  },
  // Move a whole section (Favorites / Channels / DMs) up or down in the sidebar.
  moveSection: (key, dir) => {
    const order = get().sectionOrder.slice()
    const i = order.indexOf(key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    set({ sectionOrder: order })
    persist(get())
  },
  // Roll a section up (collapse) or open it back.
  toggleSectionCollapsed: (key) => {
    const next = { ...get().sectionCollapsed, [key]: !get().sectionCollapsed[key] }
    set({ sectionCollapsed: next })
    persist(get())
  },
  openThread: (id) => set({ threadRootId: id }),
  toast: (t) => {
    const id = uuid()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))
