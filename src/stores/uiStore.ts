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
export type ChannelSort = 'name' | 'activity' | 'unread'

// Persisted sidebar preferences (survive reloads). Kept tiny + defensive so a bad/empty
// localStorage value can never break boot.
const PREF_KEY = 'rop.sidebarPrefs'
function loadPrefs(): { channelSort: ChannelSort; hideInactive: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
    const channelSort: ChannelSort =
      raw.channelSort === 'activity' || raw.channelSort === 'unread' ? raw.channelSort : 'name'
    return { channelSort, hideInactive: !!raw.hideInactive }
  } catch {
    return { channelSort: 'name', hideInactive: false }
  }
}
function savePrefs(p: { channelSort: ChannelSort; hideInactive: boolean }) {
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
  setMobileSidebar: (open: boolean) => void
  toggleMobileSidebar: () => void
  setSearchOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  setChannelSort: (sort: ChannelSort) => void
  setHideInactive: (hide: boolean) => void
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
  setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setChannelSort: (sort) => {
    set({ channelSort: sort })
    savePrefs({ channelSort: sort, hideInactive: get().hideInactive })
  },
  setHideInactive: (hide) => {
    set({ hideInactive: hide })
    savePrefs({ channelSort: get().channelSort, hideInactive: hide })
  },
  openThread: (id) => set({ threadRootId: id }),
  toast: (t) => {
    const id = uuid()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))
