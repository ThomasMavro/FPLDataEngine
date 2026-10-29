import type { VercelRequest, VercelResponse } from '@vercel/node'

// Forwards GET /api/fpl/<path> to https://fantasy.premierleague.com/api/<path> (avoids CORS).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const p = req.query.path
  const parts = Array.isArray(p) ? p : p ? [p] : []
  const qs = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const target = `https://fantasy.premierleague.com/api/${parts.map(encodeURIComponent).join('/')}/${qs}`
  try {
    const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 fpl-decision-engine' } })
    const body = await r.text()
    res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(r.status).send(body)
  } catch (e) {
    return res.status(502).json({ error: 'Upstream FPL API unreachable', detail: String(e) })
  }
}
