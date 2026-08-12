import { useEffect, useState } from 'react'
import type { FileRow } from '@/types'
import { formatBytes, isImage } from '@/lib/utils'
import { signedUrl } from '@/lib/files'
import { Paperclip, Copy } from '@/components/ui/Icons'
import { useUIStore } from '@/stores/uiStore'

// Small download-arrow glyph (kept local so we don't need a new icon export).
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// Renders a stored attachment: inline image preview for images, a download chip otherwise.
// Non-images download on click; images preview and offer a download button.
export function FileChip({ file }: { file: FileRow }) {
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const toast = useUIStore((s) => s.toast)

  useEffect(() => {
    let alive = true
    signedUrl(file.path, file.bucket, file.name).then((u) => alive && setDownloadUrl(u))
    if (isImage(file.mime_type)) signedUrl(file.path, file.bucket).then((u) => alive && setViewUrl(u))
    return () => {
      alive = false
    }
  }, [file.path, file.bucket, file.name, file.mime_type])

  // Copy the actual image to the clipboard so it can be pasted into a message/email/doc. The clipboard
  // only reliably accepts PNG, so non-PNG images are re-encoded via canvas. We hand ClipboardItem a
  // Promise<Blob> (not an awaited blob) so Safari keeps the copy tied to the click and doesn't reject
  // it as "not user-initiated."
  async function copyImage() {
    const nav = navigator as Navigator & { clipboard?: { write?: (i: unknown[]) => Promise<void> } }
    const CI = (window as unknown as { ClipboardItem?: any }).ClipboardItem
    if (!viewUrl || !CI || !nav.clipboard?.write) {
      toast({ kind: 'error', title: 'Copy not supported here', body: 'Try downloading the image instead.' })
      return
    }
    setCopying(true)
    try {
      const asPng = (async () => {
        const blob = await (await fetch(viewUrl)).blob()
        if (blob.type === 'image/png') return blob
        const bmp = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width
        canvas.height = bmp.height
        canvas.getContext('2d')!.drawImage(bmp, 0, 0)
        return await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'),
        )
      })()
      await nav.clipboard.write([new CI({ 'image/png': asPng })])
      toast({ kind: 'success', title: 'Image copied', body: 'Paste it wherever you like.' })
    } catch {
      toast({ kind: 'error', title: 'Couldn’t copy the image', body: 'You can download it instead.' })
    } finally {
      setCopying(false)
    }
  }

  if (isImage(file.mime_type)) {
    return (
      <div className="max-w-xs">
        <a href={viewUrl ?? undefined} target="_blank" rel="noreferrer" className="block">
          {viewUrl ? (
            <img src={viewUrl} alt={file.name} className="max-h-72 w-auto rounded-lg border border-white/10 object-cover" loading="lazy" />
          ) : (
            <div className="h-40 w-full max-w-xs animate-pulse rounded-lg bg-white/5" />
          )}
        </a>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-slate-400">{file.name}</p>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={copyImage}
              disabled={!viewUrl || copying}
              className="flex items-center gap-1 text-[11px] text-brand-300 hover:text-brand-200 disabled:opacity-50"
              title="Copy the image (to paste elsewhere)"
            >
              <Copy className="h-3.5 w-3.5" /> {copying ? 'Copying…' : 'Copy'}
            </button>
            <a href={downloadUrl ?? undefined} download={file.name} className="flex items-center gap-1 text-[11px] text-brand-300 hover:text-brand-200" title="Download">
              <DownloadIcon className="h-3.5 w-3.5" /> Download
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <a
      href={downloadUrl ?? undefined}
      download={file.name}
      className="flex max-w-xs items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2.5 hover:bg-white/10"
      title={`Download ${file.name}`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
        <Paperclip className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-100">{file.name}</p>
        <p className="text-[11px] text-slate-400">{formatBytes(file.size_bytes)}</p>
      </div>
      <DownloadIcon className="h-4 w-4 shrink-0 text-brand-300" />
    </a>
  )
}
