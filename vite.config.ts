import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/fpl': {
        target: 'https://fantasy.premierleague.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/fpl/, '/api'),
        headers: { 'User-Agent': 'Mozilla/5.0 fpl-decision-engine' },
      },
    },
  },
  test: { environment: 'node' },
})
