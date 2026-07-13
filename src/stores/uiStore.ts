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

// Persisted sidebar preferences (survive reloads). Kept tiny + defensive so a bad/empty
// localStorage value can never break boot.
const PREF_KEY = 'rop.sidebarPrefs'
interface SidebarPrefs {
  channelSort: ChannelSort
  hideInactive: boolean
  channelOrder: string[] // channel ids, in the user's manual drag order
}
function loadPrefs(): SidebarPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
    const channelSort: ChannelSort =
      raw.channelSort === 'activity' || raw.channelSort === 'unread' || raw.channelSort === 'manual'
        ? raw.channelSort
        : 'name'
    const channelOrder = Array.isArray(raw.channelOrder) ? raw.channelOrder.filter((x: unknown) => typeof x === 'string') : []
    return { channelSort, hideInactive: !!raw.hideInactive, channelOrder }
  } catch {
    return { channelSort: 'name', hideInactive: false, channelOrder: [] }
  }
}
function savePrefs(p: SidebarPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
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
  setMobileSidebar: (open: boolean) => void
  toggleMobileSidebar: () => void
  setSearchOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  setChannelSort: (sort: ChannelSort) => void
  setHideInactive: (hide: boolean) => void
  setChannelOrder: (ids: string[]) => void
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
  setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setChannelSort: (sort) => {
    set({ channelSort: sort })
    savePrefs({ channelSort: sort, hideInactive: get().hideInactive, channelOrder: get().channelOrder })
  },
  setHideInactive: (hide) => {
    set({ hideInactive: hide })
    savePrefs({ channelSort: get().channelSort, hideInactive: hide, channelOrder: get().channelOrder })
  },
  // Dragging a channel writes a new manual order and switches the list into manual mode.
  setChannelOrder: (ids) => {
    set({ channelOrder: ids, channelSort: 'manual' })
    savePrefs({ channelSort: 'manual', hideInactive: get().hideInactive, channelOrder: ids })
  },
  openThread: (id) => set({ threadRootId: id }),
  toast: (t) => {
    const id = uuid()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))
