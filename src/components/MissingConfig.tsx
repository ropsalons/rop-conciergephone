import { APP_NAME } from '@/lib/constants'

// Shown when Supabase env vars are absent — a clear setup screen instead of a blank crash.
export function MissingConfig() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-lg p-6">
        <h1 className="text-lg font-bold text-white">{APP_NAME} — configuration needed</h1>
        <p className="mt-2 text-sm text-slate-300">
          The app can’t reach Supabase because its environment variables aren’t set.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>
            Copy <code className="rounded bg-black/40 px-1">.env.example</code> to{' '}
            <code className="rounded bg-black/40 px-1">.env</code>.
          </li>
          <li>
            Set <code className="rounded bg-black/40 px-1">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-black/40 px-1">VITE_SUPABASE_ANON_KEY</code> from your
            Supabase project (Project Settings → API).
          </li>
          <li>Restart the dev server, or add the variables in Netlify and redeploy.</li>
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          See <code className="rounded bg-black/40 px-1">README.md</code> for full setup steps.
        </p>
      </div>
    </div>
  )
}
