import { supabase } from './supabase'
import { MAX_FILE_BYTES } from './constants'
import { uuid } from './utils'
import type { FileRow } from '@/types'

export type PendingFile = Omit<FileRow, 'id' | 'created_at' | 'uploader_id'>

// Uploads a File to the private `attachments` bucket under <uid>/<uuid>.<ext> and returns
// the metadata to persist in the `files` table. Enforces the size cap client-side too.
export async function uploadAttachment(file: File, userId: string): Promise<PendingFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is larger than the 25MB limit.`)
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${userId}/${uuid()}.${ext}`
  const { error } = await supabase.storage.from('attachments').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error

  let width: number | null = null
  let height: number | null = null
  if (file.type.startsWith('image/')) {
    try {
      const dims = await imageSize(file)
      width = dims.width
      height = dims.height
    } catch {
      /* non-fatal */
    }
  }
  return {
    message_id: null,
    channel_id: null,
    conversation_id: null,
    bucket: 'attachments',
    path,
    name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    width,
    height,
  }
}

// Attachments live in a private bucket; resolve short-lived signed URLs to display them.
// Pass `download` (a filename) to get a URL that the browser SAVES instead of opening —
// Supabase then serves it with Content-Disposition: attachment; filename=<download>.
const signedCache = new Map<string, { url: string; exp: number }>()
export async function signedUrl(path: string, bucket = 'attachments', download?: string): Promise<string | null> {
  const cacheKey = download ? `${path}::dl` : path
  const cached = signedCache.get(cacheKey)
  if (cached && cached.exp > Date.now()) return cached.url
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, download ? { download } : undefined)
  if (!data?.signedUrl) return null
  signedCache.set(cacheKey, { url: data.signedUrl, exp: Date.now() + 3000_000 })
  return data.signedUrl
}

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = reject
    img.src = url
  })
}
