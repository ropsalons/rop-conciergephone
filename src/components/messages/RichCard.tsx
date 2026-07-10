import { useEffect, useRef, useState } from 'react'

// Renders rich HTML sent in by the integration API (daily stats, dashboards, reports)
// SAFELY inside a sandboxed iframe. `sandbox="allow-scripts"` WITHOUT `allow-same-origin`
// gives the embedded document an opaque (null) origin: it can run its own JS and draw
// charts, but it cannot read ROP Connect's cookies, localStorage, session, or DOM — so an
// external report can never leak or tamper with app data. The frame auto-sizes to content.
export function RichCard({ html, title }: { html: string; title?: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(140)

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:light dark}
  html,body{margin:0}
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:#e5e7eb;background:transparent;padding:12px;font-size:14px;line-height:1.5}
  a{color:#93c5fd}
  h1,h2,h3{color:#fff;margin:.2em 0 .4em}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid rgba(255,255,255,.14);padding:6px 9px;text-align:left}
  th{background:rgba(255,255,255,.07)}
  img,svg,canvas{max-width:100%}
  code,pre{background:rgba(255,255,255,.08);border-radius:4px;padding:.1em .3em}
</style></head><body>${html}
<script>
  function post(){try{parent.postMessage({__ropCardHeight:document.documentElement.scrollHeight},'*')}catch(e){}}
  window.addEventListener('load',post);setTimeout(post,60);setTimeout(post,400);
  if(window.ResizeObserver){new ResizeObserver(post).observe(document.body)}
</script>
</body></html>`

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (ref.current && e.source === ref.current.contentWindow && e.data && typeof e.data.__ropCardHeight === 'number') {
        setHeight(Math.min(2000, Math.max(60, e.data.__ropCardHeight + 4)))
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-white/10 bg-brand-950/40">
      {title && (
        <div className="border-b border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">
          {title}
        </div>
      )}
      <iframe
        ref={ref}
        title={title || 'Report'}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        loading="lazy"
        className="w-full"
        style={{ height, border: 0, display: 'block' }}
      />
    </div>
  )
}
