// ROP Connect static hosting shim (v5).
// Supabase force-downgrades text/html -> text/plain on the functions domain (anti-phishing),
// so the entry document is served as application/xhtml+xml (well-formed XHTML), which browsers
// render as a page and which is NOT downgraded. Assets (text/javascript, text/css, etc.) pass
// through fine and are streamed from the repo's committed dist/ via raw.githubusercontent.com.
//
// This IS the live host for ROP Connect (Netlify egress is blocked from the build sandbox, so
// the app is served from this Supabase Edge Function instead). To publish a new build: bump SHA
// to the commit that contains the built dist/, and update CSS_HREF / JS_SRC to that build's
// fingerprinted entry files (see dist/index.html), then redeploy this function.

const OWNER = 'ropsalons'
const REPO = 'rop-conciergephone'
const SHA = 'cc962bc00780d80199ead40232127617af2275cc'
const CSS_HREF = '/functions/v1/app/assets/index-DnJfiSyh.css'
const JS_SRC = '/functions/v1/app/assets/index-nDQigSIt.js'
const raw = (p: string) => `https://raw.githubusercontent.com/${OWNER}/${REPO}/${SHA}/dist/${p}`

const INDEX_XHTML = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" class="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1" />
<meta name="theme-color" content="#1f2a44" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="ROP Connect" />
<title>ROP Connect</title>
<link rel="icon" type="image/svg+xml" href="/functions/v1/app/favicon.svg" />
<link rel="stylesheet" href="${CSS_HREF}" />
</head>
<body>
<div id="root"></div>
<script type="module" src="${JS_SRC}"></script>
</body>
</html>`

const TYPES: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  woff2: 'font/woff2',
}
function ctype(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() ?? ''
  return TYPES[ext] ?? 'application/octet-stream'
}
function page() {
  const h = new Headers()
  h.set('content-type', 'application/xhtml+xml; charset=utf-8')
  h.set('cache-control', 'no-store')
  return new Response(INDEX_XHTML, { status: 200, headers: h })
}

Deno.serve(async (req) => {
  let p = new URL(req.url).pathname
  p = p.replace(/^\/functions\/v1\/app/, '').replace(/^\/app(?=\/|$)/, '').replace(/^\/+/, '')
  if (p === '' || p === 'index.html' || !p.includes('.')) return page()
  const r = await fetch(raw(p))
  if (!r.ok) return new Response('Not found: ' + p, { status: 404 })
  const h = new Headers()
  h.set('content-type', ctype(p))
  h.set('cache-control', 'public, max-age=86400')
  return new Response(await r.arrayBuffer(), { status: 200, headers: h })
})
