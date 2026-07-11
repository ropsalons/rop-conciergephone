import { useAuthStore } from '@/stores/authStore'

export function DeactivatedPage() {
  const signOut = useAuthStore((s) => s.signOut)
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-sm p-6 text-center">
        <h1 className="text-lg font-bold text-white">Account deactivated</h1>
        <p className="mt-2 text-sm text-slate-300">
          Your ROP Chat access has been turned off by an administrator. Please reach out to
          leadership if you believe this is a mistake.
        </p>
        <button onClick={signOut} className="btn-ghost mt-5 w-full">
          Sign out
        </button>
      </div>
    </div>
  )
}
