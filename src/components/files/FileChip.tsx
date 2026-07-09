import { useEffect, useState } from 'react'
import type { FileRow } from '@/types'
import { formatBytes, isImage } from '@/lib/utils'
import { signedUrl } from '@/lib/files'
import { Paperclip } from '@/components/ui/Icons'

// Renders a stored attachment: inline image preview for images, a download chip otherwise.
export function FileChip({ file }: { file: FileRow }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    signedUrl(file.path, file.bucket).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [file.path, file.bucket])

  if (isImage(file.mime_type)) {
    return (
      <a href={url ?? undefined} target="_blank" rel="noreferrer" className="block max-w-xs">
        {url ? (
          <img
            src={url}
            alt={file.name}
            className="max-h-72 w-auto rounded-lg border border-white/10 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-40 w-full max-w-xs animate-pulse rounded-lg bg-white/5" />
        )}
        <p className="mt-1 text-[11px] text-slate-400">{file.name}</p>
      </a>
    )
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="flex max-w-xs items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2.5 hover:bg-white/10"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
        <Paperclip className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-100">{file.name}</p>
        <p className="text-[11px] text-slate-400">{formatBytes(file.size_bytes)}</p>
      </div>
    </a>
  )
}
