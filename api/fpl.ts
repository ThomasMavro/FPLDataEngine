import type { VercelRequest, VercelResponse } from '@vercel/node'

// Forwards GET /api/fpl/<path> to https://fantasy.premierleague.com/api/<path> (avoids CORS).
// vercel.json rewrites /api/fpl/<path> to /api/fpl?path=<path>, since catch-all
// function filenames only work in Next.js projects.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { path, ...rest } = req.query
  const raw = Array.isArray(path) ? path.join('/') : path ?? ''
  const parts = raw.split('/').filter(Boolean)
  if (!parts.length) return res.status(400).json({ error: 'Missing path' })
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(rest)) for (const x of [v].flat()) if (x != null) params.append(k, x)
  const qs = params.toString() ? `?${params}` : ''
  const target = `https://fantasy.premierleague.com/api/${parts.map(encodeURIComponent).join('/')}/${qs}`
  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        Accept: 'application/json',
      },
    })
    const body = await r.text()
    res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json')
    res.setHeader('Cache-Control', r.ok ? 's-maxage=300, stale-while-revalidate=600' : 'no-store')
    return res.status(r.status).send(body)
  } catch (e) {
    return res.status(502).json({ error: 'Upstream FPL API unreachable', detail: String(e) })
  }
}
