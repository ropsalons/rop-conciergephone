import { useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { SearchPanel } from './SearchPanel'
import { X } from '@/components/ui/Icons'

export function SearchModal() {
  const { searchOpen, setSearchOpen } = useUIStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearchOpen])

  if (!searchOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
      <div className="relative z-10 flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-brand-900 p-3 shadow-2xl animate-slide-up">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <button onClick={() => setSearchOpen(false)} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <SearchPanel onNavigate={() => setSearchOpen(false)} />
      </div>
    </div>
  )
}
