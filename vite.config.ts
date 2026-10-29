import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/fpl': {
        target: 'https://fantasy.premierleague.com',
        changeOrigin: true,
        // Mirrors api/fpl.ts: /api/fpl?path=<path> -> /api/<path>
        rewrite: (p) => `/api/${new URL(p, 'http://localhost').searchParams.get('path') ?? ''}`,
        headers: { 'User-Agent': 'Mozilla/5.0 fpl-decision-engine' },
      },
    },
  },
  test: { environment: 'node' },
})
