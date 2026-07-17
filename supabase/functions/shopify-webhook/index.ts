// ROP Chat — Shopify webhook receiver. Shopify calls this when an order is placed
// (orders/create) or shipped (fulfillments/create); we format it and post to the
// #product-shipping channel via the ingest endpoint (author "Shopify").
//
// Auth: a shared secret in the ?token= query param (Shopify lets us set an arbitrary
// callback URL). Always returns 200 so Shopify doesn't retry-storm on a formatting error.
//
// Set up in Shopify Admin → Settings → Notifications → Webhooks:
//   Event "Order creation"       → this URL (?token=…) → JSON
//   Event "Fulfillment creation" → this URL (?token=…) → JSON
//
// The DEPLOYED copy holds the live ingest key + token; this repo copy keeps them redacted.

const INGEST_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest'
const INGEST_KEY = Deno.env.get('INGEST_KEY') ?? 'REDACTED_IN_REPO'
const SHOPIFY_TOKEN = Deno.env.get('SHOPIFY_TOKEN') ?? 'REDACTED_IN_REPO'
const CHANNEL = 'product-shipping'

function money(v: any): string {
  const n = Number(v)
  return v != null && !isNaN(n) ? '$' + n.toFixed(2) : ''
}
function items(li: any): string {
  if (!Array.isArray(li) || !li.length) return ''
  const parts = li.slice(0, 6).map((i: any) => (i.quantity || 1) + '× ' + (i.title || i.name || 'item'))
  let s = parts.join(', ')
  if (li.length > 6) s += ', +' + (li.length - 6) + ' more'
  return s
}
async function post(text: string) {
  await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: CHANNEL, author_name: 'Shopify', text }),
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('token') !== SHOPIFY_TOKEN)
    return new Response('unauthorized', { status: 401 })

  let p: any = {}
  try { p = await req.json() } catch { /* ignore */ }
  const topic = (req.headers.get('x-shopify-topic') || url.searchParams.get('kind') || '').toLowerCase()

  try {
    if (topic.includes('fulfillment')) {
      const order = p.name || (p.order_id ? '#' + p.order_id : 'order')
      const itxt = items(p.line_items)
      let text = '📦 Shipped — ' + order + (itxt ? ' · ' + itxt : '')
      const tn = p.tracking_number || (Array.isArray(p.tracking_numbers) && p.tracking_numbers[0]) || ''
      const tc = p.tracking_company || ''
      const tu = p.tracking_url || (Array.isArray(p.tracking_urls) && p.tracking_urls[0]) || ''
      if (tn || tu) text += '\nTracking: ' + [tc, tn].filter(Boolean).join(' ') + (tu ? ' ' + tu : '')
      await post(text)
    } else if (topic.includes('order')) {
      const name = p.name || (p.order_number ? '#' + p.order_number : 'New order')
      const cust = p.customer ? [p.customer.first_name, p.customer.last_name].filter(Boolean).join(' ') : ''
      const itxt = items(p.line_items)
      const total = money(p.total_price != null ? p.total_price : p.current_total_price)
      let text = '🛍️ New order ' + name + (cust ? ' — ' + cust : '') + (total ? ' · ' + total : '')
      if (itxt) text += '\n' + itxt
      await post(text)
    }
  } catch { /* ignore — still 200 */ }
  return new Response('ok', { status: 200 })
})
