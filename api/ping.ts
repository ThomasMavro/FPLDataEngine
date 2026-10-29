import type { VercelRequest, VercelResponse } from '@vercel/node'

// Health check: confirms serverless functions are deployed.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true })
}
