import { create } from 'zustand'
import { uuid } from '@/lib/utils'

export interface Toast {
  id: string
  kind: 'info' | 'success' | 'error' | 'urgent'
  title: string
  body?: string
}

interface UIState {
  mobileSidebarOpen: boolean
  searchOpen: boolean
  threadRootId: string | null
  toasts: Toast[]
  setMobileSidebar: (open: boolean) => void
  toggleMobileSidebar: () => void
  setSearchOpen: (open: boolean) => void
  openThread: (id: string | null) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  mobileSidebarOpen: false,
  searchOpen: false,
  threadRootId: null,
  toasts: [],
  setMobileSidebar: (open) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  openThread: (id) => set({ threadRootId: id }),
  toast: (t) => {
    const id = uuid()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))
